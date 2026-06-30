import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { isOwnerEmail } from "@/lib/owner-emails";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    // E-mails do Proprietário sempre passam, sem checar papel nem status.
    if (isOwnerEmail(data.user.email)) {
      try {
        await supabase.from("user_roles").insert({ user_id: data.user.id, role: "owner" });
      } catch { /* ignorado: já existe ou bloqueado */ }
      return { user: data.user };
    }

    // Bloqueia usuários inativados pelo Admin.
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_active")
      .eq("id", data.user.id)
      .maybeSingle();
    if (profile && (profile as any).is_active === false) {
      throw redirect({ to: "/pending" });
    }

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);
    const hasRole = (roles ?? []).length > 0;
    if (!hasRole) throw redirect({ to: "/pending" });
    return { user: data.user };
  },
  component: () => <Outlet />,
});

import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { isOwnerEmail } from "@/lib/owner-emails";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    // E-mails do Proprietário sempre passam, sem checar papel.
    if (isOwnerEmail(data.user.email)) {
      // Garante que o papel 'owner' exista (idempotente, tolera erro de RLS).
      try {
        await supabase.from("user_roles").insert({ user_id: data.user.id, role: "owner" });
      } catch { /* ignorado: já existe ou bloqueado */ }
      return { user: data.user };
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

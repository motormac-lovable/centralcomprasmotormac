import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OWNER_EMAILS = ["herllon.souza@motormac.com.br", "vanessa@motormac.com.br"];

/**
 * Exclusão completa de um usuário (auth + dados em cascata via FKs).
 * Apenas Proprietários ou Administradores podem chamar.
 * Proprietários NÃO podem ser excluídos.
 */
export const deleteUserCompletely = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ user_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verifica permissão do chamador
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isOwner = (roles ?? []).some((r: any) => r.role === "owner");
    const isAdmin = isOwner || (roles ?? []).some((r: any) => r.role === "admin");
    if (!isAdmin) throw new Response("Forbidden", { status: 403 });

    if (data.user_id === userId) {
      throw new Response("Você não pode excluir o próprio usuário.", { status: 400 });
    }

    // Bloqueia exclusão de Proprietário
    const { data: targetRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user_id);
    const targetIsOwner = (targetRoles ?? []).some((r: any) => r.role === "owner");

    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", data.user_id)
      .maybeSingle();
    const targetEmailIsOwner =
      !!targetProfile?.email && OWNER_EMAILS.includes(targetProfile.email.toLowerCase());

    if (targetIsOwner || targetEmailIsOwner) {
      throw new Response("Proprietários não podem ser excluídos.", { status: 400 });
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Response(error.message, { status: 500 });

    return { ok: true };
  });

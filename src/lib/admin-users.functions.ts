import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OWNER_EMAILS = ["herllon.souza@motormac.com.br", "vanessa@motormac.com.br"];

async function getActorInfo(supabaseAdmin: any, userId: string) {
  const { data: p } = await supabaseAdmin
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();
  const { data: a } = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = a?.user?.email ?? p?.email ?? "";
  const name = p?.full_name || email || "Administrador";
  return { name, email, emailIsOwner: !!email && OWNER_EMAILS.includes(email.toLowerCase()) };
}

/**
 * Exclusão de usuário: remove o login em auth.users e anonimiza o perfil,
 * preservando histórico. Registra auditoria em user_audit_log.
 */
export const deleteUserCompletely = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ user_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", userId);
    const actor = await getActorInfo(supabaseAdmin, userId);
    const isOwner = actor.emailIsOwner || (callerRoles ?? []).some((r: any) => r.role === "owner");
    const isAdmin = isOwner || (callerRoles ?? []).some((r: any) => r.role === "admin");
    if (!isAdmin) throw new Response("Forbidden", { status: 403 });

    if (data.user_id === userId) {
      throw new Response("Você não pode excluir o próprio usuário.", { status: 400 });
    }

    const { data: targetRoles } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", data.user_id);
    const { data: targetProfile } = await supabaseAdmin
      .from("profiles").select("email, full_name").eq("id", data.user_id).maybeSingle();
    const targetIsOwner =
      (targetRoles ?? []).some((r: any) => r.role === "owner") ||
      (!!targetProfile?.email && OWNER_EMAILS.includes(targetProfile.email.toLowerCase()));
    if (targetIsOwner) {
      throw new Response("Proprietários não podem ser excluídos.", { status: 400 });
    }
    const targetIsAdmin = (targetRoles ?? []).some((r: any) => r.role === "admin");
    if (targetIsAdmin && !isOwner) {
      throw new Response("Somente o Proprietário pode excluir Administradores.", { status: 403 });
    }

    // 1) Anonimiza perfil + grava auditoria (mantém histórico e cards antigos).
    const { error: rpcErr } = await supabaseAdmin.rpc("mark_profile_deleted", {
      _target: data.user_id,
      _actor: userId,
      _actor_name: actor.name,
    });
    if (rpcErr) throw new Response(rpcErr.message, { status: 500 });

    // 2) Remove papéis e cadastro de aprovador
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("approver_settings").delete().eq("user_id", data.user_id);

    // 3) Remove login (auth.users). Perfil sobrevive (FK removida).
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Response(error.message, { status: 500 });

    return { ok: true };
  });

/**
 * Ativa/inativa acesso do usuário e registra auditoria.
 */
export const setUserActiveState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ user_id: z.string().uuid(), active: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", userId);
    const actor = await getActorInfo(supabaseAdmin, userId);
    const isOwner = actor.emailIsOwner || (callerRoles ?? []).some((r: any) => r.role === "owner");
    const isAdmin = isOwner || (callerRoles ?? []).some((r: any) => r.role === "admin");
    const isBuyer = isAdmin || (callerRoles ?? []).some((r: any) => r.role === "buyer");
    if (!isBuyer) throw new Response("Forbidden", { status: 403 });

    if (data.user_id === userId) {
      throw new Response("Você não pode alterar o próprio status.", { status: 400 });
    }

    const { data: targetRoles } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", data.user_id);
    const { data: targetProfile } = await supabaseAdmin
      .from("profiles").select("email").eq("id", data.user_id).maybeSingle();
    const targetIsOwner =
      (targetRoles ?? []).some((r: any) => r.role === "owner") ||
      (!!targetProfile?.email && OWNER_EMAILS.includes(targetProfile.email.toLowerCase()));
    const targetIsAdmin = (targetRoles ?? []).some((r: any) => r.role === "admin");
    const targetIsSolicitante = (targetRoles ?? []).some((r: any) => r.role === "solicitante");

    if (targetIsOwner) throw new Response("Proprietários não podem ser inativados.", { status: 400 });
    if (targetIsAdmin && !isOwner) {
      throw new Response("Somente o Proprietário pode inativar Administradores.", { status: 403 });
    }
    // Comprador puro só age sobre Solicitantes.
    if (!isAdmin && !targetIsSolicitante) {
      throw new Response("Comprador só pode gerenciar Solicitantes.", { status: 403 });
    }

    const { error } = await supabaseAdmin.rpc("set_user_active", {
      _target: data.user_id,
      _active: data.active,
      _actor: userId,
      _actor_name: actor.name,
    });
    if (error) throw new Response(error.message, { status: 500 });

    return { ok: true };
  });

/**
 * Atualiza o papel (role) de um usuário registrado.
 */
export const updateUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({
      user_id: z.string().uuid(),
      role: z.enum(["owner", "admin", "buyer", "solicitante", "aprovador", "auditor"]),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { userId, claims } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", userId);
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles").select("email").eq("id", userId).maybeSingle();
    const { data: callerAuth } = await supabaseAdmin.auth.admin.getUserById(userId);
    const callerEmail = callerAuth?.user?.email ?? callerProfile?.email ?? (claims as any)?.email ?? "";
    const callerEmailIsOwner = !!callerEmail && OWNER_EMAILS.includes(callerEmail.toLowerCase());
    const callerIsOwner = callerEmailIsOwner || (callerRoles ?? []).some((r: any) => r.role === "owner");
    const callerIsAdmin = callerIsOwner || (callerRoles ?? []).some((r: any) => r.role === "admin");
    if (!callerIsAdmin) throw new Response("Forbidden", { status: 403 });

    if (!callerIsOwner && data.role === "owner") {
      throw new Response("Apenas Proprietários podem atribuir o papel de Proprietário.", { status: 403 });
    }

    const { data: targetRoles } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", data.user_id);
    const { data: targetProfile } = await supabaseAdmin
      .from("profiles").select("email").eq("id", data.user_id).maybeSingle();
    const targetIsOwner =
      (targetRoles ?? []).some((r: any) => r.role === "owner") ||
      (!!targetProfile?.email && OWNER_EMAILS.includes(targetProfile.email.toLowerCase()));
    const targetIsAdmin = (targetRoles ?? []).some((r: any) => r.role === "admin");
    if (!callerIsOwner && (targetIsOwner || targetIsAdmin)) {
      throw new Response("Somente o Proprietário pode alterar Proprietários ou Administradores.", { status: 403 });
    }

    await supabaseAdmin
      .from("user_roles").delete().eq("user_id", data.user_id)
      .in("role", ["owner", "admin", "buyer", "solicitante", "aprovador", "auditor"]);

    const { error } = await supabaseAdmin
      .from("user_roles").insert({ user_id: data.user_id, role: data.role });
    if (error) throw new Response(error.message, { status: 500 });

    return { ok: true };
  });

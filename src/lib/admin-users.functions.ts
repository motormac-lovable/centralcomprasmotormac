import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { canManageProtectedUser, isEligibleForAdmin } from "@/lib/protected-users";

const PROTECTED_MSG = "Este usuário só pode ser gerenciado pelo Proprietário.";

const OWNER_EMAILS = ["herllon.souza@motormac.com.br"];

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
    const isAuditor = (callerRoles ?? []).some((r: any) => r.role === "auditor");
    if (!isAdmin && !isAuditor) throw new Response("Forbidden", { status: 403 });

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
    if (!canManageProtectedUser(targetProfile?.email, isOwner)) {
      throw new Response(PROTECTED_MSG, { status: 403 });
    }
    const targetIsAdmin = (targetRoles ?? []).some((r: any) => r.role === "admin");
    if (targetIsAdmin && !isOwner) {
      throw new Response("Somente o Proprietário pode excluir Administradores.", { status: 403 });
    }
    // Auditor: exclusão restrita ao perfil Solicitante.
    if (!isAdmin && isAuditor) {
      const targetIsSolicitante = (targetRoles ?? []).some((r: any) => r.role === "solicitante");
      const onlySolicitante = targetIsSolicitante && !(targetRoles ?? []).some(
        (r: any) => r.role !== "solicitante",
      );
      if (!onlySolicitante) {
        throw new Response("Auditor só pode excluir usuários com o perfil Solicitante.", { status: 403 });
      }
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
    if (!canManageProtectedUser(targetProfile?.email, isOwner)) {
      throw new Response(PROTECTED_MSG, { status: 403 });
    }
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
    if (!canManageProtectedUser(targetProfile?.email, callerIsOwner)) {
      throw new Response(PROTECTED_MSG, { status: 403 });
    }
    if (data.role === "admin") {
      const { data: elig } = await supabaseAdmin
        .from("profiles").select("is_active, is_deleted").eq("id", data.user_id).maybeSingle();
      if (!isEligibleForAdmin(elig)) {
        throw new Response("Usuário inativo não pode ser promovido a Administrador.", { status: 400 });
      }
    }

    await supabaseAdmin
      .from("user_roles").delete().eq("user_id", data.user_id)
      .in("role", ["owner", "admin", "buyer", "solicitante", "aprovador", "auditor"]);

    const { error } = await supabaseAdmin
      .from("user_roles").insert({ user_id: data.user_id, role: data.role });
    if (error) throw new Response(error.message, { status: 500 });

    return { ok: true };
  });

/**
 * Atualiza atomicamente o e-mail em auth.users (via Admin API) e na tabela
 * pública `profiles`. Preserva a senha existente (o Admin API mantém a
 * senha quando apenas o campo `email` é enviado). Marca `force_logout_at`
 * para forçar o usuário-alvo a refazer o login com o novo e-mail no
 * próximo clique.
 */
export const updateUserEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({
      user_id: z.string().uuid(),
      email: z.string().trim().toLowerCase().email("E-mail inválido"),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", userId);
    const actor = await getActorInfo(supabaseAdmin, userId);
    const callerIsOwner = actor.emailIsOwner || (callerRoles ?? []).some((r: any) => r.role === "owner");
    const callerIsAdmin = callerIsOwner || (callerRoles ?? []).some((r: any) => r.role === "admin");
    if (!callerIsAdmin) throw new Response("Forbidden", { status: 403 });

    // Alvo
    const { data: targetRoles } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", data.user_id);
    const { data: targetProfile } = await supabaseAdmin
      .from("profiles").select("email").eq("id", data.user_id).maybeSingle();
    const targetIsOwner =
      (targetRoles ?? []).some((r: any) => r.role === "owner") ||
      (!!targetProfile?.email && OWNER_EMAILS.includes(targetProfile.email.toLowerCase()));
    const targetIsAdmin = (targetRoles ?? []).some((r: any) => r.role === "admin");
    if (!callerIsOwner && (targetIsOwner || targetIsAdmin)) {
      throw new Response("Somente o Proprietário pode alterar o e-mail de Administradores.", { status: 403 });
    }
    if (!canManageProtectedUser(targetProfile?.email, callerIsOwner)) {
      throw new Response(PROTECTED_MSG, { status: 403 });
    }
    if (targetIsOwner) {
      throw new Response("O e-mail de Proprietários não pode ser alterado por esta tela.", { status: 400 });
    }

    // Lê o e-mail atual em auth.users (fonte da verdade para login).
    const { data: currentAuth } = await supabaseAdmin.auth.admin.getUserById(data.user_id);
    const currentAuthEmail = (currentAuth?.user?.email ?? "").toLowerCase();
    const targetEmail = data.email; // já normalizado (trim + lowercase) pelo zod
    const authNeedsUpdate = currentAuthEmail !== targetEmail;

    // 1) Atualiza o e-mail em auth.users quando divergente. `email_confirm: true`
    //    faz o novo e-mail valer imediatamente como credencial oficial de login,
    //    sem exigir confirmação por e-mail. NENHUMA senha é enviada — o Supabase
    //    preserva a senha existente.
    if (authNeedsUpdate) {
      const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(
        data.user_id,
        { email: targetEmail, email_confirm: true },
      );
      if (authErr) throw new Response(authErr.message, { status: 500 });
    }

    // 2) Sempre reconcilia a tabela pública `profiles` para casar com auth.users.
    //    Se o e-mail mudou (em auth ou já divergia do profile), agenda logout
    //    forçado para o usuário-alvo relogar com a credencial nova.
    const profileEmailMatched = (targetProfile?.email ?? "").toLowerCase() === targetEmail;
    const anyChange = authNeedsUpdate || !profileEmailMatched;
    const profileUpdate = anyChange
      ? { email: targetEmail, force_logout_at: new Date().toISOString() }
      : { email: targetEmail };
    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .update(profileUpdate)
      .eq("id", data.user_id);
    if (profErr) throw new Response(profErr.message, { status: 500 });

    // 3) Auditoria — apenas quando algo mudou.
    if (anyChange) {
      await supabaseAdmin.from("user_audit_log").insert({
        target_user_id: data.user_id,
        target_user_name: targetProfile?.email ?? null,
        target_user_email: targetEmail,
        actor_user_id: userId,
        actor_user_name: actor.name,
        action: "email_alterado",
        details: {
          de_auth: currentAuthEmail || null,
          de_profile: targetProfile?.email ?? null,
          para: targetEmail,
          reconciliado: !authNeedsUpdate && !profileEmailMatched,
        },
      });
    }

    return { ok: true, changed: anyChange, auth_updated: authNeedsUpdate };
  });

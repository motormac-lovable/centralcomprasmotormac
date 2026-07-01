import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Cadastro público (SEM criar usuário no auth): grava a solicitação pendente.
// O Administrador cria o usuário só ao aprovar a solicitação.
// ---------------------------------------------------------------------------
const registerSchema = z.object({
  full_name: z.string().min(1).max(200),
  cpf: z.string().min(1).max(32),
  phone: z.string().min(1).max(32),
  email: z.string().email().max(255),
  password: z.string().min(8).max(200),
  checklist_types: z.array(z.string().max(64)).max(20),
  requested_departments: z.array(z.string().max(120)).max(200).default([]),
});

export const registerBuyerApplicant = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => registerSchema.parse(data))
  .handler(async ({ data }) => {
    // Regra de senha: mínimo 8, letra, número e símbolo.
    const p = data.password;
    const strong =
      p.length >= 8 && /[A-Za-z]/.test(p) && /[0-9]/.test(p) && /[^A-Za-z0-9]/.test(p);
    if (!strong) throw new Error("Senha fraca. Use 8+ caracteres com letras, números e símbolos.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Bloqueia se já existir usuário aprovado com o mesmo e-mail no auth.
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const already = list?.users?.find(
      (u) => (u.email ?? "").toLowerCase() === data.email.toLowerCase(),
    );
    if (already) {
      throw new Error("Este e-mail já possui cadastro aprovado. Entre normalmente ou use 'Esqueci minha senha'.");
    }

    // Bloqueia duplicidade de solicitações pendentes para o mesmo e-mail.
    const { data: existing } = await supabaseAdmin
      .from("buyer_applications")
      .select("id")
      .eq("email", data.email)
      .eq("status", "pending")
      .maybeSingle();
    if (existing) {
      return { ok: true, application_id: existing.id, duplicated: true };
    }

    const { data: inserted, error } = await supabaseAdmin
      .from("buyer_applications")
      .insert({
        user_id: null,
        full_name: data.full_name,
        cpf: data.cpf,
        phone: data.phone,
        email: data.email,
        checklist_types: data.checklist_types,
        requested_departments: data.requested_departments ?? [],
        requested_ceiling: null,
        status: "pending",
        pending_password: data.password,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, application_id: inserted.id, duplicated: false };
  });

// ---------------------------------------------------------------------------
// Aprovação: cria o usuário no auth (se ainda não existir) e atribui o papel.
// Apenas Owner/Admin autenticados podem aprovar.
// ---------------------------------------------------------------------------
const approveSchema = z.object({
  application_id: z.string().uuid(),
  role: z.enum(["admin", "buyer", "solicitante", "aprovador", "auditor"]),
});

export const approveBuyerApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => approveSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Autoriza somente Owner ou Admin.
    const { data: isOwner } = await supabase.rpc("has_role", { _user_id: userId, _role: "owner" });
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isOwner && !isAdmin) throw new Error("Sem permissão para aprovar cadastros.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: app, error: aErr } = await supabaseAdmin
      .from("buyer_applications")
      .select("*")
      .eq("id", data.application_id)
      .maybeSingle();
    if (aErr || !app) throw new Error("Solicitação não encontrada.");
    if ((app as any).status === "approved") throw new Error("Solicitação já aprovada.");

    // Cria o usuário (ou reaproveita) e GARANTE que a senha cadastrada
    // pelo solicitante seja a senha efetiva de acesso após a aprovação.
    let uid: string | null = (app as any).user_id ?? null;
    const pwd = (app as any).pending_password as string | null;
    const email = (app as any).email as string;
    const meta = {
      full_name: (app as any).full_name,
      cpf: (app as any).cpf,
      phone: (app as any).phone,
    };

    if (!uid) {
      if (!pwd) throw new Error("Solicitação sem senha registrada. Peça um novo cadastro.");
      const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: pwd,
        email_confirm: true,
        user_metadata: meta,
      });
      if (cErr || !created?.user) {
        // E-mail já existe no auth: reaproveita e força a senha cadastrada.
        const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
        const found = list?.users?.find(
          (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
        );
        if (!found) throw new Error(cErr?.message || "Falha ao criar usuário.");
        uid = found.id;
        await supabaseAdmin.auth.admin.updateUserById(uid, {
          password: pwd,
          email_confirm: true,
          user_metadata: meta,
        });
      } else {
        uid = created.user.id;
      }
    } else if (pwd) {
      // Usuário já vinculado: sincroniza a senha para a cadastrada na solicitação.
      await supabaseAdmin.auth.admin.updateUserById(uid, {
        password: pwd,
        email_confirm: true,
      });
    }

    // Zera papéis anteriores (exceto owner) e atribui o novo.
    await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", uid!)
      .in("role", ["admin", "buyer", "solicitante", "aprovador", "auditor"]);
    const { error: rErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: uid!, role: data.role } as never);
    if (rErr) throw new Error("Falha ao atribuir papel: " + rErr.message);

    // Atualiza a solicitação, limpa a senha temporária.
    const { error: uErr } = await supabaseAdmin
      .from("buyer_applications")
      .update({
        status: "approved",
        user_id: uid,
        decided_by: userId,
        decided_at: new Date().toISOString(),
        pending_password: null,
      } as never)
      .eq("id", data.application_id);
    if (uErr) throw new Error(uErr.message);

    return { ok: true, user_id: uid, role: data.role };
  });

// ---------------------------------------------------------------------------
// Reprovação: NÃO cria usuário. Apenas marca como rejected e limpa senha.
// ---------------------------------------------------------------------------
export const rejectBuyerApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ application_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isOwner } = await supabase.rpc("has_role", { _user_id: userId, _role: "owner" });
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isOwner && !isAdmin) throw new Error("Sem permissão.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("buyer_applications")
      .update({
        status: "rejected",
        decided_by: userId,
        decided_at: new Date().toISOString(),
        pending_password: null,
      } as never)
      .eq("id", data.application_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Compat: mantém a função antiga (usada por outros pontos, hoje sem chamadas).
// ---------------------------------------------------------------------------
const legacySchema = z.object({
  user_id: z.string().uuid(),
  full_name: z.string().min(1).max(200),
  cpf: z.string().min(1).max(32),
  phone: z.string().min(1).max(32),
  email: z.string().email().max(255),
  checklist_types: z.array(z.string().max(64)).max(20),
  requested_departments: z.array(z.string().max(120)).max(200).default([]),
  requested_ceiling: z.number().nullable().optional(),
});

export const submitBuyerApplication = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => legacySchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("buyer_applications")
      .select("id")
      .eq("user_id", data.user_id)
      .eq("status", "pending")
      .maybeSingle();
    if (existing) return { ok: true, id: existing.id, duplicated: true };
    const { data: inserted, error } = await supabaseAdmin
      .from("buyer_applications")
      .insert({
        user_id: data.user_id,
        full_name: data.full_name,
        cpf: data.cpf,
        phone: data.phone,
        email: data.email,
        checklist_types: data.checklist_types,
        requested_departments: data.requested_departments ?? [],
        requested_ceiling: data.requested_ceiling ?? null,
        status: "pending",
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: inserted.id, duplicated: false };
  });

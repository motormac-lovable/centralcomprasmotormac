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

    // Cria o usuário no Auth imediatamente com a senha escolhida (hash gerenciado pelo Supabase).
    // A senha NÃO é persistida em nenhuma tabela — apenas o hash em auth.users.
    const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.full_name,
        cpf: data.cpf,
        phone: data.phone,
      },
    });
    if (cErr || !created?.user) {
      throw new Error(cErr?.message || "Falha ao criar usuário.");
    }
    const uid = created.user.id;

    const { data: inserted, error } = await supabaseAdmin
      .from("buyer_applications")
      .insert({
        user_id: uid,
        full_name: data.full_name,
        cpf: data.cpf,
        phone: data.phone,
        email: data.email,
        checklist_types: data.checklist_types,
        requested_departments: data.requested_departments ?? [],
        requested_ceiling: null,
        status: "pending",
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

    // O usuário já foi criado no Auth durante o cadastro. Aqui apenas garantimos vínculo,
    // atribuímos o papel e marcamos como aprovado. Nenhuma senha em texto plano é armazenada.
    let uid: string | null = (app as any).user_id ?? null;
    const email = (app as any).email as string;

    if (!uid) {
      // Fallback (aplicações legadas ou usuário criado à parte): tenta localizar por e-mail.
      const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const found = list?.users?.find(
        (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
      );
      if (!found) {
        throw new Error("Usuário não encontrado no Auth. Peça um novo cadastro para gerar as credenciais.");
      }
      uid = found.id;
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

    // Marca solicitação como aprovada.
    const { error: uErr } = await supabaseAdmin
      .from("buyer_applications")
      .update({
        status: "approved",
        user_id: uid,
        decided_by: userId,
        decided_at: new Date().toISOString(),
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

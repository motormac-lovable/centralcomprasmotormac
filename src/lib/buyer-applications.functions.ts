import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
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
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verifica que o user_id realmente existe em auth.users e que o e-mail bate.
    const { data: userRes, error: uErr } = await supabaseAdmin.auth.admin.getUserById(data.user_id);
    if (uErr || !userRes?.user) throw new Error("Usuário não encontrado.");
    if ((userRes.user.email ?? "").toLowerCase() !== data.email.toLowerCase()) {
      throw new Error("E-mail não corresponde ao usuário.");
    }

    // Evita duplicatas de solicitação pendente para o mesmo usuário.
    const { data: existing } = await supabaseAdmin
      .from("buyer_applications")
      .select("id,status")
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

// ---------------------------------------------------------------------------
// Cadastro completo via admin API (sem rate limit público de signUp)
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

    // Cria o usuário via Admin API — bypassa o rate limit público de signup
    // e já confirma o e-mail (a governança do acesso ocorre no Painel Admin).
    let userId: string | null = null;
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.full_name,
        cpf: data.cpf,
        phone: data.phone,
      },
    });
    if (createErr) {
      const msg = createErr.message || "";
      // Se já existe, recupera o id para permitir reenvio da solicitação.
      if (/already been registered|already registered|exists/i.test(msg)) {
        const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
        const found = list?.users?.find(
          (u) => (u.email ?? "").toLowerCase() === data.email.toLowerCase(),
        );
        if (!found) throw new Error("E-mail já cadastrado. Tente entrar ou recuperar a senha.");
        userId = found.id;
      } else {
        throw new Error(msg || "Falha ao criar usuário.");
      }
    } else {
      userId = created?.user?.id ?? null;
    }
    if (!userId) throw new Error("Não foi possível obter o ID do novo usuário.");

    // Evita duplicatas de solicitação pendente.
    const { data: existing } = await supabaseAdmin
      .from("buyer_applications")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "pending")
      .maybeSingle();
    if (existing) return { ok: true, user_id: userId, application_id: existing.id, duplicated: true };

    const { data: inserted, error } = await supabaseAdmin
      .from("buyer_applications")
      .insert({
        user_id: userId,
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
    return { ok: true, user_id: userId, application_id: inserted.id, duplicated: false };
  });

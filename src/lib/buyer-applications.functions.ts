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

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { RELATO_MAX, SUGESTAO_MAX, notaFinal, podeRegistrarRecebimento, recebimentoStatus } from "@/lib/recebimento";

/**
 * Registro de recebimento pelo solicitante. Só o próprio solicitante,
 * só com o card em Pedidos Gerados e NF+Boleto+XML anexados, e uma única vez.
 * Grava apenas data.recebimento — não altera status, alçadas nem Kanban.
 */
export const registrarRecebimento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      card_id: z.string().uuid(),
      decisao: z.enum(["confirmado", "problema"]),
      estrelas: z.number().int().min(0).max(5),
      sugestao: z.string().max(SUGESTAO_MAX).optional(),
      relato: z.string().max(RELATO_MAX).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: card } = await supabaseAdmin
      .from("kanban_cards").select("id, status, data, requester_id, requester_email, buyer_name").eq("id", data.card_id).maybeSingle();
    if (!card) throw new Response("Solicitação não encontrada.", { status: 404 });

    const { data: au } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = (au?.user?.email ?? "").toLowerCase();
    const isRequester = card.requester_id === userId || (!!email && (card.requester_email ?? "").toLowerCase() === email);
    const { data: rolesRows } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
    const roles = new Set((rolesRows ?? []).map((r: any) => r.role as string));
    const { data: apr } = await supabaseAdmin.from("approver_settings").select("departments").eq("user_id", userId).maybeSingle();
    const ccDesc = ((card.data as any)?.centro_custo_descricao as string | undefined) ?? null;
    const permitido = podeRegistrarRecebimento({
      isRequester,
      isOwner: roles.has("owner"),
      isAdmin: roles.has("admin"),
      isApprover: roles.has("aprovador"),
      approverDepartments: ((apr as any)?.departments as string[]) ?? [],
      centroCustoDescricao: ccDesc,
    });
    if (!permitido) throw new Response("Você não tem permissão para registrar o recebimento desta solicitação.", { status: 403 });
    if (recebimentoStatus(card) !== "pendente_aceite")
      throw new Response("Recebimento indisponível nesta etapa.", { status: 409 });

    const relato = data.relato?.trim() ?? "";
    if (data.decisao === "problema" && !relato)
      throw new Response("Explique o que aconteceu antes de confirmar.", { status: 400 });

    const { data: prof } = await supabaseAdmin.from("profiles").select("full_name, phone").eq("id", userId).maybeSingle();
    const nome = (prof as any)?.full_name || email || "Solicitante";
    const nota = notaFinal(data.estrelas);
    const recebimento = {
      status: data.decisao,
      estrelas: nota,
      sugestao: data.decisao === "confirmado" ? data.sugestao?.trim() || null : null,
      relato: data.decisao === "problema" ? relato : null,
      registrado_em: new Date().toISOString(),
      registrado_por: nome,
    };
    const nextData = { ...((card.data as Record<string, unknown>) ?? {}), recebimento };
    const { error } = await supabaseAdmin.from("kanban_cards").update({ data: nextData as never }).eq("id", card.id);
    if (error) throw new Response("Não foi possível registrar o recebimento.", { status: 500 });

    if (data.decisao === "problema") {
      await supabaseAdmin.from("card_messages").insert({
        card_id: card.id,
        sender_id: userId,
        sender_name: nome,
        sender_email: email,
        sender_phone: (prof as any)?.phone ?? "",
        sender_role: isRequester ? "solicitante" : roles.has("owner") ? "owner" : roles.has("admin") ? "admin" : "aprovador",
        buyer_name: card.buyer_name,
        body: `⚠️ ALERTA DE RECEBIMENTO: ${isRequester ? "o solicitante" : nome} reportou uma falha na entrega (${nota}/5 estrelas): "${relato}"`,
      });
    }
    // Recebido confirmado → protocolo automático no Pipefy (falha fica registrada no card para reenvio na guia Protocolo).
    let protocolo: { ok: boolean; numero: string | null; pendencias: string[] } | null = null;
    if (data.decisao === "confirmado") {
      try {
        const { executarProtocoloPipefy } = await import("@/lib/pipefy-protocolo.server");
        const r: any = await executarProtocoloPipefy(supabaseAdmin, card.id, userId);
        protocolo = { ok: !!r.ok, numero: r.ok ? String(r.protocolo?.card_id ?? "") : null, pendencias: r.ok ? [] : (r.pendencias ?? []) };
      } catch (e) { console.error("Protocolo automático falhou", e); }
    }
    return { ok: true, recebimento, protocolo };
  });

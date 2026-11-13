import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getFaturamento, INVOICE_BUCKET } from "@/lib/invoice-documents";
import { validarDadosPagamento, CONDICOES_PAGAMENTO } from "@/lib/pagamento";

/** Só Comprador, Administrador e Proprietário (auditor só lê; solicitante não acessa). */
async function exigirEquipeCompras(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const roles = new Set((data ?? []).map((r: any) => r.role as string));
  if (!(roles.has("buyer") || roles.has("admin") || roles.has("owner")))
    throw new Response("Apenas Compradores, Administradores e Proprietário podem executar esta ação.", { status: 403 });
  return supabaseAdmin;
}

const parcelaSchema = z.object({ numero: z.number().int(), valor: z.string().max(30) });
const dadosSchema = z.object({
  condicao_de_pagamento: z.enum(CONDICOES_PAGAMENTO),
  banco: z.string().max(100).default(""),
  fornecedor: z.string().max(200).optional(),
  agencia: z.string().max(30).default(""),
  conta_corrente: z.string().max(40).default(""),
  codigo_pix: z.string().max(150).default(""),
  numero_de_parcelas: z.string().max(4).default(""),
  parcelas_detalhe: z.array(parcelaSchema).max(12).default([]),
  responsavel_pelo_cartao: z.string().max(150).default(""),
  despesa_contrato: z.enum(["Sim", "Não"]).default("Não"),
  numero_contrato: z.string().max(80).default(""),
  numero_nf: z.string().max(40),
  valor_documento: z.string().max(30),
});

/** Grava data.dados_pagamento (somente em Pedidos Gerados). Não altera status, aprovações ou transições. */
export const salvarDadosPagamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ card_id: z.string().uuid(), dados: dadosSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await exigirEquipeCompras(context.userId);
    const { data: card } = await admin.from("kanban_cards").select("id, status, data").eq("id", data.card_id).maybeSingle();
    if (!card) throw new Response("Solicitação não encontrada.", { status: 404 });
    if (card.status !== "pedidos_gerados") throw new Response("Dados de pagamento só podem ser informados em Pedidos Gerados.", { status: 409 });
    const fat = getFaturamento(card.data);
    const erros = validarDadosPagamento(data.dados, (fat.boletos?.length ?? 0) > 0);
    if (erros.length) throw new Response(erros.join(" "), { status: 400 });
    const { data: prof } = await admin.from("profiles").select("full_name, email").eq("id", context.userId).maybeSingle();
    const dados_pagamento = { ...data.dados, updated_at: new Date().toISOString(), updated_by: (prof as any)?.full_name || (prof as any)?.email || "Comprador", salvo_por_email: (prof as any)?.email || "" };
    const nextData = { ...((card.data as Record<string, unknown>) ?? {}), dados_pagamento };
    const { error } = await admin.from("kanban_cards").update({ data: nextData as never }).eq("id", card.id);
    if (error) throw new Response("Não foi possível salvar os dados de pagamento.", { status: 500 });
    return { ok: true, dados_pagamento };
  });

/** Reenvio manual pela guia Protocolo (só após o Recebido). */
export const protocolarPipefy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ card_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await exigirEquipeCompras(context.userId);
    const { executarProtocoloPipefy } = await import("@/lib/pipefy-protocolo.server");
    return executarProtocoloPipefy(admin, data.card_id, context.userId);
  });

/** Lê NF e boleto anexados (PDF) com IA e sugere os dados de pagamento. Não grava nada. */
export const extrairDadosPagamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ card_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await exigirEquipeCompras(context.userId);
    const { data: card } = await admin.from("kanban_cards").select("data").eq("id", data.card_id).maybeSingle();
    if (!card) return { ok: false as const, erro: "Solicitação não encontrada." };
    const fat = getFaturamento(card.data);
    const arquivos = [
      ...(fat.notas_fiscais ?? []).slice(0, 2).map((f) => ({ ...f, tipo: "Nota Fiscal" })),
      ...(fat.boletos ?? []).slice(0, 4).map((f) => ({ ...f, tipo: "Boleto" })),
    ];
    if (!arquivos.length) return { ok: false as const, erro: "Nenhuma NF ou boleto anexado." };
    const content: any[] = [{ type: "text", text:
      "Extraia dos documentos fiscais brasileiros abaixo (NF e boletos) os dados de pagamento. " +
      "numero_nf: número da nota (só dígitos, sem zeros à esquerda). valor_documento: valor total da NF em reais com ponto decimal (ex 1234.56). " +
      "fornecedor: razão social do emitente/beneficiário. boletos: um item por boleto/parcela com valor (ponto decimal). " +
      "Se a XML/chave de acesso estiver informada use-a para conferir o número: " + (fat.xml ?? "não informada") }];
    for (const a of arquivos) {
      const { data: blob } = await admin.storage.from(INVOICE_BUCKET).download(a.path);
      if (!blob) continue;
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      const mime = a.type || "application/pdf";
      content.push({ type: "text", text: `Documento: ${a.tipo} (${a.name})` });
      content.push({ type: "image_url", image_url: { url: `data:${mime};base64,${btoa(bin)}` } });
    }
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.8-flash",
        messages: [{ role: "user", content }],
        tools: [{ type: "function", function: { name: "dados", parameters: { type: "object", properties: {
          numero_nf: { type: "string" }, valor_documento: { type: "string" }, fornecedor: { type: "string" },
          boletos: { type: "array", items: { type: "object", properties: { valor: { type: "string" }, vencimento: { type: "string" } } } },
        }, required: ["numero_nf", "valor_documento"] } } }],
        tool_choice: { type: "function", function: { name: "dados" } },
      }),
    });
    if (!res.ok) {
      console.error("AI extract", res.status, (await res.text()).slice(0, 500));
      return { ok: false as const, erro: res.status === 429 ? "Muitas leituras seguidas; tente em instantes." : res.status === 402 ? "Créditos de IA esgotados." : "Não foi possível ler os documentos." };
    }
    const j: any = await res.json();
    try {
      const x = JSON.parse(j.choices[0].message.tool_calls[0].function.arguments);
      return { ok: true as const, numero_nf: String(x.numero_nf ?? ""), valor_documento: String(x.valor_documento ?? ""), fornecedor: String(x.fornecedor ?? ""),
        boletos: (Array.isArray(x.boletos) ? x.boletos : []).map((b: any) => ({ valor: String(b?.valor ?? "") })) as { valor: string }[] };
    } catch { return { ok: false as const, erro: "Resposta da leitura inválida." }; }
  });

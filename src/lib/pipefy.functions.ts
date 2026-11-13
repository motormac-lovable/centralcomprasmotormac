import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getFaturamento, INVOICE_BUCKET } from "@/lib/invoice-documents";
import { montarCamposPipefy, PIPEFY_ANEXO_BOLETO_FIELD, PIPEFY_ANEXO_NF_FIELD } from "@/lib/pipefy-payload";
import { validarDadosPagamento, CONDICOES_PAGAMENTO } from "@/lib/pagamento";

const PIPEFY_API = "https://api.pipefy.com/graphql";

async function gql(token: string, query: string, variables: Record<string, unknown>) {
  const r = await fetch(PIPEFY_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j.errors) {
    console.error("Pipefy error", r.status, JSON.stringify(j.errors ?? j).slice(0, 800));
    throw new Error(j.errors?.[0]?.message || `Pipefy respondeu ${r.status}`);
  }
  return j.data;
}

/** Só Comprador, Administrador e Proprietário (auditor só lê; solicitante não acessa). */
async function exigirEquipeCompras(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const roles = new Set((data ?? []).map((r: any) => r.role as string));
  if (!(roles.has("buyer") || roles.has("admin") || roles.has("owner")))
    throw new Response("Apenas Compradores, Administradores e Proprietário podem executar esta ação.", { status: 403 });
  return supabaseAdmin;
}

const parcelaSchema = z.object({ numero: z.number().int(), data_vencimento: z.string().max(10), valor: z.string().max(30) });
const dadosSchema = z.object({
  condicao_de_pagamento: z.enum(CONDICOES_PAGAMENTO),
  data_vencimento: z.string().max(10).default(""),
  banco: z.string().max(100).default(""),
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
    const dados_pagamento = { ...data.dados, updated_at: new Date().toISOString(), updated_by: (prof as any)?.full_name || (prof as any)?.email || "Comprador" };
    const nextData = { ...((card.data as Record<string, unknown>) ?? {}), dados_pagamento };
    const { error } = await admin.from("kanban_cards").update({ data: nextData as never }).eq("id", card.id);
    if (error) throw new Response("Não foi possível salvar os dados de pagamento.", { status: 500 });
    return { ok: true, dados_pagamento };
  });

/** Cria o card no Pipefy com os campos do De/Para e anexos (NF e boletos). Idempotente: não protocola duas vezes. */
export const protocolarPipefy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ card_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await exigirEquipeCompras(context.userId);
    const token = process.env["PIPEFY_API_TOKEN"];
    const pipeId = process.env["PIPEFY_PIPE_ID"];
    const orgId = process.env["PIPEFY_ORG_ID"];
    if (!token || !pipeId || !orgId)
      return { ok: false as const, pendencias: ["Integração com o Pipefy ainda não configurada (credenciais ausentes)."] };

    const { data: card } = await admin
      .from("kanban_cards")
      .select("id, status, title, summary, empresa, unidade, requester_email, order_number, numero_pedido_linx, codigo_unico, data, suppliers, buyer_name")
      .eq("id", data.card_id).maybeSingle();
    if (!card) throw new Response("Solicitação não encontrada.", { status: 404 });
    if (card.status !== "pedidos_gerados") return { ok: false as const, pendencias: ["O card precisa estar em Pedidos Gerados."] };
    const d = (card.data ?? {}) as Record<string, any>;
    if (d.protocolo_pipefy?.card_id) return { ok: true as const, protocolo: d.protocolo_pipefy, jaExistia: true };

    const fat = getFaturamento(card.data);
    const pend: string[] = [];
    if (!fat.notas_fiscais?.length) pend.push("Anexe a Nota Fiscal em Documentos de Faturamento.");
    const { data: au } = await admin.auth.admin.getUserById(context.userId);
    const { campos, pendencias } = montarCamposPipefy(card as any, au?.user?.email ?? "");
    pend.push(...pendencias);
    if (pend.length) return { ok: false as const, pendencias: pend };

    // Anexos: baixa do storage privado e envia via URL pré-assinada do Pipefy.
    const enviar = async (path: string, name: string) => {
      const { data: blob, error } = await admin.storage.from(INVOICE_BUCKET).download(path);
      if (error || !blob) throw new Error(`Falha ao ler anexo ${name}`);
      const pre = await gql(token, `mutation($i: CreatePresignedUrlInput!){ createPresignedUrl(input:$i){ url } }`,
        { i: { organizationId: orgId, fileName: name } });
      const url: string = pre.createPresignedUrl.url;
      const put = await fetch(url, { method: "PUT", body: await blob.arrayBuffer(), headers: { "Content-Type": blob.type || "application/octet-stream" } });
      if (!put.ok) throw new Error(`Falha ao enviar anexo ${name} ao Pipefy`);
      return new URL(url).pathname.replace(/^\//, "");
    };
    try {
      const nfPaths = await Promise.all((fat.notas_fiscais ?? []).map((f) => enviar(f.path, f.name)));
      campos.push({ field_id: PIPEFY_ANEXO_NF_FIELD, field_value: nfPaths });
      if (fat.boletos?.length) {
        const bPaths = await Promise.all(fat.boletos.map((f) => enviar(f.path, f.name)));
        campos.push({ field_id: PIPEFY_ANEXO_BOLETO_FIELD, field_value: bPaths });
      }
      const res = await gql(token, `mutation($i: CreateCardInput!){ createCard(input:$i){ card { id url } } }`,
        { i: { pipe_id: pipeId, title: `${card.codigo_unico ?? ""} ${card.title ?? ""}`.trim(), fields_attributes: campos } });
      const { data: prof } = await admin.from("profiles").select("full_name").eq("id", context.userId).maybeSingle();
      const protocolo = {
        card_id: String(res.createCard.card.id),
        url: res.createCard.card.url as string,
        protocolado_em: new Date().toISOString(),
        protocolado_por: (prof as any)?.full_name || au?.user?.email || "Comprador",
      };
      const { data: atual } = await admin.from("kanban_cards").select("data").eq("id", card.id).maybeSingle();
      const nextData = { ...((atual?.data as Record<string, unknown>) ?? {}), protocolo_pipefy: protocolo };
      await admin.from("kanban_cards").update({ data: nextData as never }).eq("id", card.id);
      return { ok: true as const, protocolo, jaExistia: false };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      const { data: atual } = await admin.from("kanban_cards").select("data").eq("id", card.id).maybeSingle();
      const nextData = { ...((atual?.data as Record<string, unknown>) ?? {}), protocolo_pipefy_erro: { mensagem: msg, em: new Date().toISOString() } };
      await admin.from("kanban_cards").update({ data: nextData as never }).eq("id", card.id);
      return { ok: false as const, pendencias: [`Falha no envio ao Pipefy: ${msg}`] };
    }
  });

/** Monta os campos do card Pipefy a partir do card da Central (puro, testável). */
import { centroCustoPipefy, empresaPipefy, setorPipefy } from "./pipefy-depara";
import { getDadosPagamento, parseValor } from "./pagamento";

export const PIPEFY_ANEXO_NF_FIELD = "anexar_nf";
export const PIPEFY_ANEXO_BOLETO_FIELD = "anexar_boleto";

export type CardParaProtocolo = {
  id: string;
  title?: string | null;
  summary?: string | null;
  empresa?: string | null;
  unidade?: string | null;
  requester_email?: string | null;
  order_number?: string | null;
  numero_pedido_linx?: string | null;
  codigo_unico?: string | null;
  data: unknown;
  suppliers?: unknown;
};

export type CampoPipefy = { field_id: string; field_value: string | string[] };

export function fornecedorVencedor(card: CardParaProtocolo): { fornecedor: string; valor: string; condicao: string } {
  const d = (card.data ?? {}) as Record<string, any>;
  const aprov = d.aprovacao ?? {};
  const sup = (Array.isArray(card.suppliers) ? card.suppliers : []).find((s: any) => s?.chosen) as any;
  return {
    fornecedor: aprov.fornecedor_escolhido || sup?.fornecedor || "",
    valor: aprov.valor_escolhido || sup?.valor || "",
    condicao: sup?.condicao || "",
  };
}

export function justificativaOriginal(card: CardParaProtocolo): string {
  const d = (card.data ?? {}) as Record<string, any>;
  return String(d.justificativa || d.motivo || d.descricao || d.observacoes || card.summary || card.title || "").trim();
}

/** Retorna os campos ou a lista de pendências que impedem o protocolo. */
export function montarCamposPipefy(card: CardParaProtocolo, compradorEmail: string) {
  const d = (card.data ?? {}) as Record<string, any>;
  const pg = getDadosPagamento(card.data);
  const pend: string[] = [];
  const setor = setorPipefy(d.departamento_codigo);
  if (!setor) pend.push(`Setor sem De/Para para o departamento ${d.departamento_codigo || "(não informado)"}.`);
  const emp = empresaPipefy(card.empresa ?? d.empresa, card.unidade ?? d.unidade);
  if (!emp) pend.push("Empresa/Unidade sem De/Para no Pipefy.");
  const cc = centroCustoPipefy(d.centro_custo_codigo, d.centro_custo_descricao, emp?.cnpj);
  if (cc.centro_de_custo === "Outro, qual?" && !cc.outro_centro_de_custo) pend.push("Centro de Custo não informado.");
  const venc = fornecedorVencedor(card);
  if (!venc.fornecedor) pend.push("Fornecedor vencedor não identificado.");
  if (!pg.condicao_de_pagamento) pend.push("Dados de pagamento não preenchidos.");
  if (!pg.numero_nf) pend.push("Número da NF não informado.");
  const valor = parseValor(pg.valor_documento || venc.valor);
  if (!(valor > 0)) pend.push("Valor do documento não informado.");
  const oc = card.numero_pedido_linx || card.order_number || "";
  if (!oc) pend.push("Número do pedido gerado não informado.");
  const just = justificativaOriginal(card);
  if (!just) pend.push("Justificativa da solicitação ausente.");

  const f: CampoPipefy[] = [];
  const add = (id: string, v: string | null | undefined) => { if (v) f.push({ field_id: id, field_value: v }); };
  add("setor", setor);
  add("seu_e_mail", compradorEmail);
  add("empresa", emp?.opcao);
  add("numero_do_nf", pg.numero_nf);
  add("valor_do_documento", valor > 0 ? valor.toFixed(2) : "");
  add("fornecedor", venc.fornecedor);
  add("gera_valor_a_pagar", "Sim");
  const c = pg.condicao_de_pagamento;
  add("condicao_de_pagamento", c);
  if (c === "Parcelado") {
    add("numero_de_parcelas", pg.numero_de_parcelas);
    add("data_vencimento", pg.parcelas_detalhe?.[0]?.data_vencimento);
    add("parcelas_detalhe", (pg.parcelas_detalhe ?? []).map((p) => `${p.numero}ª: ${p.data_vencimento} - R$ ${p.valor}`).join("\n"));
  } else add("data_vencimento", pg.data_vencimento);
  if (c === "Depósito") { add("banco", pg.banco); add("agencia", pg.agencia); add("conta_corrente", pg.conta_corrente); add("codigo_pix", pg.codigo_pix); }
  if (c === "Cartão corporativo") {
    add("responsavel_pelo_cartao", pg.responsavel_pelo_cartao);
    add("despesa_contrato", pg.despesa_contrato || "Não");
    if (pg.despesa_contrato === "Sim") add("numero_contrato", pg.numero_contrato);
  }
  add("tipo_de_lancamento", "Centro de Custo");
  add("centro_de_custo", cc.centro_de_custo);
  add("outro_centro_de_custo", cc.outro_centro_de_custo);
  add("tipo_de_autorizacao_de_pagamento", "Ordem de Compra");
  add("numero_da_ordem_de_compra", oc);
  add("justificativa_da_despesa", just);
  return { campos: f, pendencias: pend, copiaEmail: card.requester_email || null };
}

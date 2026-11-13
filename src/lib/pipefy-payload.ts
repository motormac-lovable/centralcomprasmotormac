/** Monta os campos do card Pipefy a partir do card da Central (puro, testável). */
import { centroCustoPipefy, empresaPipefy } from "./pipefy-depara";
import { getDadosPagamento, parseValor } from "./pagamento";

export const PIPEFY_ANEXO_NF_FIELD = "anexar_nf";
export const PIPEFY_ANEXO_BOLETO_FIELD = "anexar_boleto";
/** Valor da parcela 1..12 (IDs gerados pelo Pipefy, fora de ordem). */
export const PIPEFY_PARCELA_FIELDS = [
  "copy_of_valor_da_parcela_2", "copy_of_valor_da_parcela_1", "copy_of_copy_of_valor_da_parcela_1",
  "copy_of_copy_of_copy_of_valor_da_parcela_1", "copy_of_valor_da_parcela_4", "copy_of_copy_of_valor_da_parcela_4",
  "copy_of_copy_of_copy_of_valor_da_parcela_4", "copy_of_copy_of_copy_of_copy_of_valor_da_parcela_4", "copy_of_valor_da_parcela_8",
  "copy_of_copy_of_copy_of_copy_of_copy_of_valor_da_parcela_4", "copy_of_copy_of_valor_da_parcela_10", "copy_of_valor_da_parcela_11",
];

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
  // IDs reais do formulário público Pipefy (Gcg4XrX6).
  add("seu_e_mail", compradorEmail);
  add("c_pia_de_e_mail", card.requester_email || "");
  add("empresa", emp?.opcao);
  add("n_mero_do_documento", pg.numero_nf);
  add("valor_do_documento", valor > 0 ? valor.toFixed(2) : "");
  add("fornecedor", venc.fornecedor);
  add("livre_de_d_bito", "Sim");
  const c = pg.condicao_de_pagamento;
  add("condi_o_de_pagamento", c);
  if (c === "Parcelado") {
    add("n_mero_de_parcelas", pg.numero_de_parcelas);
    (pg.parcelas_detalhe ?? []).slice(0, 12).forEach((p, i) => {
      const v = parseValor(p.valor);
      if (v > 0) add(PIPEFY_PARCELA_FIELDS[i], v.toFixed(2));
    });
  }
  if (c === "Depósito") { add("banco", pg.banco); add("ag_ncia", pg.agencia); add("conta_corrente", pg.conta_corrente); add("c_digo_pix", pg.codigo_pix); }
  if (c === "Cartão corporativo") add("respons_vel_pelo_cart_o", pg.responsavel_pelo_cartao);
  add("tipo_de_lan_amento", "Centro de Custo");
  add("centro_de_custo", cc.centro_de_custo);
  add("centro_de_custos", cc.outro_centro_de_custo);
  add("tipo_de_autoriza_o_de_pagamento", "Ordem de Compra");
  add("uma_despesa_de_contrato", pg.despesa_contrato || "Não");
  if (pg.despesa_contrato === "Sim") add("n_mero_do_contrato", pg.numero_contrato);
  add("n_mero_da_ordem_de_compra", oc);
  add("observa_es", just);
  return { campos: f, pendencias: pend, copiaEmail: card.requester_email || null };
}

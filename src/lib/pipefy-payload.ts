/** Monta os campos do card Pipefy a partir do card da Central (puro, testável). */
import { centroCustoPipefy, empresaPipefy, setorPipefy } from "./pipefy-depara";
import { pedidoCompraInfo } from "./purchase-order-number";
import { getDadosPagamento, parseValor, normalizarVencimento } from "./pagamento";

/** IDs das etiquetas Setor e vencimentos, conferidos no formulário público. */
const SETOR_IDS: Record<string, string> = {
  "Tecnologia da Informação": "309399978", Marketing: "309399979", DP: "309399980", RH: "309399981",
  Financeiro: "309399982", Contabilidade: "309399987", Controladoria: "309399988", Geradores: "309399989",
  JCB: "309399990", Peças: "309400019", Engenharia: "309400023", Compras: "309400024",
  "Segurança do trabalho": "309400026", Oficina: "309400027", Frota: "309492409", NEST: "317317079", Administrativo: "318144216",
};
export const PIPEFY_VENCIMENTO_FIELDS = [
  "data_vencimento", "copy_of_data_vencimento", "copy_of_copy_of_data_vencimento", "copy_of_copy_of_copy_of_data_vencimento",
  "copy_of_data_vencimento_4", "copy_of_copy_of_copy_of_data_vencimento_4", "copy_of_copy_of_copy_of_copy_of_copy_of_data_vencimento_4",
  "copy_of_copy_of_copy_of_copy_of_data_vencimento_4", "copy_of_copy_of_data_vencimento_4", "copy_of_data_vencimento_9",
  "copy_of_data_vencimento_10", "copy_of_data_vencimento_11",
];

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
  const setor = setorPipefy(d.departamento_codigo ?? d.departamento);
  if (!setor) pend.push("Setor sem De/Para para o departamento da solicitação.");
  const emp = empresaPipefy(card.empresa ?? d.empresa, card.unidade ?? d.unidade);
  if (!emp) pend.push("Empresa/Unidade sem De/Para no Pipefy.");
  const cc = centroCustoPipefy(d.centro_custo_codigo, d.centro_custo_descricao, emp?.cnpj);
  if (cc.centro_de_custo === "Outro, qual?" && !cc.outro_centro_de_custo) pend.push("Centro de Custo não informado.");
  const venc0 = fornecedorVencedor(card);
  const venc = { ...venc0, fornecedor: venc0.fornecedor || (pg as any).fornecedor || "" };
  if (!venc.fornecedor) pend.push("Fornecedor vencedor não identificado.");
  if (!pg.condicao_de_pagamento) pend.push("Dados de pagamento não preenchidos.");
  if (!pg.numero_nf) pend.push("Número da NF não informado.");
  const valor = parseValor(pg.valor_documento || venc.valor);
  if (!(valor > 0)) pend.push("Valor do documento não informado.");
  // Para todos os fins, o número enviado é o do Pedido de Compra (regra PC), nunca o do Linx.
  const oc = pedidoCompraInfo(card.data)?.numero ?? "";
  if (!oc) pend.push("Número do Pedido de Compra (PC) ainda não gerado.");
  const just = justificativaOriginal(card);
  if (!just) pend.push("Justificativa da solicitação ausente.");

  const f: CampoPipefy[] = [];
  const add = (id: string, v: string | null | undefined) => { if (v) f.push({ field_id: id, field_value: v }); };
  if (setor) f.push({ field_id: "sele_o_de_etiqueta", field_value: [SETOR_IDS[setor]] });
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
    add("n_mero_de_parcelas", String(pg.parcelas_detalhe?.length ?? ""));
    (pg.parcelas_detalhe ?? []).slice(0, 12).forEach((p, i) => {
      const v = parseValor(p.valor);
      if (v > 0) add(PIPEFY_PARCELA_FIELDS[i], v.toFixed(2));
      const date = normalizarVencimento(p.vencimento);
      if (date) add(PIPEFY_VENCIMENTO_FIELDS[i], `${date}T12:00:00-03:00`);
      else pend.push(`Vencimento da parcela ${i + 1} não informado. Leia os boletos no card.`);
    });
  } else {
    const date = normalizarVencimento(pg.data_vencimento);
    if (date) add("data_vencimento", `${date}T12:00:00-03:00`);
    else pend.push("Data de vencimento não informada. Confira os dados de pagamento no card.");
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

import { getFaturamento } from "./invoice-documents";
import { getDadosPagamento } from "./pagamento";
import { montarCamposPipefy, type CardParaProtocolo } from "./pipefy-payload";

/** Usa as mesmas pendências do envio, sem disparar protocolo ou alterar o card. */
export function situacaoProtocolo(card: CardParaProtocolo) {
  const d = (card.data ?? {}) as Record<string, any>;
  if (d.protocolo_pipefy?.card_id) return { label: "Protocolado", tone: "ok", pronto: false, pendencias: [] as string[] };
  const fat = getFaturamento(card.data);
  const pendencias = montarCamposPipefy(card, d.dados_pagamento?.salvo_por_email ?? "").pendencias;
  if (!fat.notas_fiscais?.length) pendencias.unshift("Anexe a Nota Fiscal em Documentos de Faturamento.");
  const recebido = d.recebimento?.status === "confirmado";
  const pronto = recebido && pendencias.length === 0;
  if (pendencias.length) return { label: "Dados pendentes", tone: "pend", pronto: false, pendencias };
  if (d.protocolo_pipefy_erro) return { label: "Falha no envio", tone: "erro", pronto, pendencias };
  if (!getDadosPagamento(card.data).condicao_de_pagamento) return { label: "Aguardando dados de pagamento", tone: "pend", pronto: false, pendencias };
  if (d.recebimento?.status === "problema") return { label: "Recebimento com problema", tone: "erro", pronto: false, pendencias };
  if (!recebido) return { label: "Aguardando Recebido do solicitante", tone: "pend", pronto: false, pendencias };
  return { label: "Pronto para protocolar", tone: "pronto", pronto, pendencias };
}
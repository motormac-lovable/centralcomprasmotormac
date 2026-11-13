import { getFaturamento } from "@/lib/invoice-documents";

export type RecebimentoStatus = "neutro" | "aguardando_docs" | "pendente_aceite" | "confirmado" | "problema";

export type Recebimento = {
  status: "confirmado" | "problema";
  estrelas: number;
  sugestao?: string | null;
  relato?: string | null;
  registrado_em: string;
  registrado_por: string;
};

export const SUGESTAO_MAX = 500;
export const RELATO_MAX = 1000;

export function getRecebimento(data: unknown): Recebimento | null {
  const r = (data as { recebimento?: Recebimento } | null)?.recebimento;
  return r && (r.status === "confirmado" || r.status === "problema") ? r : null;
}

export function hasDocumentosFiscaisCompletos(data: unknown): boolean {
  const f = getFaturamento(data);
  return (f.notas_fiscais?.length ?? 0) > 0 && (f.boletos?.length ?? 0) > 0 && !!f.xml?.trim();
}

/** Estado da célula de Recebimento — decisão final congela o estado. */
export function recebimentoStatus(card: { status: string; data: unknown }): RecebimentoStatus {
  const r = getRecebimento(card.data);
  if (r) return r.status;
  if (card.status !== "pedidos_gerados") return "neutro";
  return hasDocumentosFiscaisCompletos(card.data) ? "pendente_aceite" : "aguardando_docs";
}

/** Nota padrão: 5 estrelas quando o solicitante não escolher. */
export function notaFinal(estrelas: number): number {
  return estrelas >= 1 && estrelas <= 5 ? Math.round(estrelas) : 5;
}

/** Quem pode registrar o recebimento: solicitante, Desenvolvedor/Proprietário, Administrador
 *  ou aprovador cujo escopo inclui o Centro de Custo da solicitação. */
export function podeRegistrarRecebimento(p: {
  isRequester: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  isApprover: boolean;
  approverDepartments: string[];
  centroCustoDescricao?: string | null;
}): boolean {
  if (p.isRequester || p.isOwner || p.isAdmin) return true;
  const cc = (p.centroCustoDescricao ?? "").trim().toUpperCase();
  return p.isApprover && !!cc && p.approverDepartments.some((d) => d.trim().toUpperCase() === cc);
}

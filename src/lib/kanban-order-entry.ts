type EntryCard = {
  kind: string;
  status: string;
  data: unknown;
  approver_id: string | null;
};

export const MANUAL_ORDER_ENTRY_MESSAGE =
  "Movimentação manual não permitida para 'Pedidos Gerados'. O card é movido automaticamente após a aprovação da cotação.";

export function hasFormalOrderApproval(card: EntryCard): boolean {
  if (card.status !== "cotacoes_aprovadas" && card.status !== "pedidos_gerados") return false;
  if (!card.approver_id || !card.data || typeof card.data !== "object") return false;
  const approval = (card.data as Record<string, unknown>).aprovacao;
  if (!approval || typeof approval !== "object") return false;
  const { aprovador, aprovado_em } = approval as Record<string, unknown>;
  return typeof aprovador === "string" && aprovador.trim().length > 0 &&
    typeof aprovado_em === "string" && Number.isFinite(Date.parse(aprovado_em));
}

/** Only validates the manual Kanban path; the approval RPC and ERP flow do not use this guard. */
export function manualOrderEntryBlock(card: EntryCard, requestedStatus: string): "manual" | "approval" | null {
  if (requestedStatus === "pedidos_gerados") return "manual";
  if (card.kind === "frete" && requestedStatus === "cotacoes_aprovadas" && !hasFormalOrderApproval(card)) {
    return "approval";
  }
  return null;
}
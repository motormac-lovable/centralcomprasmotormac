// Regras puras das notificações (toasts) — sem dependência de navegador.
export const TOAST_NOVAS_MENSAGENS =
  "💬 Olá, você possui novas mensagens na Central de Compras. Acesse a plataforma para interagir com o comprador.";
export const TOAST_NOVAS_MENSAGENS_COMPRADOR =
  "💬 Olá, você possui novas mensagens na Central de Compras. Acesse a plataforma para interagir com o solicitante.";
export const TOAST_APROVACAO_PENDENTE =
  "🔔 Olá, existe uma ou mais solicitações aguardando aprovação na Central de Compras.";
export const TOAST_MUDANCA_STATUS =
  "🔄 Olá, uma ou mais solicitações de compra mudaram de status. Acompanhe pelo seu histórico na Central de Compras.";
export const TOAST_DURATION_MS = 5000;

export type ChatCard = { requester_id: string | null; assigned_to: string | null; buyer_name: string | null };
export type ChatPerson = { id: string; name?: string | null };

/** Papéis dinâmicos a partir do próprio card (não do perfil cadastrado). */
export const isSolicitante = (p: ChatPerson, c: ChatCard) => !!c.requester_id && p.id === c.requester_id;
export const isComprador = (p: ChatPerson, c: ChatCard) =>
  (!!c.assigned_to && p.id === c.assigned_to) ||
  (!!c.buyer_name && !!p.name && p.name.trim().toLowerCase() === c.buyer_name.trim().toLowerCase());

/** Via dupla: solicitante→comprador; comprador→solicitante; terceiro→ambos. */
export function shouldNotifyChat(sender: ChatPerson, me: ChatPerson, card: ChatCard): boolean {
  if (sender.id === me.id) return false;
  const meSol = isSolicitante(me, card), meComp = isComprador(me, card);
  if (isSolicitante(sender, card)) return meComp;
  if (isComprador(sender, card)) return meSol;
  return meSol || meComp;
}

export function chatToastText(me: ChatPerson, card: ChatCard) {
  return isComprador(me, card) && !isSolicitante(me, card) ? TOAST_NOVAS_MENSAGENS_COMPRADOR : TOAST_NOVAS_MENSAGENS;
}

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

/** Via dupla dinâmica: papéis definidos pelo próprio card, não pelo perfil. */
export function chatRecipients(
  senderId: string,
  card: { requester_id: string | null; assigned_to: string | null },
): string[] {
  const sol = card.requester_id;
  const comp = card.assigned_to;
  let out: Array<string | null>;
  if (sol && senderId === sol) out = [comp];
  else if (comp && senderId === comp) out = [sol];
  else out = [sol, comp];
  return Array.from(new Set(out.filter((x): x is string => !!x && x !== senderId)));
}

/** Texto do toast conforme o papel do destinatário no card. */
export function chatToastText(recipientId: string, card: { assigned_to: string | null; requester_id: string | null }) {
  return card.assigned_to === recipientId && card.requester_id !== recipientId
    ? TOAST_NOVAS_MENSAGENS_COMPRADOR
    : TOAST_NOVAS_MENSAGENS;
}

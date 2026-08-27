import { getDataProvider } from "@/services/data/provider";

export const FILA_GERAL_LABEL = "Fila de Atendimento (Aguardando Atribuição)";

export type CardMessage = {
  id: string;
  card_id: string;
  sender_id: string;
  sender_name: string;
  sender_email: string;
  sender_phone: string;
  sender_role: string;
  buyer_name: string | null;
  body: string;
  read_at: string | null;
  created_at: string;
};

export type MessageCardRef = {
  id: string;
  codigo_unico?: string | null;
  title?: string | null;
  buyer_name?: string | null;
};

export function buyerLabel(buyer: string | null | undefined) {
  return buyer && buyer.trim() ? buyer : `Comprador: ${FILA_GERAL_LABEL}`;
}

/** Lê o comprador atualmente vinculado ao card no Kanban. */
export async function fetchCardBuyer(cardId: string): Promise<string | null> {
  const api = await getDataProvider();
  return api.solicitacoes.getBuyer(cardId);
}

export async function sendCardMessage(input: {
  card: MessageCardRef;
  body: string;
  sender: { id: string; name: string; email: string; phone: string; role: string };
}) {
  const api = await getDataProvider();
  // Regra de associação: quando um COMPRADOR envia mensagem a partir de um card,
  // ele passa a ser o comprador vinculado àquela solicitação.
  let buyerNow = await fetchCardBuyer(input.card.id);
  const senderName = input.sender.name?.trim();
  if (input.sender.role === "comprador" && senderName && buyerNow !== senderName) {
    try {
      await api.solicitacoes.update(input.card.id, {
        buyer_name: senderName,
        buyer_assigned_at: new Date().toISOString(),
      });
      buyerNow = senderName;
    } catch { /* mantém o comprador atual se a atualização falhar */ }
  }

  await api.mensagens.create({
    card_id: input.card.id,
    sender_id: input.sender.id,
    sender_name: input.sender.name,
    sender_email: input.sender.email,
    sender_phone: input.sender.phone,
    sender_role: input.sender.role,
    buyer_name: buyerNow,
    body: input.body.trim(),
  });
}


/** Marca como lidas todas as mensagens de uma conversa que não foram enviadas pelo usuário. */
export async function markConversationRead(cardId: string, userId: string) {
  const api = await getDataProvider();
  await api.mensagens.markRead([cardId], userId);
}

/**
 * Marca como lidas todas as mensagens recebidas nas conversas visíveis ao usuário.
 * Usado ao abrir "Minhas Mensagens": o badge some após a visualização e só volta
 * a aparecer quando chegar uma nova mensagem de outra pessoa.
 */
export async function markConversationsRead(cardIds: string[], userId: string) {
  if (cardIds.length === 0) return;
  const api = await getDataProvider();
  await api.mensagens.markRead(cardIds, userId);
}


export function formatMessageDate(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} às ${p(d.getHours())}:${p(d.getMinutes())}`;
}

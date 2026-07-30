import { supabase } from "@/integrations/supabase/client";

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
  const { data } = await supabase
    .from("kanban_cards")
    .select("buyer_name")
    .eq("id", cardId)
    .maybeSingle();
  return (data as { buyer_name?: string | null } | null)?.buyer_name ?? null;
}

export async function sendCardMessage(input: {
  card: MessageCardRef;
  body: string;
  sender: { id: string; name: string; email: string; phone: string; role: string };
}) {
  // Regra de associação: quando um COMPRADOR envia mensagem a partir de um card,
  // ele passa a ser o comprador vinculado àquela solicitação.
  let buyerNow = await fetchCardBuyer(input.card.id);
  const senderName = input.sender.name?.trim();
  if (input.sender.role === "comprador" && senderName && buyerNow !== senderName) {
    const { error: assignError } = await supabase
      .from("kanban_cards")
      .update({ buyer_name: senderName, buyer_assigned_at: new Date().toISOString() })
      .eq("id", input.card.id);
    if (!assignError) buyerNow = senderName;
  }

  const { error } = await supabase.from("card_messages").insert({
    card_id: input.card.id,
    sender_id: input.sender.id,
    sender_name: input.sender.name,
    sender_email: input.sender.email,
    sender_phone: input.sender.phone,
    sender_role: input.sender.role,
    buyer_name: buyerNow,
    body: input.body.trim(),
  });
  if (error) throw error;
}


/** Marca como lidas todas as mensagens de uma conversa que não foram enviadas pelo usuário. */
export async function markConversationRead(cardId: string, userId: string) {
  await supabase
    .from("card_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("card_id", cardId)
    .is("read_at", null)
    .neq("sender_id", userId);
}

export function formatMessageDate(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} às ${p(d.getHours())}:${p(d.getMinutes())}`;
}

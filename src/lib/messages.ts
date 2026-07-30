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

export async function sendCardMessage(input: {
  card: MessageCardRef;
  body: string;
  sender: { id: string; name: string; email: string; phone: string; role: string };
}) {
  const { error } = await supabase.from("card_messages").insert({
    card_id: input.card.id,
    sender_id: input.sender.id,
    sender_name: input.sender.name,
    sender_email: input.sender.email,
    sender_phone: input.sender.phone,
    sender_role: input.sender.role,
    buyer_name: input.card.buyer_name ?? null,
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

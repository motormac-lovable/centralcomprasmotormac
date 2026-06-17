import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Kind = Database["public"]["Enums"]["card_kind"];
type Status = Database["public"]["Enums"]["card_status"];

export const STATUS_COLUMNS: { id: Status; label: string; tone: string }[] = [
  { id: "pending", label: "Pendente / Novo", tone: "oklch(0.62 0.18 60)" },
  { id: "in_progress", label: "Em Análise / Desenvolvimento", tone: "oklch(0.55 0.18 250)" },
  { id: "done", label: "Aprovado / Realizado", tone: "oklch(0.6 0.18 150)" },
  { id: "rejected", label: "Recusado / Erro", tone: "oklch(0.6 0.24 27)" },
];

export const KIND_LABEL: Record<Kind, string> = {
  compras: "Compra de Peças",
  contratos: "Contratos",
  frete: "Frete",
};

export async function createCard(input: {
  kind: Kind;
  title: string;
  summary: string;
  requester_name?: string;
  requester_email?: string;
  unidade?: string;
  empresa?: string;
  data: Record<string, unknown>;
}) {
  const { data, error } = await supabase
    .from("kanban_cards")
    .insert({ ...input, data: input.data as never })
    .select()
    .single();
  if (error) throw error;
  return data;
}

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Kind = Database["public"]["Enums"]["card_kind"];
export type Status = Database["public"]["Enums"]["card_status"];

export const STATUS_COLUMNS: { id: Status; label: string; tone: string; bg: string }[] = [
  { id: "solicitacoes_abertas",  label: "Solicitações abertas",   tone: "oklch(0.55 0.18 250)", bg: "transparent" },
  { id: "em_cotacao",            label: "Em cotação",             tone: "oklch(0.75 0.16 85)",  bg: "transparent" },
  { id: "aguardando_aprovacao",  label: "Aguardando Aprovação",   tone: "oklch(0.6 0.18 280)",  bg: "transparent" },
  { id: "cotacoes_aprovadas",    label: "Cotações Aprovadas",     tone: "oklch(0.65 0.18 160)", bg: "color-mix(in oklab, oklch(0.65 0.18 160) 6%, transparent)" },
  { id: "cotacoes_rejeitadas",   label: "Cotações Rejeitadas",    tone: "oklch(0.6 0.24 27)",   bg: "color-mix(in oklab, oklch(0.6 0.24 27) 6%, transparent)" },
  { id: "pedidos_gerados",       label: "Pedidos gerados",        tone: "oklch(0.6 0.18 150)",  bg: "color-mix(in oklab, oklch(0.6 0.18 150) 6%, transparent)" },
];

export const KIND_LABEL: Record<Kind, string> = {
  compras: "Compra de Peças",
  contratos: "Contratos",
  frete: "Frete",
  materiais: "Materiais e Serviços",
};

export type Observation = { at: string; author: string; text: string };
export type Supplier = {
  id: string;
  fornecedor: string;
  valor: string;
  prazo: string;
  condicao: string;
  chosen: boolean;
};
export type Attachment = { name: string; path: string; size: number; uploaded_at: string };

export function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/** SLA tag for "Solicitações abertas" — based on created_at. */
export function openSlaTag(createdAt: string): { label: string; bg: string; fg: string } {
  const d = daysSince(createdAt);
  if (d >= 7) return { label: "Em atraso", bg: "oklch(0.6 0.24 27)", fg: "white" };
  if (d >= 4) return { label: "Início Imediato", bg: "oklch(0.75 0.16 65)", fg: "#1a1a1a" };
  return { label: "Aguardando início", bg: "oklch(0.55 0.18 250)", fg: "white" };
}

/** SLA tag for "Aguardando Aprovação" — based on status_changed_at. */
export function approvalSlaTag(statusChangedAt: string): { label: string; bg: string; fg: string } {
  const d = daysSince(statusChangedAt);
  if (d > 20) return { label: "Compra declinada", bg: "oklch(0.6 0.24 27)", fg: "white" };
  if (d >= 5) return { label: "Aprovação Pendente", bg: "oklch(0.7 0.18 60)", fg: "#1a1a1a" };
  return { label: "Aguardando Aprovação", bg: "oklch(0.55 0.18 250)", fg: "white" };
}

export async function createCard(input: {
  kind: Kind;
  title: string;
  summary: string;
  requester_name?: string;
  requester_email?: string;
  unidade?: string;
  empresa?: string;
  status?: Status;
  data: Record<string, unknown>;
}) {
  const { error } = await supabase
    .from("kanban_cards")
    .insert({ ...input, data: input.data as never });
  if (error) throw error;
  return { ok: true as const };
}

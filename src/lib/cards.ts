import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { getCompradoraByCodigo, MATERIAL_BUYERS } from "@/lib/apollo-buyers";


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
  cnpj?: string;
  email?: string;
  telefone?: string;
  observacao?: string;
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
  // Regra de atribuição inicial do Comprador conforme a origem do formulário.
  let buyer_name: string | null = null;
  let buyer_source: "materiais_apollo" | "rodizio_contratos" | null = null;

  if (input.kind === "materiais") {
    const itens = Array.isArray((input.data as { itens?: unknown }).itens)
      ? ((input.data as { itens: Array<{ codigo?: string }> }).itens)
      : [];
    for (const it of itens) {
      const b = getCompradoraByCodigo(it?.codigo);
      if (b) { buyer_name = b; buyer_source = "materiais_apollo"; break; }
    }
  } else if (input.kind === "contratos") {
    try {
      const { data: assigned } = await supabase.rpc("assign_contract_buyer", { _buyers: MATERIAL_BUYERS });
      if (assigned && typeof assigned === "string") {
        buyer_name = assigned;
        buyer_source = "rodizio_contratos";
      }
    } catch { /* fallback silencioso: card sem comprador */ }
  }
  // "compras" (peças) e "frete" iniciam sem comprador.

  const initialObs: Array<{ at: string; author: string; text: string }> = [];
  if (buyer_name) {
    const at = new Date().toISOString();
    initialObs.push({
      at,
      author: "Sistema",
      text: buyer_source === "rodizio_contratos"
        ? `👤 Campo Comprador atribuído automaticamente a ${buyer_name} pelo revezamento cíclico de contratos.`
        : `👤 Campo Comprador atribuído automaticamente a ${buyer_name} conforme mapeamento da base "Listas Materiais Apollo".`,
    });
  }

  // Sempre grava o requester_id (auth.uid) para que o Histórico do Solicitante
  // funcione mesmo quando o e-mail digitado no formulário difere do e-mail
  // de autenticação (comum em envios via mobile).
  // getSession() lê a sessão local (sem round-trip de rede) — envio mais rápido.
  const { data: sessionData } = await supabase.auth.getSession();
  const requester_id = sessionData?.session?.user?.id ?? null;

  const insertPayload: Record<string, unknown> = {
    ...input,
    data: input.data as never,
    buyer_name,
    buyer_assigned_at: buyer_name ? new Date().toISOString() : null,
    requester_id,
  };
  if (initialObs.length) insertPayload.observations = initialObs as never;

  const { error } = await supabase
    .from("kanban_cards")
    .insert(insertPayload as never);
  if (error) throw error;
  return { ok: true as const, buyer_name };
}


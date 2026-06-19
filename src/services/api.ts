// Centraliza a estrutura de payload e helpers da integração com o Linx Apollo.
// Toda a I/O acontece neste módulo para facilitar a substituição da simulação
// por chamadas reais quando a API estiver liberada.
import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";

export type KanbanCardRow = Database["public"]["Tables"]["kanban_cards"]["Row"];

export type LinxPayload = {
  codigo_unico: string;
  unidade: string | null;
  empresa: string | null;
  tipo: KanbanCardRow["kind"];
  solicitante: { nome: string | null; email: string | null };
  fornecedor_vencedor: {
    fornecedor: string;
    valor: string;
    prazo: string;
    condicao: string;
  } | null;
  itens: Record<string, unknown> | Array<Record<string, unknown>>;
  aprovador: { id: string | null; nome: string | null };
  apollo_id?: string | null;
};

export function buildLinxPayload(card: KanbanCardRow): LinxPayload {
  const suppliers = (card.suppliers as unknown as Array<{
    fornecedor: string;
    valor: string;
    prazo: string;
    condicao?: string;
    pagamento?: string;
    chosen?: boolean;
    escolhido?: boolean;
  }>) ?? [];
  const winner = suppliers.find((s) => s.chosen || s.escolhido) ?? null;
  return {
    codigo_unico: card.codigo_unico ?? "",
    unidade: card.unidade,
    empresa: card.empresa,
    tipo: card.kind,
    solicitante: { nome: card.requester_name, email: card.requester_email },
    fornecedor_vencedor: winner
      ? {
          fornecedor: winner.fornecedor,
          valor: winner.valor,
          prazo: winner.prazo,
          condicao: winner.condicao ?? winner.pagamento ?? "",
        }
      : null,
    itens: (() => {
      const data = (card.data as Record<string, unknown>) ?? {};
      if (Array.isArray(data.itens)) return data.itens as Array<Record<string, unknown>>;
      return data;
    })(),

    aprovador: { id: card.approver_id, nome: card.approver_name },
    apollo_id: card.numero_pedido_linx ?? card.order_number ?? null,
  };
}

export function exportJSON(rows: KanbanCardRow[]): void {
  const payload = rows.map(buildLinxPayload);
  downloadFile(
    JSON.stringify(payload, null, 2),
    `motormac-linx-${new Date().toISOString().slice(0, 10)}.json`,
    "application/json",
  );
}

export function exportCSV(rows: KanbanCardRow[]): void {
  const headers = [
    "codigo_unico",
    "tipo",
    "unidade",
    "empresa",
    "solicitante",
    "email",
    "fornecedor_vencedor",
    "valor",
    "prazo",
    "pedido_linx",
    "created_at",
  ];
  const lines = [headers.join(";")];
  for (const card of rows) {
    const p = buildLinxPayload(card);
    lines.push(
      [
        p.codigo_unico,
        p.tipo,
        p.unidade ?? "",
        p.empresa ?? "",
        p.solicitante.nome ?? "",
        p.solicitante.email ?? "",
        p.fornecedor_vencedor?.fornecedor ?? "",
        p.fornecedor_vencedor?.valor ?? "",
        p.fornecedor_vencedor?.prazo ?? "",
        p.apollo_id ?? "",
        card.created_at,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(";"),
    );
  }
  downloadFile(
    lines.join("\n"),
    `motormac-linx-${new Date().toISOString().slice(0, 10)}.csv`,
    "text/csv;charset=utf-8",
  );
}

function downloadFile(content: string, name: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Simula o webhook de retorno do Linx Apollo:
 * recebe o código único, gera um número de pedido fictício,
 * atualiza o card e move para "Pedidos gerados".
 */
export async function simulateLinxWebhook(
  codigoUnico: string,
): Promise<{ ok: true; pedido: string; cardId: string } | { ok: false; error: string }> {
  const { data: card, error: fetchErr } = await supabase
    .from("kanban_cards")
    .select("id, status, title")
    .eq("codigo_unico", codigoUnico)
    .maybeSingle();
  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!card) return { ok: false, error: `Solicitação #${codigoUnico} não encontrada.` };

  const pedido = String(Math.floor(100000 + Math.random() * 900000));
  const { error: upErr } = await supabase
    .from("kanban_cards")
    .update({
      numero_pedido_linx: pedido,
      order_number: pedido,
      status: "pedidos_gerados",
    })
    .eq("id", card.id);
  if (upErr) return { ok: false, error: upErr.message };
  return { ok: true, pedido, cardId: card.id };
}

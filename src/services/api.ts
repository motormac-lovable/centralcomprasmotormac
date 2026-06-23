// Centraliza a estrutura de payload e helpers da integração com o Linx Apollo.
// Toda a I/O acontece neste módulo para facilitar a substituição da simulação
// por chamadas reais quando a API estiver liberada.
import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { getCompradoraByCodigo } from "@/lib/apollo-buyers";

export type KanbanCardRow = Database["public"]["Tables"]["kanban_cards"]["Row"];

export type LinxItem = {
  codigo_material: string;
  descricao_material: string;
  quantidade_solicitada: string;
  unidade_medida: string;
};

export type LinxFornecedorVencedor = {
  razao_social: string;
  cnpj: string;
  valor_total_cotado: string;
  prazo_entrega: string;
  condicao_pagamento: string;
} | null;

export type LinxPayload = {
  identificacao: {
    codigo_unico: string;
    solicitante: {
      nome: string | null;
      telefone: string | null;
      email: string | null;
    };
    unidade: string | null;
    empresa: string | null;
    compradora_responsavel: string | null;
  };
  tecnico_operacional: {
    departamento: string | null;
    origem: string | null;
    tipo_solicitacao: string;
    descricao: string | null;
    indicacao_fornecedor: { nome: string | null; cnpj: string | null };
  };
  itens: LinxItem[];
  fornecedor_vencedor: LinxFornecedorVencedor;
  aprovador: { id: string | null; nome: string | null };
  meta: {
    tipo_card: KanbanCardRow["kind"];
    apollo_id: string | null;
    created_at: string;
  };
};

type RawItem = {
  codigo?: string;
  material?: string;
  descricao?: string;
  quantidade?: string | number;
  unidadeMedida?: string;
  unidade_medida?: string;
};

type RawSupplier = {
  fornecedor?: string;
  razao_social?: string;
  cnpj?: string;
  valor?: string;
  valor_total?: string;
  prazo?: string;
  prazo_entrega?: string;
  condicao?: string;
  condicao_pagamento?: string;
  pagamento?: string;
  chosen?: boolean;
  escolhido?: boolean;
};

export function buildLinxPayload(card: KanbanCardRow): LinxPayload {
  const data = (card.data as Record<string, unknown>) ?? {};
  const rawItens: RawItem[] = Array.isArray(data.itens) ? (data.itens as RawItem[]) : [];
  const itens: LinxItem[] = rawItens.map((it) => ({
    codigo_material: String(it.codigo ?? ""),
    descricao_material: String(it.material ?? it.descricao ?? ""),
    quantidade_solicitada: String(it.quantidade ?? ""),
    unidade_medida: String(it.unidadeMedida ?? it.unidade_medida ?? ""),
  }));

  const compradora =
    itens.map((i) => getCompradoraByCodigo(i.codigo_material)).find(Boolean) ?? null;

  const suppliers = (card.suppliers as unknown as RawSupplier[]) ?? [];
  const winner = suppliers.find((s) => s.chosen || s.escolhido) ?? null;
  const fornecedor_vencedor: LinxFornecedorVencedor = winner
    ? {
        razao_social: winner.razao_social ?? winner.fornecedor ?? "",
        cnpj: winner.cnpj ?? "",
        valor_total_cotado: winner.valor_total ?? winner.valor ?? "",
        prazo_entrega: winner.prazo_entrega ?? winner.prazo ?? "",
        condicao_pagamento:
          winner.condicao_pagamento ?? winner.condicao ?? winner.pagamento ?? "",
      }
    : null;

  return {
    identificacao: {
      codigo_unico: card.codigo_unico ?? "",
      solicitante: {
        nome: card.requester_name ?? (data.nome as string) ?? null,
        telefone: (data.telefone as string) ?? null,
        email: card.requester_email ?? (data.email as string) ?? null,
      },
      unidade: card.unidade,
      empresa: card.empresa,
      compradora_responsavel: compradora,
    },
    tecnico_operacional: {
      departamento: (data.departamento as string) ?? null,
      origem: (data.origem as string) ?? null,
      tipo_solicitacao: (data.tipo as string) ?? "Convencional",
      descricao: (data.descricao as string) ?? null,
      indicacao_fornecedor: {
        nome: (data.fornecedorNome as string) ?? null,
        cnpj: (data.fornecedorCnpj as string) ?? null,
      },
    },
    itens,
    fornecedor_vencedor,
    aprovador: { id: card.approver_id, nome: card.approver_name },
    meta: {
      tipo_card: card.kind,
      apollo_id: card.numero_pedido_linx ?? card.order_number ?? null,
      created_at: card.created_at,
    },
  };
}

export const MOCK_LINX_PAYLOAD: LinxPayload = {
  identificacao: {
    codigo_unico: "0620265",
    solicitante: {
      nome: "Maria Silva Andrade",
      telefone: "(51) 99876-5432",
      email: "maria.andrade@motormac.com.br",
    },
    unidade: "Porto Alegre",
    empresa: "NEST",
    compradora_responsavel: "Andressa Andrade",
  },
  tecnico_operacional: {
    departamento: "MANUTENÇÃO INDUSTRIAL",
    origem: "ALMOXARIFADO CENTRAL",
    tipo_solicitacao: "Convencional",
    descricao:
      "Reposição de estoque mínimo para os itens do almoxarifado central. Necessário entrega até o fim do mês.",
    indicacao_fornecedor: {
      nome: "Lubrificantes Sul Ltda.",
      cnpj: "12.345.678/0001-90",
    },
  },
  itens: [
    {
      codigo_material: "1",
      descricao_material: "ÓLEO LUBRIFICANTE 15W40",
      quantidade_solicitada: "20",
      unidade_medida: "L",
    },
    {
      codigo_material: "82",
      descricao_material: "FILTRO DE COMBUSTÍVEL",
      quantidade_solicitada: "12",
      unidade_medida: "UN",
    },
  ],
  fornecedor_vencedor: {
    razao_social: "Lubrificantes Sul Ltda.",
    cnpj: "12.345.678/0001-90",
    valor_total_cotado: "R$ 4.820,00",
    prazo_entrega: "5 dias úteis",
    condicao_pagamento: "28 DDL",
  },
  aprovador: {
    id: "00000000-0000-0000-0000-000000000000",
    nome: "Vanessa Motormac",
  },
  meta: {
    tipo_card: "materiais",
    apollo_id: null,
    created_at: new Date().toISOString(),
  },
};

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
        p.identificacao.codigo_unico,
        p.meta.tipo_card,
        p.identificacao.unidade ?? "",
        p.identificacao.empresa ?? "",
        p.identificacao.solicitante.nome ?? "",
        p.identificacao.solicitante.email ?? "",
        p.fornecedor_vencedor?.razao_social ?? "",
        p.fornecedor_vencedor?.valor_total_cotado ?? "",
        p.fornecedor_vencedor?.prazo_entrega ?? "",
        p.meta.apollo_id ?? "",
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

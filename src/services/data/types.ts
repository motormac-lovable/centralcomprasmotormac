/**
 * Tipos de domínio independentes de fornecedor de banco.
 * Espelham o schema corporativo (ver docs/schema_oracle.sql) e não dependem
 * dos tipos gerados pelo backend atual.
 */

export type CardKind = "compras" | "contratos" | "frete" | "materiais";

export type CardStatus =
  | "solicitacoes_abertas"
  | "em_cotacao"
  | "aguardando_aprovacao"
  | "cotacoes_rejeitadas"
  | "cotacoes_aprovadas"
  | "pedidos_gerados";

export type DepartmentDTO = { code: number; name: string };
export type OriginDTO = { code: number; name: string };

export type SolicitacaoDTO = {
  id: string;
  codigo_unico: string | null;
  kind: CardKind;
  title: string;
  summary: string | null;
  status: CardStatus;
  requester_id: string | null;
  requester_name: string | null;
  requester_email: string | null;
  unidade: string | null;
  empresa: string | null;
  buyer_name: string | null;
  buyer_assigned_at: string | null;
  approver_id: string | null;
  approver_name: string | null;
  order_number: string | null;
  numero_pedido_linx: string | null;
  data: Record<string, unknown>;
  observations: unknown[];
  suppliers: unknown[];
  attachments: unknown[];
  created_at: string;
  updated_at: string;
  status_changed_at: string;
};

export type SolicitacaoCreateDTO = {
  kind: CardKind;
  title: string;
  summary: string;
  requester_id?: string | null;
  requester_name?: string;
  requester_email?: string;
  unidade?: string;
  empresa?: string;
  status?: CardStatus;
  buyer_name?: string | null;
  buyer_assigned_at?: string | null;
  observations?: unknown[];
  data: Record<string, unknown>;
};

export type MensagemDTO = {
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

export type MensagemCreateDTO = Omit<MensagemDTO, "id" | "created_at" | "read_at">;

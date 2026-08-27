/**
 * Contrato da camada de dados (Data Provider).
 *
 * Toda leitura/escrita da aplicação deve passar por esta interface. Existem
 * duas implementações intercambiáveis:
 *   - "rest"     → API REST corporativa (Oracle/SQL Server/Postgres próprio)
 *   - "supabase" → backend atual (padrão, mantém o sistema em produção)
 *
 * Troca de backend: variável de ambiente VITE_DATA_BACKEND=rest
 * (mais VITE_API_BASE_URL apontando para a API da empresa).
 */
import type {
  DepartmentDTO,
  MensagemCreateDTO,
  MensagemDTO,
  OriginDTO,
  SolicitacaoCreateDTO,
  SolicitacaoDTO,
} from "./types";

export interface DataProvider {
  departments: {
    list(): Promise<DepartmentDTO[]>;
  };
  origins: {
    list(): Promise<OriginDTO[]>;
  };
  solicitacoes: {
    list(filters?: { status?: string; requesterId?: string }): Promise<SolicitacaoDTO[]>;
    getById(id: string): Promise<SolicitacaoDTO | null>;
    create(input: SolicitacaoCreateDTO): Promise<{ id?: string }>;
    update(id: string, patch: Partial<SolicitacaoDTO>): Promise<void>;
    getBuyer(id: string): Promise<string | null>;
    assignRotationBuyer(buyers: string[]): Promise<string | null>;
  };
  mensagens: {
    listByCard(cardId: string): Promise<MensagemDTO[]>;
    create(input: MensagemCreateDTO): Promise<void>;
    markRead(cardIds: string[], userId: string): Promise<void>;
  };
}

export type DataBackend = "supabase" | "rest";

export const DATA_BACKEND: DataBackend =
  ((import.meta.env['VITE_DATA_BACKEND'] as string | undefined) === "rest" ? "rest" : "supabase");

let cached: DataProvider | null = null;

/** Resolve o provider ativo (singleton). */
export async function getDataProvider(): Promise<DataProvider> {
  if (cached) return cached;
  if (DATA_BACKEND === "rest") {
    const { restDataProvider } = await import("./rest-provider");
    cached = restDataProvider;
  } else {
    const { supabaseDataProvider } = await import("./supabase-provider");
    cached = supabaseDataProvider;
  }
  return cached;
}

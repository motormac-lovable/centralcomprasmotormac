/**
 * Implementação da camada de dados sobre a API REST corporativa.
 * Nenhuma regra de negócio aqui — apenas mapeamento rota ⇄ entidade.
 */
import { http } from "@/services/http";
import { ENDPOINTS } from "@/services/endpoints";
import type { DataProvider } from "./provider";
import type {
  DepartmentDTO,
  MensagemCreateDTO,
  MensagemDTO,
  OriginDTO,
  SolicitacaoCreateDTO,
  SolicitacaoDTO,
} from "./types";

export const restDataProvider: DataProvider = {
  departments: {
    list: () => http.get<DepartmentDTO[]>(ENDPOINTS.departamentos),
  },
  origins: {
    list: () => http.get<OriginDTO[]>(ENDPOINTS.origens),
  },
  solicitacoes: {
    list: (filters) =>
      http.get<SolicitacaoDTO[]>(ENDPOINTS.solicitacoes, {
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.requesterId ? { requester_id: filters.requesterId } : {}),
      }),
    getById: (id) => http.get<SolicitacaoDTO | null>(ENDPOINTS.solicitacao(id)),
    create: (input: SolicitacaoCreateDTO) =>
      http.post<{ id?: string }>(ENDPOINTS.solicitacoes, input),
    update: async (id, patch) => {
      await http.put(ENDPOINTS.solicitacao(id), patch);
    },
    getBuyer: async (id) => {
      const res = await http.get<{ buyer_name: string | null }>(ENDPOINTS.solicitacaoBuyer(id));
      return res?.buyer_name ?? null;
    },
    assignRotationBuyer: async (buyers) => {
      const res = await http.post<{ buyer_name: string | null }>(
        ENDPOINTS.solicitacaoRodizioComprador,
        { buyers },
      );
      return res?.buyer_name ?? null;
    },
  },
  mensagens: {
    listByCard: (cardId) => http.get<MensagemDTO[]>(ENDPOINTS.mensagens, { card_id: cardId }),
    create: async (input: MensagemCreateDTO) => {
      await http.post(ENDPOINTS.mensagens, input);
    },
    markRead: async (cardIds, userId) => {
      if (cardIds.length === 0) return;
      await http.post(ENDPOINTS.mensagensLidas, { card_ids: cardIds, user_id: userId });
    },
  },
};

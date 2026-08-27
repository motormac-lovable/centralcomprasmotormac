/**
 * Implementação da camada de dados sobre o backend atual (Lovable Cloud).
 * Mantida como padrão para que o sistema continue operando enquanto a API
 * REST corporativa não está disponível. Mesmo contrato do rest-provider.
 */
import { supabase } from "@/integrations/supabase/client";
import type { DataProvider } from "./provider";
import type {
  DepartmentDTO,
  MensagemCreateDTO,
  MensagemDTO,
  OriginDTO,
  SolicitacaoCreateDTO,
  SolicitacaoDTO,
} from "./types";

export const supabaseDataProvider: DataProvider = {
  departments: {
    list: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("code, name")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DepartmentDTO[];
    },
  },
  origins: {
    list: async () => {
      const { data, error } = await supabase
        .from("origins")
        .select("code, name")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as OriginDTO[];
    },
  },
  solicitacoes: {
    list: async (filters) => {
      let query = supabase.from("kanban_cards").select("*");
      if (filters?.status) query = query.eq("status", filters.status as never);
      if (filters?.requesterId) query = query.eq("requester_id", filters.requesterId);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SolicitacaoDTO[];
    },
    getById: async (id) => {
      const { data, error } = await supabase
        .from("kanban_cards")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as SolicitacaoDTO) ?? null;
    },
    create: async (input: SolicitacaoCreateDTO) => {
      const { data, error } = await supabase
        .from("kanban_cards")
        .insert(input as never)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      return { id: (data as { id?: string } | null)?.id };
    },
    update: async (id, patch) => {
      const { error } = await supabase
        .from("kanban_cards")
        .update(patch as never)
        .eq("id", id);
      if (error) throw error;
    },
    getBuyer: async (id) => {
      const { data } = await supabase
        .from("kanban_cards")
        .select("buyer_name")
        .eq("id", id)
        .maybeSingle();
      return (data as { buyer_name?: string | null } | null)?.buyer_name ?? null;
    },
    assignRotationBuyer: async (buyers) => {
      const { data } = await supabase.rpc("assign_contract_buyer", { _buyers: buyers });
      return typeof data === "string" ? data : null;
    },
  },
  mensagens: {
    listByCard: async (cardId) => {
      const { data, error } = await supabase
        .from("card_messages")
        .select("*")
        .eq("card_id", cardId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as MensagemDTO[];
    },
    create: async (input: MensagemCreateDTO) => {
      const { error } = await supabase.from("card_messages").insert(input as never);
      if (error) throw error;
    },
    markRead: async (cardIds, userId) => {
      if (cardIds.length === 0) return;
      await supabase
        .from("card_messages")
        .update({ read_at: new Date().toISOString() })
        .in("card_id", cardIds)
        .is("read_at", null)
        .neq("sender_id", userId);
    },
  },
};

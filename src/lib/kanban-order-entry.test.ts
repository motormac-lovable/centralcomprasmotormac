import { describe, expect, it } from "vitest";
import { hasFormalOrderApproval, manualOrderEntryBlock } from "./kanban-order-entry";

const approved = {
  kind: "frete", status: "cotacoes_aprovadas", approver_id: "approver-id",
  data: { aprovacao: { aprovador: "Aprovador", aprovado_em: "2026-10-29T21:51:00Z" } },
};

describe("entrada manual em Pedidos Gerados", () => {
  it("bloqueia arraste direto para todos os tipos, mesmo aprovados", () => {
    for (const kind of ["frete", "compras", "contratos", "materiais"]) {
      expect(manualOrderEntryBlock({ ...approved, kind }, "pedidos_gerados")).toBe("manual");
    }
  });

  it("bloqueia o atalho de Frete sem aprovação formal", () => {
    expect(manualOrderEntryBlock({ ...approved, data: {} }, "cotacoes_aprovadas")).toBe("approval");
    expect(hasFormalOrderApproval({ ...approved, approver_id: null })).toBe(false);
    expect(hasFormalOrderApproval({ ...approved, data: { aprovacao: { aprovador: "Aprovador", aprovado_em: "inválido" } } })).toBe(false);
  });

  it("não aceita Em cotação, Aguardando Aprovação ou Pendente, mesmo com metadados antigos", () => {
    for (const status of ["em_cotacao", "aguardando_aprovacao", "pendente", "solicitacoes_abertas", "cotacoes_rejeitadas"]) {
      expect(hasFormalOrderApproval({ ...approved, status })).toBe(false);
      expect(manualOrderEntryBlock({ ...approved, status }, "cotacoes_aprovadas")).toBe("approval");
    }
  });

  it("reconhece a aprovação formal já registrada pelo fluxo automático", () => {
    expect(hasFormalOrderApproval(approved)).toBe(true);
    expect(hasFormalOrderApproval({ ...approved, status: "pedidos_gerados" })).toBe(true);
    expect(manualOrderEntryBlock(approved, "cotacoes_aprovadas")).toBeNull();
  });

  it("preserva os demais destinos e tipos", () => {
    for (const status of ["solicitacoes_abertas", "em_cotacao", "aguardando_aprovacao", "cotacoes_rejeitadas"]) {
      expect(manualOrderEntryBlock({ ...approved, data: {} }, status)).toBeNull();
    }
    for (const kind of ["compras", "contratos", "materiais"]) {
      expect(manualOrderEntryBlock({ ...approved, kind, data: {} }, "cotacoes_aprovadas")).toBeNull();
    }
  });
});
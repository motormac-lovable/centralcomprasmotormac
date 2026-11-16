import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({ createServerFn: () => ({
  middleware() { return this; }, inputValidator() { return this; }, handler(fn: unknown) { return fn; },
}) }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
vi.mock("@/lib/purchase-order.server", () => ({ emitirPedidoCompra: vi.fn() }));

import { aprovarCotacao } from "./approval.functions";
import { emitirPedidoCompra } from "./purchase-order.server";

const run = aprovarCotacao as unknown as (args: unknown) => Promise<any>;
const rpc = vi.fn();
const input = { data: { cardId: "card", supplierId: "winner", justificativa: "Cotação única" }, context: { supabase: { rpc } } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(emitirPedidoCompra).mockResolvedValue({ numero: "PC9311260001", email_status: "enviado" });
});

describe("aprovação direta para Pedidos Gerados", () => {
  it("emite o PC e e-mail pelo fluxo existente após aprovação de compras, materiais e frete", async () => {
    for (const kind of ["compras", "materiais", "frete"]) {
      rpc.mockResolvedValue({ data: { id: "card", status: "pedidos_gerados", kind }, error: null });
      expect((await run(input)).pedido.numero).toBe("PC9311260001");
    }
    expect(emitirPedidoCompra).toHaveBeenCalledTimes(3);
    expect(rpc).toHaveBeenCalledWith("approve_kanban_card", { _card_id: "card", _selected_supplier_id: "winner", _justificativa: "Cotação única" });
  });
  it("mantém Contratos sem emissão de PC", async () => {
    rpc.mockResolvedValue({ data: { id: "card", status: "pedidos_gerados", kind: "contratos" }, error: null });
    expect((await run(input)).pedido).toBeNull();
    expect(emitirPedidoCompra).not.toHaveBeenCalled();
  });
  it("não emite pedido quando a alçada rejeita a aprovação", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Administrador só pode aprovar até R$ 5.000,00" } });
    await expect(run(input)).rejects.toThrow("5.000,00");
    expect(emitirPedidoCompra).not.toHaveBeenCalled();
  });
  it("preserva a aprovação quando a emissão falha e retorna aviso", async () => {
    rpc.mockResolvedValue({ data: { id: "card", status: "pedidos_gerados", kind: "compras" }, error: null });
    vi.mocked(emitirPedidoCompra).mockRejectedValue(new Error("Não foi possível gerar o pedido."));
    expect((await run(input)).aviso).toBe("Não foi possível gerar o pedido.");
  });
});
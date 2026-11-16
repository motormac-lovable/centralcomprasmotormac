import { describe, expect, it } from "vitest";
import { generatePurchaseOrderNumber, purchaseOrderPrefix } from "./purchase-order-number";
import { resolverFilialFiscal } from "./filiais-fiscais";
import { fornecedorVencedor, generatePurchaseOrderPDF } from "./purchase-order-pdf";
import { MANUAL_ORDER_ENTRY_MESSAGE } from "./kanban-order-entry";

describe("Pedido de Compra", () => {
  it("usa 2 últimos dígitos do CNPJ + MM + AA + 4 dígitos", async () => {
    const n = await generatePurchaseOrderNumber("DMMC", "Porto Alegre", new Date("2026-02-15T12:00:00Z"), () => false, () => 0.8492);
    expect(n).toBe("PC - 9302268492");
  });
  it("sorteia outro código quando já usado na mesma filial e mês", async () => {
    const seq = [0.1234, 0.1234, 0.0007];
    const used = new Set(["PC - 0611261234"]);
    const n = await generatePurchaseOrderNumber("DMMC", "São José", new Date("2026-11-16T12:00:00Z"), (x) => used.has(x), () => seq.shift()!);
    expect(n).toBe("PC - 0611260007");
  });
  it("mantém 4 dígitos com zeros à esquerda", () => {
    expect(purchaseOrderPrefix("51.292.751/0003-21", new Date("2026-01-10T12:00:00Z"))).toBe("210126");
  });
  it("resolve filiais com variações de escrita e MEI/NEST", () => {
    expect(resolverFilialFiscal("DMMC", "Chapeco")?.cnpj).toBe("90.627.332/0009-40");
    expect(resolverFilialFiscal("NEST", "São José")?.cnpj).toBe("35.217.337/0002-10");
    expect(resolverFilialFiscal("Motormac", "Filial RS")).toBeNull();
  });
  it("único fornecedor no mapa é o vencedor", () => {
    expect(fornecedorVencedor([{ fornecedor: "X", email: "a@b.com" }])?.email).toBe("a@b.com");
    expect(fornecedorVencedor([{ fornecedor: "X" }, { fornecedor: "Y" }])).toBeNull();
  });
  it("gera PDF", () => {
    const doc = generatePurchaseOrderPDF({ title: "T", empresa: "DMMC", unidade: "Porto Alegre", suppliers: [{ fornecedor: "F", valor: "R$ 100,00" }], data: { itens: [{ material: "M", quantidade: "2" }] } }, "PC - 9311260001");
    expect(doc.output("arraybuffer").byteLength).toBeGreaterThan(1000);
  });
  it("mensagem de bloqueio manual", () => {
    expect(MANUAL_ORDER_ENTRY_MESSAGE).toBe("⛔ Movimentação manual não permitida. O card avança automaticamente para 'Pedidos Gerados' após a aprovação formal da cotação.");
  });
});

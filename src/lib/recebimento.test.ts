import { describe, it, expect } from "vitest";
import { recebimentoStatus, notaFinal } from "./recebimento";

const docs = { faturamento: { notas_fiscais: [{}], boletos: [{}], xml: "<x/>" } };

describe("recebimento", () => {
  it("fora de Pedidos Gerados fica neutro", () => {
    expect(recebimentoStatus({ status: "em_cotacao", data: docs })).toBe("neutro");
  });
  it("Pedidos Gerados sem NF+Boleto+XML aguarda documentos", () => {
    expect(recebimentoStatus({ status: "pedidos_gerados", data: { faturamento: { notas_fiscais: [{}], boletos: [{}] } } })).toBe("aguardando_docs");
  });
  it("Pedidos Gerados com NF+Boleto+XML libera o aceite", () => {
    expect(recebimentoStatus({ status: "pedidos_gerados", data: docs })).toBe("pendente_aceite");
  });
  it("decisão registrada fica congelada", () => {
    expect(recebimentoStatus({ status: "pedidos_gerados", data: { ...docs, recebimento: { status: "problema" } } })).toBe("problema");
  });
  it("sem estrelas escolhidas grava 5", () => {
    expect(notaFinal(0)).toBe(5);
    expect(notaFinal(3)).toBe(3);
  });
});

import { podeRegistrarRecebimento as pode } from "./recebimento";
describe("permissão de recebimento", () => {
  const base = { isRequester: false, isOwner: false, isAdmin: false, isApprover: false, approverDepartments: [] as string[], centroCustoDescricao: "SUPPLY CHAIN" };
  it("solicitante, desenvolvedor e administrador podem", () => {
    expect(pode({ ...base, isRequester: true })).toBe(true);
    expect(pode({ ...base, isOwner: true })).toBe(true);
    expect(pode({ ...base, isAdmin: true })).toBe(true);
  });
  it("aprovador só do centro de custo", () => {
    expect(pode({ ...base, isApprover: true, approverDepartments: ["SUPPLY CHAIN"] })).toBe(true);
    expect(pode({ ...base, isApprover: true, approverDepartments: ["MARKETING"] })).toBe(false);
    expect(pode(base)).toBe(false);
  });
});

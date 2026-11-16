import { describe, expect, it } from "vitest";
import { situacaoProtocolo } from "./protocolo-readiness";

const dados = {
  departamento: "201", centro_custo_codigo: "2122", centro_custo_descricao: "TI",
  pedido_compra: { numero: "PC9311260001" }, recebimento: { status: "confirmado" },
  faturamento: { notas_fiscais: [{ path: "nf.pdf", name: "nf.pdf" }] },
  dados_pagamento: { condicao_de_pagamento: "Boleto", fornecedor: "Fornecedor", numero_nf: "7337", valor_documento: "900.00", data_vencimento: "2026-11-30" },
};
const card = { id: "1", empresa: "DMMC", unidade: "Porto Alegre", title: "Compra", data: dados };

describe("Disponibilidade do protocolo", () => {
  it("bloqueia sem Centro de Custo", () => {
    const s = situacaoProtocolo({ ...card, data: { ...dados, centro_custo_codigo: "", centro_custo_descricao: "" } });
    expect(s.pronto).toBe(false);
    expect(s.pendencias).toContain("Centro de Custo não informado.");
  });
  it("bloqueia sem vencimento", () => {
    const s = situacaoProtocolo({ ...card, data: { ...dados, dados_pagamento: { ...dados.dados_pagamento, data_vencimento: "" } } });
    expect(s.pronto).toBe(false);
    expect(s.pendencias).toContain("Data de vencimento não informada. Confira os dados de pagamento no card.");
  });
  it("libera somente com todas as pendências resolvidas e Recebido", () => {
    expect(situacaoProtocolo(card).pronto).toBe(true);
    expect(situacaoProtocolo({ ...card, data: { ...dados, recebimento: null } }).pronto).toBe(false);
  });
  it("bloqueia sem número PC", () => {
    expect(situacaoProtocolo({ ...card, data: { ...dados, pedido_compra: null } }).pronto).toBe(false);
  });
});
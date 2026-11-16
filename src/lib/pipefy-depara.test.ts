import { describe, it, expect } from "vitest";
import { centroCustoPipefy, empresaPipefy, setorPipefy } from "./pipefy-depara";
import { validarDadosPagamento, parseCondicaoMapa, normalizarVencimento } from "./pagamento";
import { montarCamposPipefy, PIPEFY_VENCIMENTO_FIELDS } from "./pipefy-payload";

describe("De/Para Pipefy", () => {
  it("setor por departamento", () => {
    expect(setorPipefy("201")).toBe("Tecnologia da Informação");
    expect(setorPipefy(250)).toBe("Compras");
    expect(setorPipefy("82")).toBe("Geradores");
    expect(setorPipefy("999")).toBeNull();
  });
  it("empresa por empresa+unidade", () => {
    expect(empresaPipefy("DMMC", "Porto Alegre")?.opcao).toBe("2.1 MATRIZ");
    expect(empresaPipefy("SV Parts", "Chapecó")?.opcao).toBe("19.6 - SV PARTS CHAP/SC");
    expect(empresaPipefy("MALB", "Colombo")?.opcao).toBe("MALB");
  });
  it("centro de custo mapeado ou Outro", () => {
    expect(centroCustoPipefy("2122", "TI").centro_de_custo).toBe("2122 - Tecnologia da Informação");
    expect(centroCustoPipefy("2143", "X").centro_de_custo).toBe("Oficina JCB");
    expect(centroCustoPipefy("700", "NEST", "35.217.337/0001-30").centro_de_custo).toBe("201 NEST POA");
    expect(centroCustoPipefy("2150", "SUPPLY CHAIN")).toEqual({ centro_de_custo: "Outro, qual?", outro_centro_de_custo: "2150 - SUPPLY CHAIN" });
  });
  it("boleto exige boleto anexado; depósito exige dados bancários", () => {
    const base = { numero_nf: "1", valor_documento: "100", data_vencimento: "2026-11-30" };
    expect(validarDadosPagamento({ ...base, condicao_de_pagamento: "Boleto" }, false)).toContain("Anexe o boleto em Documentos de Faturamento.");
    expect(validarDadosPagamento({ ...base, condicao_de_pagamento: "Boleto" }, true)).toEqual([]);
    expect(validarDadosPagamento({ ...base, condicao_de_pagamento: "Depósito" }, false).length).toBe(1);
  });
  it("exige vencimento válido para boleto", () => {
    expect(validarDadosPagamento({ numero_nf: "1", valor_documento: "100", condicao_de_pagamento: "Boleto" }, true)).toContain("Leia o boleto para obter a data de vencimento.");
    expect(normalizarVencimento("30/11/2026")).toBe("2026-11-30");
    expect(normalizarVencimento("31/11/2026")).toBe("");
  });
  it("permite vencimento informado para pagamentos sem boleto", () => {
    const dados = { numero_nf: "1", valor_documento: "100", condicao_de_pagamento: "Adiantamento Viagem" as const };
    expect(validarDadosPagamento(dados, false)).toContain("Informe uma data de vencimento válida.");
    expect(validarDadosPagamento({ ...dados, data_vencimento: "2026-12-01" }, false)).toEqual([]);
  });
  it("exige vencimento em cada parcela", () => {
    const dados = { numero_nf: "1", valor_documento: "200", condicao_de_pagamento: "Parcelado" as const,
      parcelas_detalhe: [{ numero: 1, valor: "100", vencimento: "2026-11-30" }, { numero: 2, valor: "100" }] };
    expect(validarDadosPagamento(dados, true)).toContain("Leia os boletos para obter o vencimento de todas as parcelas.");
  });
  it("envia etiqueta Setor e vencimentos reais ao formulário público", () => {
    const { campos, pendencias } = montarCamposPipefy({ id: "1", empresa: "DMMC", unidade: "Porto Alegre", order_number: "123", title: "Compra",
      data: { departamento: "201", centro_custo_codigo: "2122", centro_custo_descricao: "TI",
        dados_pagamento: { condicao_de_pagamento: "Parcelado", fornecedor: "Fornecedor", numero_nf: "42", valor_documento: "200",
          parcelas_detalhe: [{ numero: 1, valor: "100", vencimento: "2026-11-30" }, { numero: 2, valor: "100", vencimento: "2026-12-30" }] } } }, "comprador@motormac.com.br");
    expect(pendencias).toEqual([]);
    expect(campos).toContainEqual({ field_id: "sele_o_de_etiqueta", field_value: ["309399978"] });
    expect(campos).toContainEqual({ field_id: "n_mero_de_parcelas", field_value: "2" });
    expect(campos).toContainEqual({ field_id: PIPEFY_VENCIMENTO_FIELDS[0], field_value: "2026-11-30T12:00:00-03:00" });
    expect(campos).toContainEqual({ field_id: PIPEFY_VENCIMENTO_FIELDS[1], field_value: "2026-12-30T12:00:00-03:00" });
  });
  it("parser do mapa comparativo", () => {
    expect(parseCondicaoMapa("30/60/90", 300).parcelas.map((p) => p.valor)).toEqual(["100.00", "100.00", "100.00"]);
    expect(parseCondicaoMapa("4x", 400).parcelas.length).toBe(4);
    expect(parseCondicaoMapa("à vista", 100).parcelado).toBe(false);
  });
});

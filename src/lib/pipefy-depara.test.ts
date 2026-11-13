import { describe, it, expect } from "vitest";
import { centroCustoPipefy, empresaPipefy, setorPipefy } from "./pipefy-depara";
import { validarDadosPagamento, parseCondicaoMapa } from "./pagamento";

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
    const base = { numero_nf: "1", valor_documento: "100" };
    expect(validarDadosPagamento({ ...base, condicao_de_pagamento: "Boleto" }, false)).toContain("Anexe o boleto em Documentos de Faturamento.");
    expect(validarDadosPagamento({ ...base, condicao_de_pagamento: "Boleto" }, true)).toEqual([]);
    expect(validarDadosPagamento({ ...base, condicao_de_pagamento: "Depósito" }, false).length).toBe(1);
  });
  it("parser do mapa comparativo", () => {
    expect(parseCondicaoMapa("30/60/90", 300).parcelas.map((p) => p.valor)).toEqual(["100.00", "100.00", "100.00"]);
    expect(parseCondicaoMapa("4x", 400).parcelas.length).toBe(4);
    expect(parseCondicaoMapa("à vista", 100).parcelado).toBe(false);
  });
});

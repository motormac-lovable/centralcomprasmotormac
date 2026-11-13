import { describe, expect, it } from "vitest";
import { CENTROS_DE_CUSTO, centroCustoKey, centroCustoLabel, isCentroCustoValido } from "./centros-de-custo";
import { BLOCO_INICIAL_VAZIO, validateBlocoInicial } from "../components/forms/BlocoInicialPadrao";

describe("base oficial de centros de custo", () => {
  it("contém exatamente 147 combinações distintas", () => {
    expect(CENTROS_DE_CUSTO).toHaveLength(147);
    expect(new Set(CENTROS_DE_CUSTO.map(centroCustoKey)).size).toBe(147);
  });
  it("preserva códigos repetidos com descrições distintas", () => {
    for (const codigo of ["700", "2108", "2208", "2218", "2318", "2403", "2603", "2604"]) {
      expect(CENTROS_DE_CUSTO.filter((c) => c.codigo === codigo)).toHaveLength(2);
    }
    expect(isCentroCustoValido("700", "NEST")).toBe(true);
    expect(isCentroCustoValido("700", "MOTORMAC ENERGIA INDUSTRIAL")).toBe(true);
  });
  it("exige uma combinação oficial e não aceita texto livre", () => {
    expect(isCentroCustoValido("", "")).toBe(false);
    expect(isCentroCustoValido("2150", "NEST")).toBe(false);
    expect(isCentroCustoValido("2150", "SUPPLY CHAIN")).toBe(true);
  });
  it("bloqueia o bloco de abertura sem centro de custo válido", () => {
    const bloco = { ...BLOCO_INICIAL_VAZIO, nome: "Teste", telefone: "51999999999", email: "teste@example.com", unidade: "Porto Alegre", empresa: "NEST" };
    expect(validateBlocoInicial(bloco).centro_custo_codigo).toBeDefined();
    expect(validateBlocoInicial({ ...bloco, centro_custo_codigo: "2150", centro_custo_descricao: "SUPPLY CHAIN" })).toEqual({});
  });
  it("apresenta o código e descrição e não inventa valores legados", () => {
    expect(centroCustoLabel({ centro_custo_codigo: "2150", centro_custo_descricao: "SUPPLY CHAIN" })).toBe("2150 - SUPPLY CHAIN");
    expect(centroCustoLabel({})).toBe("Não informado");
  });
});
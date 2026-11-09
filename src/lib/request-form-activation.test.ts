import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Verifica apenas a configuração de disponibilidade, não a apresentação da tela.
const source = readFileSync(new URL("../routes/index.tsx", import.meta.url), "utf8");
const availability = new Map(
  [...source.matchAll(/to: "([^"]+)"[\s\S]*?inativo: (true|false)/g)].map(
    (match) => [match[1], match[2] === "false"] as const,
  ),
);

describe("Disponibilidade dos formulários de Nova Solicitação", () => {
  it("ativa Solicitação de Compras", () => {
    expect(availability.get("/materiais")).toBe(true);
  });
  it("ativa Solicitação de Peças", () => {
    expect(availability.get("/compras")).toBe(true);
  });
  it("ativa Cadastro ou Renovação", () => {
    expect(availability.get("/contratos")).toBe(true);
  });
  it("mantém Solicitação de Frete ativa", () => {
    expect(availability.get("/frete")).toBe(true);
  });
});
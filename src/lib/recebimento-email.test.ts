import { describe, it, expect } from "vitest";
import { assuntoRecebimento, corpoRecebimento } from "./recebimento-email.server";
describe("e-mail de recebimento", () => {
  it("assunto exato", () => expect(assuntoRecebimento("11202666")).toBe("Documentos Fiscais Disponíveis - Confirme o Recebimento (Solicitação #11202666)"));
  it("corpo com caminho", () => expect(corpoRecebimento("1")).toContain("Central de compras >> Minhas solicitações ou Histórico >> Recebimento"));
});

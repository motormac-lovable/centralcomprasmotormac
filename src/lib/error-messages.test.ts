import { describe, expect, it } from "vitest";
import { translateError } from "./error-messages";

describe("Falhas de notificações e protocolo em português", () => {
  it("traduz todos os campos obrigatórios da resposta do Pipefy", () => {
    expect(translateError('Field "Setor" is required! Please fill it and you’ll be ready to go!, Field "Data Vencimento" is required! Please fill it and you’ll be ready to go!'))
      .toBe("Preencha os campos obrigatórios no protocolo: Setor, Data Vencimento.");
  });
  it("não preserva erro misto com etiqueta acentuada em português", () => {
    expect(translateError('Field "Condição de Pagamento" is invalid', "Não foi possível enviar o protocolo."))
      .toBe("Não foi possível enviar o protocolo.");
  });
  it("traduz falhas de rede e preserva avisos locais", () => {
    expect(translateError(new Error("Failed to fetch"))).toBe("Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.");
    expect(translateError("Não foi possível enviar a notificação por e-mail.")).toBe("Não foi possível enviar a notificação por e-mail.");
  });
});
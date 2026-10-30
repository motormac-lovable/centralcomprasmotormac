import { describe, expect, it } from "vitest";
import { canManageProtectedUser, isEligibleForAdmin, isProtectedUserEmail } from "./protected-users";

describe("usuários protegidos", () => {
  it("os sete e-mails informados são protegidos (sem diferenciar maiúsculas)", () => {
    for (const e of [
      "aprovador@motormac.com.br",
      "solicitante@motormac.com.br",
      "auditor@motormac.com.br",
      "Controladoria@motormac.com.br",
      "comprador@motormac.com.br",
      "solicitante2@motormac.com.br",
      "aprovador2@motormac.com.br",
    ]) expect(isProtectedUserEmail(e)).toBe(true);
    expect(isProtectedUserEmail("outro@motormac.com.br")).toBe(false);
  });

  it("somente o Proprietário gerencia um usuário protegido", () => {
    expect(canManageProtectedUser("comprador@motormac.com.br", false)).toBe(false);
    expect(canManageProtectedUser("comprador@motormac.com.br", true)).toBe(true);
    expect(canManageProtectedUser("outro@motormac.com.br", false)).toBe(true);
  });

  it("usuário inativo é inelegível para Administrador", () => {
    expect(isEligibleForAdmin({ is_active: false, is_deleted: false })).toBe(false);
    expect(isEligibleForAdmin({ is_active: true, is_deleted: true })).toBe(false);
    expect(isEligibleForAdmin({ is_active: true, is_deleted: false })).toBe(true);
  });
});

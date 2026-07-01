export const PASSWORD_RULE_MESSAGE =
  "A senha deve conter no mínimo 8 caracteres, incluindo letras, números e símbolos.";

export function passwordChecks(p: string) {
  return {
    length: p.length >= 8,
    letter: /[A-Za-z]/.test(p),
    number: /[0-9]/.test(p),
    symbol: /[^A-Za-z0-9]/.test(p),
  };
}

export function isStrongPassword(p: string) {
  const c = passwordChecks(p);
  return c.length && c.letter && c.number && c.symbol;
}

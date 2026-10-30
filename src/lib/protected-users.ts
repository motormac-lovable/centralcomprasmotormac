/**
 * Usuários protegidos: somente o Proprietário pode inativar, reativar,
 * excluir, reclassificar ou editar estes perfis. Regra cumulativa às
 * demais regras de governança. A mesma lista existe no banco
 * (app_private.is_protected_user) — mantenha as duas iguais.
 */
export const PROTECTED_USER_EMAILS = [
  "aprovador@motormac.com.br",
  "solicitante@motormac.com.br",
  "auditor@motormac.com.br",
  "controladoria@motormac.com.br",
  "comprador@motormac.com.br",
  "solicitante2@motormac.com.br",
  "aprovador2@motormac.com.br",
] as const;

export const isProtectedUserEmail = (email?: string | null) =>
  !!email &&
  (PROTECTED_USER_EMAILS as readonly string[]).includes(email.trim().toLowerCase());

/** Quem pode gerenciar um usuário protegido: exclusivamente o Proprietário. */
export const canManageProtectedUser = (targetEmail: string | null | undefined, callerIsOwner: boolean) =>
  !isProtectedUserEmail(targetEmail) || callerIsOwner;

/** Usuário inativo (ou excluído) é inelegível para ser promovido a Administrador. */
export const isEligibleForAdmin = (profile?: { is_active?: boolean | null; is_deleted?: boolean | null } | null) =>
  !!profile && profile.is_active !== false && profile.is_deleted !== true;

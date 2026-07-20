/** E-mails do Proprietário (acesso total e irrevogável pela aplicação). */
export const OWNER_EMAILS = [
  "herllon.souza@motormac.com.br",
] as const;

export const isOwnerEmail = (email?: string | null) =>
  !!email && OWNER_EMAILS.includes(email.toLowerCase() as (typeof OWNER_EMAILS)[number]);

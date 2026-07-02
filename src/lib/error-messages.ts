// Traduções amigáveis em pt-BR para erros comuns (Supabase Auth, Postgres,
// rede, upload, validação). Uso: `translateError(err)` sempre que for
// exibir a mensagem ao usuário final via toast/alerta.

const EXACT: Record<string, string> = {
  "Invalid login credentials": "E-mail ou senha incorretos. Por favor, tente novamente.",
  "Invalid email or password": "E-mail ou senha incorretos. Por favor, tente novamente.",
  "Email not confirmed": "E-mail ainda não confirmado. Verifique sua caixa de entrada.",
  "User already registered": "Este e-mail já possui cadastro. Tente entrar ou use 'Esqueci minha senha'.",
  "User not found": "Usuário não encontrado.",
  "Email rate limit exceeded": "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.",
  "Signup requires a valid password": "A senha informada é inválida. Use no mínimo 8 caracteres com letras, números e símbolos.",
  "Password should be at least 6 characters": "A senha deve conter no mínimo 8 caracteres, incluindo letras, números e símbolos.",
  "New password should be different from the old password": "A nova senha precisa ser diferente da senha atual.",
  "Auth session missing!": "Sessão expirada. Faça login novamente.",
  "JWT expired": "Sessão expirada. Faça login novamente.",
  "Token has expired or is invalid": "O link expirou ou é inválido. Solicite um novo.",
  "Unauthorized": "Você não tem permissão para executar esta ação.",
  "Failed to fetch": "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.",
  "Network request failed": "Falha de conexão. Verifique sua internet e tente novamente.",
  "NetworkError when attempting to fetch resource.": "Falha de conexão. Verifique sua internet e tente novamente.",
  "Load failed": "Falha ao carregar. Verifique sua conexão e tente novamente.",
  "The object exceeded the maximum allowed size": "Falha ao enviar o arquivo. O formato ou tamanho não é permitido.",
  "Payload too large": "Falha ao enviar o arquivo. O formato ou tamanho não é permitido.",
  "duplicate key value violates unique constraint": "Este registro já existe.",
  "violates foreign key constraint": "Não foi possível salvar: existe uma referência inválida entre os dados.",
  "violates not-null constraint": "Por favor, preencha todos os campos obrigatórios antes de continuar.",
  "permission denied": "Você não tem permissão para executar esta ação.",
  "new row violates row-level security policy": "Você não tem permissão para executar esta ação.",
};

const PATTERNS: Array<[RegExp, string]> = [
  [/invalid.*credentials/i, "E-mail ou senha incorretos. Por favor, tente novamente."],
  [/email.*not.*confirmed/i, "E-mail ainda não confirmado. Verifique sua caixa de entrada."],
  [/already.*registered|user.*already.*exists/i, "Este e-mail já possui cadastro. Tente entrar ou use 'Esqueci minha senha'."],
  [/password.*(short|at least|weak|characters)/i, "A senha deve conter no mínimo 8 caracteres, incluindo letras, números e símbolos."],
  [/rate.?limit/i, "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente."],
  [/jwt|token.*(expired|invalid)|session.*(missing|expired)/i, "Sessão expirada. Faça login novamente."],
  [/failed to fetch|network.*(error|failed)|load failed|fetch.*failed/i, "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente."],
  [/timeout|timed out/i, "A operação demorou demais para responder. Tente novamente."],
  [/duplicate key|already exists/i, "Este registro já existe."],
  [/foreign key/i, "Não foi possível salvar: existe uma referência inválida entre os dados."],
  [/not-null|null value in column/i, "Por favor, preencha todos os campos obrigatórios antes de continuar."],
  [/permission denied|row-level security|not authorized|unauthorized/i, "Você não tem permissão para executar esta ação."],
  [/(payload|file|object).*(too large|exceeded)/i, "Falha ao enviar o arquivo. O formato ou tamanho não é permitido."],
  [/invalid.*(mime|file type|format)/i, "Falha ao enviar o arquivo. O formato ou tamanho não é permitido."],
  [/bucket.*not.*found|object.*not.*found/i, "Arquivo não encontrado no servidor."],
  [/quota/i, "Limite de armazenamento atingido. Contate o administrador."],
  [/violates check constraint/i, "Os dados informados são inválidos. Revise os campos e tente novamente."],
];

const GENERIC_FALLBACK = "Não foi possível concluir a operação. Verifique sua conexão e tente novamente.";

function rawMessage(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (typeof err === "object") {
    const anyErr = err as any;
    return anyErr.message || anyErr.error_description || anyErr.error || anyErr.msg || anyErr.hint || "";
  }
  return String(err);
}

export function translateError(err: unknown, fallback: string = GENERIC_FALLBACK): string {
  const raw = rawMessage(err).trim();
  if (!raw) return fallback;
  if (EXACT[raw]) return EXACT[raw];
  for (const [regex, msg] of PATTERNS) {
    if (regex.test(raw)) return msg;
  }
  // Se a mensagem já está em português (heurística simples), preserva.
  if (/[áéíóúãõâêôçÁÉÍÓÚÃÕÂÊÔÇ]|(\b(não|senha|usuário|conexão|arquivo|permissão|inválid|obrigat|falha|erro)\b)/i.test(raw)) {
    return raw;
  }
  return fallback;
}

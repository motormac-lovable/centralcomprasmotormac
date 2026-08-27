/**
 * Contrato de rotas da API REST corporativa.
 * Único lugar onde os caminhos HTTP são declarados — a TI pode ajustar aqui
 * sem tocar em nenhum componente da aplicação.
 */
export const ENDPOINTS = {
  // Solicitações / Kanban
  solicitacoes: "/api/solicitacoes",
  solicitacao: (id: string) => `/api/solicitacoes/${id}`,
  solicitacaoBuyer: (id: string) => `/api/solicitacoes/${id}/comprador`,
  solicitacaoRodizioComprador: "/api/solicitacoes/rodizio-comprador",

  // Mensagens (chat vinculado à solicitação)
  mensagens: "/api/mensagens",
  mensagensLidas: "/api/mensagens/marcar-lidas",

  // Tabelas de apoio
  departamentos: "/api/departamentos",
  origens: "/api/origens",

  // Usuários / perfis / papéis
  usuarios: "/api/usuarios",
  usuario: (id: string) => `/api/usuarios/${id}`,
  usuarioPapeis: (id: string) => `/api/usuarios/${id}/papeis`,

  // Autenticação
  authLogin: "/api/auth/login",
  authRefresh: "/api/auth/refresh",
  authLogout: "/api/auth/logout",
  authMe: "/api/auth/me",
} as const;

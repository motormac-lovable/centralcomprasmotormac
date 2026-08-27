# Desacoplamento do backend — guia para a TI

A aplicação passou a acessar dados **exclusivamente por uma camada de serviço**,
permitindo trocar o backend atual por uma API REST corporativa sobre
Oracle / SQL Server / PostgreSQL próprio.

## Arquitetura

```
componentes / hooks
        │
        ▼
src/services/data/provider.ts      ← contrato único (DataProvider)
        ├── supabase-provider.ts   ← backend atual (padrão, em produção)
        └── rest-provider.ts       ← API REST corporativa
                 │
                 ▼
        src/services/http.ts       ← Fetch genérico + JWT Bearer
        src/services/endpoints.ts  ← mapa de rotas (/api/solicitacoes, ...)
```

Autenticação segue o mesmo padrão:

```
src/services/auth/auth-provider.ts
  ├── sessionAuthProvider  ← autenticação atual (padrão)
  └── jwtAuthProvider      ← login na API da empresa (JWT / OAuth2 / AD / LDAP)
src/services/auth/token-store.ts  ← token único usado no header Authorization
```

## Como apontar para a API da empresa

Variáveis de ambiente:

```
VITE_DATA_BACKEND=rest
VITE_AUTH_BACKEND=jwt
VITE_API_BASE_URL=https://api.motormac.com.br
```

Nenhum componente precisa ser alterado: o `provider.ts` resolve a
implementação em tempo de execução.

## O que a TI precisa entregar

1. Banco conforme `docs/schema_oracle.sql` (DDL ANSI/Oracle, com notas de
   portabilidade para SQL Server e PostgreSQL).
2. API REST conforme `docs/openapi.yaml` (Swagger/OpenAPI 3).
3. Emissão de JWT em `POST /api/auth/login` e validação do Bearer em todas as
   demais rotas. Perfis retornados em `user.roles`
   (`owner | admin | buyer | aprovador | solicitante | auditor`).

## Observações

- As regras de governança, movimentação de cards, downloads, justificativas e
  alçadas de aprovação **não foram alteradas** — apenas o transporte de dados.
- Enquanto `VITE_DATA_BACKEND` não for definido, o sistema continua operando
  normalmente no backend atual.
- A migração dos módulos restantes (Kanban, Admin, storage de anexos) deve
  seguir o mesmo padrão: adicionar o método ao contrato `DataProvider`,
  implementar nos dois providers e substituir a chamada direta no componente.

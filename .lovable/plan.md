## Diagnóstico — o que já está pronto vs. o que falta

**Já entregue (apenas pequenos ajustes):**
- Layout global com logo, topbar e Meu Perfil
- Modal de Alteração de Senha (ajustar mínimo de 8 → 6 caracteres)
- Login com credenciais master `herllon.souza@motormac.com.br / 12345678`
- Hub "Nova Solicitação" com 3 formulários (compras, contratos, frete)
- Fluxo de cadastro de comprador com status Pendente/Ativo/Inativo
- Painel Admin / Governança com Aprovar/Reprovar acesso
- Kanban 5 colunas com tags de SLA, modal avançado, mapa comparativo
- Dashboard de indicadores com contadores e gráficos

**Falta entregar (novidades do brief):**
1. **Senha mínima 6 caracteres** no modal Meu Perfil (hoje está 8)
2. **"Esqueci minha senha"** — modal na tela de login
3. **Código identificador único** `MMAAAA + sequencial` (ex: `0620265`)
4. **Bloco Inicial Padrão** nos 3 formulários: Nome, Telefone, E-mail, Unidade (7 opções), Empresa (4 opções)
5. **Área do Desenvolvedor** — nova rota exclusiva (Proprietário/TI) com extração JSON/CSV, simulação de webhook Linx Apollo, logs em tempo real e `src/services/api.ts` centralizando o payload
6. **Mock Data** — seed de 2 compradores pendentes + 5 cards distribuídos no Kanban

---

## Plano de execução

### Fase 1 — Banco (1 migração)
- Adicionar coluna `codigo_unico TEXT UNIQUE` em `kanban_cards`
- Adicionar coluna `numero_pedido_linx TEXT` (renomear/aliasar `order_number` se já existir)
- Criar sequence `solicitacao_seq` e função `gerar_codigo_unico()` que retorna `to_char(now(),'MMYYYY') || nextval('solicitacao_seq')`
- Trigger `BEFORE INSERT` em `kanban_cards` que preenche `codigo_unico` se nulo
- Backfill: atualizar cards existentes com códigos sequenciais
- Seed: inserir 2 `buyer_applications` pendentes + 5 cards de exemplo com SLAs variados (criados em datas escalonadas: 1, 5, 8, 12 e 22 dias atrás para cobrir todas as tags)

### Fase 2 — Ajustes nos módulos existentes
- `src/components/ProfileMenu.tsx`: `MIN_LEN = 6`
- `src/lib/cards.ts`: tipo `KanbanCard` ganha `codigo_unico` e `numero_pedido_linx`
- Kanban: exibir `#{codigo_unico}` em destaque no topo do card e no header do modal
- Busca/filtro global indexando `codigo_unico`
- Dashboard: garantir contadores exatos por coluna (já temos, só validar)

### Fase 3 — Bloco Inicial Padrão (3 formulários)
- Criar `src/components/forms/BlocoInicialPadrao.tsx` com: Nome, Telefone (máscara), E-mail, Unidade (select: Porto Alegre, São José, Colombo, Maringá, Chapecó, São Gabriel, Passo Fundo), Empresa (select: NEST, DMMC, SV Parts, MALB)
- Integrar em `compras.tsx`, `contratos.tsx`, `frete.tsx` substituindo os campos duplicados de identificação
- Persistir os 5 campos no payload do card

### Fase 4 — "Esqueci minha senha"
- Em `src/routes/auth.tsx`: link "Esqueci minha senha" abaixo do campo de senha
- Modal com input de e-mail + validação de formato
- Chama `supabase.auth.resetPasswordForEmail(email, { redirectTo: origin + '/reset-password' })`
- Toast: "Um link de redefinição de senha foi enviado para o seu e-mail!"
- Criar rota pública `/reset-password` que recebe o link, captura `type=recovery` do hash e chama `supabase.auth.updateUser({ password })`

### Fase 5 — Área do Desenvolvedor
- Nova rota `src/routes/_authenticated/dev.tsx` (gate por `isAdmin`)
- Link no Layout visível só para admin
- Conteúdo:
  - Tabela de solicitações finalizadas (status `pedido_gerado`) com filtros (unidade, empresa, período)
  - Botões "Exportar JSON" / "Exportar CSV" (download local, sem backend)
  - Simulador de Webhook: input de Código Único + botão "Simular retorno do Linx" que gera um número fictício, grava em `numero_pedido_linx` e move o card para "Pedidos gerados"
  - Painel de Logs em tempo real (estado local + realtime do Supabase)
- Criar `src/services/api.ts` centralizando: `buildLinxPayload(card)`, `exportJSON(rows)`, `exportCSV(rows)`, `simulateLinxWebhook(codigo)`

### Fase 6 — Validação
- Smoke test via Playwright: login master → ver código único nos cards → exportar JSON → simular webhook → confirmar movimentação
- Verificar build limpo

---

## Detalhes técnicos relevantes

- **Logo:** o spec pede `src="/logo-motormac.png"`, mas o projeto já usa o asset CDN via `logo-motormac.png.asset.json` (mesma imagem, melhor performance). Vou **manter o asset CDN** — visualmente idêntico, evita arquivo binário no repo.
- **E-mails de recuperação:** o `resetPasswordForEmail` do Lovable Cloud envia e-mail real. Para o ambiente de teste o toast aparece igual, mesmo que o e-mail não chegue.
- **Realtime:** o canal `kanban_cards_changes` já existe no Kanban; a Área do Desenvolvedor consome o mesmo evento para atualizar os logs.
- **Master admin:** já está com senha `12345678` e role `admin` no banco — sem alteração necessária.

---

## Pergunta antes de executar

Os cards existentes no Kanban (criados antes dessa mudança) **devem receber códigos únicos retroativos** (backfill sequencial a partir de 1), ou prefere que o código só apareça nos cards novos a partir de agora? O plano acima assume backfill.
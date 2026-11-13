<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Share the requests table through RequestsHistoryView between personal requests and owner history so their actions and document presentation stay identical; preserve other history audiences.
- Keep cost-center options and exact code-description validation in one browser-safe catalog, shared by the requester block and creation guard; persist both fields in the existing request data JSON without coupling them to approval departments or transitions.
- Keep manual order-entry validation in the browser-safe kanban-order-entry module and apply it only to manual Kanban handlers; approval RPC and ERP transitions remain independent to preserve existing approval authority.
- Keep the owner-only protected-user list and admin eligibility rule in src/lib/protected-users.ts mirrored by app_private.is_protected_user / is_admin_eligible in the database; server functions use the service role, so they must check it explicitly besides RLS. Admin revocation on inactivation lives in a profiles trigger so every inactivation path applies it.
- Receipt confirmation (thumbs up/down) is stored only in kanban_cards.data.recebimento via the registrarRecebimento server function, which verifies the caller (requester, owner, admin, or approver whose departments include the card cost-center description, via podeRegistrarRecebimento) and Pedidos Gerados + NF/Boleto/XML; it never changes status, approvals or Kanban rules.
- Pipefy payment protocol (runs only after recebimento "confirmado", via pipefy-protocolo.server.ts called by registrarRecebimento or the Protocolo tab; saving dados_pagamento releases the receipt step): De/Para rules live in browser-safe src/lib/pipefy-depara.ts + pipefy-payload.ts; payment data is stored only in kanban_cards.data.dados_pagamento and protocol result in data.protocolo_pipefy, written by pipefy.functions.ts (buyer/admin/owner checked server-side, Pedidos Gerados only); never changes status, approvals or transitions.

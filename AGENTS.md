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
- Normalize document due dates with pagamento.ts and map each installment to its verified public-form field in pipefy-payload.ts; this avoids invented dates and mismatched installment order.
- Normalize notification and protocol failures with error-messages.ts before display or persistence; external provider messages must not bypass localization.
- Keep the Protocolo table synced from kanban_cards through a unique, cleaned-up realtime subscription and focus/online/visible polling recovery; all sending paths persist to the same data.protocolo_pipefy source, so stale requests must not overwrite newer reads.
- Derive Protocolo readiness through browser-safe situacaoProtocolo using montarCamposPipefy's sending requirements, so missing data is shown and the send button stays disabled without changing server authority.
- Upload Pipefy attachments through pipefy-attachments.ts using objectName, contentType and contentLength plus the PUT MIME header; reject lost filenames to preserve original extensions and bytes without changing Central download rules.
- Purchase orders (PC numbers, PDF, supplier e-mail) live in purchase-order-number.ts, filiais-fiscais.ts, purchase-order-pdf.ts (browser-safe) and purchase-order.server.ts; they write only kanban_cards.data.pedido_compra plus a history note, never status/approvals, and skip Contratos so Kanban rules stay intact.
- Approved quotations go directly to generated orders through the existing approval RPC; approval.functions.ts awaits existing purchase-order issuance, while a database compatibility trigger redirects the retired approved-quotations status without changing approval authority.
- Payment block lives inside the green invoice section (NF → XML → condição); the boleto upload renders only for Boleto via a render slot, "parcelado" is an optional flag (legacy "Parcelado" still read), and Pix goes to Pipefy as Depósito + Código Pix with the payee in observations because the form has no Pix option.

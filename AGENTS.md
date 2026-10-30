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
- Keep manual order-entry validation in the browser-safe kanban-order-entry module and apply it only to manual Kanban handlers; approval RPC and ERP transitions remain independent to preserve existing approval authority.
- Keep the owner-only protected-user list and admin eligibility rule in src/lib/protected-users.ts mirrored by app_private.is_protected_user / is_admin_eligible in the database; server functions use the service role, so they must check it explicitly besides RLS. Admin revocation on inactivation lives in a profiles trigger so every inactivation path applies it.

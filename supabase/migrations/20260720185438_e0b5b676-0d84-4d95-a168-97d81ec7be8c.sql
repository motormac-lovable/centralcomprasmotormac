
-- 1) Drop plaintext password storage from buyer_applications
ALTER TABLE public.buyer_applications DROP COLUMN IF EXISTS pending_password;

-- 2) Tighten kanban_cards UPDATE policy: remove aprovador (approvers must use approve/reject RPCs)
DROP POLICY IF EXISTS "Buyers, approvers and admins can update cards" ON public.kanban_cards;
CREATE POLICY "Buyers and admins can update cards"
  ON public.kanban_cards
  FOR UPDATE
  TO authenticated
  USING (
    app_private.has_role(auth.uid(), 'buyer'::public.app_role)
    OR app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'owner'::public.app_role)
  )
  WITH CHECK (
    app_private.has_role(auth.uid(), 'buyer'::public.app_role)
    OR app_private.has_role(auth.uid(), 'admin'::public.app_role)
    OR app_private.has_role(auth.uid(), 'owner'::public.app_role)
  );

-- 3) Tighten storage policies for orcamentos bucket (only staff roles)
DROP POLICY IF EXISTS "Authenticated can read orcamentos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload orcamentos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update orcamentos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete orcamentos" ON storage.objects;

CREATE POLICY "Staff can read orcamentos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'orcamentos'
    AND (
      app_private.has_role(auth.uid(), 'buyer'::public.app_role)
      OR app_private.has_role(auth.uid(), 'admin'::public.app_role)
      OR app_private.has_role(auth.uid(), 'owner'::public.app_role)
      OR app_private.has_role(auth.uid(), 'aprovador'::public.app_role)
      OR app_private.has_role(auth.uid(), 'auditor'::public.app_role)
    )
  );

CREATE POLICY "Staff can upload orcamentos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'orcamentos'
    AND (
      app_private.has_role(auth.uid(), 'buyer'::public.app_role)
      OR app_private.has_role(auth.uid(), 'admin'::public.app_role)
      OR app_private.has_role(auth.uid(), 'owner'::public.app_role)
      OR app_private.has_role(auth.uid(), 'aprovador'::public.app_role)
    )
  );

CREATE POLICY "Staff can update orcamentos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'orcamentos'
    AND (
      app_private.has_role(auth.uid(), 'buyer'::public.app_role)
      OR app_private.has_role(auth.uid(), 'admin'::public.app_role)
      OR app_private.has_role(auth.uid(), 'owner'::public.app_role)
    )
  )
  WITH CHECK (
    bucket_id = 'orcamentos'
    AND (
      app_private.has_role(auth.uid(), 'buyer'::public.app_role)
      OR app_private.has_role(auth.uid(), 'admin'::public.app_role)
      OR app_private.has_role(auth.uid(), 'owner'::public.app_role)
    )
  );

CREATE POLICY "Staff can delete orcamentos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'orcamentos'
    AND (
      app_private.has_role(auth.uid(), 'admin'::public.app_role)
      OR app_private.has_role(auth.uid(), 'owner'::public.app_role)
      OR app_private.has_role(auth.uid(), 'buyer'::public.app_role)
    )
  );

-- 4) Remove broad staff SELECT on profiles CPF/phone; keep read of non-sensitive fields
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (
  id, full_name, email, is_active, is_deleted, deleted_at, deleted_by, deleted_by_name,
  deactivated_at, deactivated_by, deactivated_by_name, original_full_name, original_email,
  force_logout_at, created_at
) ON public.profiles TO authenticated;
GRANT UPDATE, INSERT, DELETE ON public.profiles TO authenticated;

-- Admin-only RPC returning profiles with PII (used by admin users management page)
CREATE OR REPLACE FUNCTION public.list_profiles_with_pii()
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  cpf text,
  phone text,
  is_active boolean,
  is_deleted boolean,
  created_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.email, p.cpf, p.phone, p.is_active, p.is_deleted, p.created_at
  FROM public.profiles p
  WHERE p.is_deleted = false
    AND (
      public.has_role(auth.uid(), 'owner'::public.app_role)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  ORDER BY p.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.list_profiles_with_pii() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_profiles_with_pii() TO authenticated;

-- 5) Lock down SECURITY DEFINER helpers: revoke anon; revoke authenticated on non-client helpers
-- Client-callable (keep authenticated execute; revoke anon)
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

REVOKE ALL ON FUNCTION public.assign_contract_buyer(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_contract_buyer(text[]) TO authenticated;

REVOKE ALL ON FUNCTION public.approve_kanban_card(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_kanban_card(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.reject_kanban_card(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_kanban_card(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.append_requester_file(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.append_requester_file(uuid, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.append_quotation_attachments(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.append_quotation_attachments(uuid, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.has_approver_for_department(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_approver_for_department(text) TO authenticated;

-- Server-only / trigger helpers (revoke from anon and authenticated; service_role retains via ownership)
REVOKE ALL ON FUNCTION public.get_profile_pii(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_profile_deleted(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_user_active(uuid, boolean, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kanban_cards_set_requester() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gerar_codigo_unico() FROM PUBLIC, anon, authenticated;

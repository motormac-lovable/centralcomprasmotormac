
-- kanban_cards: remove anon SELECT and anon INSERT
DROP POLICY IF EXISTS "Public status lookup by codigo_unico" ON public.kanban_cards;
DROP POLICY IF EXISTS "Anyone can create a card" ON public.kanban_cards;

CREATE POLICY "Authenticated can create a card"
  ON public.kanban_cards FOR INSERT TO authenticated
  WITH CHECK (kind IS NOT NULL AND title IS NOT NULL AND length(title) > 0);

REVOKE INSERT, SELECT ON public.kanban_cards FROM anon;

-- profiles: restrict SELECT to self or staff
DROP POLICY IF EXISTS "Profiles readable by authenticated" ON public.profiles;

CREATE POLICY "Users read own profile or staff reads all"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR app_private.has_role(auth.uid(), 'owner'::app_role)
    OR app_private.has_role(auth.uid(), 'admin'::app_role)
    OR app_private.has_role(auth.uid(), 'buyer'::app_role)
    OR app_private.has_role(auth.uid(), 'aprovador'::app_role)
    OR app_private.has_role(auth.uid(), 'auditor'::app_role)
  );

-- storage: UPDATE policies for both buckets
CREATE POLICY "Buyers can update orcamentos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'orcamentos'
    AND (
      app_private.has_role(auth.uid(), 'buyer'::app_role)
      OR app_private.has_role(auth.uid(), 'admin'::app_role)
      OR app_private.has_role(auth.uid(), 'owner'::app_role)
    )
  )
  WITH CHECK (
    bucket_id = 'orcamentos'
    AND (
      app_private.has_role(auth.uid(), 'buyer'::app_role)
      OR app_private.has_role(auth.uid(), 'admin'::app_role)
      OR app_private.has_role(auth.uid(), 'owner'::app_role)
    )
  );

CREATE POLICY "Update solicitacao-anexos (owner or staff)"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'solicitacao-anexos'
    AND (
      (storage.foldername(name))[1] = (auth.uid())::text
      OR app_private.has_role(auth.uid(), 'admin'::app_role)
      OR app_private.has_role(auth.uid(), 'owner'::app_role)
    )
  )
  WITH CHECK (
    bucket_id = 'solicitacao-anexos'
    AND (
      (storage.foldername(name))[1] = (auth.uid())::text
      OR app_private.has_role(auth.uid(), 'admin'::app_role)
      OR app_private.has_role(auth.uid(), 'owner'::app_role)
    )
  );

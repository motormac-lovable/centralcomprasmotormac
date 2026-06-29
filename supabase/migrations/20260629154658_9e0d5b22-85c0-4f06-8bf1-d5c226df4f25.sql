DROP POLICY IF EXISTS "Buyers can read orcamentos" ON storage.objects;
CREATE POLICY "Staff and approvers can read orcamentos"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'orcamentos'
  AND (
    app_private.has_role(auth.uid(), 'buyer'::app_role)
    OR app_private.has_role(auth.uid(), 'admin'::app_role)
    OR app_private.has_role(auth.uid(), 'owner'::app_role)
    OR app_private.has_role(auth.uid(), 'aprovador'::app_role)
  )
);

DROP POLICY IF EXISTS "Read solicitacao-anexos (owner or staff)" ON storage.objects;
CREATE POLICY "Read solicitacao-anexos (owner, staff or approver)"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'solicitacao-anexos'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR app_private.has_role(auth.uid(), 'buyer'::app_role)
    OR app_private.has_role(auth.uid(), 'admin'::app_role)
    OR app_private.has_role(auth.uid(), 'owner'::app_role)
    OR app_private.has_role(auth.uid(), 'aprovador'::app_role)
  )
);
-- Amplia permissões do bucket 'orcamentos' para incluir Aprovadores
DROP POLICY IF EXISTS "Buyers can upload orcamentos" ON storage.objects;
DROP POLICY IF EXISTS "Buyers can update orcamentos" ON storage.objects;
DROP POLICY IF EXISTS "Buyers can delete orcamentos" ON storage.objects;

CREATE POLICY "Staff can upload orcamentos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'orcamentos'
  AND (
    app_private.has_role(auth.uid(), 'buyer'::app_role)
    OR app_private.has_role(auth.uid(), 'admin'::app_role)
    OR app_private.has_role(auth.uid(), 'owner'::app_role)
    OR app_private.has_role(auth.uid(), 'aprovador'::app_role)
  )
);

CREATE POLICY "Staff can update orcamentos"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'orcamentos'
  AND (
    app_private.has_role(auth.uid(), 'buyer'::app_role)
    OR app_private.has_role(auth.uid(), 'admin'::app_role)
    OR app_private.has_role(auth.uid(), 'owner'::app_role)
    OR app_private.has_role(auth.uid(), 'aprovador'::app_role)
  )
)
WITH CHECK (
  bucket_id = 'orcamentos'
  AND (
    app_private.has_role(auth.uid(), 'buyer'::app_role)
    OR app_private.has_role(auth.uid(), 'admin'::app_role)
    OR app_private.has_role(auth.uid(), 'owner'::app_role)
    OR app_private.has_role(auth.uid(), 'aprovador'::app_role)
  )
);

CREATE POLICY "Staff can delete orcamentos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'orcamentos'
  AND (
    app_private.has_role(auth.uid(), 'buyer'::app_role)
    OR app_private.has_role(auth.uid(), 'admin'::app_role)
    OR app_private.has_role(auth.uid(), 'owner'::app_role)
    OR app_private.has_role(auth.uid(), 'aprovador'::app_role)
  )
);
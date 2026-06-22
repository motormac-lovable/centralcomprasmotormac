DROP POLICY IF EXISTS "Read solicitacao-anexos (owner or staff)" ON storage.objects;
DROP POLICY IF EXISTS "Delete solicitacao-anexos (owner or staff)" ON storage.objects;

CREATE POLICY "Read solicitacao-anexos (owner or staff)"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'solicitacao-anexos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR app_private.has_role(auth.uid(), 'buyer')
    OR app_private.has_role(auth.uid(), 'admin')
    OR app_private.has_role(auth.uid(), 'owner')
  )
);

CREATE POLICY "Delete solicitacao-anexos (owner or staff)"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'solicitacao-anexos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR app_private.has_role(auth.uid(), 'admin')
    OR app_private.has_role(auth.uid(), 'owner')
  )
);
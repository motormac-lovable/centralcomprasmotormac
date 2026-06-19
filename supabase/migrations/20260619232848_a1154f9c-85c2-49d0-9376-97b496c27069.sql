
CREATE POLICY "Authenticated users upload solicitacao-anexos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'solicitacao-anexos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Read solicitacao-anexos (owner or staff)"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'solicitacao-anexos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'buyer')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'owner')
  )
);

CREATE POLICY "Delete solicitacao-anexos (owner or staff)"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'solicitacao-anexos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'owner')
  )
);

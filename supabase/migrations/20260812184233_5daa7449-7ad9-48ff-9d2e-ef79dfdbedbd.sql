CREATE POLICY "orcamentos_requester_read"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'orcamentos'
  AND EXISTS (
    SELECT 1 FROM public.kanban_cards c
    WHERE c.id::text = split_part(objects.name, '/', 1)
      AND (
        c.requester_id = auth.uid()
        OR (c.requester_email IS NOT NULL AND lower(c.requester_email) = app_private.current_user_email())
      )
  )
);
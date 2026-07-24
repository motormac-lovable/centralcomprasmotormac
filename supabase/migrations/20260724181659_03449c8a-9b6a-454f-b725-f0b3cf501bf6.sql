
CREATE OR REPLACE FUNCTION app_private.current_user_email()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT lower(email) FROM auth.users WHERE id = auth.uid()
$$;

DROP POLICY IF EXISTS invoice_documents_requester_read ON storage.objects;
CREATE POLICY invoice_documents_requester_read
ON storage.objects FOR SELECT
USING (
  bucket_id = 'invoice-documents'
  AND EXISTS (
    SELECT 1 FROM public.kanban_cards c
    WHERE c.id::text = split_part(objects.name, '/', 1)
      AND (
        c.requester_id = auth.uid()
        OR (c.requester_email IS NOT NULL
            AND lower(c.requester_email) = app_private.current_user_email())
      )
  )
);


-- RLS policies for invoice-documents bucket
-- File paths follow the pattern: <card_id>/<subtipo>/<file>
-- where subtipo is 'nf' or 'boleto'.

-- Staff (buyer/admin/owner) manage all files
CREATE POLICY "invoice_documents_staff_all"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'invoice-documents'
  AND (
    public.has_role(auth.uid(), 'buyer'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'owner'::public.app_role)
  )
)
WITH CHECK (
  bucket_id = 'invoice-documents'
  AND (
    public.has_role(auth.uid(), 'buyer'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'owner'::public.app_role)
  )
);

-- Requester can read files of their own cards
CREATE POLICY "invoice_documents_requester_read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'invoice-documents'
  AND EXISTS (
    SELECT 1 FROM public.kanban_cards c
    WHERE c.id::text = split_part(storage.objects.name, '/', 1)
      AND (
        c.requester_id = auth.uid()
        OR (
          c.requester_email IS NOT NULL
          AND lower(c.requester_email) = lower(COALESCE((SELECT email FROM auth.users WHERE id = auth.uid()), ''))
        )
      )
  )
);

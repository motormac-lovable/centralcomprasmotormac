
DROP POLICY IF EXISTS "Staff can upload orcamentos" ON storage.objects;
DROP POLICY IF EXISTS "Staff can update orcamentos" ON storage.objects;
DROP POLICY IF EXISTS "Staff can delete orcamentos" ON storage.objects;
DROP POLICY IF EXISTS "Staff and approvers can read orcamentos" ON storage.objects;

CREATE POLICY "Authenticated can read orcamentos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'orcamentos');

CREATE POLICY "Authenticated can upload orcamentos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'orcamentos');

CREATE POLICY "Authenticated can update orcamentos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'orcamentos')
  WITH CHECK (bucket_id = 'orcamentos');

CREATE POLICY "Authenticated can delete orcamentos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'orcamentos');

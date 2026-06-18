
CREATE POLICY "Buyers can read orcamentos" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'orcamentos' AND (public.has_role(auth.uid(),'buyer') OR public.has_role(auth.uid(),'admin')));

CREATE POLICY "Buyers can upload orcamentos" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'orcamentos' AND (public.has_role(auth.uid(),'buyer') OR public.has_role(auth.uid(),'admin')));

CREATE POLICY "Buyers can delete orcamentos" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'orcamentos' AND (public.has_role(auth.uid(),'buyer') OR public.has_role(auth.uid(),'admin')));

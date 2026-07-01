CREATE POLICY "Buyers can toggle solicitantes active state" ON public.profiles
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'buyer'::app_role)
  AND public.has_role(profiles.id, 'solicitante'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'buyer'::app_role)
  AND public.has_role(profiles.id, 'solicitante'::app_role)
);
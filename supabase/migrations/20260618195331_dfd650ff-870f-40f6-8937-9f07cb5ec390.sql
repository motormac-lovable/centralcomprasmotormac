
-- Allow owners and admins to update any profile. Owners can also update owner profiles.
CREATE POLICY "Owners and admins update profiles" ON public.profiles
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

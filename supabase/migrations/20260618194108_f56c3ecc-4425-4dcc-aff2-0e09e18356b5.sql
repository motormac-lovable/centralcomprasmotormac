DROP POLICY IF EXISTS "Owners and admins insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Owners and admins delete roles" ON public.user_roles;

CREATE POLICY "Owners and admins insert roles"
ON public.user_roles FOR INSERT
WITH CHECK (
  (role = 'buyer' AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')))
  OR (role = 'admin' AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')))
  OR (role = 'owner' AND public.has_role(auth.uid(), 'owner'))
);

CREATE POLICY "Owners and admins delete roles"
ON public.user_roles FOR DELETE
USING (
  (role = 'buyer' AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')))
  OR (role = 'admin' AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')))
  OR (role = 'owner' AND public.has_role(auth.uid(), 'owner'))
);
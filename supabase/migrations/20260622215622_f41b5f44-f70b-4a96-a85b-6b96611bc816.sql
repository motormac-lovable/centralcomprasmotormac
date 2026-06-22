DROP POLICY IF EXISTS "Owners and admins insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Owners and admins delete roles" ON public.user_roles;

CREATE POLICY "Owners and admins insert roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    ((role IN ('buyer'::public.app_role, 'solicitante'::public.app_role))
      AND (app_private.has_role(auth.uid(), 'owner'::public.app_role) OR app_private.has_role(auth.uid(), 'admin'::public.app_role)))
    OR ((role = 'admin'::public.app_role)
      AND (app_private.has_role(auth.uid(), 'owner'::public.app_role) OR app_private.has_role(auth.uid(), 'admin'::public.app_role)))
    OR ((role = 'owner'::public.app_role) AND app_private.has_role(auth.uid(), 'owner'::public.app_role))
  );

CREATE POLICY "Owners and admins delete roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (
    ((role IN ('buyer'::public.app_role, 'solicitante'::public.app_role))
      AND (app_private.has_role(auth.uid(), 'owner'::public.app_role) OR app_private.has_role(auth.uid(), 'admin'::public.app_role)))
    OR ((role = 'admin'::public.app_role)
      AND (app_private.has_role(auth.uid(), 'owner'::public.app_role) OR app_private.has_role(auth.uid(), 'admin'::public.app_role)))
    OR ((role = 'owner'::public.app_role) AND app_private.has_role(auth.uid(), 'owner'::public.app_role))
  );
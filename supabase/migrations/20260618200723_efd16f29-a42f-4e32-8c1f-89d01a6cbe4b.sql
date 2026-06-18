CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
GRANT USAGE ON SCHEMA app_private TO authenticated;
GRANT USAGE ON SCHEMA app_private TO service_role;

CREATE OR REPLACE FUNCTION app_private.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = _user_id
        AND role = _role
    )
    OR (
      _role = 'owner'::public.app_role
      AND EXISTS (
        SELECT 1
        FROM auth.users u
        WHERE u.id = _user_id
          AND lower(u.email) IN ('herllon.souza@motormac.com.br', 'vanessa@motormac.com.br')
      )
    )
$$;

REVOKE ALL ON FUNCTION app_private.has_role(UUID, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.has_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.has_role(UUID, public.app_role) TO service_role;

DROP POLICY IF EXISTS "Owners and admins see all applications" ON public.buyer_applications;
CREATE POLICY "Owners and admins see all applications"
ON public.buyer_applications FOR SELECT TO authenticated
USING (app_private.has_role(auth.uid(), 'owner') OR app_private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Owners and admins update applications" ON public.buyer_applications;
CREATE POLICY "Owners and admins update applications"
ON public.buyer_applications FOR UPDATE TO authenticated
USING (app_private.has_role(auth.uid(), 'owner') OR app_private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Owners and admins update profiles" ON public.profiles;
CREATE POLICY "Owners and admins update profiles"
ON public.profiles FOR UPDATE TO authenticated
USING (app_private.has_role(auth.uid(), 'owner') OR app_private.has_role(auth.uid(), 'admin'))
WITH CHECK (app_private.has_role(auth.uid(), 'owner') OR app_private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Owners and admins read all roles" ON public.user_roles;
CREATE POLICY "Owners and admins read all roles"
ON public.user_roles FOR SELECT TO authenticated
USING (app_private.has_role(auth.uid(), 'owner') OR app_private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Owners and admins insert roles" ON public.user_roles;
CREATE POLICY "Owners and admins insert roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (
  (role = 'buyer' AND (app_private.has_role(auth.uid(), 'owner') OR app_private.has_role(auth.uid(), 'admin')))
  OR (role = 'admin' AND (app_private.has_role(auth.uid(), 'owner') OR app_private.has_role(auth.uid(), 'admin')))
  OR (role = 'owner' AND app_private.has_role(auth.uid(), 'owner'))
);

DROP POLICY IF EXISTS "Owners and admins delete roles" ON public.user_roles;
CREATE POLICY "Owners and admins delete roles"
ON public.user_roles FOR DELETE TO authenticated
USING (
  (role = 'buyer' AND (app_private.has_role(auth.uid(), 'owner') OR app_private.has_role(auth.uid(), 'admin')))
  OR (role = 'admin' AND (app_private.has_role(auth.uid(), 'owner') OR app_private.has_role(auth.uid(), 'admin')))
  OR (role = 'owner' AND app_private.has_role(auth.uid(), 'owner'))
);

DROP POLICY IF EXISTS "Buyers and admins can update cards" ON public.kanban_cards;
CREATE POLICY "Buyers and admins can update cards"
ON public.kanban_cards FOR UPDATE TO authenticated
USING (app_private.has_role(auth.uid(), 'buyer') OR app_private.has_role(auth.uid(), 'admin') OR app_private.has_role(auth.uid(), 'owner'));

DROP POLICY IF EXISTS "Admins can delete cards" ON public.kanban_cards;
CREATE POLICY "Admins can delete cards"
ON public.kanban_cards FOR DELETE TO authenticated
USING (app_private.has_role(auth.uid(), 'admin') OR app_private.has_role(auth.uid(), 'owner'));

DROP POLICY IF EXISTS "Buyers can read orcamentos" ON storage.objects;
CREATE POLICY "Buyers can read orcamentos"
ON storage.objects FOR SELECT TO authenticated
USING ((bucket_id = 'orcamentos') AND (app_private.has_role(auth.uid(), 'buyer') OR app_private.has_role(auth.uid(), 'admin') OR app_private.has_role(auth.uid(), 'owner')));

DROP POLICY IF EXISTS "Buyers can upload orcamentos" ON storage.objects;
CREATE POLICY "Buyers can upload orcamentos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK ((bucket_id = 'orcamentos') AND (app_private.has_role(auth.uid(), 'buyer') OR app_private.has_role(auth.uid(), 'admin') OR app_private.has_role(auth.uid(), 'owner')));

DROP POLICY IF EXISTS "Buyers can delete orcamentos" ON storage.objects;
CREATE POLICY "Buyers can delete orcamentos"
ON storage.objects FOR DELETE TO authenticated
USING ((bucket_id = 'orcamentos') AND (app_private.has_role(auth.uid(), 'buyer') OR app_private.has_role(auth.uid(), 'admin') OR app_private.has_role(auth.uid(), 'owner')));

REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM anon;
REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM authenticated;
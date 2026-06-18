-- Promote existing admins (owner emails) to 'owner'
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'owner'::public.app_role
FROM auth.users u
WHERE u.email IN ('herllon.souza@motormac.com.br', 'vanessa@motormac.com.br')
ON CONFLICT DO NOTHING;

-- Remove the legacy 'admin' role from owners (they don't need both)
DELETE FROM public.user_roles
WHERE role = 'admin'
  AND user_id IN (
    SELECT id FROM auth.users
    WHERE email IN ('herllon.souza@motormac.com.br', 'vanessa@motormac.com.br')
  );

-- Update new-user trigger: owner emails become 'owner'; others wait for approval
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, cpf, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'cpf', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', '')
  )
  ON CONFLICT (id) DO NOTHING;

  IF NEW.email IN ('herllon.souza@motormac.com.br', 'vanessa@motormac.com.br') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner')
    ON CONFLICT DO NOTHING;
  END IF;
  -- Other users get no role until approved.

  RETURN NEW;
END $function$;

-- Update RLS: Admins OR Owners can read/approve buyer applications
DROP POLICY IF EXISTS "Admins see all applications" ON public.buyer_applications;
DROP POLICY IF EXISTS "Admins update applications" ON public.buyer_applications;

CREATE POLICY "Owners and admins see all applications"
ON public.buyer_applications FOR SELECT
USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Owners and admins update applications"
ON public.buyer_applications FOR UPDATE
USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

-- Update RLS on user_roles
DROP POLICY IF EXISTS "Admins read all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins manage roles insert" ON public.user_roles;
DROP POLICY IF EXISTS "Admins manage roles delete" ON public.user_roles;

CREATE POLICY "Owners and admins read all roles"
ON public.user_roles FOR SELECT
USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

-- INSERT: admins can add 'buyer'; only owners can add 'admin'; no one can add 'owner'
CREATE POLICY "Owners and admins insert roles"
ON public.user_roles FOR INSERT
WITH CHECK (
  (role = 'buyer' AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')))
  OR (role = 'admin' AND public.has_role(auth.uid(), 'owner'))
);

-- DELETE: admins can remove 'buyer'; only owners can remove 'admin'; no one can remove 'owner'
CREATE POLICY "Owners and admins delete roles"
ON public.user_roles FOR DELETE
USING (
  (role = 'buyer' AND (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')))
  OR (role = 'admin' AND public.has_role(auth.uid(), 'owner'))
);

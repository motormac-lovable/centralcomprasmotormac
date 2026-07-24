
-- Simplify has_role to avoid querying auth.users (causes "permission denied for table users" under storage RLS)
CREATE OR REPLACE FUNCTION app_private.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$function$;

-- Ensure Herllon has the owner role (fallback that was previously hard-coded)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'owner'::public.app_role FROM auth.users
WHERE lower(email) = 'herllon.souza@motormac.com.br'
ON CONFLICT (user_id, role) DO NOTHING;

-- Broaden SELECT policy on solicitacao-anexos to also include 'auditor'
DROP POLICY IF EXISTS "Read solicitacao-anexos (owner, staff or approver)" ON storage.objects;
CREATE POLICY "Read solicitacao-anexos (kanban roles)"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'solicitacao-anexos'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR app_private.has_role(auth.uid(), 'buyer'::app_role)
    OR app_private.has_role(auth.uid(), 'admin'::app_role)
    OR app_private.has_role(auth.uid(), 'owner'::app_role)
    OR app_private.has_role(auth.uid(), 'aprovador'::app_role)
    OR app_private.has_role(auth.uid(), 'auditor'::app_role)
  )
);

-- Same broadening for the orcamentos bucket (kanban attachments)
DROP POLICY IF EXISTS "Read orcamentos (staff)" ON storage.objects;
DROP POLICY IF EXISTS "Read orcamentos (kanban roles)" ON storage.objects;
CREATE POLICY "Read orcamentos (kanban roles)"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'orcamentos'
  AND (
    app_private.has_role(auth.uid(), 'buyer'::app_role)
    OR app_private.has_role(auth.uid(), 'admin'::app_role)
    OR app_private.has_role(auth.uid(), 'owner'::app_role)
    OR app_private.has_role(auth.uid(), 'aprovador'::app_role)
    OR app_private.has_role(auth.uid(), 'auditor'::app_role)
  )
);

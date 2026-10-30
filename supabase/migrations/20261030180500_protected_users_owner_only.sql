CREATE OR REPLACE FUNCTION app_private.is_protected_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id
      AND (lower(coalesce(p.email, '')) = ANY (ARRAY[
             'aprovador@motormac.com.br','solicitante@motormac.com.br','auditor@motormac.com.br',
             'controladoria@motormac.com.br','comprador@motormac.com.br','solicitante2@motormac.com.br',
             'aprovador2@motormac.com.br'])
        OR lower(coalesce(p.original_email, '')) = ANY (ARRAY[
             'aprovador@motormac.com.br','solicitante@motormac.com.br','auditor@motormac.com.br',
             'controladoria@motormac.com.br','comprador@motormac.com.br','solicitante2@motormac.com.br',
             'aprovador2@motormac.com.br']))
  )
$$;

CREATE OR REPLACE FUNCTION app_private.is_admin_eligible(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id AND p.is_active = true AND p.is_deleted = false
  )
$$;

GRANT EXECUTE ON FUNCTION app_private.is_protected_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_admin_eligible(uuid) TO authenticated;

-- Usuários protegidos: somente o Proprietário altera (cumulativo às políticas existentes).
CREATE POLICY "Protected users: only owner updates profile"
ON public.profiles AS RESTRICTIVE FOR UPDATE TO authenticated
USING (NOT app_private.is_protected_user(id) OR id = auth.uid() OR app_private.has_role(auth.uid(), 'owner'::app_role))
WITH CHECK (NOT app_private.is_protected_user(id) OR id = auth.uid() OR app_private.has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Protected users: only owner adds roles"
ON public.user_roles AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (NOT app_private.is_protected_user(user_id) OR app_private.has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Protected users: only owner removes roles"
ON public.user_roles AS RESTRICTIVE FOR DELETE TO authenticated
USING (NOT app_private.is_protected_user(user_id) OR app_private.has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Protected users: only owner inserts approver settings"
ON public.approver_settings AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (NOT app_private.is_protected_user(user_id) OR app_private.has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Protected users: only owner updates approver settings"
ON public.approver_settings AS RESTRICTIVE FOR UPDATE TO authenticated
USING (NOT app_private.is_protected_user(user_id) OR app_private.has_role(auth.uid(), 'owner'::app_role))
WITH CHECK (NOT app_private.is_protected_user(user_id) OR app_private.has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Protected users: only owner deletes approver settings"
ON public.approver_settings AS RESTRICTIVE FOR DELETE TO authenticated
USING (NOT app_private.is_protected_user(user_id) OR app_private.has_role(auth.uid(), 'owner'::app_role));

-- Usuário inativo/excluído é inelegível para o papel de Administrador.
CREATE POLICY "Inactive users cannot become admin"
ON public.user_roles AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (role <> 'admin'::app_role OR app_private.is_admin_eligible(user_id));
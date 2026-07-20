
-- Remove role de Proprietário da vanessa (se existir)
DELETE FROM public.user_roles
WHERE role = 'owner'::public.app_role
  AND user_id IN (SELECT id FROM auth.users WHERE lower(email) = 'vanessa@motormac.com.br');

-- Atualiza has_role removendo vanessa da lista de proprietários implícitos
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
          AND lower(u.email) = 'herllon.souza@motormac.com.br'
      )
    )
$function$;

-- Atualiza handle_new_user para atribuir owner apenas ao herllon
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

  IF lower(NEW.email) = 'herllon.souza@motormac.com.br' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END $function$;

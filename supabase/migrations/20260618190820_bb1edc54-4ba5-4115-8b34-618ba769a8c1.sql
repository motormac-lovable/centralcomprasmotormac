UPDATE auth.users
SET encrypted_password = crypt('12345678', gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
WHERE email = 'herllon.souza@motormac.com.br';

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users WHERE email = 'herllon.souza@motormac.com.br'
ON CONFLICT DO NOTHING;
-- DROP SCHEMA app_private;

CREATE SCHEMA app_private;

-- DROP FUNCTION app_private.current_user_email();

CREATE OR REPLACE FUNCTION app_private.current_user_email()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT lower(email) FROM auth.users WHERE id = auth.uid()
$function$
;

-- DROP FUNCTION app_private.has_role(uuid, app_role);

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
$function$
;

CREATE TYPE public.approver_settings AS (
	user_id uuid,
	departments _text,
	teto_alcada numeric(12,2),
	created_at timestamptz,
	updated_at timestamptz);

CREATE TABLE public.approver_settings ( user_id uuid NOT NULL, departments _text DEFAULT '{}'::text[] NOT NULL, teto_alcada numeric(12, 2) DEFAULT 0 NOT NULL, created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL, CONSTRAINT approver_settings_pkey PRIMARY KEY (user_id));

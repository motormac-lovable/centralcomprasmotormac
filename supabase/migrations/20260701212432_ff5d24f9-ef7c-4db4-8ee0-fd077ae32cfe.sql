
-- 1) Preserve profile rows after auth.users deletion (soft delete / anonymize)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- 2) Keep kanban cards working when a linked user is deleted from auth
ALTER TABLE public.kanban_cards DROP CONSTRAINT IF EXISTS kanban_cards_assigned_to_fkey;
ALTER TABLE public.kanban_cards
  ADD CONSTRAINT kanban_cards_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3) Metadata columns on profiles for lifecycle tracking
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS deleted_by_name text,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_by uuid,
  ADD COLUMN IF NOT EXISTS deactivated_by_name text,
  ADD COLUMN IF NOT EXISTS original_full_name text,
  ADD COLUMN IF NOT EXISTS original_email text;

-- 4) Audit log table for lifecycle actions
CREATE TABLE IF NOT EXISTS public.user_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  target_user_id uuid,
  target_user_name text,
  target_user_email text,
  actor_user_id uuid,
  actor_user_name text,
  action text NOT NULL, -- 'inativado' | 'reativado' | 'excluido'
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.user_audit_log TO authenticated;
GRANT ALL ON public.user_audit_log TO service_role;

ALTER TABLE public.user_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners and admins read audit log" ON public.user_audit_log;
CREATE POLICY "Owners and admins read audit log"
  ON public.user_audit_log
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'auditor'::public.app_role)
  );

CREATE INDEX IF NOT EXISTS user_audit_log_target_idx ON public.user_audit_log(target_user_id);
CREATE INDEX IF NOT EXISTS user_audit_log_created_idx ON public.user_audit_log(created_at DESC);

-- 5) Server-side helper: mark profile as deleted (anonymized) and log audit.
-- Called by admin server function (via supabaseAdmin) after auth.users removal.
CREATE OR REPLACE FUNCTION public.mark_profile_deleted(
  _target uuid,
  _actor uuid,
  _actor_name text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  original_name text;
  original_email text;
BEGIN
  SELECT COALESCE(full_name, email, 'Usuário'), email
    INTO original_name, original_email
  FROM public.profiles
  WHERE id = _target;

  IF original_name IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.profiles SET
    original_full_name = COALESCE(original_full_name, full_name),
    original_email     = COALESCE(original_email, email),
    full_name          = original_name || ' (Excluído)',
    email              = NULL,
    cpf                = NULL,
    phone              = NULL,
    is_active          = false,
    is_deleted         = true,
    deleted_at         = now(),
    deleted_by         = _actor,
    deleted_by_name    = _actor_name
  WHERE id = _target;

  INSERT INTO public.user_audit_log(
    target_user_id, target_user_name, target_user_email,
    actor_user_id, actor_user_name, action, details
  ) VALUES (
    _target, original_name, original_email,
    _actor, _actor_name, 'excluido',
    jsonb_build_object('anonimizado', true)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_profile_deleted(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_profile_deleted(uuid, uuid, text) TO service_role;

-- 6) Server-side helper: toggle active state with audit
CREATE OR REPLACE FUNCTION public.set_user_active(
  _target uuid,
  _active boolean,
  _actor uuid,
  _actor_name text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_name text;
  target_email text;
BEGIN
  SELECT COALESCE(full_name, email, 'Usuário'), email
    INTO target_name, target_email
  FROM public.profiles WHERE id = _target;

  IF target_name IS NULL THEN
    RAISE EXCEPTION 'Perfil não encontrado';
  END IF;

  UPDATE public.profiles SET
    is_active = _active,
    deactivated_at = CASE WHEN _active THEN NULL ELSE now() END,
    deactivated_by = CASE WHEN _active THEN NULL ELSE _actor END,
    deactivated_by_name = CASE WHEN _active THEN NULL ELSE _actor_name END
  WHERE id = _target;

  INSERT INTO public.user_audit_log(
    target_user_id, target_user_name, target_user_email,
    actor_user_id, actor_user_name, action, details
  ) VALUES (
    _target, target_name, target_email,
    _actor, _actor_name,
    CASE WHEN _active THEN 'reativado' ELSE 'inativado' END,
    '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_active(uuid, boolean, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_active(uuid, boolean, uuid, text) TO service_role;

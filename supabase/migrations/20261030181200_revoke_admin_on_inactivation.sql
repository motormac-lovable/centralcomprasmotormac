CREATE OR REPLACE FUNCTION app_private.revoke_admin_on_inactivation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed int;
BEGIN
  IF (NEW.is_active = false OR NEW.is_deleted = true)
     AND (OLD.is_active IS DISTINCT FROM NEW.is_active OR OLD.is_deleted IS DISTINCT FROM NEW.is_deleted) THEN
    DELETE FROM public.user_roles WHERE user_id = NEW.id AND role = 'admin'::app_role;
    GET DIAGNOSTICS removed = ROW_COUNT;
    IF removed > 0 THEN
      INSERT INTO public.user_audit_log(
        target_user_id, target_user_name, target_user_email,
        actor_user_id, actor_user_name, action, details
      ) VALUES (
        NEW.id, COALESCE(NEW.full_name, NEW.email, 'Usuário'), NEW.email,
        COALESCE(NEW.deactivated_by, NEW.deleted_by), COALESCE(NEW.deactivated_by_name, NEW.deleted_by_name),
        'admin_revogado_por_inativacao',
        jsonb_build_object('motivo', 'Usuário inativado perde o cargo de Administrador')
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_revoke_admin_on_inactivation ON public.profiles;
CREATE TRIGGER trg_revoke_admin_on_inactivation
AFTER UPDATE OF is_active, is_deleted ON public.profiles
FOR EACH ROW EXECUTE FUNCTION app_private.revoke_admin_on_inactivation();
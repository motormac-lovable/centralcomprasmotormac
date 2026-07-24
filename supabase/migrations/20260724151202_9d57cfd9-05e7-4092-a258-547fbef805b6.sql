CREATE OR REPLACE FUNCTION public.list_profiles_with_pii()
 RETURNS TABLE(id uuid, full_name text, email text, cpf text, phone text, is_active boolean, is_deleted boolean, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.full_name, p.email, p.cpf, p.phone, p.is_active, p.is_deleted, p.created_at
  FROM public.profiles p
  WHERE p.is_deleted = false
    AND (
      public.has_role(auth.uid(), 'owner'::public.app_role)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'buyer'::public.app_role)
      OR public.has_role(auth.uid(), 'auditor'::public.app_role)
    )
  ORDER BY p.created_at DESC;
$function$;
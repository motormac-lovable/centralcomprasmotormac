CREATE OR REPLACE FUNCTION public.can_access_card_messages(_card_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.has_role(auth.uid(), 'owner')
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'buyer')
      OR public.has_role(auth.uid(), 'aprovador')
      OR EXISTS (
        SELECT 1 FROM public.kanban_cards c
        WHERE c.id = _card_id
          AND (
            c.requester_id = auth.uid()
            OR lower(coalesce(c.requester_email, '')) = lower(coalesce((SELECT email FROM public.profiles WHERE id = auth.uid()), '@'))
          )
      );
$function$;
GRANT EXECUTE ON FUNCTION public.can_access_card_messages(uuid) TO authenticated;
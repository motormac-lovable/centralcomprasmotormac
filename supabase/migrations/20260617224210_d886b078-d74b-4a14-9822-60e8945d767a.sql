
-- Pin search_path on helper functions
ALTER FUNCTION public.set_updated_at() SET search_path = public;

-- Revoke RPC access to SECURITY DEFINER functions (still callable from policies/triggers)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Replace overly permissive WITH CHECK (true) on kanban insert with a real check
DROP POLICY "Anyone can create a card" ON public.kanban_cards;
CREATE POLICY "Anyone can create a card" ON public.kanban_cards
  FOR INSERT TO anon, authenticated
  WITH CHECK (kind IS NOT NULL AND title IS NOT NULL AND length(title) > 0);

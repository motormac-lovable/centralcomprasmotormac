CREATE POLICY "Buyers read all roles" ON public.user_roles
  FOR SELECT USING (public.has_role(auth.uid(), 'buyer'::public.app_role));
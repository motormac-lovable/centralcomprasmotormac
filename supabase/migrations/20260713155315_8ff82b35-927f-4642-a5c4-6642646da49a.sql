CREATE POLICY "Auditors read all roles"
ON public.user_roles
FOR SELECT
USING (public.has_role(auth.uid(), 'auditor'::public.app_role));
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS force_logout_at timestamptz;
GRANT SELECT (force_logout_at) ON public.profiles TO authenticated;
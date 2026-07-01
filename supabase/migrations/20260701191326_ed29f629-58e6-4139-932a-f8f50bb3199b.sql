ALTER TABLE public.buyer_applications
  ADD COLUMN IF NOT EXISTS pending_password text,
  ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.buyer_applications
  ADD COLUMN IF NOT EXISTS requested_departments text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS requested_ceiling numeric(12,2);
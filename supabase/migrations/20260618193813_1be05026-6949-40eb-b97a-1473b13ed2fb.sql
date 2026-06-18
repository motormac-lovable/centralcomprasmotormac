-- 1. Add 'owner' to the enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'owner';

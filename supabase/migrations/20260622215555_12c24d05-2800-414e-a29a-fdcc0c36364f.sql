-- 1. Adiciona o papel 'solicitante' ao enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'solicitante';
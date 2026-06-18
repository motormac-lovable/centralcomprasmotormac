
-- 1) Add new columns to kanban_cards
ALTER TABLE public.kanban_cards
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS approver_id uuid,
  ADD COLUMN IF NOT EXISTS approver_name text,
  ADD COLUMN IF NOT EXISTS order_number text,
  ADD COLUMN IF NOT EXISTS observations jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS suppliers jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2) Migrate status enum (pending/in_progress/done/rejected -> 5 new values)
ALTER TABLE public.kanban_cards ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.kanban_cards ALTER COLUMN status TYPE text USING status::text;

UPDATE public.kanban_cards SET status = CASE status
  WHEN 'pending' THEN 'solicitacoes_abertas'
  WHEN 'in_progress' THEN 'em_cotacao'
  WHEN 'done' THEN 'pedidos_gerados'
  WHEN 'rejected' THEN 'cotacoes_rejeitadas'
  ELSE 'solicitacoes_abertas'
END;

DROP TYPE IF EXISTS public.card_status CASCADE;
CREATE TYPE public.card_status AS ENUM (
  'solicitacoes_abertas',
  'em_cotacao',
  'aguardando_aprovacao',
  'cotacoes_rejeitadas',
  'pedidos_gerados'
);

ALTER TABLE public.kanban_cards
  ALTER COLUMN status TYPE public.card_status USING status::public.card_status;
ALTER TABLE public.kanban_cards
  ALTER COLUMN status SET DEFAULT 'solicitacoes_abertas'::public.card_status;

-- 3) Trigger to update status_changed_at whenever status changes
CREATE OR REPLACE FUNCTION public.update_status_changed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at = now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS kanban_cards_status_changed ON public.kanban_cards;
CREATE TRIGGER kanban_cards_status_changed
BEFORE UPDATE ON public.kanban_cards
FOR EACH ROW EXECUTE FUNCTION public.update_status_changed_at();

-- 4) Make sure realtime publishes the table
ALTER PUBLICATION supabase_realtime ADD TABLE public.kanban_cards;

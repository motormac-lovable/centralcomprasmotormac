
ALTER TABLE public.kanban_cards
  ADD COLUMN IF NOT EXISTS buyer_name text,
  ADD COLUMN IF NOT EXISTS buyer_assigned_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_kanban_cards_buyer_name ON public.kanban_cards(buyer_name);

CREATE TABLE IF NOT EXISTS public.contract_buyer_rotation (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  counter bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.contract_buyer_rotation TO authenticated;
GRANT ALL ON public.contract_buyer_rotation TO service_role;

ALTER TABLE public.contract_buyer_rotation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados podem ler rotacao" ON public.contract_buyer_rotation;
CREATE POLICY "Autenticados podem ler rotacao" ON public.contract_buyer_rotation
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.contract_buyer_rotation (id, counter) VALUES (1, 0)
  ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.assign_contract_buyer(_buyers text[])
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_idx bigint;
  n int;
BEGIN
  n := COALESCE(array_length(_buyers, 1), 0);
  IF n = 0 THEN RETURN NULL; END IF;

  INSERT INTO public.contract_buyer_rotation (id, counter) VALUES (1, 0)
    ON CONFLICT (id) DO NOTHING;

  UPDATE public.contract_buyer_rotation
    SET counter = counter + 1, updated_at = now()
    WHERE id = 1
    RETURNING counter INTO next_idx;

  RETURN _buyers[((next_idx - 1) % n) + 1];
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_contract_buyer(text[]) TO authenticated;

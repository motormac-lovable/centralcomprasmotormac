-- Sequence para a numeração ordinária global
CREATE SEQUENCE IF NOT EXISTS public.solicitacao_seq START 1;
GRANT USAGE ON SEQUENCE public.solicitacao_seq TO authenticated, service_role;

-- Coluna do código único
ALTER TABLE public.kanban_cards ADD COLUMN IF NOT EXISTS codigo_unico TEXT;

-- Função geradora MMAAAA + nextval
CREATE OR REPLACE FUNCTION public.gerar_codigo_unico()
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RETURN to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'MMYYYY') || nextval('public.solicitacao_seq')::text;
END $$;

-- Trigger BEFORE INSERT
CREATE OR REPLACE FUNCTION public.set_codigo_unico()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.codigo_unico IS NULL OR NEW.codigo_unico = '' THEN
    NEW.codigo_unico := public.gerar_codigo_unico();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_codigo_unico ON public.kanban_cards;
CREATE TRIGGER trg_set_codigo_unico
BEFORE INSERT ON public.kanban_cards
FOR EACH ROW EXECUTE FUNCTION public.set_codigo_unico();

-- Backfill cards existentes (ordem cronológica)
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn,
         to_char(created_at AT TIME ZONE 'America/Sao_Paulo', 'MMYYYY') AS prefix
  FROM public.kanban_cards WHERE codigo_unico IS NULL
)
UPDATE public.kanban_cards k
SET codigo_unico = o.prefix || nextval('public.solicitacao_seq')::text
FROM ordered o WHERE k.id = o.id;

-- Garantir unicidade após backfill
CREATE UNIQUE INDEX IF NOT EXISTS kanban_cards_codigo_unico_uidx ON public.kanban_cards (codigo_unico);

-- Coluna semântica para o pedido devolvido pelo Linx Apollo (alias do order_number)
ALTER TABLE public.kanban_cards ADD COLUMN IF NOT EXISTS numero_pedido_linx TEXT;
UPDATE public.kanban_cards SET numero_pedido_linx = order_number WHERE numero_pedido_linx IS NULL AND order_number IS NOT NULL;
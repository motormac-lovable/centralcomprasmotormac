CREATE TABLE IF NOT EXISTS public.market_cache (
  key text PRIMARY KEY,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.market_cache TO anon, authenticated;
GRANT ALL ON public.market_cache TO service_role;

ALTER TABLE public.market_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "market_cache readable by everyone"
  ON public.market_cache FOR SELECT
  USING (true);
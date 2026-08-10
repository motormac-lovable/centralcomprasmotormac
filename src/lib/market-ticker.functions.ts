import { createServerFn } from "@tanstack/react-start";

// Cache de 18 minutos (≈80 atualizações/dia — dentro do free tier Marketaux de 100/dia)
const CACHE_TTL_MS = 18 * 60 * 1000;

export type NewsItem = {
  uuid: string;
  title: string;
  description: string;
  source: string;
  url: string;
  image_url?: string | null;
  published_at: string;
  tag?: string;
};

export type Quote = {
  label: string;
  symbol: string;
  value: number;
  change_pct: number; // variação percentual do dia
  updated_at: string;
};

export type MarketTicker = {
  news: NewsItem[];
  quotes: {
    ibov: Quote | null;
    usd: Quote | null;
    eur: Quote | null;
  };
  fetched_at: string;
};

// ============ Fontes externas ============

async function fetchMarketauxPage(apiKey: string, page: number): Promise<NewsItem[]> {
  const publishedAfter = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
  const url = new URL("https://api.marketaux.com/v1/news/all");
  url.searchParams.set("api_token", apiKey);
  url.searchParams.set("language", "pt");
  url.searchParams.set("sort", "published_on");
  url.searchParams.set("published_after", publishedAfter);
  url.searchParams.set("limit", "3");
  url.searchParams.set("page", String(page));
  const resp = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
  if (!resp.ok) throw new Error(`Marketaux HTTP ${resp.status}`);
  const json = (await resp.json()) as { data?: Array<Record<string, unknown>> };

  return (json.data ?? []).map((raw) => ({
    uuid: String(raw.uuid ?? crypto.randomUUID()),
    title: String(raw.title ?? ""),
    description: String(raw.description ?? raw.snippet ?? ""),
    source: String(raw.source ?? "Marketaux"),
    url: String(raw.url ?? "#"),
    image_url: (raw.image_url as string) ?? null,
    published_at: String(raw.published_at ?? new Date().toISOString()),
    tag: (raw.entities as Array<{ name?: string }>)?.[0]?.name ?? "Economia",
  }));
}

async function fetchMarketauxNews(apiKey: string): Promise<NewsItem[]> {
  // O plano gratuito devolve 3 artigos por requisicao — pagina para chegar a 8+
  const pages = await Promise.allSettled([1, 2, 3].map((p) => fetchMarketauxPage(apiKey, p)));
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const r of pages) {
    if (r.status !== "fulfilled") continue;
    for (const item of r.value) {
      if (seen.has(item.uuid)) continue;
      seen.add(item.uuid);
      out.push(item);
    }
  }
  if (out.length === 0) throw new Error("Marketaux sem resultados");
  return out.slice(0, 12);
}

async function fetchBCBQuote(code: number, label: string, symbol: string): Promise<Quote | null> {
  // Série 1 = USD/BRL, 21619 = EUR/BRL (SGS BCB — cotações diárias PTAX)
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados/ultimos/2?formato=json`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!resp.ok) return null;
  const data = (await resp.json()) as Array<{ data: string; valor: string }>;
  if (data.length === 0) return null;
  const last = parseFloat(data[data.length - 1].valor);
  const prev = data.length > 1 ? parseFloat(data[0].valor) : last;
  const change = prev > 0 ? ((last - prev) / prev) * 100 : 0;
  return {
    label,
    symbol,
    value: last,
    change_pct: change,
    updated_at: new Date().toISOString(),
  };
}

async function fetchBrapiIbov(): Promise<Quote | null> {
  // Brapi — API pública e gratuita para B3
  try {
    const resp = await fetch("https://brapi.dev/api/quote/%5EBVSP", {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as { results?: Array<Record<string, unknown>> };
    const r = json.results?.[0];
    if (!r) return null;
    return {
      label: "IBOVESPA",
      symbol: "IBOV",
      value: Number(r.regularMarketPrice ?? 0),
      change_pct: Number(r.regularMarketChangePercent ?? 0),
      updated_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function buildFreshTicker(apiKey: string): Promise<MarketTicker> {
  const [news, usd, eur, ibov] = await Promise.allSettled([
    fetchMarketauxNews(apiKey),
    fetchBCBQuote(1, "Dólar Comercial", "USD/BRL"),
    fetchBCBQuote(21619, "Euro", "EUR/BRL"),
    fetchBrapiIbov(),
  ]);
  return {
    news: news.status === "fulfilled" ? news.value : [],
    quotes: {
      ibov: ibov.status === "fulfilled" ? ibov.value : null,
      usd: usd.status === "fulfilled" ? usd.value : null,
      eur: eur.status === "fulfilled" ? eur.value : null,
    },
    fetched_at: new Date().toISOString(),
  };
}

// ============ Server function ============

export const getMarketTicker = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const apiKey = process.env.MARKETAUX_API_KEY;

  // 1) Tenta servir do cache
  const { data: cached } = await supabaseAdmin
    .from("market_cache")
    .select("payload, fetched_at")
    .eq("key", "ticker_v1")
    .maybeSingle();

  if (cached?.payload && cached.fetched_at) {
    const age = Date.now() - new Date(cached.fetched_at).getTime();
    if (age < CACHE_TTL_MS) {
      return cached.payload as MarketTicker;
    }
  }

  // 2) Cache expirado ou inexistente — busca nas APIs
  if (!apiKey) {
    // Sem chave, retorna o que houver no cache (mesmo expirado) ou vazio
    if (cached?.payload) return cached.payload as MarketTicker;
    return {
      news: [],
      quotes: { ibov: null, usd: null, eur: null },
      fetched_at: new Date().toISOString(),
    };
  }

  try {
    const fresh = await buildFreshTicker(apiKey);
    // Só grava se conseguiu ao menos uma fonte
    if (fresh.news.length > 0 || fresh.quotes.usd || fresh.quotes.ibov) {
      await supabaseAdmin
        .from("market_cache")
        .upsert(
          { key: "ticker_v1", payload: fresh, fetched_at: fresh.fetched_at },
          { onConflict: "key" }
        );
      return fresh;
    }
  } catch (err) {
    console.error("[market-ticker] fetch falhou:", err);
  }

  // 3) Fallback: retorna cache expirado se existir
  if (cached?.payload) return cached.payload as MarketTicker;
  return {
    news: [],
    quotes: { ibov: null, usd: null, eur: null },
    fetched_at: new Date().toISOString(),
  };
});

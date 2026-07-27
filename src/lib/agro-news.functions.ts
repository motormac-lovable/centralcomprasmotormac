import { createServerFn } from "@tanstack/react-start";

// Atualização diária: cache válido por 12h (garante feed novo todo dia)
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const CACHE_KEY = "agro_news_v1";

export type AgroNewsItem = {
  id: string;
  topic: string;
  title: string;
  source: string;
  url: string;
  published_at: string;
};

export type AgroNewsPayload = {
  items: AgroNewsItem[];
  fetched_at: string;
};

const TOPICS: Array<{ topic: string; query: string }> = [
  { topic: "Crédito Rural", query: "inadimplência crédito rural" },
  { topic: "Confiança do Agro", query: "índice de confiança do agronegócio CNA" },
  { topic: "Taxa Selic", query: "taxa Selic Copom" },
  { topic: "Financiamento", query: "Finame Moderfrota financiamento máquinas agrícolas" },
  { topic: "Petróleo Brent", query: "preço do petróleo Brent barril" },
  { topic: "Soja e Milho", query: "preço da soja e do milho saca" },
];

function decodeEntities(s: string) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function pick(tag: string, xml: string) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decodeEntities(m[1]) : "";
}

async function fetchTopic(topic: string, query: string): Promise<AgroNewsItem | null> {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
      `${query} when:7d`,
    )}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MotormacBot/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    const xml = await resp.text();
    const items = xml.split("<item>").slice(1);
    if (items.length === 0) return null;
    const first = items[0];
    const title = pick("title", first);
    const link = pick("link", first);
    if (!title || !link) return null;
    return {
      id: `${topic}-${link}`,
      topic,
      title,
      source: pick("source", first) || "Google Notícias",
      url: link,
      published_at: (() => {
        const d = pick("pubDate", first);
        const parsed = d ? new Date(d) : new Date();
        return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
      })(),
    };
  } catch {
    return null;
  }
}

export const getAgroNews = createServerFn({ method: "GET" }).handler(
  async (): Promise<AgroNewsPayload> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: cached } = await supabaseAdmin
      .from("market_cache")
      .select("payload, fetched_at")
      .eq("key", CACHE_KEY)
      .maybeSingle();

    if (cached?.payload && cached.fetched_at) {
      const age = Date.now() - new Date(cached.fetched_at).getTime();
      if (age < CACHE_TTL_MS) return cached.payload as unknown as AgroNewsPayload;
    }

    const results = await Promise.all(TOPICS.map((t) => fetchTopic(t.topic, t.query)));
    const items = results.filter((r): r is AgroNewsItem => r !== null);

    if (items.length > 0) {
      const fresh: AgroNewsPayload = { items, fetched_at: new Date().toISOString() };
      await supabaseAdmin
        .from("market_cache")
        .upsert(
          { key: CACHE_KEY, payload: fresh as unknown as never, fetched_at: fresh.fetched_at },
          { onConflict: "key" },
        );
      return fresh;
    }

    if (cached?.payload) return cached.payload as unknown as AgroNewsPayload;
    return { items: [], fetched_at: new Date().toISOString() };
  },
);

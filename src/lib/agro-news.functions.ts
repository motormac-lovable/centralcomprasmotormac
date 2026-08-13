import { createServerFn } from "@tanstack/react-start";

// Atualização a cada 18 minutos (alinhado ao ticker de mercado)
const CACHE_TTL_MS = 18 * 60 * 1000;
const CACHE_KEY = "agro_news_v4";

export type AgroNewsItem = {
  id: string;
  topic: string;
  title: string;
  source: string;
  url: string;
  published_at: string;
  scope?: "nacional" | "internacional";
};

export type AgroNewsPayload = {
  items: AgroNewsItem[];
  fetched_at: string;
};

const TOPICS: Array<{ topic: string; query: string; scope: "nacional" | "internacional" }> = [
  // Nacionais
  { topic: "Crédito Rural", query: "inadimplência crédito rural Brasil", scope: "nacional" },
  { topic: "Confiança do Agro", query: "índice de confiança do agronegócio CNA Fiesp", scope: "nacional" },
  { topic: "Taxa Selic", query: "taxa Selic Copom juros", scope: "nacional" },
  { topic: "Financiamento", query: "Finame Moderfrota financiamento máquinas agrícolas", scope: "nacional" },
  { topic: "Petróleo Brent", query: "preço do petróleo Brent barril", scope: "nacional" },
  { topic: "Soja", query: "preço da soja saca mercado", scope: "nacional" },
  { topic: "Milho", query: "preço do milho saca mercado", scope: "nacional" },
  { topic: "Economia BR", query: "economia brasileira inflação PIB câmbio dólar", scope: "nacional" },
  // Internacionais
  { topic: "Internacional", query: "global economy inflation interest rates", scope: "internacional" },
  { topic: "Commodities", query: "global commodity prices grains soybean corn", scope: "internacional" },
  { topic: "Energia", query: "oil prices OPEC crude market", scope: "internacional" },
  { topic: "Mercados", query: "Federal Reserve markets outlook economy", scope: "internacional" },
];


const PER_TOPIC = 3;

const NAMED_ENTITIES: Record<string, string> = {
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  amp: "&",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  laquo: "«",
  raquo: "»",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
};

function decodeOnce(s: string) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[String(name).toLowerCase()] ?? m);
}

function decodeEntities(s: string) {
  let out = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  // Alguns feeds vêm com dupla codificação (&amp;#233;) — decodifica em passes
  for (let i = 0; i < 3; i++) {
    const next = decodeOnce(out);
    if (next === out) break;
    out = next;
  }
  return out
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Aceita apenas títulos em pt-BR, espanhol ou inglês:
// rejeita qualquer texto com caracteres fora do alfabeto latino
// (CJK, cirílico, árabe, hebraico, grego, tailandês, devanágari etc.)
const NON_LATIN = /[\u0370-\u03FF\u0400-\u04FF\u0530-\u058F\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0900-\u097F\u0E00-\u0E7F\u1100-\u11FF\u2E80-\u9FFF\uA960-\uA97F\uAC00-\uD7FF\uF900-\uFAFF\uFF00-\uFFEF]/;
// Sobras de codificação (entidades não resolvidas, mojibake)
const BROKEN = /&#?\w+;|[\uFFFD]|Ã[\u0080-\u00BF]|â\u0080/;

function isAllowedText(title: string) {
  if (!title || title.length < 12) return false;
  if (NON_LATIN.test(title)) return false;
  if (BROKEN.test(title)) return false;
  return true;
}

function pick(tag: string, xml: string) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decodeEntities(m[1]) : "";
}

function parseItems(xml: string, topic: string): AgroNewsItem[] {
  const chunks = xml.split("<item>").slice(1);
  const out: AgroNewsItem[] = [];
  for (const chunk of chunks.slice(0, PER_TOPIC)) {
    const title = pick("title", chunk);
    const link = pick("link", chunk);
    if (!link || !isAllowedText(title)) continue;
    const d = pick("pubDate", chunk);
    const parsed = d ? new Date(d) : new Date();
    out.push({
      id: `${topic}-${link}`,
      topic,
      title,
      source: pick("source", chunk) || "Google Notícias",
      url: link,
      published_at: Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString(),
    });
  }
  return out;
}

async function fetchRss(url: string, topic: string): Promise<AgroNewsItem[]> {
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
      },
      signal: AbortSignal.timeout(9000),
    });
    if (!resp.ok) {
      console.error(`[agro-news] ${topic}: HTTP ${resp.status} em ${new URL(url).host}`);
      return [];
    }
    return parseItems(await resp.text(), topic);
  } catch (err) {
    console.error(`[agro-news] ${topic}: falha em ${url.slice(0, 60)}`, err);
    return [];
  }
}

async function fetchTopic(topic: string, query: string): Promise<AgroNewsItem[]> {
  const q = encodeURIComponent(`${query} when:2d`);
  const google = `https://news.google.com/rss/search?q=${q}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
  const primary = await fetchRss(google, topic);
  if (primary.length > 0) return primary;

  // Fallback: Bing News RSS (caso o Google bloqueie o IP do servidor)
  const bing = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=RSS&setmkt=pt-BR&cc=BR`;
  return fetchRss(bing, topic);
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

    // Consolida, remove duplicadas e ordena da mais recente para a mais antiga
    const seen = new Set<string>();
    const items = results
      .flat()
      .filter((n) => {
        const key = n.title.toLowerCase().replace(/\s+/g, " ").trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
      .slice(0, 8);

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

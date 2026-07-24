import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Newspaper, Circle } from "lucide-react";
import { getMarketTicker, type MarketTicker, type Quote, type NewsItem } from "@/lib/market-ticker.functions";

function fmtCurrency(v: number, digits = 2) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtPct(v: number) {
  const s = v >= 0 ? "+" : "";
  return `${s}${v.toFixed(2)}%`;
}

function QuoteBadge({ q }: { q: Quote }) {
  const up = q.change_pct >= 0;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-0.5 text-xs font-medium">
      <span className="font-semibold text-foreground">{q.symbol}</span>
      <span className="text-muted-foreground">
        {q.symbol === "IBOV" ? fmtCurrency(q.value, 0) + " pts" : "R$ " + fmtCurrency(q.value, 4)}
      </span>
      <span className={`inline-flex items-center gap-0.5 ${up ? "text-emerald-600" : "text-red-600"}`}>
        {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {fmtPct(q.change_pct)}
      </span>
    </span>
  );
}

function relativeMinutes(fetchedAt: string, now: number) {
  const diff = Math.max(0, Math.floor((now - new Date(fetchedAt).getTime()) / 60000));
  if (diff < 1) return "agora";
  if (diff === 1) return "há 1 min";
  return `há ${diff} min`;
}

export function MarketTickerBar() {
  const navigate = useNavigate();
  const fetchTicker = useServerFn(getMarketTicker);
  const { data } = useQuery<MarketTicker>({
    queryKey: ["market-ticker"],
    queryFn: () => fetchTicker(),
    staleTime: 60 * 1000,
    refetchInterval: 18 * 60 * 1000, // sincroniza com a janela de cache
    refetchOnWindowFocus: false,
  });

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const headlines = useMemo<NewsItem[]>(() => data?.news?.slice(0, 8) ?? [], [data]);
  const quotes = data?.quotes;
  const hasContent = (quotes?.ibov || quotes?.usd || quotes?.eur) || headlines.length > 0;

  if (!hasContent) return null;

  const openNoticias = () => navigate({ to: "/noticias" });

  return (
    <div className="border-b bg-muted/40">
      <div className="mx-auto flex items-center gap-3 px-4 sm:px-8 py-1.5 text-xs">
        {/* Cotações */}
        <div className="flex items-center gap-2 shrink-0">
          {quotes?.ibov && <QuoteBadge q={quotes.ibov} />}
          {quotes?.usd && <QuoteBadge q={quotes.usd} />}
          {quotes?.eur && <QuoteBadge q={quotes.eur} />}
        </div>

        {/* Marquee de manchetes */}
        {headlines.length > 0 && (
          <div className="flex-1 overflow-hidden relative min-w-0">
            <div className="ticker-track flex items-center gap-8 whitespace-nowrap">
              {[...headlines, ...headlines].map((n, i) => (
                <button
                  key={`${n.uuid}-${i}`}
                  onClick={openNoticias}
                  className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
                  title="Ver todas as notícias"
                >
                  <Newspaper className="h-3 w-3 text-primary shrink-0" />
                  <span className="font-medium text-foreground">{n.source}:</span>
                  <span>{n.title}</span>
                  <span className="text-muted-foreground/50">•</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Status "Em tempo real" */}
        {data?.fetched_at && (
          <div className="shrink-0 inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Circle className="h-2 w-2 fill-emerald-500 text-emerald-500 animate-pulse" />
            <span className="hidden md:inline">Em tempo real • Atualizado {relativeMinutes(data.fetched_at, now)}</span>
            <span className="md:hidden">{relativeMinutes(data.fetched_at, now)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

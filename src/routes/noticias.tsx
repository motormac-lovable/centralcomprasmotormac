import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Newspaper, ArrowLeft, TrendingUp, ExternalLink, Circle, Loader2 } from "lucide-react";
import { getMarketTicker, type MarketTicker } from "@/lib/market-ticker.functions";
import { AgroIndicadoresStrip } from "@/components/AgroIndicadoresStrip";
import { getAgroNews, type AgroNewsPayload } from "@/lib/agro-news.functions";

export const Route = createFileRoute("/noticias")({
  head: () => ({
    meta: [
      { title: "Notícias de Economia — Motormac" },
      { name: "description", content: "Feed de notícias econômicas em tempo real, atualizado a cada 18 minutos via Marketaux." },
      { property: "og:title", content: "Notícias de Economia — Motormac" },
      { name: "twitter:title", content: "Notícias de Economia — Motormac" },
      { property: "og:description", content: "Feed de notícias econômicas em tempo real, atualizado a cada 18 minutos." },
      { name: "twitter:description", content: "Feed de notícias econômicas em tempo real, atualizado a cada 18 minutos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Noticias,
});

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function Noticias() {
  const fetchTicker = useServerFn(getMarketTicker);
  const { data, isLoading, isError } = useQuery<MarketTicker>({
    queryKey: ["market-ticker"],
    queryFn: () => fetchTicker(),
    staleTime: 60 * 1000,
    refetchInterval: 18 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const news = (data?.news ?? []).slice(0, 8);

  const fetchAgroNews = useServerFn(getAgroNews);
  const { data: agro, isLoading: agroLoading } = useQuery<AgroNewsPayload>({
    queryKey: ["agro-news"],
    queryFn: () => fetchAgroNews(),
    staleTime: 60 * 1000,
    refetchInterval: 18 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const agroItems = [...(agro?.items ?? [])]
    .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
    .slice(0, 8);

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8">
      <div className="mb-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao Hub
        </Link>
      </div>

      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-accent text-accent-foreground px-3 py-1 text-xs font-medium mb-3">
            <Newspaper className="h-3.5 w-3.5" />
            Feed Econômico
          </div>
          <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight">
            Notícias & Indicadores
          </h1>
          <p className="mt-2 text-muted-foreground text-sm sm:text-base max-w-2xl">
            Principais manchetes do mercado financeiro e do setor, atualizadas automaticamente a cada 18 minutos.
          </p>
          {data?.fetched_at && (
            <div className="mt-3 inline-flex items-center gap-2 text-xs text-muted-foreground">
              <Circle className="h-2 w-2 fill-emerald-500 text-emerald-500 animate-pulse" />
              Em tempo real • Última atualização: {formatDate(data.fetched_at)}
            </div>
          )}
        </div>
        <div className="hidden sm:flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <TrendingUp className="h-6 w-6" />
        </div>
      </div>

      <AgroIndicadoresStrip />

      <section className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Notícias
          </h2>
          {agro?.fetched_at && (
            <span className="text-xs text-muted-foreground">
              Atualizado em {formatDate(agro.fetched_at)}
            </span>
          )}
        </div>
        {agroLoading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Buscando notícias dos indicadores...
          </div>
        ) : agroItems.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed bg-card p-5 text-center text-sm text-muted-foreground">
            Nenhuma notícia relacionada aos indicadores no momento.
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 items-stretch">
            {agroItems.map((n) => (
              <a
                key={n.id}
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex h-full min-h-[190px] flex-col rounded-xl border bg-card p-4 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <span className="inline-flex w-fit items-center rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-medium text-accent-foreground">
                  {n.topic}
                </span>
                <h3 className="mt-2 min-h-[3.75rem] text-sm font-semibold leading-snug group-hover:text-primary transition-colors line-clamp-3">
                  {n.title}
                </h3>
                <span className="mt-auto pt-3 text-[10px] text-muted-foreground">
                  {n.source} • {formatDate(n.published_at)}
                </span>
                <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
                  Ler notícia completa
                  <ExternalLink className="h-3 w-3" />
                </span>
              </a>
            ))}
          </div>
        )}
      </section>

      {isLoading && (
        <div className="mt-12 flex items-center justify-center text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Carregando notícias...
        </div>
      )}

      {isError && (
        <div className="mt-8 rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          Não foi possível carregar as notícias no momento. Tente novamente em alguns instantes.
        </div>
      )}

      {!isLoading && !isError && news.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          Nenhuma manchete disponível no momento. As notícias voltarão na próxima atualização automática.
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {news.map((n) => (
          <a
            key={n.uuid}
            href={n.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative overflow-hidden rounded-2xl border bg-card p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <div className="flex items-start justify-between gap-3">
              {n.tag && (
                <span className="inline-flex items-center rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-medium text-accent-foreground">
                  {n.tag}
                </span>
              )}
              <span className="text-[10px] text-muted-foreground text-right">
                {n.source}
                <br />
                {formatDate(n.published_at)}
              </span>
            </div>
            <h3 className="mt-3 text-base font-semibold leading-snug group-hover:text-primary transition-colors">
              {n.title}
            </h3>
            {n.description && (
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed line-clamp-3">
                {n.description}
              </p>
            )}
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
              Ler notícia completa
              <ExternalLink className="h-3 w-3" />
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

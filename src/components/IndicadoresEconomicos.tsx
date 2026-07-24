import { useEffect, useState } from "react";
import { DollarSign, TrendingUp, BarChart3, Activity, Newspaper, ArrowRight, ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMarketTicker, type MarketTicker } from "@/lib/market-ticker.functions";

type Chave = "dolar" | "ipca" | "igpm";

type Indicador = {
  key: Chave;
  label: string;
  value: string;
  sub: string;
  icon: typeof DollarSign;
  accent: string;
  loading: boolean;
};

const FALLBACK: Record<Chave, string> = {
  dolar: "USD R$ 5,11",
  ipca: "4,64%",
  igpm: "3,16%",
};

const CACHE_KEY = "motormac_indicadores_bcb_v2";

function fmtMoney(v: string | number) {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : v;
  if (!Number.isFinite(n)) return null;
  return `USD R$ ${n.toFixed(2).replace(".", ",")}`;
}

function fmtPct(v: string | number) {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : v;
  if (!Number.isFinite(n)) return null;
  return `${n.toFixed(2).replace(".", ",")}%`;
}

async function fetchSerieUltimos(codigo: number, n: number): Promise<Array<{ valor: string; data: string }> | null> {
  try {
    const res = await fetch(
      `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados/ultimos/${n}?formato=json`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    return (await res.json()) as Array<{ valor: string; data: string }>;
  } catch {
    return null;
  }
}

export function IndicadoresEconomicos() {
  const fetchTicker = useServerFn(getMarketTicker);
  const { data: ticker } = useQuery<MarketTicker>({
    queryKey: ["market-ticker"],
    queryFn: () => fetchTicker(),
    staleTime: 60 * 1000,
    refetchInterval: 18 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const headlines = (ticker?.news ?? []).slice(0, 4);

  const [state, setState] = useState<Record<Chave, { value: string; sub: string; loading: boolean }>>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = window.localStorage.getItem(CACHE_KEY);
        if (cached) {
          const p = JSON.parse(cached) as Partial<Record<Chave, { value: string; sub: string }>>;
          return {
            dolar: { value: p.dolar?.value ?? FALLBACK.dolar, sub: p.dolar?.sub ?? "Dia anterior: USD R$ -", loading: true },
            ipca: { value: p.ipca?.value ?? FALLBACK.ipca, sub: p.ipca?.sub ?? "No mês: -", loading: true },
            igpm: { value: p.igpm?.value ?? FALLBACK.igpm, sub: p.igpm?.sub ?? "No mês: -", loading: true },
          };
        }
      } catch {}
    }
    return {
      dolar: { value: FALLBACK.dolar, sub: "Dia anterior: USD R$ -", loading: true },
      ipca: { value: FALLBACK.ipca, sub: "No mês: -", loading: true },
      igpm: { value: FALLBACK.igpm, sub: "No mês: -", loading: true },
    };
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [dolarArr, ipcaAcumArr, ipcaMesArr, igpmAcumArr, igpmMesArr] = await Promise.all([
        fetchSerieUltimos(10813, 2),
        fetchSerieUltimos(13522, 1),
        fetchSerieUltimos(433, 1),
        fetchSerieUltimos(189, 1),
        fetchSerieUltimos(189, 1),
      ]);
      if (cancelled) return;

      const dolarAtual = dolarArr?.[dolarArr.length - 1]?.valor;
      const dolarAnterior = dolarArr && dolarArr.length >= 2 ? dolarArr[dolarArr.length - 2].valor : null;
      const dolarValue = (dolarAtual && fmtMoney(dolarAtual)) || FALLBACK.dolar;
      const dolarSubVal = dolarAnterior ? fmtMoney(dolarAnterior) : null;
      const dolarSub = `Dia anterior: ${dolarSubVal ?? "USD R$ -"}`;

      const ipcaValue = (ipcaAcumArr?.[0]?.valor && fmtPct(ipcaAcumArr[0].valor)) || FALLBACK.ipca;
      const ipcaMes = ipcaMesArr?.[0]?.valor ? fmtPct(ipcaMesArr[0].valor) : null;
      const ipcaSub = `No mês: ${ipcaMes ?? "-"}`;

      const igpmValue = (igpmAcumArr?.[0]?.valor && fmtPct(igpmAcumArr[0].valor)) || FALLBACK.igpm;
      const igpmMes = igpmMesArr?.[0]?.valor ? fmtPct(igpmMesArr[0].valor) : null;
      const igpmSub = `No mês: ${igpmMes ?? "-"}`;

      const next = {
        dolar: { value: dolarValue, sub: dolarSub, loading: false },
        ipca: { value: ipcaValue, sub: ipcaSub, loading: false },
        igpm: { value: igpmValue, sub: igpmSub, loading: false },
      };
      setState(next);
      try {
        window.localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({
            dolar: { value: dolarValue, sub: dolarSub },
            ipca: { value: ipcaValue, sub: ipcaSub },
            igpm: { value: igpmValue, sub: igpmSub },
          }),
        );
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const items: Indicador[] = [
    {
      key: "dolar",
      label: "Dólar Comercial (Venda)",
      value: state.dolar.value,
      sub: state.dolar.sub,
      icon: DollarSign,
      accent: "oklch(0.6 0.18 150)",
      loading: state.dolar.loading,
    },
    {
      key: "ipca",
      label: "IPCA — Acumulado 12 meses",
      value: state.ipca.value,
      sub: state.ipca.sub,
      icon: TrendingUp,
      accent: "oklch(0.55 0.18 250)",
      loading: state.ipca.loading,
    },
    {
      key: "igpm",
      label: "IGP-M — Acumulado 12 meses",
      value: state.igpm.value,
      sub: state.igpm.sub,
      icon: BarChart3,
      accent: "oklch(0.6 0.24 27)",
      loading: state.igpm.loading,
    },
  ];

  const newsAccent = "oklch(0.55 0.18 200)";

  return (
    <section className="w-full mt-8">
      <div className="flex items-center justify-center gap-2 mb-3">
        <Activity className="h-4 w-4 text-primary" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground">
          NOTÍCIAS & INDICADORES ECONÔMICOS
        </h2>
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <div
              key={it.key}
              className="group relative overflow-hidden rounded-2xl border bg-card p-4 shadow-sm transition-all hover:shadow-lg hover:-translate-y-1"
            >
              <div
                className="absolute inset-x-0 top-0 h-1 opacity-80"
                style={{ background: it.accent }}
              />

              <div className="flex items-start justify-between gap-4">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
                  style={{
                    background: `color-mix(in oklab, ${it.accent} 12%, transparent)`,
                    color: it.accent,
                  }}
                >
                  <Icon className="h-5 w-5" />
                </div>

                {it.loading ? (
                  <div className="h-4 w-14 rounded bg-muted animate-pulse" />
                ) : (
                  <div
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      background: `color-mix(in oklab, ${it.accent} 10%, transparent)`,
                      color: it.accent,
                    }}
                  >
                    BCB
                  </div>
                )}
              </div>

              <div className="mt-4">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {it.label}
                </div>
                {it.loading ? (
                  <div className="mt-1.5 h-8 w-32 rounded bg-muted animate-pulse" />
                ) : (
                  <>
                    <div
                      className="mt-0.5 text-xl font-bold tracking-tight"
                      style={{ color: it.accent }}
                    >
                      {it.value}
                    </div>
                    <div className={`mt-0.5 text-muted-foreground/80 ${it.key === "dolar" ? "text-[14px]" : "text-[11px]"}`}>
                      {it.sub}
                    </div>
                  </>
                )}
              </div>

              <div
                className="absolute -bottom-5 -right-5 w-20 h-20 rounded-full opacity-5 group-hover:opacity-10 transition-opacity"
                style={{ background: it.accent }}
              />
            </div>
          );
        })}

        <div className="group relative overflow-hidden rounded-2xl border bg-card p-4 shadow-sm transition-all hover:shadow-lg hover:border-primary/40 flex flex-col">
          <div
            className="absolute inset-x-0 top-0 h-1 opacity-80"
            style={{ background: `linear-gradient(90deg, ${newsAccent}, var(--primary-glow))` }}
          />

          <div className="flex items-start justify-between gap-4">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
              style={{
                background: `color-mix(in oklab, ${newsAccent} 12%, transparent)`,
                color: newsAccent,
              }}
            >
              <Newspaper className="h-5 w-5" />
            </div>

            <div
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                background: `color-mix(in oklab, ${newsAccent} 10%, transparent)`,
                color: newsAccent,
              }}
            >
              Feed
            </div>
          </div>

          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Mais Notícias de Economia
            </div>
            <div className="mt-0.5 text-sm font-bold tracking-tight" style={{ color: newsAccent }}>
              Acesse o feed
            </div>
          </div>

          {headlines.length > 0 ? (
            <ul className="mt-2 space-y-1.5 flex-1">
              {headlines.map((n) => (
                <li key={n.uuid}>
                  <a
                    href={n.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group/link flex items-start gap-1.5 text-[11px] leading-snug text-foreground/85 hover:text-primary transition-colors"
                    title={n.title}
                  >
                    <ExternalLink className="h-3 w-3 mt-0.5 shrink-0 opacity-60 group-hover/link:opacity-100" />
                    <span className="line-clamp-2">
                      <span className="font-medium text-muted-foreground mr-1">{n.source}:</span>
                      {n.title}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-2 text-[11px] text-muted-foreground/80 leading-relaxed flex-1">
              Feed atualizado com as principais manchetes do mercado e do setor.
            </div>
          )}

          <Link
            to="/noticias"
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:gap-2 transition-all self-start"
          >
            Ver todas as notícias
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>

          <div
            className="absolute -bottom-5 -right-5 w-20 h-20 rounded-full opacity-5 pointer-events-none"
            style={{ background: newsAccent }}
          />
        </div>
      </div>

      <p className="text-center text-[10px] text-muted-foreground mt-3">
        Indicadores atualizados em tempo real via Banco Central do Brasil
      </p>
    </section>
  );
}

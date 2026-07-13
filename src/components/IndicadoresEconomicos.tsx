import { useEffect, useState } from "react";
import { DollarSign, TrendingUp, BarChart3, Activity } from "lucide-react";

type Chave = "dolar" | "ipca" | "igpm";

type Indicador = {
  key: Chave;
  label: string;
  value: string;
  icon: typeof DollarSign;
  accent: string;
  loading: boolean;
};

const FALLBACK: Record<Chave, string> = {
  dolar: "USD R$ 5,11",
  ipca: "4,64%",
  igpm: "3,16%",
};

const CACHE_KEY = "motormac_indicadores_bcb_v1";

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

async function fetchSerie(codigo: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados/ultimos/1?formato=json`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ valor: string }>;
    return data?.[0]?.valor ?? null;
  } catch {
    return null;
  }
}

export function IndicadoresEconomicos() {
  const [state, setState] = useState<Record<Chave, { value: string; loading: boolean }>>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = window.localStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as { dolar?: string; ipca?: string; igpm?: string };
          return {
            dolar: { value: parsed.dolar ?? FALLBACK.dolar, loading: true },
            ipca: { value: parsed.ipca ?? FALLBACK.ipca, loading: true },
            igpm: { value: parsed.igpm ?? FALLBACK.igpm, loading: true },
          };
        }
      } catch {}
    }
    return {
      dolar: { value: FALLBACK.dolar, loading: true },
      ipca: { value: FALLBACK.ipca, loading: true },
      igpm: { value: FALLBACK.igpm, loading: true },
    };
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [dolarRaw, ipcaRaw, igpmRaw] = await Promise.all([
        fetchSerie(10813),
        fetchSerie(13522),
        fetchSerie(189),
      ]);
      if (cancelled) return;
      const dolar = (dolarRaw && fmtMoney(dolarRaw)) || FALLBACK.dolar;
      const ipca = (ipcaRaw && fmtPct(ipcaRaw)) || FALLBACK.ipca;
      const igpm = (igpmRaw && fmtPct(igpmRaw)) || FALLBACK.igpm;
      setState({
        dolar: { value: dolar, loading: false },
        ipca: { value: ipca, loading: false },
        igpm: { value: igpm, loading: false },
      });
      try {
        window.localStorage.setItem(CACHE_KEY, JSON.stringify({ dolar, ipca, igpm }));
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
      icon: DollarSign,
      accent: "oklch(0.6 0.18 150)",
      loading: state.dolar.loading,
    },
    {
      key: "ipca",
      label: "IPCA — Acumulado 12 meses",
      value: state.ipca.value,
      icon: TrendingUp,
      accent: "oklch(0.55 0.18 250)",
      loading: state.ipca.loading,
    },
    {
      key: "igpm",
      label: "IGP-M — Acumulado 12 meses",
      value: state.igpm.value,
      icon: BarChart3,
      accent: "oklch(0.6 0.24 27)",
      loading: state.igpm.loading,
    },
  ];

  return (
    <section className="w-full mt-10">
      <div className="flex items-center justify-center gap-2 mb-4">
        <Activity className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
          Indicadores Econômicos Estratégicos
        </h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <div
              key={it.key}
              className="group relative overflow-hidden rounded-2xl border bg-card p-6 shadow-sm transition-all hover:shadow-lg hover:-translate-y-1"
            >
              <div
                className="absolute inset-x-0 top-0 h-1 opacity-80"
                style={{ background: it.accent }}
              />

              <div className="flex items-start justify-between gap-4">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
                  style={{
                    background: `color-mix(in oklab, ${it.accent} 12%, transparent)`,
                    color: it.accent,
                  }}
                >
                  <Icon className="h-6 w-6" />
                </div>

                {it.loading ? (
                  <div className="h-5 w-16 rounded bg-muted animate-pulse" />
                ) : (
                  <div
                    className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                    style={{
                      background: `color-mix(in oklab, ${it.accent} 10%, transparent)`,
                      color: it.accent,
                    }}
                  >
                    BCB
                  </div>
                )}
              </div>

              <div className="mt-5">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  {it.label}
                </div>
                {it.loading ? (
                  <div className="mt-2 h-8 w-32 rounded bg-muted animate-pulse" />
                ) : (
                  <div
                    className="mt-1 text-2xl font-bold tracking-tight"
                    style={{ color: it.accent }}
                  >
                    {it.value}
                  </div>
                )}
              </div>

              <div
                className="absolute -bottom-6 -right-6 w-24 h-24 rounded-full opacity-5 group-hover:opacity-10 transition-opacity"
                style={{ background: it.accent }}
              />
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground mt-4">
        Indicadores atualizados em tempo real via Banco Central do Brasil
      </p>
    </section>
  );
}

import { useEffect, useState } from "react";
import { Sprout, ShieldAlert, Percent, Landmark, Fuel, Wheat } from "lucide-react";

type Card = {
  key: string;
  label: string;
  value: string;
  sub: string;
  icon: typeof Sprout;
  accent: string;
};

const BASE: Card[] = [
  {
    key: "inadimplencia",
    label: "Inadimplência no Crédito Rural",
    value: "2,4%",
    sub: "Carteira agro — referência BCB",
    icon: ShieldAlert,
    accent: "oklch(0.6 0.24 27)",
  },
  {
    key: "confianca",
    label: "Confiança do Agronegócio (Fiesp/CNA)",
    value: "98,7 pts",
    sub: "Índice trimestral (base 100)",
    icon: Sprout,
    accent: "oklch(0.6 0.18 150)",
  },
  {
    key: "selic",
    label: "Taxa Selic",
    value: "—",
    sub: "Meta definida pelo Copom",
    icon: Percent,
    accent: "oklch(0.55 0.18 250)",
  },
  {
    key: "financiamento",
    label: "Juros Finame / Moderfrota",
    value: "8,5% a.a.",
    sub: "Linhas de investimento agro",
    icon: Landmark,
    accent: "oklch(0.55 0.18 200)",
  },
  {
    key: "brent",
    label: "Petróleo Brent (barril)",
    value: "USD 71,80",
    sub: "Referência internacional",
    icon: Fuel,
    accent: "oklch(0.5 0.12 60)",
  },
  {
    key: "graos",
    label: "Soja e Milho (bolsa e físico)",
    value: "Soja R$ 132 / Milho R$ 63",
    sub: "Saca 60kg — indicador de mercado",
    icon: Wheat,
    accent: "oklch(0.65 0.15 90)",
  },
];

export function AgroIndicadoresStrip() {
  const [selic, setSelic] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          "https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json",
          { headers: { Accept: "application/json" } },
        );
        if (!res.ok) return;
        const json = (await res.json()) as Array<{ valor: string }>;
        const n = Number(json?.[0]?.valor);
        if (!cancelled && Number.isFinite(n)) setSelic(`${n.toFixed(2).replace(".", ",")}% a.a.`);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = BASE.map((c) => (c.key === "selic" && selic ? { ...c, value: selic } : c));
  const loop = [...cards, ...cards];

  return (
    <div className="relative mt-6 overflow-hidden">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-background to-transparent" />
      <div className="ticker-track flex w-max gap-3 py-1">
        {loop.map((c, i) => {
          const Icon = c.icon;
          return (
            <div
              key={`${c.key}-${i}`}
              className="w-56 shrink-0 rounded-xl border bg-card px-3 py-2.5 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    background: `color-mix(in oklab, ${c.accent} 12%, transparent)`,
                    color: c.accent,
                  }}
                >
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[9px] uppercase tracking-wider text-muted-foreground">
                    {c.label}
                  </div>
                  <div className="truncate text-sm font-bold" style={{ color: c.accent }}>
                    {c.value}
                  </div>
                </div>
              </div>
              <div className="mt-1 truncate text-[10px] text-muted-foreground/80">{c.sub}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { Newspaper, ArrowLeft, TrendingUp, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/noticias")({
  head: () => ({
    meta: [
      { title: "Notícias de Economia — Motormac" },
      { name: "description", content: "Feed de notícias e indicadores econômicos do mercado e do setor." },
      { property: "og:title", content: "Notícias de Economia — Motormac" },
      { name: "twitter:title", content: "Notícias de Economia — Motormac" },
      { property: "og:description", content: "Feed de notícias e indicadores econômicos do mercado e do setor." },
      { name: "twitter:description", content: "Feed de notícias e indicadores econômicos do mercado e do setor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Noticias,
});

const mockNews = [
  {
    id: 1,
    title: "Banco Central mantém sinalização cautelosa para os próximos meses",
    source: "Valor Econômico",
    summary: "A ata do Copom reforçou a postura de vigilância frente às incertezas fiscais e à inflação acima da meta.",
    tag: "Política Monetária",
  },
  {
    id: 2,
    title: "Setor de máquinas e equipamentos projeta alta na demanda no segundo semestre",
    source: "Agência Brasil",
    summary: "Indicadores de produção industrial apontam para recuperação puxada por investimentos em infraestrutura.",
    tag: "Setor",
  },
  {
    id: 3,
    title: "Dólar fecha em leve queda com fluxo de comércio exterior",
    source: "Reuters",
    summary: "Moeda norte-americana recuou ante o real em sessão de menor volume, refletindo o cenário externo.",
    tag: "Câmbio",
  },
  {
    id: 4,
    title: "IGP-M acelera e pressiona custos de reposição de estoque",
    source: "Estadão",
    summary: "A variação do índice de preços ao produtor impacta diretamente a cadeia de suprimentos de peças.",
    tag: "Inflação",
  },
];

function Noticias() {
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
            Acompanhe as principais manchetes do mercado financeiro e do setor de máquinas e equipamentos.
          </p>
        </div>
        <div className="hidden sm:flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <TrendingUp className="h-6 w-6" />
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-dashed border-border bg-card p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <AlertCircle className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="mt-4 text-lg font-semibold">Integração Marketaux em configuração</h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-xl mx-auto">
          Em breve este feed será alimentado automaticamente com notícias em tempo real via Marketaux.
          Enquanto isso, confira abaixo os destaques selecionados para o dia.
        </p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {mockNews.map((news) => (
          <article
            key={news.id}
            className="group relative overflow-hidden rounded-2xl border bg-card p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="inline-flex items-center rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-medium text-accent-foreground">
                {news.tag}
              </span>
              <span className="text-[10px] text-muted-foreground">{news.source}</span>
            </div>
            <h3 className="mt-3 text-base font-semibold leading-snug group-hover:text-primary transition-colors">
              {news.title}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              {news.summary}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { Package, FileSignature, Truck, ArrowRight, ClipboardList, Lock } from "lucide-react";
import { toast } from "sonner";
import { IndicadoresEconomicos } from "@/components/IndicadoresEconomicos";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hub de Compras — Motormac" },
      { name: "description", content: "Selecione o tipo de compra interna: peças, contratos ou frete." },
    ],
  }),
  component: Hub,
});

const cards = [
  {
    to: "/materiais",
    title: "Solicitação de Compras",
    subtitle: "Apollo",
    description: "Solicite materiais e serviços diversos pelo módulo de Gestão de Materiais.",
    icon: ClipboardList,
    accent: "oklch(0.62 0.18 200)",
    inativo: true,
  },
  {
    to: "/compras",
    title: "Solicitação de Peças",
    subtitle: "Módulo de Peças",
    description: "Abra um pedido de compra de peças para Cummins, JCB e demais operações.",
    icon: Package,
    accent: "var(--primary)",
    inativo: true,
  },
  {
    to: "/frete",
    title: "Solicitação de Frete",
    subtitle: "Logística",
    description: "Solicite cotações e agendamentos de frete com origem e destino.",
    icon: Truck,
    accent: "oklch(0.6 0.18 150)",
    inativo: false,
  },
  {
    to: "/contratos",
    title: "Cadastro ou Renovação",
    subtitle: "Contratos",
    description: "Envie contratos novos, aditivos de renovação ou retificações de saldo.",
    icon: FileSignature,
    accent: "oklch(0.55 0.18 250)",
    inativo: true,
  },
] as const;

function Hub() {
  // A notificação "Bem Vindo, [Perfil]!" é disparada uma única vez no
  // evento SIGNED_IN pelo AuthProvider — nunca em trocas de tela.

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8 flex flex-col items-center min-h-screen justify-center" style={{ zoom: "90%" }}>
      <div className="text-center max-w-2xl mx-auto mb-8 flex flex-col items-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-accent text-accent-foreground px-3 py-1 text-xs font-medium mb-4">
          Plataforma Interna
        </div>
        <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight">
          Central de <span className="text-primary">Compras</span> Motormac
        </h1>
        <p className="mt-4 text-muted-foreground text-base sm:text-lg">
          Escolha abaixo o tipo de requisição que deseja abrir. Tudo registrado, rastreável e em um só lugar.
        </p>
      </div>

      <div className="w-full grid gap-5 md:grid-cols-2 lg:grid-cols-4 justify-center">
        {cards.map((c) => {
          const Icon = c.icon;

          if (c.inativo) {
            return (
              <div
                key={c.to}
                role="button"
                aria-disabled="true"
                title="Formulário inativo"
                onClick={() => toast.error("Formulário inativo")}
                className="group relative overflow-hidden rounded-2xl border border-muted bg-muted/40 p-6 shadow-none cursor-not-allowed select-none opacity-70"
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-muted-foreground/25" />
                <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 bg-muted text-muted-foreground">
                  <Icon className="h-6 w-6" />
                </div>
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {c.subtitle}
                </div>
                <h2 className="text-xl font-semibold mt-1 text-muted-foreground">{c.title}</h2>
                <p className="text-sm text-muted-foreground/80 mt-2 leading-relaxed">{c.description}</p>
                <div className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                  <Lock className="h-4 w-4" />
                  Formulário inativo
                </div>
                <div className="pointer-events-none absolute inset-0 hidden items-center justify-center bg-background/70 group-hover:flex">
                  <span className="rounded-md bg-secondary text-secondary-foreground px-3 py-1.5 text-sm font-medium shadow-sm">
                    Formulário inativo
                  </span>
                </div>
              </div>
            );
          }

          return (
            <Link
              key={c.to}
              to={c.to}
              className="group relative overflow-hidden rounded-2xl border bg-card p-6 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all"
            >
              <div
                className="absolute inset-x-0 top-0 h-1"
                style={{ background: `linear-gradient(90deg, ${c.accent}, var(--primary-glow))` }}
              />
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
                style={{ background: `color-mix(in oklab, ${c.accent} 12%, transparent)`, color: c.accent }}
              >
                <Icon className="h-6 w-6" />
              </div>
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {c.subtitle}
              </div>
              <h2 className="text-xl font-semibold mt-1">{c.title}</h2>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{c.description}</p>
              <div className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-primary group-hover:gap-2.5 transition-all">
                Abrir formulário
                <ArrowRight className="h-4 w-4" />
              </div>
            </Link>
          );
        })}
      </div>

      <IndicadoresEconomicos />
    </div>
  );
}

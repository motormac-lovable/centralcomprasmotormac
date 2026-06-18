import { createFileRoute, Link } from "@tanstack/react-router";
import { Trello, BarChart3, ArrowRight, LayoutGrid } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/inicio")({
  head: () => ({
    meta: [
      { title: "Painel do Comprador — Motormac" },
      { name: "description", content: "Acesse o Kanban operacional ou o Dashboard de indicadores." },
    ],
  }),
  component: InicioPage,
});

function InicioPage() {
  const { fullName } = useAuth();

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-10">
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 rounded-full bg-accent text-accent-foreground px-3 py-1 text-xs font-medium mb-3">
          <LayoutGrid className="h-3 w-3" /> Acesso do Comprador
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Olá, {fullName || "Comprador"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Escolha uma área para continuar.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          to="/kanban"
          className="group relative rounded-2xl border bg-card p-6 shadow-sm hover:shadow-md transition flex flex-col gap-3"
        >
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-accent text-primary">
            <Trello className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Painel Kanban</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Gerencie solicitações em andamento, mova cartões entre colunas e acompanhe o fluxo operacional.
            </p>
          </div>
          <div className="mt-auto pt-3 flex items-center gap-2 text-sm font-medium text-primary">
            Acessar Kanban <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </div>
        </Link>

        <Link
          to="/dashboard"
          className="group relative rounded-2xl border bg-card p-6 shadow-sm hover:shadow-md transition flex flex-col gap-3"
        >
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-accent text-primary">
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Dashboard de Compras</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Visualize indicadores, gráficos de status, tipos de compra e distribuição por unidade.
            </p>
          </div>
          <div className="mt-auto pt-3 flex items-center gap-2 text-sm font-medium text-primary">
            Acessar Dashboard <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </div>
        </Link>
      </div>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FileSignature, Package, Truck, Inbox, Trello, ClipboardList } from "lucide-react";
import { kindLabel, loadHistory, type HistoryEntry, type RequestKind } from "../lib/history";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/historico")({
  head: () => ({
    meta: [
      { title: "Histórico de Compras — Motormac" },
      { name: "description", content: "Acompanhe as compras já enviadas pela plataforma." },
    ],
  }),
  component: HistoricoPage,
});

const iconFor: Record<RequestKind, typeof Package> = {
  compras: Package,
  contratos: FileSignature,
  frete: Truck,
  materiais: ClipboardList,
};

const colorFor: Record<RequestKind, string> = {
  compras: "var(--primary)",
  contratos: "oklch(0.55 0.18 250)",
  frete: "oklch(0.6 0.18 150)",
  materiais: "oklch(0.62 0.18 200)",
};

function HistoricoPage() {
  const [items, setItems] = useState<HistoryEntry[]>([]);
  const { isBuyer } = useAuth();
  useEffect(() => setItems(loadHistory()), []);

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10">
      <div className="flex flex-wrap items-end justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Histórico de Compras</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Acompanhe todas as requisições já abertas nesta plataforma.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isBuyer && (
            <Link
              to="/kanban"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition"
            >
              <Trello className="h-4 w-4" />
              Abrir Kanban
            </Link>
          )}
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md border bg-card px-4 py-2 text-sm font-medium hover:bg-muted transition"
          >
            Nova solicitação
          </Link>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card/50 p-12 text-center">
          <Inbox className="h-10 w-10 mx-auto text-muted-foreground" />
          <h2 className="mt-4 text-lg font-medium">Nenhuma solicitação ainda</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Quando você abrir uma requisição, ela aparecerá aqui.
          </p>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground mt-6 hover:bg-primary/90 transition"
          >
            Abrir primeira solicitação
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => {
            const Icon = iconFor[it.kind];
            const color = colorFor[it.kind];
            return (
              <li
                key={it.id}
                className="flex items-start gap-4 rounded-xl border bg-card p-4 sm:p-5 shadow-sm hover:shadow-md transition"
              >
                <div
                  className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `color-mix(in oklab, ${color} 12%, transparent)`, color }}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium uppercase tracking-wider">{kindLabel[it.kind]}</span>
                    <span>·</span>
                    <span>
                      {new Date(it.createdAt).toLocaleString("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                  <h3 className="font-medium mt-0.5 truncate">{it.title}</h3>
                  <p className="text-sm text-muted-foreground truncate">{it.summary}</p>
                </div>
                <span className="hidden sm:inline-flex items-center rounded-full bg-accent text-accent-foreground px-2.5 py-1 text-xs font-medium shrink-0">
                  {it.status}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

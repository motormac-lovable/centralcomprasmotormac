import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ClipboardList, Inbox, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { KIND_LABEL, STATUS_COLUMNS, type Status } from "@/lib/cards";
import type { Database } from "@/integrations/supabase/types";

type Card = Pick<
  Database["public"]["Tables"]["kanban_cards"]["Row"],
  "id" | "kind" | "title" | "summary" | "status" | "created_at" | "codigo_unico" | "numero_pedido_linx" | "requester_email"
>;

export const Route = createFileRoute("/_authenticated/minhas-solicitacoes")({
  head: () => ({
    meta: [
      { title: "Minhas Solicitações — Motormac" },
      { name: "description", content: "Acompanhe o status em tempo real das suas solicitações abertas." },
    ],
  }),
  component: MinhasSolicitacoesPage,
});

const STATUS_META: Record<Status, { label: string; tone: string }> =
  STATUS_COLUMNS.reduce((acc, c) => {
    acc[c.id] = { label: c.label, tone: c.tone };
    return acc;
  }, {} as Record<Status, { label: string; tone: string }>);

function MinhasSolicitacoesPage() {
  const { user, fullName } = useAuth();
  const [items, setItems] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    if (!user?.email) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("kanban_cards")
      .select("id, kind, title, summary, status, created_at, codigo_unico, numero_pedido_linx, requester_email")
      .ilike("requester_email", user.email)
      .order("created_at", { ascending: false });
    if (!error) setItems(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    reload();
    // realtime: atualiza status conforme card se move no Kanban
    const ch = supabase
      .channel("minhas-solicitacoes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "kanban_cards" },
        () => reload(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
      <div className="flex flex-wrap items-end justify-between mb-8 gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-accent text-accent-foreground px-3 py-1 text-xs font-medium mb-3">
            <ClipboardList className="h-3 w-3" /> Visão do Solicitante
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Minhas Solicitações</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {fullName ? `${fullName} · ` : ""}Acompanhamento em tempo real do status no fluxo de compras.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={reload}
            className="inline-flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
            title="Recarregar"
          >
            <RefreshCw className="h-4 w-4" /> Atualizar
          </button>
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Nova solicitação
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">Carregando…</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card/50 p-12 text-center">
          <Inbox className="h-10 w-10 mx-auto text-muted-foreground" />
          <h2 className="mt-4 text-lg font-medium">Nenhuma solicitação registrada</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Suas requisições aparecerão aqui com o status atualizado em tempo real.
          </p>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground mt-6 hover:bg-primary/90"
          >
            Abrir primeira solicitação
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-4">Código</th>
                  <th className="text-left p-4">Tipo</th>
                  <th className="text-left p-4">Título / Resumo</th>
                  <th className="text-left p-4">Aberta em</th>
                  <th className="text-left p-4">Status atual</th>
                  <th className="text-left p-4">Pedido ERP</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const meta = STATUS_META[it.status];
                  return (
                    <tr key={it.id} className="border-t">
                      <td className="p-4 font-mono text-xs">{it.codigo_unico ?? "—"}</td>
                      <td className="p-4">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {KIND_LABEL[it.kind]}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="font-medium">{it.title}</div>
                        {it.summary && <div className="text-xs text-muted-foreground truncate max-w-md">{it.summary}</div>}
                      </td>
                      <td className="p-4 text-xs text-muted-foreground">
                        {new Date(it.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                      </td>
                      <td className="p-4">
                        <span
                          className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold text-white"
                          style={{ background: meta?.tone ?? "var(--primary)" }}
                        >
                          {meta?.label ?? it.status}
                        </span>
                      </td>
                      <td className="p-4 font-mono text-xs">
                        {it.numero_pedido_linx ? (
                          <span className="text-emerald-700 font-semibold">#{it.numero_pedido_linx}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

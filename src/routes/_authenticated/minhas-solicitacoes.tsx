import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Inbox, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { KIND_LABEL, STATUS_COLUMNS, type Status } from "@/lib/cards";
import type { Database } from "@/integrations/supabase/types";
import { DATA_DE_CORTE_PRODUCAO_ISO } from "@/lib/cutoff";

type Card = Pick<
  Database["public"]["Tables"]["kanban_cards"]["Row"],
  "id" | "kind" | "title" | "summary" | "status" | "created_at" | "codigo_unico" | "numero_pedido_linx" | "requester_email" | "data" | "buyer_name" | "status_changed_at"
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

function formatBR(iso: string | null | undefined) {
  if (!iso) return "-";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} às ${hh}:${mi}`;
}

function MinhasSolicitacoesPage() {
  const { user, fullName, isApprover, isBuyer, isOwner, isAdmin, approverDepartments } = useAuth();
  const [items, setItems] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const approverScope = isApprover && !isOwner && !isAdmin && !isBuyer;

  const reload = async () => {
    if (!user?.email) return;
    setLoading(true);
    let q = supabase
      .from("kanban_cards")
      .select("id, kind, title, summary, status, created_at, codigo_unico, numero_pedido_linx, requester_email, data, buyer_name, status_changed_at")
      .gte("created_at", DATA_DE_CORTE_PRODUCAO_ISO)
      .order("created_at", { ascending: false });

    if (approverScope && approverDepartments.length > 0) {
      const deptList = approverDepartments.map((d) => `"${d.replace(/"/g, '\\"')}"`).join(",");
      q = q.or(`requester_email.ilike.${user.email},data->>departamento.in.(${deptList})`);
    } else {
      q = q.ilike("requester_email", user.email);
    }

    const { data } = await q;
    setItems((data ?? []) as Card[]);
    setLoading(false);
  };

  useEffect(() => {
    reload();
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
  }, [user?.email, approverScope, approverDepartments.join("|")]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const dept = ((it.data as any)?.departamento as string | undefined) ?? "";
      return (
        it.title?.toLowerCase().includes(q) ||
        it.summary?.toLowerCase().includes(q) ||
        it.codigo_unico?.toLowerCase().includes(q) ||
        it.numero_pedido_linx?.toLowerCase().includes(q) ||
        it.requester_email?.toLowerCase().includes(q) ||
        it.buyer_name?.toLowerCase().includes(q) ||
        dept.toLowerCase().includes(q)
      );
    });
  }, [items, query]);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
      <div className="flex flex-wrap items-end justify-between mb-8 gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-accent text-accent-foreground px-3 py-1 text-xs font-medium mb-3">
            <ClipboardList className="h-3 w-3" /> {approverScope ? "Visão do Aprovador" : "Visão do Solicitante"}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Minhas Solicitações</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {fullName ? `${fullName} · ` : ""}
            {approverScope
              ? `Solicitações dos departamentos sob sua alçada${approverDepartments.length ? ` (${approverDepartments.join(", ")})` : ""} — atualizado em tempo real.`
              : "Acompanhamento em tempo real do status no fluxo de compras."}
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

      <div className="mb-4 relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por título, código, pedido, solicitante, comprador ou departamento…"
          className="w-full rounded-md border bg-card pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {loading ? (
        <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">Carregando…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card/50 p-12 text-center">
          <Inbox className="h-10 w-10 mx-auto text-muted-foreground" />
          <h2 className="mt-4 text-lg font-medium">
            {items.length === 0 ? "Nenhuma solicitação registrada" : "Nenhum resultado para a busca"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {items.length === 0
              ? "As requisições aparecerão aqui com o status atualizado em tempo real."
              : "Ajuste os termos de busca para ver mais resultados."}
          </p>
          {items.length === 0 && (
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground mt-6 hover:bg-primary/90"
            >
              Abrir primeira solicitação
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* Desktop: tabela */}
          <div className="hidden md:block rounded-2xl border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left p-4">Código</th>
                    <th className="text-left p-4">Tipo</th>
                    <th className="text-left p-4">Título / Resumo</th>
                    {approverScope && <th className="text-left p-4">Solicitante</th>}
                    <th className="text-left p-4">Comprador</th>
                    <th className="text-left p-4">Última movimentação</th>
                    <th className="text-left p-4">Status atual</th>
                    <th className="text-left p-4">Pedido ERP</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((it) => {
                    const meta = STATUS_META[it.status];
                    const dept = ((it.data as any)?.departamento as string | undefined) ?? "";
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
                          {approverScope && dept && (
                            <div className="mt-1">
                              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">
                                {dept}
                              </span>
                            </div>
                          )}
                        </td>
                        {approverScope && (
                          <td className="p-4 text-xs text-muted-foreground truncate max-w-[200px]">
                            {it.requester_email ?? "—"}
                          </td>
                        )}
                        <td className="p-4 text-xs">
                          {it.buyer_name ? (
                            <span className="font-medium">{it.buyer_name}</span>
                          ) : (
                            <span className="italic text-muted-foreground">Aguardando atribuição</span>
                          )}
                        </td>
                        <td className="p-4 text-xs text-muted-foreground">
                          {formatBR(it.status_changed_at || it.created_at)}
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

          {/* Mobile: cards */}
          <ul className="md:hidden space-y-3">
            {filtered.map((it) => {
              const meta = STATUS_META[it.status];
              const dept = ((it.data as any)?.departamento as string | undefined) ?? "";
              return (
                <li key={it.id} className="rounded-xl border bg-card p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {KIND_LABEL[it.kind]} {it.codigo_unico && <span className="font-mono normal-case">· #{it.codigo_unico}</span>}
                      </div>
                      <h3 className="font-medium mt-0.5 truncate">{it.title}</h3>
                    </div>
                    <span
                      className="inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold text-white shrink-0"
                      style={{ background: meta?.tone ?? "var(--primary)" }}
                    >
                      {meta?.label ?? it.status}
                    </span>
                  </div>
                  {it.summary && <p className="text-xs text-muted-foreground mt-1 truncate">{it.summary}</p>}
                  <div className="mt-2 grid grid-cols-1 gap-1 text-xs">
                    {approverScope && (
                      <div>
                        <span className="text-muted-foreground">Solicitante: </span>
                        <span className="truncate">{it.requester_email ?? "—"}</span>
                      </div>
                    )}
                    {approverScope && dept && (
                      <div>
                        <span className="text-muted-foreground">Departamento: </span>
                        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">
                          {dept}
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground">👤 Comprador: </span>
                      {it.buyer_name ? (
                        <span className="font-medium">{it.buyer_name}</span>
                      ) : (
                        <span className="italic text-muted-foreground">Aguardando atribuição</span>
                      )}
                    </div>
                    <div>
                      <span className="text-muted-foreground">📅 Última movimentação: </span>
                      <span>{formatBR(it.status_changed_at || it.created_at)}</span>
                    </div>
                    {it.numero_pedido_linx && (
                      <div>
                        <span className="text-muted-foreground">Pedido ERP: </span>
                        <span className="font-mono text-emerald-700 font-semibold">#{it.numero_pedido_linx}</span>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

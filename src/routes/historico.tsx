import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FileSignature, Package, Truck, Inbox, Trello, ClipboardList, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { KIND_LABEL, STATUS_COLUMNS, type Status } from "@/lib/cards";
import type { Database } from "@/integrations/supabase/types";
import { DATA_DE_CORTE_PRODUCAO_ISO } from "@/lib/cutoff";

export const Route = createFileRoute("/historico")({
  head: () => ({
    meta: [
      { title: "Histórico de Solicitações — Motormac" },
      { name: "description", content: "Acompanhe suas solicitações emitidas e o status atual no Kanban." },
    ],
  }),
  component: HistoricoPage,
});

type Kind = Database["public"]["Enums"]["card_kind"];
type Card = Pick<
  Database["public"]["Tables"]["kanban_cards"]["Row"],
  "id" | "kind" | "title" | "summary" | "status" | "created_at" | "codigo_unico" | "numero_pedido_linx" | "requester_email" | "data" | "buyer_name" | "status_changed_at"
>;

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

const iconFor: Record<Kind, typeof Package> = {
  compras: Package,
  contratos: FileSignature,
  frete: Truck,
  materiais: ClipboardList,
};

const colorFor: Record<Kind, string> = {
  compras: "var(--primary)",
  contratos: "oklch(0.55 0.18 250)",
  frete: "oklch(0.6 0.18 150)",
  materiais: "oklch(0.62 0.18 200)",
};

const STATUS_META: Record<Status, { label: string; tone: string }> = STATUS_COLUMNS.reduce(
  (acc, c) => {
    acc[c.id] = { label: c.label, tone: c.tone };
    return acc;
  },
  {} as Record<Status, { label: string; tone: string }>,
);

function HistoricoPage() {
  const { user, isBuyer, isApprover, isOwner, isAdmin, approverDepartments, fullName } = useAuth();
  const [items, setItems] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const approverScope = isApprover && !isOwner && !isAdmin && !isBuyer;
  const ownerScope = isOwner;

  const reload = async () => {
    if (!user?.email) return;
    setLoading(true);
    // Para recuperar ou visualizar as solicitações DEMO anteriores aos testes reais, altere ou comente este filtro de data.
    let q = supabase
      .from("kanban_cards")
      .select("id, kind, title, summary, status, created_at, codigo_unico, numero_pedido_linx, requester_email, data, buyer_name, status_changed_at")
      .gte("created_at", DATA_DE_CORTE_PRODUCAO_ISO)
      .order("created_at", { ascending: false });

    if (ownerScope) {
      // Proprietário enxerga TODAS as solicitações emitidas no sistema em tempo real.
    } else if (approverScope && approverDepartments.length > 0) {
      // Aprovador enxerga todas as solicitações dos departamentos sob sua alçada
      // (em qualquer status), além das que ele mesmo criou.
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
      .channel("historico-solicitacoes")
      .on("postgres_changes", { event: "*", schema: "public", table: "kanban_cards" }, () => reload())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email, approverScope, ownerScope, approverDepartments.join("|")]);

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
        dept.toLowerCase().includes(q)
      );
    });
  }, [items, query]);

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10">
      <div className="flex flex-wrap items-end justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Histórico de Solicitações</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {fullName ? `${fullName} · ` : ""}
            {approverScope
              ? `Solicitações dos departamentos sob sua alçada${approverDepartments.length ? ` (${approverDepartments.join(", ")})` : ""} — atualizado em tempo real.`
              : "Suas solicitações emitidas e o status atual no Kanban (atualizado em tempo real)."}
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

      <div className="mb-4 relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por título, código, pedido, solicitante ou departamento…"
          className="w-full rounded-md border bg-card pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {loading ? (
        <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">Carregando…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card/50 p-12 text-center">
          <Inbox className="h-10 w-10 mx-auto text-muted-foreground" />
          <h2 className="mt-4 text-lg font-medium">
            {items.length === 0 ? "Nenhuma solicitação ainda" : "Nenhum resultado para a busca"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {items.length === 0
              ? "Quando uma requisição for aberta, ela aparecerá aqui."
              : "Ajuste os termos de busca para ver mais resultados."}
          </p>
          {items.length === 0 && (
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground mt-6 hover:bg-primary/90 transition"
            >
              Abrir primeira solicitação
            </Link>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((it) => {
            const Icon = iconFor[it.kind];
            const color = colorFor[it.kind];
            const meta = STATUS_META[it.status];
            const dept = ((it.data as any)?.departamento as string | undefined) ?? "";
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
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    <span className="font-medium uppercase tracking-wider">{KIND_LABEL[it.kind]}</span>
                    <span>·</span>
                    <span>
                      {new Date(it.created_at).toLocaleString("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                    {it.codigo_unico && (
                      <>
                        <span>·</span>
                        <span className="font-mono">#{it.codigo_unico}</span>
                      </>
                    )}
                    {it.numero_pedido_linx && (
                      <>
                        <span>·</span>
                        <span className="font-mono text-emerald-700 font-semibold">Pedido #{it.numero_pedido_linx}</span>
                      </>
                    )}
                    {approverScope && dept && (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">
                          {dept}
                        </span>
                      </>
                    )}
                    {approverScope && it.requester_email && (
                      <>
                        <span>·</span>
                        <span className="truncate max-w-[220px]">{it.requester_email}</span>
                      </>
                    )}
                  </div>
                  <h3 className="font-medium mt-0.5 truncate">{it.title}</h3>
                  {it.summary && <p className="text-sm text-muted-foreground truncate">{it.summary}</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <span aria-hidden>👤</span>
                      <span className="font-medium text-foreground/80">Comprador:</span>
                      <span className={it.buyer_name ? "" : "italic text-muted-foreground"}>
                        {it.buyer_name || "Aguardando atribuição"}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <span aria-hidden>📅</span>
                      <span className="font-medium text-foreground/80">Última movimentação:</span>
                      <span>{formatBR(it.status_changed_at || it.created_at)}</span>
                    </span>
                  </div>
                </div>
                <div className="hidden sm:flex flex-col items-end gap-2 shrink-0">
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold text-white"
                    style={{ background: meta?.tone ?? "var(--primary)" }}
                  >
                    {meta?.label ?? it.status}
                  </span>
                </div>
                <span
                  className="sm:hidden inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold text-white shrink-0"
                  style={{ background: meta?.tone ?? "var(--primary)" }}
                >
                  {meta?.label ?? it.status}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

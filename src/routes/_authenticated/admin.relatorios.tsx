import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BarChart3, Download, Filter, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { KIND_LABEL, STATUS_COLUMNS, type Status } from "@/lib/cards";
import type { Database } from "@/integrations/supabase/types";
import { DATA_DE_CORTE_PRODUCAO_ISO } from "@/lib/cutoff";

type CardRow = Database["public"]["Tables"]["kanban_cards"]["Row"];
type Kind = Database["public"]["Enums"]["card_kind"];

export const Route = createFileRoute("/_authenticated/admin/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios de Auditoria e Gestão — Motormac" }] }),
  component: RelatoriosPage,
});

const STATUS_LABEL: Record<Status, string> = Object.fromEntries(
  STATUS_COLUMNS.map((c) => [c.id, c.label]),
) as Record<Status, string>;

function parseValor(v?: string | null): number {
  if (!v) return 0;
  const s = String(v).replace(/[^0-9,.-]/g, "").replace(/\.(?=\d{3}([,.]|$))/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function formatBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function cardValor(c: CardRow): number {
  const suppliers = Array.isArray(c.suppliers) ? (c.suppliers as any[]) : [];
  const chosen = suppliers.find((s) => s?.chosen);
  if (chosen) return parseValor(chosen.valor);
  // fallback: menor valor entre fornecedores
  const vals = suppliers.map((s) => parseValor(s?.valor)).filter((n) => n > 0);
  return vals.length ? Math.min(...vals) : 0;
}

function cardDept(c: CardRow): string {
  const d = (c.data as any)?.departamento;
  return typeof d === "string" ? d : "—";
}

function RelatoriosPage() {
  const { isAdmin, isBuyer, isAuditor } = useAuth();
  const canView = isAdmin || isBuyer || isAuditor;

  const [rows, setRows] = useState<CardRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [dtIni, setDtIni] = useState<string>("");
  const [dtFim, setDtFim] = useState<string>("");
  const [kind, setKind] = useState<"" | Kind>("");
  const [status, setStatus] = useState<"" | Status>("");
  const [dept, setDept] = useState<string>("");
  const [busca, setBusca] = useState<string>("");

  useEffect(() => {
    if (!canView) return;
    let active = true;
    setLoading(true);
    supabase
      .from("kanban_cards")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(2000)
      .then(({ data }) => {
        if (!active) return;
        setRows((data as CardRow[]) ?? []);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [canView]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (dtIni && new Date(r.created_at) < new Date(dtIni)) return false;
      if (dtFim) {
        const end = new Date(dtFim);
        end.setHours(23, 59, 59, 999);
        if (new Date(r.created_at) > end) return false;
      }
      if (kind && r.kind !== kind) return false;
      if (status && r.status !== status) return false;
      if (dept && cardDept(r).toLowerCase() !== dept.toLowerCase()) return false;
      if (busca) {
        const q = busca.toLowerCase();
        const hay = `${r.codigo_unico ?? ""} ${r.title ?? ""} ${r.requester_name ?? ""} ${r.buyer_name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, dtIni, dtFim, kind, status, dept, busca]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      const d = cardDept(r);
      if (d && d !== "—") set.add(d);
    });
    return Array.from(set).sort();
  }, [rows]);

  const kpis = useMemo(() => {
    const total = filtered.length;
    const emAndamento = filtered.filter((r) =>
      ["solicitacoes_abertas", "em_cotacao", "aguardando_aprovacao"].includes(r.status),
    ).length;
    const aprovadas = filtered.filter((r) =>
      ["cotacoes_aprovadas", "pedidos_gerados"].includes(r.status),
    ).length;
    const rejeitadas = filtered.filter((r) => r.status === "cotacoes_rejeitadas").length;
    const valorAprovado = filtered
      .filter((r) => ["cotacoes_aprovadas", "pedidos_gerados"].includes(r.status))
      .reduce((acc, r) => acc + cardValor(r), 0);
    return { total, emAndamento, aprovadas, rejeitadas, valorAprovado };
  }, [filtered]);

  const exportCSV = () => {
    const headers = [
      "Código",
      "Título",
      "Tipo",
      "Status",
      "Departamento",
      "Solicitante",
      "Comprador",
      "Aprovador",
      "Valor",
      "Criado em",
      "Última atualização",
    ];
    const escape = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const lines = [headers.join(";")];
    filtered.forEach((r) => {
      lines.push(
        [
          r.codigo_unico ?? "",
          r.title ?? "",
          KIND_LABEL[r.kind] ?? r.kind,
          STATUS_LABEL[r.status] ?? r.status,
          cardDept(r),
          r.requester_name ?? "",
          r.buyer_name ?? "",
          r.approver_name ?? "",
          formatBRL(cardValor(r)),
          new Date(r.created_at).toLocaleString("pt-BR"),
          new Date(r.updated_at).toLocaleString("pt-BR"),
        ]
          .map(escape)
          .join(";"),
      );
    });
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-motormac-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!canView) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <ShieldAlert className="h-10 w-10 mx-auto text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-semibold">Acesso restrito</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta área é exclusiva para Administradores, Compradores e Auditores.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link to="/admin" className="inline-flex items-center gap-1 hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" /> Admin
            </Link>
            <span>/</span>
            <span>Relatórios</span>
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-primary" /> Relatórios de Auditoria e Gestão
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visão consolidada das solicitações registradas na plataforma. Use os filtros abaixo para refinar e exporte em CSV para auditoria.
          </p>
        </div>
        <button
          onClick={exportCSV}
          disabled={!filtered.length}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Download className="h-4 w-4" /> Exportar CSV
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <KpiCard label="Total de solicitações" value={kpis.total.toLocaleString("pt-BR")} tone="bg-blue-50 text-blue-700 border-blue-200" />
        <KpiCard label="Em andamento" value={kpis.emAndamento.toLocaleString("pt-BR")} tone="bg-amber-50 text-amber-700 border-amber-200" />
        <KpiCard label="Aprovadas" value={kpis.aprovadas.toLocaleString("pt-BR")} tone="bg-emerald-50 text-emerald-700 border-emerald-200" />
        <KpiCard label="Rejeitadas" value={kpis.rejeitadas.toLocaleString("pt-BR")} tone="bg-red-50 text-red-700 border-red-200" />
        <KpiCard label="Valor aprovado" value={formatBRL(kpis.valorAprovado)} tone="bg-indigo-50 text-indigo-700 border-indigo-200" />
      </div>

      {/* Filtros */}
      <div className="rounded-xl border bg-card p-4 mb-4">
        <div className="flex items-center gap-2 text-sm font-medium mb-3">
          <Filter className="h-4 w-4" /> Filtros
        </div>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <Field label="Data inicial">
            <input type="date" value={dtIni} onChange={(e) => setDtIni(e.target.value)} className="input" />
          </Field>
          <Field label="Data final">
            <input type="date" value={dtFim} onChange={(e) => setDtFim(e.target.value)} className="input" />
          </Field>
          <Field label="Tipo">
            <select value={kind} onChange={(e) => setKind(e.target.value as any)} className="input">
              <option value="">Todos</option>
              {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                <option key={k} value={k}>{KIND_LABEL[k]}</option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value as any)} className="input">
              <option value="">Todos</option>
              {STATUS_COLUMNS.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Departamento">
            <select value={dept} onChange={(e) => setDept(e.target.value)} className="input">
              <option value="">Todos</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </Field>
          <Field label="Buscar">
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Código, título, solicitante..."
              className="input"
            />
          </Field>
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Título</th>
                <th className="px-3 py-2">Departamento</th>
                <th className="px-3 py-2">Solicitante</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2">Criado em</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Carregando…</td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                    Nenhum registro encontrado para os filtros aplicados.
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-xs">#{r.codigo_unico ?? "—"}</td>
                    <td className="px-3 py-2">{KIND_LABEL[r.kind] ?? r.kind}</td>
                    <td className="px-3 py-2 max-w-xs truncate" title={r.title}>{r.title}</td>
                    <td className="px-3 py-2">{cardDept(r)}</td>
                    <td className="px-3 py-2">{r.requester_name ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted">
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatBRL(cardValor(r))}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("pt-BR")}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 text-xs text-muted-foreground border-t bg-muted/20">
          {filtered.length.toLocaleString("pt-BR")} registro(s) exibido(s) de {rows.length.toLocaleString("pt-BR")} totais.
        </div>
      </div>

      <style>{`
        .input {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background));
          padding: 0.5rem 0.625rem;
          font-size: 0.875rem;
        }
        .input:focus {
          outline: 2px solid hsl(var(--primary) / 0.4);
          outline-offset: 1px;
        }
      `}</style>
    </div>
  );
}

function KpiCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <div className="text-xs font-medium opacity-80">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

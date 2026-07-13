import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Trello, TrendingUp, AlertCircle, Filter, DollarSign, Clock, CheckCircle2, XCircle } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, CartesianGrid,
  LineChart, Line, AreaChart, Area,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { KIND_LABEL, STATUS_COLUMNS, daysSince } from "@/lib/cards";
import type { Database } from "@/integrations/supabase/types";
import { DATA_DE_CORTE_PRODUCAO_ISO } from "@/lib/cutoff";

type Card = Database["public"]["Tables"]["kanban_cards"]["Row"];
type Kind = Database["public"]["Enums"]["card_kind"];

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard Estratégico — Motormac" },
      { name: "description", content: "Indicadores estratégicos e operacionais das compras Motormac." },
    ],
  }),
  component: DashboardPage,
});

const ALL = "__all__";

function parseValor(v: unknown): number {
  if (typeof v !== "string") return 0;
  // BR format "R$ 1.234,56" or "1234,56"
  const cleaned = v.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function winnerValue(card: Card): number {
  const suppliers = (card.suppliers as unknown as Array<{ valor?: string; chosen?: boolean; escolhido?: boolean }>) ?? [];
  const winner = suppliers.find((s) => s.chosen || s.escolhido);
  if (winner) return parseValor(winner.valor);
  // fallback: mínimo entre cotações
  const vals = suppliers.map((s) => parseValor(s.valor)).filter((n) => n > 0);
  return vals.length ? Math.min(...vals) : 0;
}

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function DashboardPage() {
  const { isBuyer } = useAuth();
  const [cards, setCards] = useState<Card[]>([]);
  const [fKind, setFKind] = useState<string>(ALL);
  const [fUnidade, setFUnidade] = useState<string>(ALL);
  const [fEmpresa, setFEmpresa] = useState<string>(ALL);

  useEffect(() => {
    // Para recuperar ou visualizar as solicitações DEMO anteriores aos testes reais, altere ou comente este filtro de data.
    supabase.from("kanban_cards").select("*").gte("created_at", DATA_DE_CORTE_PRODUCAO_ISO).then(({ data }) => setCards(data ?? []));
  }, []);

  const unidades = useMemo(
    () => Array.from(new Set(cards.map((c) => c.unidade).filter(Boolean) as string[])).sort(),
    [cards],
  );
  const empresas = useMemo(
    () => Array.from(new Set(cards.map((c) => c.empresa).filter(Boolean) as string[])).sort(),
    [cards],
  );

  const filtered = useMemo(
    () =>
      cards.filter(
        (c) =>
          (fKind === ALL || c.kind === fKind) &&
          (fUnidade === ALL || c.unidade === fUnidade) &&
          (fEmpresa === ALL || c.empresa === fEmpresa),
      ),
    [cards, fKind, fUnidade, fEmpresa],
  );

  if (!isBuyer) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <AlertCircle className="h-10 w-10 mx-auto text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-semibold">Acesso restrito a Compradores</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Seu cadastro ainda está pendente de aprovação. Quando aprovado, esta área será liberada.
        </p>
      </div>
    );
  }

  const open = filtered.filter((c) => c.status !== "pedidos_gerados" && c.status !== "cotacoes_rejeitadas").length;
  const concluidas = filtered.filter((c) => c.status === "pedidos_gerados");
  const rejeitadas = filtered.filter((c) => c.status === "cotacoes_rejeitadas").length;

  const valorTotal = concluidas.reduce((s, c) => s + winnerValue(c), 0);
  const ticketMedio = concluidas.length ? valorTotal / concluidas.length : 0;
  const taxaConversao = filtered.length ? (concluidas.length / filtered.length) * 100 : 0;
  const leadTimes = concluidas.map((c) => daysSince(c.created_at));
  const leadTimeMedio = leadTimes.length ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length : 0;

  const statusCounts = STATUS_COLUMNS.map((s) => ({
    name: s.label,
    count: filtered.filter((c) => c.status === s.id).length,
    fill: s.tone,
  }));

  const kindCounts = (["compras", "contratos", "frete", "materiais"] as const).map((k) => ({
    name: KIND_LABEL[k],
    value: filtered.filter((c) => c.kind === k).length,
  }));

  const valorPorTipo = (["compras", "contratos", "frete", "materiais"] as const).map((k) => ({
    name: KIND_LABEL[k],
    valor: concluidas.filter((c) => c.kind === k).reduce((s, c) => s + winnerValue(c), 0),
  }));

  const byUnidade = Object.entries(
    filtered.reduce<Record<string, { count: number; valor: number }>>((acc, c) => {
      const k = c.unidade || "Não informada";
      acc[k] ??= { count: 0, valor: 0 };
      acc[k].count += 1;
      acc[k].valor += c.status === "pedidos_gerados" ? winnerValue(c) : 0;
      return acc;
    }, {}),
  )
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.count - a.count);

  const byEmpresa = Object.entries(
    filtered.reduce<Record<string, { count: number; valor: number }>>((acc, c) => {
      const k = c.empresa || "Não informada";
      acc[k] ??= { count: 0, valor: 0 };
      acc[k].count += 1;
      acc[k].valor += c.status === "pedidos_gerados" ? winnerValue(c) : 0;
      return acc;
    }, {}),
  )
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.valor - a.valor);

  // Evolução mensal (últimos 6 meses)
  const months: { key: string; label: string; abertas: number; concluidas: number; valor: number }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push({
      key,
      label: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
      abertas: 0,
      concluidas: 0,
      valor: 0,
    });
  }
  for (const c of filtered) {
    const d = new Date(c.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const m = months.find((x) => x.key === key);
    if (m) {
      m.abertas += 1;
      if (c.status === "pedidos_gerados") {
        m.concluidas += 1;
        m.valor += winnerValue(c);
      }
    }
  }

  // Top fornecedores
  const fornecedoresMap: Record<string, { count: number; valor: number }> = {};
  for (const c of concluidas) {
    const suppliers = (c.suppliers as unknown as Array<{ fornecedor?: string; valor?: string; chosen?: boolean; escolhido?: boolean }>) ?? [];
    const w = suppliers.find((s) => s.chosen || s.escolhido);
    if (w?.fornecedor) {
      fornecedoresMap[w.fornecedor] ??= { count: 0, valor: 0 };
      fornecedoresMap[w.fornecedor].count += 1;
      fornecedoresMap[w.fornecedor].valor += parseValor(w.valor);
    }
  }
  const topFornecedores = Object.entries(fornecedoresMap)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 8);

  const pieColors = ["oklch(0.52 0.22 27)", "oklch(0.55 0.18 250)", "oklch(0.6 0.18 150)"];

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-accent text-accent-foreground px-3 py-1 text-xs font-medium mb-2">
            <TrendingUp className="h-3 w-3" /> Indicadores estratégicos
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard de Compras</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Combine filtros para analisar diferentes cenários de forma estratégica.
          </p>
        </div>
        <Link
          to="/kanban"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition"
        >
          <Trello className="h-4 w-4" />
          Ir para o Kanban
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Filtros */}
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-muted-foreground">
          <Filter className="h-4 w-4" /> Filtros estratégicos
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <FilterSelect
            label="Check list"
            value={fKind}
            onChange={setFKind}
            options={[{ value: ALL, label: "Todos os check lists" }, ...(["compras", "contratos", "frete", "materiais"] as Kind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))]}
          />
          <FilterSelect
            label="Unidade"
            value={fUnidade}
            onChange={setFUnidade}
            options={[{ value: ALL, label: "Todas as unidades" }, ...unidades.map((u) => ({ value: u, label: u }))]}
          />
          <FilterSelect
            label="Empresa"
            value={fEmpresa}
            onChange={setFEmpresa}
            options={[{ value: ALL, label: "Todas as empresas" }, ...empresas.map((e) => ({ value: e, label: e }))]}
          />
        </div>
        {(fKind !== ALL || fUnidade !== ALL || fEmpresa !== ALL) && (
          <button
            onClick={() => { setFKind(ALL); setFUnidade(ALL); setFEmpresa(ALL); }}
            className="mt-3 text-xs text-primary hover:underline"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* KPIs estratégicos */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={<DollarSign className="h-4 w-4" />} label="Valor total comprado" value={brl(valorTotal)} accent="oklch(0.6 0.18 150)" />
        <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Ticket médio" value={brl(ticketMedio)} accent="oklch(0.55 0.18 250)" />
        <KpiCard icon={<Clock className="h-4 w-4" />} label="Lead time médio" value={`${leadTimeMedio.toFixed(1)} dias`} accent="oklch(0.7 0.18 60)" />
        <KpiCard icon={<CheckCircle2 className="h-4 w-4" />} label="Taxa de conversão" value={`${taxaConversao.toFixed(1)}%`} accent="oklch(0.6 0.24 27)" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Solicitações abertas" value={open} accent="var(--primary)" />
        <MetricCard label="Pedidos gerados" value={concluidas.length} accent="oklch(0.6 0.18 150)" />
        <MetricCard label="Cotações rejeitadas" value={rejeitadas} accent="oklch(0.6 0.24 27)" />
        <MetricCard label="Total no período" value={filtered.length} accent="oklch(0.55 0.18 250)" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Evolução mensal — Solicitações vs Pedidos" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={months}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="abertas" name="Abertas" stroke="oklch(0.55 0.18 250)" fill="oklch(0.55 0.18 250 / 0.25)" />
              <Area type="monotone" dataKey="concluidas" name="Concluídas" stroke="oklch(0.6 0.18 150)" fill="oklch(0.6 0.18 150 / 0.25)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Valor comprado por mês (R$)" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={months}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => brl(Number(v))} width={90} />
              <Tooltip formatter={(v) => brl(Number(v))} />
              <Line type="monotone" dataKey="valor" name="Valor (R$)" stroke="oklch(0.6 0.18 150)" strokeWidth={3} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Distribuição por Status">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={statusCounts}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-12} textAnchor="end" height={60} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                {statusCounts.map((s, i) => <Cell key={i} fill={s.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Distribuição por Check List">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={kindCounts} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95} label>
                {kindCounts.map((_, i) => <Cell key={i} fill={pieColors[i]} />)}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Valor comprado por Check List (R$)">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={valorPorTipo}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => brl(Number(v))} width={90} />
              <Tooltip formatter={(v) => brl(Number(v))} />
              <Bar dataKey="valor" radius={[8, 8, 0, 0]}>
                {valorPorTipo.map((_, i) => <Cell key={i} fill={pieColors[i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Solicitações por Unidade">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={byUnidade} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" name="Solicitações" fill="var(--primary)" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Valor por Empresa (R$)">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={byEmpresa} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis type="number" tickFormatter={(v) => brl(Number(v))} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => brl(Number(v))} />
              <Bar dataKey="valor" name="Valor (R$)" fill="oklch(0.6 0.18 150)" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Top Fornecedores por Valor" className="lg:col-span-2">
          {topFornecedores.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
              <XCircle className="h-4 w-4 mr-2" /> Sem pedidos concluídos no recorte selecionado.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topFornecedores} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" tickFormatter={(v) => brl(Number(v))} />
                <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => brl(Number(v))} />
                <Bar dataKey="valor" name="Valor (R$)" fill="oklch(0.55 0.18 250)" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function FilterSelect({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-muted-foreground mb-1">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function KpiCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
        <span style={{ color: accent }}>{icon}</span> {label}
      </div>
      <div className="text-2xl font-semibold mt-2" style={{ color: accent }}>{value}</div>
    </div>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="h-1 w-10 rounded-full mb-3" style={{ background: accent }} />
      <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-3xl font-semibold mt-1" style={{ color: accent }}>{value}</div>
    </div>
  );
}

function ChartCard({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border bg-card p-5 shadow-sm ${className}`}>
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">{title}</h3>
      {children}
    </div>
  );
}

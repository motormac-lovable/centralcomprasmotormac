import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Trello, TrendingUp, AlertCircle } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, CartesianGrid,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { KIND_LABEL, STATUS_COLUMNS } from "@/lib/cards";
import type { Database } from "@/integrations/supabase/types";

type Card = Database["public"]["Tables"]["kanban_cards"]["Row"];

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard de Indicadores — Motormac" },
      { name: "description", content: "Indicadores operacionais das solicitações em andamento." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { isBuyer } = useAuth();
  const [cards, setCards] = useState<Card[]>([]);

  useEffect(() => {
    supabase.from("kanban_cards").select("*").then(({ data }) => setCards(data ?? []));
  }, []);

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

  const open = cards.filter((c) => c.status !== "pedidos_gerados" && c.status !== "cotacoes_rejeitadas").length;
  const statusCounts = STATUS_COLUMNS.map((s) => ({
    name: s.label,
    count: cards.filter((c) => c.status === s.id).length,
    fill: s.tone,
  }));
  const kindCounts = (["compras", "contratos", "frete"] as const).map((k) => ({
    name: KIND_LABEL[k],
    value: cards.filter((c) => c.kind === k).length,
  }));
  const byUnidade = Object.entries(
    cards.reduce<Record<string, number>>((acc, c) => {
      const k = c.unidade || "Não informada";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {}),
  ).map(([name, count]) => ({ name, count }));

  const pieColors = ["oklch(0.52 0.22 27)", "oklch(0.55 0.18 250)", "oklch(0.6 0.18 150)"];

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-accent text-accent-foreground px-3 py-1 text-xs font-medium mb-2">
            <TrendingUp className="h-3 w-3" /> Indicadores em tempo real
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard de Indicadores</h1>
          <p className="text-sm text-muted-foreground mt-1">Acompanhe o andamento das solicitações em todas as unidades.</p>
        </div>
        <Link
          to="/kanban"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition"
        >
          <Trello className="h-4 w-4" />
          Ir para o Kanban Operacional
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Solicitações abertas" value={open} accent="var(--primary)" />
        {STATUS_COLUMNS.map((s) => (
          <MetricCard
            key={s.id}
            label={s.label}
            value={cards.filter((c) => c.status === s.id).length}
            accent={s.tone}
          />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
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

        <ChartCard title="Distribuição por Tipo de Solicitação">
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

        <ChartCard title="Solicitações por Unidade" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={byUnidade} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill="var(--primary)" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
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

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Code2, Download, FileJson, Sheet, Send, Activity, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  buildLinxPayload,
  exportCSV,
  exportJSON,
  simulateLinxWebhook,
  type KanbanCardRow,
} from "@/services/api";

export const Route = createFileRoute("/_authenticated/dev")({
  head: () => ({ meta: [{ title: "Área do Desenvolvedor — Motormac" }] }),
  component: DevPage,
});

type LogEntry = { ts: string; level: "info" | "success" | "error"; message: string };

function DevPage() {
  const { isOwner, loading } = useAuth();
  const [cards, setCards] = useState<KanbanCardRow[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([
    { ts: new Date().toISOString(), level: "info", message: "Console técnico inicializado." },
  ]);
  const [filtroUnidade, setFiltroUnidade] = useState("");
  const [filtroEmpresa, setFiltroEmpresa] = useState("");
  const [codigoSim, setCodigoSim] = useState("");
  const [simulando, setSimulando] = useState(false);

  useEffect(() => {
    let active = true;
    supabase
      .from("kanban_cards")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => active && setCards(data ?? []));
    const channel = supabase
      .channel("dev_kanban_logs")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "kanban_cards" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const r = payload.new as KanbanCardRow;
            setCards((p) => [r, ...p]);
            pushLog("info", `INSERT #${r.codigo_unico} · ${r.title}`);
          } else if (payload.eventType === "UPDATE") {
            const r = payload.new as KanbanCardRow;
            setCards((p) => p.map((c) => (c.id === r.id ? r : c)));
            pushLog("info", `UPDATE #${r.codigo_unico} · status=${r.status}`);
          } else if (payload.eventType === "DELETE") {
            const r = payload.old as KanbanCardRow;
            setCards((p) => p.filter((c) => c.id !== r.id));
            pushLog("info", `DELETE #${r.codigo_unico ?? r.id}`);
          }
        },
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const pushLog = (level: LogEntry["level"], message: string) =>
    setLogs((prev) => [{ ts: new Date().toISOString(), level, message }, ...prev].slice(0, 50));

  const finalizados = useMemo(
    () => cards.filter((c) => c.status === "pedidos_gerados"),
    [cards],
  );

  const filtradas = useMemo(
    () =>
      finalizados.filter(
        (c) =>
          (!filtroUnidade || c.unidade === filtroUnidade) &&
          (!filtroEmpresa || c.empresa === filtroEmpresa),
      ),
    [finalizados, filtroUnidade, filtroEmpresa],
  );

  const unidades = useMemo(
    () => Array.from(new Set(finalizados.map((c) => c.unidade).filter(Boolean))) as string[],
    [finalizados],
  );
  const empresas = useMemo(
    () => Array.from(new Set(finalizados.map((c) => c.empresa).filter(Boolean))) as string[],
    [finalizados],
  );

  const aprovados = useMemo(
    () => cards.filter((c) => c.status === "aguardando_aprovacao"),
    [cards],
  );

  const handleSimulate = async () => {
    const codigo = codigoSim.trim().replace(/^#/, "");
    if (!codigo) return toast.error("Informe o código único da solicitação.");
    setSimulando(true);
    pushLog("info", `POST /api/linx-apollo/webhook → #${codigo}`);
    const res = await simulateLinxWebhook(codigo);
    setSimulando(false);
    if (!res.ok) {
      pushLog("error", `Erro 404: ${res.error}`);
      toast.error(res.error);
      return;
    }
    pushLog("success", `Sucesso 200: Pedido ${res.pedido} criado no Linx Apollo para #${codigo}`);
    toast.success(`Pedido Linx #${res.pedido} gerado para a solicitação #${codigo}`);
    setCodigoSim("");
  };

  if (loading) {
    return <div className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-muted-foreground">Carregando…</div>;
  }
  if (!isOwner) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <AlertCircle className="h-10 w-10 mx-auto text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-semibold">Área restrita</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Disponível apenas para o Proprietário do Sistema / TI.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-6">
      <header className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-accent text-primary">
          <Code2 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Área do Desenvolvedor</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Módulo técnico para integração two-way com o Linx Apollo.
          </p>
        </div>
      </header>

      {/* Extração de dados */}
      <section className="rounded-2xl border bg-card shadow-sm">
        <div className="p-5 border-b flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold">Extração de dados (Pedidos finalizados)</h2>
            <p className="text-xs text-muted-foreground">
              {filtradas.length} de {finalizados.length} solicitações concluídas.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={filtroUnidade}
              onChange={(e) => setFiltroUnidade(e.target.value)}
              className="text-sm rounded-md border bg-background px-2 py-1.5"
            >
              <option value="">Todas as unidades</option>
              {unidades.map((u) => <option key={u}>{u}</option>)}
            </select>
            <select
              value={filtroEmpresa}
              onChange={(e) => setFiltroEmpresa(e.target.value)}
              className="text-sm rounded-md border bg-background px-2 py-1.5"
            >
              <option value="">Todas as empresas</option>
              {empresas.map((e) => <option key={e}>{e}</option>)}
            </select>
            <button
              onClick={() => { exportJSON(filtradas); pushLog("success", `Export JSON · ${filtradas.length} registros`); }}
              className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
            >
              <FileJson className="h-4 w-4" /> JSON
            </button>
            <button
              onClick={() => { exportCSV(filtradas); pushLog("success", `Export CSV · ${filtradas.length} registros`); }}
              className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
            >
              <Sheet className="h-4 w-4" /> CSV
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Código</th>
                <th className="px-4 py-2 text-left">Tipo</th>
                <th className="px-4 py-2 text-left">Unidade</th>
                <th className="px-4 py-2 text-left">Empresa</th>
                <th className="px-4 py-2 text-left">Fornecedor</th>
                <th className="px-4 py-2 text-left">Pedido Linx</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-xs">Nenhum pedido finalizado encontrado.</td></tr>
              )}
              {filtradas.map((c) => {
                const p = buildLinxPayload(c);
                return (
                  <tr key={c.id} className="border-t">
                    <td className="px-4 py-2 font-mono font-semibold">#{c.codigo_unico}</td>
                    <td className="px-4 py-2 capitalize">{c.kind}</td>
                    <td className="px-4 py-2">{c.unidade ?? "—"}</td>
                    <td className="px-4 py-2">{c.empresa ?? "—"}</td>
                    <td className="px-4 py-2">{p.fornecedor_vencedor?.fornecedor ?? "—"}</td>
                    <td className="px-4 py-2 font-mono text-emerald-700">{c.numero_pedido_linx ?? c.order_number ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Simulador de webhook */}
      <section className="rounded-2xl border bg-card shadow-sm p-5">
        <h2 className="text-lg font-semibold mb-1">Webhook de retorno (Linx → Plataforma)</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Simula a resposta do Linx Apollo: ao receber o código único, gera um número de pedido fictício, grava em <code className="text-[11px] bg-muted px-1 rounded">numero_pedido_linx</code> e move o card para "Pedidos gerados".
        </p>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <input
            value={codigoSim}
            onChange={(e) => setCodigoSim(e.target.value)}
            placeholder="Ex: 062026123"
            className="flex-1 min-w-[200px] rounded-md border bg-background px-3 py-2 text-sm"
          />
          <button
            onClick={handleSimulate}
            disabled={simulando}
            className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90 disabled:opacity-60"
          >
            <Send className="h-4 w-4" /> {simulando ? "Processando..." : "Simular webhook"}
          </button>
        </div>
        {aprovados.length > 0 && (
          <div className="text-xs text-muted-foreground">
            Aguardando aprovação:{" "}
            {aprovados.map((c, i) => (
              <button
                key={c.id}
                onClick={() => setCodigoSim(c.codigo_unico ?? "")}
                className="font-mono text-primary hover:underline"
              >
                #{c.codigo_unico}{i < aprovados.length - 1 ? ", " : ""}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Logs */}
      <section className="rounded-2xl border bg-card shadow-sm">
        <div className="p-5 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h2 className="text-lg font-semibold">Logs de comunicação</h2>
          </div>
          <button
            onClick={() => setLogs([])}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <Download className="h-3.5 w-3.5" /> Limpar
          </button>
        </div>
        <ul className="font-mono text-[12px] divide-y max-h-[360px] overflow-y-auto">
          {logs.length === 0 && (
            <li className="px-4 py-6 text-center text-muted-foreground text-xs">Sem eventos.</li>
          )}
          {logs.map((l, i) => (
            <li key={i} className="px-4 py-2 flex items-start gap-3">
              <span className="text-muted-foreground shrink-0">
                [{new Date(l.ts).toLocaleString("pt-BR")}]
              </span>
              <span
                className={
                  l.level === "success" ? "text-emerald-700"
                  : l.level === "error" ? "text-red-600"
                  : "text-foreground"
                }
              >
                {l.message}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

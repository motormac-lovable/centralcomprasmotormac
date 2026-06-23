import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Code2, Download, FileJson, Sheet, Send, Activity, AlertCircle, Eye, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  buildLinxPayload,
  exportCSV,
  exportJSON,
  simulateLinxWebhook,
  MOCK_LINX_PAYLOAD,
  type LinxPayload,
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
  const [preview, setPreview] = useState<LinxPayload | null>(null);
  const [consultaCodigo, setConsultaCodigo] = useState("");
  const [consultando, setConsultando] = useState(false);
  const [consultaResposta, setConsultaResposta] = useState<{ status: number; body: unknown } | null>(null);

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
    () =>
      cards.filter(
        (c) =>
          c.status === "cotacoes_aprovadas" || c.status === "pedidos_gerados",
      ),
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

  const handleConsultarApi = async () => {
    const codigo = consultaCodigo.trim().replace(/^#/, "");
    if (!codigo) return toast.error("Informe o código único.");
    setConsultando(true);
    setConsultaResposta(null);
    pushLog("info", `GET /api/solicitacoes/${codigo}`);
    try {
      const r = await fetch(`/api/solicitacoes/${encodeURIComponent(codigo)}`, {
        headers: { Accept: "application/json" },
      });
      const body = await r.json().catch(() => ({ error: "Resposta inválida." }));
      setConsultaResposta({ status: r.status, body });
      if (r.ok) pushLog("success", `200 OK · status_atual="${(body as { status_atual?: string }).status_atual ?? "?"}"`);
      else pushLog("error", `${r.status} · ${(body as { error?: string }).error ?? "Falha"}`);
    } catch (e) {
      pushLog("error", `Erro de rede: ${(e as Error).message}`);
      setConsultaResposta({ status: 0, body: { error: (e as Error).message } });
    } finally {
      setConsultando(false);
    }
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
            <h2 className="text-lg font-semibold">Extração de dados (Cotações aprovadas + Pedidos gerados)</h2>
            <p className="text-xs text-muted-foreground">
              {filtradas.length} de {finalizados.length} solicitações prontas para integração / já retornadas pelo ERP.
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
            <button
              onClick={() => { setPreview(MOCK_LINX_PAYLOAD); pushLog("info", "Preview de exemplo (mock) aberto."); }}
              className="inline-flex items-center gap-2 rounded-md border border-dashed px-3 py-1.5 text-sm hover:bg-muted"
              title="Visualizar JSON de exemplo com a estrutura completa"
            >
              <Eye className="h-4 w-4" /> Ver exemplo (mock)
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Código</th>
                <th className="px-4 py-2 text-left">Tipo</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Unidade</th>
                <th className="px-4 py-2 text-left">Empresa</th>
                <th className="px-4 py-2 text-left">Fornecedor</th>
                <th className="px-4 py-2 text-left">Pedido Linx</th>
                <th className="px-4 py-2 text-left">Payload</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-xs">Nenhuma cotação aprovada ou pedido gerado encontrado.</td></tr>
              )}
              {filtradas.map((c) => {
                const p = buildLinxPayload(c);
                const aguardandoRetorno = c.status === "cotacoes_aprovadas";
                return (
                  <tr key={c.id} className="border-t align-top">
                    <td className="px-4 py-2 font-mono font-semibold">#{c.codigo_unico}</td>
                    <td className="px-4 py-2 capitalize">{c.kind}</td>
                    <td className="px-4 py-2">
                      <span
                        className={
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium " +
                          (aguardandoRetorno
                            ? "bg-amber-100 text-amber-800"
                            : "bg-emerald-100 text-emerald-800")
                        }
                      >
                        {aguardandoRetorno ? "Saindo p/ ERP" : "Retornou do ERP"}
                      </span>
                    </td>
                    <td className="px-4 py-2">{c.unidade ?? "—"}</td>
                    <td className="px-4 py-2">{c.empresa ?? "—"}</td>
                    <td className="px-4 py-2">{p.fornecedor_vencedor?.razao_social ?? "—"}</td>
                    <td className="px-4 py-2 font-mono text-emerald-700">{c.numero_pedido_linx ?? c.order_number ?? "—"}</td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => setPreview(p)}
                        className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                      >
                        <FileJson className="h-3.5 w-3.5" /> Ver JSON
                      </button>
                    </td>
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

      {/* API de Consulta de Status (Linx → Plataforma) */}
      <section className="rounded-2xl border bg-card shadow-sm p-5">
        <h2 className="text-lg font-semibold mb-1">🔌 API de Consulta de Status (Integração Linx)</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Endpoint REST público que a Linx Apollo consulta pelo Código Único para acompanhar o ciclo da solicitação dentro do Kanban.
        </p>

        <div className="rounded-lg border bg-muted/30 p-4 space-y-3 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center rounded-md bg-emerald-600 text-white px-2 py-0.5 text-[11px] font-bold">GET</span>
            <code className="text-[12px] font-mono">/api/solicitacoes/{`{codigo_unico}`}</code>
          </div>
          <div className="text-xs">
            <div className="font-semibold mb-1">Resposta — <span className="text-emerald-700">200 OK</span></div>
            <pre className="bg-background border rounded p-3 text-[11px] font-mono leading-relaxed overflow-x-auto">{`{
  "codigo_solicitacao": "0620265",
  "status_atual": "Cotações Aprovadas",
  "data_ultima_atualizacao": "2025-06-12T14:32:08.000Z"
}`}</pre>
          </div>
          <div className="text-[11px] text-muted-foreground space-y-1">
            <div><strong>codigo_solicitacao</strong> — Código Único gerado pela plataforma (MMAAAA + sequencial).</div>
            <div><strong>status_atual</strong> — Coluna real do card no Kanban. Valores: <em>Solicitação aberta</em>, <em>Em Cotação</em>, <em>Aguardando aprovação</em>, <em>Cotações Rejeitadas</em>, <em>Cotações Aprovadas</em>, <em>Pedido Gerado</em>.</div>
            <div><strong>data_ultima_atualizacao</strong> — Timestamp ISO 8601 da última mudança de coluna/edição.</div>
            <div className="pt-1"><strong>Erros:</strong> <code>404</code> quando o código não existe · <code>400</code> quando ausente.</div>
          </div>
        </div>

        <div className="rounded-lg border p-4">
          <h3 className="text-sm font-semibold mb-2">Testar API de Status</h3>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <input
              value={consultaCodigo}
              onChange={(e) => setConsultaCodigo(e.target.value)}
              placeholder="Ex: 062026123"
              className="flex-1 min-w-[200px] rounded-md border bg-background px-3 py-2 text-sm font-mono"
            />
            <button
              onClick={handleConsultarApi}
              disabled={consultando}
              className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:bg-primary/90 disabled:opacity-60"
            >
              <Send className="h-4 w-4" /> {consultando ? "Consultando..." : "Enviar GET"}
            </button>
          </div>
          {cards.length > 0 && (
            <div className="text-xs text-muted-foreground mb-3">
              Sugestões:{" "}
              {cards.slice(0, 6).map((c, i) => (
                <button
                  key={c.id}
                  onClick={() => setConsultaCodigo(c.codigo_unico ?? "")}
                  className="font-mono text-primary hover:underline"
                >
                  #{c.codigo_unico}{i < Math.min(cards.length, 6) - 1 ? ", " : ""}
                </button>
              ))}
            </div>
          )}
          {consultaResposta && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">HTTP</span>
                <span
                  className={
                    "inline-flex items-center rounded-md px-2 py-0.5 font-mono font-bold " +
                    (consultaResposta.status >= 200 && consultaResposta.status < 300
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-red-100 text-red-800")
                  }
                >
                  {consultaResposta.status || "ERR"}
                </span>
                <span className="text-muted-foreground">— resposta exatamente como a Linx recebe:</span>
              </div>
              <pre className="bg-muted/50 border rounded p-3 text-[12px] font-mono leading-relaxed overflow-x-auto">
                {JSON.stringify(consultaResposta.body, null, 2)}
              </pre>
            </div>
          )}
        </div>
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

      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="bg-card rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileJson className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">
                  Payload Linx Apollo — #{preview.identificacao.codigo_unico || "exemplo"}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(preview, null, 2));
                    toast.success("JSON copiado para a área de transferência.");
                  }}
                  className="text-xs rounded-md border px-2 py-1 hover:bg-muted"
                >
                  Copiar
                </button>
                <button
                  onClick={() => setPreview(null)}
                  className="rounded-md p-1 hover:bg-muted"
                  aria-label="Fechar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <pre className="overflow-auto p-4 text-[12px] font-mono leading-relaxed bg-muted/30 rounded-b-2xl">
              {JSON.stringify(preview, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

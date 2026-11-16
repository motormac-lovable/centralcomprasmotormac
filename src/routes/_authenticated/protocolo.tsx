import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send, FileCheck2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { situacaoProtocolo } from "@/lib/protocolo-readiness";
import { Button } from "@/components/ui/button";
import { useProtocolar } from "@/components/DadosPagamentoSection";
import { DATA_DE_CORTE_PRODUCAO_ISO } from "@/lib/cutoff";
import type { Database } from "@/integrations/supabase/types";
import { translateError } from "@/lib/error-messages";
import { rotuloPedido } from "@/lib/purchase-order-number";

type Card = Database["public"]["Tables"]["kanban_cards"]["Row"];

export const Route = createFileRoute("/_authenticated/protocolo")({
  head: () => ({
    meta: [
      { title: "Protocolo Pipefy — Central de Compras Motormac" },
      { name: "description", content: "Acompanhe e envie ao Pipefy o protocolo dos documentos de pagamento dos pedidos gerados." },
      { property: "og:title", content: "Protocolo Pipefy — Central de Compras Motormac" },
      { property: "og:description", content: "Protocolo dos documentos de pagamento no Pipefy." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProtocoloPage,
});

function ProtocoloPage() {
  const { isBuyer, isAdmin, isOwner, isAuditor, isSolicitante, isApprover } = useAuth();
  const allowed = isBuyer || isAdmin || isOwner || isAuditor;
  const canSend = !isAuditor && (isBuyer || isAdmin || isOwner);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const protocolar = useProtocolar();
  const mounted = useRef(false);
  const loadVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    const { data, error } = await supabase.from("kanban_cards").select("*")
      .eq("status", "pedidos_gerados").gte("created_at", DATA_DE_CORTE_PRODUCAO_ISO)
      .order("status_changed_at", { ascending: false });
    if (mounted.current && version === loadVersion.current && !error) setCards(data ?? []);
  }, []);
  useEffect(() => {
    if (!allowed) return;
    mounted.current = true;
    void load();
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    const channel = supabase.channel(`protocolo-cards-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "kanban_cards" }, () => { void load(); })
      .subscribe((status) => { if (status === "SUBSCRIBED") void load(); });
    // Recupera eventos perdidos durante desconexões e ao voltar à guia.
    const interval = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      mounted.current = false;
      ++loadVersion.current;
      void supabase.removeChannel(channel);
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [allowed, load]);

  if (!allowed) {
    return <div className="mx-auto max-w-xl p-8 text-center text-sm text-muted-foreground">
      {isSolicitante || isApprover ? "A guia Protocolo é exclusiva da equipe de Compras." : "Acesso restrito."}
    </div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold"><FileCheck2 className="h-5 w-5 text-primary" /> Protocolo Pipefy</h1>
        <p className="text-sm text-muted-foreground">Pedidos Gerados com documentos de pagamento e confirmação de recebimento.</p>
      </div>
      {!cards ? <Loader2 className="h-5 w-5 animate-spin" /> : cards.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum pedido em Pedidos Gerados.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="p-3">Código</th><th className="p-3">Solicitação</th><th className="p-3">Pedido</th><th className="p-3">Centro de Custo</th><th className="p-3">Situação</th><th className="whitespace-nowrap p-3">Número do protocolo</th><th className="p-3 text-right">Ação</th></tr>
            </thead>
            <tbody>
              {cards.map((c) => {
                const s = situacaoProtocolo(c);
                const d = (c.data ?? {}) as any;
                const tone = s.tone === "ok" ? "text-protocol-success" : s.tone === "erro" ? "text-destructive" : s.tone === "pronto" ? "text-foreground font-medium" : "text-muted-foreground";
                return (
                  <tr key={c.id} className="border-t align-top">
                    <td className="p-3 font-mono text-xs">{c.codigo_unico ?? "—"}</td>
                    <td className="p-3"><Link to="/kanban" className="hover:underline">{c.title}</Link><div className="text-xs text-muted-foreground">{c.buyer_name ?? ""}</div></td>
                    <td className="p-3">{rotuloPedido(c) ?? "—"}</td>
                    <td className="p-3 text-xs">{d.centro_custo_codigo ? `${d.centro_custo_codigo} - ${d.centro_custo_descricao}` : "—"}</td>
                    <td className={`p-3 text-xs ${tone}`}>
                      {s.tone === "erro" && <AlertTriangle className="mr-1 inline h-3 w-3" />}{s.label}
                      {s.pendencias.length > 0 && <ul className="mt-1 space-y-1 text-muted-foreground">{s.pendencias.map((p) => <li key={p}>{p}</li>)}</ul>}
                      {s.tone === "erro" && d.protocolo_pipefy_erro?.mensagem && <div className="text-muted-foreground">{translateError(d.protocolo_pipefy_erro.mensagem, "Não foi possível enviar o protocolo ao Pipefy.")}</div>}
                    </td>
                    <td className="whitespace-nowrap p-3 text-xs text-foreground">
                      {d.protocolo_pipefy?.card_id ? `#${String(d.protocolo_pipefy.card_id).replace(/^#+/, "")}` : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-3 text-right">
                      {canSend && d.recebimento?.status === "confirmado" && s.tone !== "ok" && (
                        <Button type="button" variant="outline" size="sm" disabled={!s.pronto || sending === c.id} onClick={async () => { setSending(c.id); try { await protocolar(c.id); } finally { setSending(null); void load(); } }}>
                          {sending === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Protocolar
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

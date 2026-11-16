import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Send, FileCheck2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { getFaturamento } from "@/lib/invoice-documents";
import { getDadosPagamento } from "@/lib/pagamento";
import { ProtocoloBadge, useProtocolar } from "@/components/DadosPagamentoSection";
import { DATA_DE_CORTE_PRODUCAO_ISO } from "@/lib/cutoff";
import type { Database } from "@/integrations/supabase/types";
import { translateError } from "@/lib/error-messages";

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

function situacao(c: Card) {
  const d = (c.data ?? {}) as any;
  if (d.protocolo_pipefy?.card_id) return { label: "Protocolado", tone: "ok" };
  if (d.protocolo_pipefy_erro) return { label: "Falha no envio", tone: "erro" };
  const fat = getFaturamento(c.data);
  if (!fat.notas_fiscais?.length) return { label: "Aguardando NF", tone: "pend" };
  if (!getDadosPagamento(c.data).condicao_de_pagamento) return { label: "Aguardando dados de pagamento", tone: "pend" };
  const rec = d.recebimento?.status;
  if (rec === "problema") return { label: "Recebimento com problema", tone: "erro" };
  if (rec !== "confirmado") return { label: "Aguardando Recebido do solicitante", tone: "pend" };
  return { label: "Pronto para protocolar", tone: "pronto" };
}

function ProtocoloPage() {
  const { isBuyer, isAdmin, isOwner, isAuditor, isSolicitante, isApprover } = useAuth();
  const allowed = isBuyer || isAdmin || isOwner || isAuditor;
  const canSend = !isAuditor && (isBuyer || isAdmin || isOwner);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const protocolar = useProtocolar();

  const load = () =>
    supabase.from("kanban_cards").select("*").eq("status", "pedidos_gerados").gte("created_at", DATA_DE_CORTE_PRODUCAO_ISO)
      .order("status_changed_at", { ascending: false }).then(({ data }) => setCards(data ?? []));
  useEffect(() => { if (allowed) load(); }, [allowed]);

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
              <tr><th className="p-3">Código</th><th className="p-3">Solicitação</th><th className="p-3">Pedido</th><th className="p-3">Centro de Custo</th><th className="p-3">Situação</th><th className="p-3 text-right">Ação</th></tr>
            </thead>
            <tbody>
              {cards.map((c) => {
                const s = situacao(c);
                const d = (c.data ?? {}) as any;
                const tone = s.tone === "ok" ? "text-primary" : s.tone === "erro" ? "text-destructive" : s.tone === "pronto" ? "text-foreground font-medium" : "text-muted-foreground";
                return (
                  <tr key={c.id} className="border-t align-top">
                    <td className="p-3 font-mono text-xs">{c.codigo_unico ?? "—"}</td>
                    <td className="p-3"><Link to="/kanban" className="hover:underline">{c.title}</Link><div className="text-xs text-muted-foreground">{c.buyer_name ?? ""}</div></td>
                    <td className="p-3">{c.numero_pedido_linx || c.order_number || "—"}</td>
                    <td className="p-3 text-xs">{d.centro_custo_codigo ? `${d.centro_custo_codigo} - ${d.centro_custo_descricao}` : "—"}</td>
                    <td className={`p-3 text-xs ${tone}`}>
                      {s.tone === "erro" && <AlertTriangle className="mr-1 inline h-3 w-3" />}{s.label}
                      {s.tone === "erro" && d.protocolo_pipefy_erro?.mensagem && <div className="text-muted-foreground">{translateError(d.protocolo_pipefy_erro.mensagem, "Não foi possível enviar o protocolo ao Pipefy.")}</div>}
                      <div className="mt-1"><ProtocoloBadge data={c.data} /></div>
                    </td>
                    <td className="p-3 text-right">
                      {canSend && d.recebimento?.status === "confirmado" && s.tone !== "ok" && (
                        <button type="button" disabled={sending === c.id} onClick={async () => { setSending(c.id); await protocolar(c.id); setSending(null); load(); }}
                          className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60">
                          {sending === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Protocolar
                        </button>
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

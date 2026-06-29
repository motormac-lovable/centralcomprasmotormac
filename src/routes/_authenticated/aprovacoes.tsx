import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, XCircle, ShieldAlert, Filter, Crown, Package, FileText, Truck, ClipboardList, Paperclip, Download, Eye, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import type { Database } from "@/integrations/supabase/types";
import { KIND_LABEL, type Supplier, type Attachment } from "@/lib/cards";

type Card = Database["public"]["Tables"]["kanban_cards"]["Row"];
type Kind = Database["public"]["Enums"]["card_kind"];

const KIND_ICON: Record<Kind, typeof Package> = {
  compras: Package,
  contratos: FileText,
  frete: Truck,
  materiais: ClipboardList,
};

export const Route = createFileRoute("/_authenticated/aprovacoes")({
  head: () => ({ meta: [{ title: "Painel de Cotações para Aprovação — Central de Compras" }] }),
  component: AprovacoesPage,
});

const TETO_OWNER_EXCLUSIVO = 200_000;

function parseValor(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return 0;
  const cleaned = v.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(?:[,.]|$))/g, "").replace(",", ".");
  const n = Number(cleaned);
  return isFinite(n) ? n : 0;
}

function suppliersOf(card: Card): Supplier[] {
  return (card.suppliers as unknown as Supplier[] | null) ?? [];
}

function chosenSupplier(card: Card): Supplier | null {
  return suppliersOf(card).find((s) => s.chosen) ?? null;
}

function valorReferenciaAlcada(card: Card): number {
  const ch = chosenSupplier(card);
  if (ch) return parseValor(ch.valor);
  const valores = suppliersOf(card).map((s) => parseValor(s.valor)).filter((n) => n > 0);
  return valores.length ? Math.min(...valores) : 0;
}

function departamentoOf(card: Card): string | null {
  const data = (card.data as Record<string, unknown>) ?? {};
  const d = data.departamento;
  return typeof d === "string" && d.trim() ? d.trim() : null;
}

function attachmentsOf(card: Card): Attachment[] {
  return (card.attachments as unknown as Attachment[] | null) ?? [];
}

function AprovacoesPage() {
  const { isApprover, isOwner, approverDepartments, approverCeiling, fullName, user } = useAuth();
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejecting, setRejecting] = useState<Card | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("kanban_cards")
      .select("*")
      .eq("status", "aguardando_aprovacao")
      .order("status_changed_at", { ascending: true });
    if (error) toast.error(error.message);
    setCards((data ?? []) as Card[]);
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  const visibleCards = useMemo(() => {
    return cards.filter((c) => {
      const valor = valorReferenciaAlcada(c);
      const dept = departamentoOf(c);
      if (valor > TETO_OWNER_EXCLUSIVO) return isOwner;
      if (isOwner) return true;
      if (isApprover) {
        if (!dept || !approverDepartments.includes(dept)) return false;
        if (valor === 0) return true;
        return valor <= approverCeiling;
      }
      return false;
    });
  }, [cards, isApprover, isOwner, approverDepartments, approverCeiling]);

  if (!isApprover && !isOwner) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <ShieldAlert className="h-10 w-10 mx-auto text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-semibold">Acesso restrito a Aprovadores</h1>
      </div>
    );
  }

  const approve = async (card: Card, selectedSupplierId: string, justificativa: string) => {
    setBusyId(card.id);
    const author = fullName || user?.email || "Aprovador";
    const list = suppliersOf(card);
    const updatedSuppliers = list.map((s) => ({ ...s, chosen: s.id === selectedSupplierId }));
    const chosen = updatedSuppliers.find((s) => s.id === selectedSupplierId);
    const cheapest = [...list].sort((a, b) => parseValor(a.valor) - parseValor(b.valor))[0];
    const isCheapest = cheapest?.id === selectedSupplierId;

    const obs = ((card.observations as unknown as Array<{ at: string; author: string; text: string }>) ?? []);
    const logText = isCheapest
      ? `✅ Cotação APROVADA pelo aprovador ${author}. Fornecedor escolhido: ${chosen?.fornecedor} (${chosen?.valor}) — menor custo.`
      : `✅ Cotação APROVADA pelo aprovador ${author}. Fornecedor escolhido: ${chosen?.fornecedor} (${chosen?.valor}). Justificativa (custo maior): ${justificativa}`;
    const log = [...obs, { at: new Date().toISOString(), author, text: logText }];

    const dataObj = ((card.data as Record<string, unknown>) ?? {});
    const nextData = {
      ...dataObj,
      aprovacao: {
        fornecedor_escolhido_id: selectedSupplierId,
        fornecedor_escolhido: chosen?.fornecedor ?? null,
        valor_escolhido: chosen?.valor ?? null,
        is_menor_custo: isCheapest,
        justificativa_custo_maior: isCheapest ? null : justificativa,
        aprovador: author,
        aprovado_em: new Date().toISOString(),
      },
    };

    const nextStatus = card.kind === "frete" ? "pedidos_gerados" : "cotacoes_aprovadas";
    const { error } = await supabase
      .from("kanban_cards")
      .update({
        status: nextStatus,
        suppliers: updatedSuppliers as never,
        data: nextData as never,
        observations: log as never,
        approver_id: user?.id ?? null,
        approver_name: author,
      })
      .eq("id", card.id);
    setBusyId(null);
    if (error) return toast.error(error.message);
    toast.success(card.kind === "frete" ? "Frete aprovado — Pedido gerado." : "Cotação aprovada — segue para integração Linx.");
    reload();
  };

  const confirmReject = async (motivo: string) => {
    if (!rejecting) return;
    const author = fullName || user?.email || "Aprovador";
    const obs = ((rejecting.observations as unknown as Array<{ at: string; author: string; text: string }>) ?? []);
    const log = [...obs, { at: new Date().toISOString(), author, text: `❌ Cotação REJEITADA por ${author}. Motivo: ${motivo}` }];
    setBusyId(rejecting.id);
    const { error } = await supabase
      .from("kanban_cards")
      .update({
        status: "cotacoes_rejeitadas",
        observations: log as never,
        approver_id: user?.id ?? null,
        approver_name: author,
      })
      .eq("id", rejecting.id);
    setBusyId(null);
    setRejecting(null);
    if (error) return toast.error(error.message);
    toast.success("Cotação rejeitada — registrada com justificativa.");
    reload();
  };

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2">
          <CheckCircle2 className="h-7 w-7 text-emerald-600" />
          Painel de Cotações para Aprovação
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Aprovação 100% nativa — sem e-mails. Selecione o fornecedor vencedor diretamente no mapa comparativo.
        </p>
      </div>

      {isApprover && !isOwner && (
        <div className="mb-6 rounded-xl border bg-card p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <div className="flex items-center gap-2"><Filter className="h-4 w-4 text-cyan-600" /><strong>Teto de alçada:</strong> {approverCeiling.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>
          <div className="flex items-center gap-2">
            <strong>Departamentos:</strong>
            <div className="flex flex-wrap gap-1">
              {approverDepartments.length === 0 && <span className="text-xs text-red-600">Nenhum vinculado.</span>}
              {approverDepartments.slice(0, 6).map((d) => (
                <span key={d} className="text-[11px] bg-cyan-100 text-cyan-800 px-2 py-0.5 rounded-full">{d}</span>
              ))}
              {approverDepartments.length > 6 && (<span className="text-[11px] text-muted-foreground">+{approverDepartments.length - 6}</span>)}
            </div>
          </div>
        </div>
      )}

      {isOwner && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm flex items-center gap-2">
          <Crown className="h-4 w-4 text-amber-700" />
          <span>Visão de Proprietário: visualiza inclusive cotações acima de R$ 200.000,00.</span>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando cotações…</p>
      ) : visibleCards.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-muted/40 p-12 text-center">
          <p className="text-sm text-muted-foreground">Nenhuma cotação aguardando sua aprovação no momento.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {visibleCards.map((card) => (
            <ApprovalCard
              key={card.id}
              card={card}
              busy={busyId === card.id}
              onApprove={(sid, just) => approve(card, sid, just)}
              onReject={() => setRejecting(card)}
            />
          ))}
        </div>
      )}

      {rejecting && (
        <RejectModal card={rejecting} busy={busyId === rejecting.id} onCancel={() => setRejecting(null)} onConfirm={confirmReject} />
      )}
    </div>
  );
}

function ApprovalCard({ card, busy, onApprove, onReject }: { card: Card; busy: boolean; onApprove: (supplierId: string, justificativa: string) => void; onReject: () => void }) {
  const Icon = KIND_ICON[card.kind];
  const dept = departamentoOf(card);
  const suppliers = suppliersOf(card);
  const data = (card.data as Record<string, unknown>) ?? {};
  const attachments = attachmentsOf(card);

  const initialChosenId = suppliers.find((s) => s.chosen)?.id ?? "";
  const [selectedId, setSelectedId] = useState<string>(initialChosenId);
  const [justificativa, setJustificativa] = useState<string>("");

  const cheapest = useMemo(() => {
    const withValor = suppliers.map((s) => ({ s, v: parseValor(s.valor) })).filter((x) => x.v > 0);
    if (!withValor.length) return null;
    return withValor.reduce((a, b) => (b.v < a.v ? b : a)).s;
  }, [suppliers]);

  const selectedSupplier = suppliers.find((s) => s.id === selectedId) ?? null;
  const isCheapest = selectedSupplier && cheapest && selectedSupplier.id === cheapest.id;
  const needsJustificativa = !!selectedSupplier && !isCheapest;
  const canApprove = !!selectedSupplier && (!needsJustificativa || justificativa.trim().length >= 5);

  return (
    <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
      <div className="p-5 border-b flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-accent text-primary shrink-0">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">#{card.codigo_unico ?? "—"}</span>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{KIND_LABEL[card.kind]}</span>
            {dept && <span className="text-[11px] bg-cyan-100 text-cyan-800 px-2 py-0.5 rounded-full">{dept}</span>}
          </div>
          <h3 className="text-lg font-semibold mt-1">{card.title}</h3>
          {card.summary && <p className="text-sm text-muted-foreground mt-0.5">{card.summary}</p>}
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-muted-foreground">{selectedSupplier ? "Valor selecionado" : "Selecione um fornecedor"}</div>
          <div className={`text-xl font-bold ${selectedSupplier ? "text-emerald-700" : "text-amber-600"}`}>
            {selectedSupplier
              ? parseValor(selectedSupplier.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
              : suppliers.length === 0 ? "Sem cotações" : "—"}
          </div>
        </div>
      </div>

      <div className="p-5 grid md:grid-cols-2 gap-4 text-sm">
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Solicitante</div>
          <div>{card.requester_name ?? "—"}</div>
          <div className="text-xs text-muted-foreground">{card.requester_email ?? "—"}</div>
          <div className="text-xs text-muted-foreground">{[card.unidade, card.empresa].filter(Boolean).join(" · ") || "—"}</div>
        </div>
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Aberto em</div>
          <div className="text-xs">{new Date(card.created_at).toLocaleString("pt-BR")}</div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mt-2">Aguardando desde</div>
          <div className="text-xs">{new Date(card.status_changed_at).toLocaleString("pt-BR")}</div>
        </div>
      </div>

      {suppliers.length > 0 && (
        <div className="px-5 pb-2">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
            Mapa Comparativo de Fornecedores — selecione o vencedor
          </div>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left p-2 w-12">Vencedor</th>
                  <th className="text-left p-2">Fornecedor</th>
                  <th className="text-left p-2">Valor</th>
                  <th className="text-left p-2">Prazo</th>
                  <th className="text-left p-2">Condição</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => {
                  const isMin = cheapest?.id === s.id;
                  const checked = selectedId === s.id;
                  return (
                    <tr key={s.id} className={`border-t cursor-pointer hover:bg-muted/30 ${checked ? "bg-emerald-50 dark:bg-emerald-950/30 font-semibold" : ""}`}
                        onClick={() => setSelectedId(s.id)}>
                      <td className="p-2">
                        <input
                          type="radio"
                          name={`winner-${card.id}`}
                          checked={checked}
                          onChange={() => setSelectedId(s.id)}
                          className="h-4 w-4 accent-emerald-600"
                        />
                      </td>
                      <td className="p-2">
                        {s.fornecedor}
                        {isMin && <span className="ml-2 text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">menor custo</span>}
                      </td>
                      <td className="p-2">{s.valor}</td>
                      <td className="p-2">{s.prazo}</td>
                      <td className="p-2">{s.condicao}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {needsJustificativa && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3">
              <label className="text-xs font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                Justificativa para escolha de fornecedor com custo maior <span className="text-red-600">*</span>
              </label>
              <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5">
                Você escolheu {selectedSupplier?.fornecedor} ({selectedSupplier?.valor}) em vez do menor custo: {cheapest?.fornecedor} ({cheapest?.valor}).
              </p>
              <textarea
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
                rows={3}
                placeholder="Ex: prazo de entrega mais curto, qualidade homologada, condições de pagamento, etc."
                className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
          )}
        </div>
      )}

      {Array.isArray(data.itens) && (data.itens as unknown[]).length > 0 && (
        <div className="px-5 pb-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
            Itens da solicitação ({(data.itens as unknown[]).length})
          </div>
          <div className="rounded-lg border max-h-40 overflow-y-auto">
            <table className="w-full text-xs">
              <tbody>
                {(data.itens as Array<Record<string, unknown>>).slice(0, 20).map((it, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="p-2 font-mono text-[10px]">{String(it.codigo ?? "")}</td>
                    <td className="p-2">{String(it.material ?? it.descricao ?? "")}</td>
                    <td className="p-2 text-right">{String(it.quantidade ?? "")} {String(it.unidadeMedida ?? "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(() => {
        const requesterFiles = Array.isArray(data.files)
          ? (data.files as Array<{ name?: string; path?: string; size?: number }>)
              .filter((f) => f && typeof f.path === "string")
              .map((f) => ({ name: String(f.name ?? f.path), path: String(f.path), size: f.size }))
          : [];
        return (
          <>
            <div className="px-5 pb-4">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 flex items-center gap-1">
                <Paperclip className="h-3.5 w-3.5" /> Anexos do Solicitante ({requesterFiles.length})
              </div>
              {requesterFiles.length === 0 ? (
                <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
                  Nenhum arquivo enviado pelo solicitante.
                </div>
              ) : (
                <ul className="rounded-lg border divide-y">
                  {requesterFiles.map((a) => <AttachmentRow key={a.path} att={a} bucket="solicitacao-anexos" />)}
                </ul>
              )}
            </div>

            <div className="px-5 pb-4">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 flex items-center gap-1">
                <Paperclip className="h-3.5 w-3.5" /> Anexos da Cotação ({attachments.length})
              </div>
              {attachments.length === 0 ? (
                <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
                  Nenhum orçamento ou proposta anexada pelo comprador.
                </div>
              ) : (
                <ul className="rounded-lg border divide-y">
                  {attachments.map((a) => <AttachmentRow key={a.path} att={a} bucket="orcamentos" />)}
                </ul>
              )}
            </div>
          </>
        );
      })()}


      <div className="px-5 py-4 border-t bg-muted/30 flex flex-wrap gap-2 justify-end">
        <button onClick={onReject} disabled={busy} className="inline-flex items-center gap-2 rounded-md bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-sm font-semibold disabled:opacity-60">
          <XCircle className="h-4 w-4" /> Rejeitar cotação
        </button>
        <button
          onClick={() => canApprove && onApprove(selectedId, justificativa.trim())}
          disabled={busy || !canApprove}
          title={
            !selectedSupplier ? "Selecione um fornecedor vencedor."
            : needsJustificativa && justificativa.trim().length < 5 ? "Informe a justificativa (mín. 5 caracteres)."
            : ""
          }
          className="inline-flex items-center gap-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <CheckCircle2 className="h-4 w-4" /> Aprovar cotação
        </button>
      </div>
    </div>
  );
}

function AttachmentRow({ att, bucket }: { att: { name: string; path: string; size?: number }; bucket: string }) {
  const [busy, setBusy] = useState(false);
  const open = async (download: boolean) => {
    setBusy(true);
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(att.path, 120);
    setBusy(false);
    if (error || !data) return toast.error("Não foi possível obter o arquivo.");
    if (!download) {
      window.open(data.signedUrl, "_blank", "noopener");
      return;
    }
    try {
      const res = await fetch(data.signedUrl);
      if (!res.ok) throw new Error("download failed");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = att.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(data.signedUrl, "_blank", "noopener");
    }
  };
  const sizeKb = att.size ? `${Math.max(1, Math.round(att.size / 1024))} KB` : "";
  return (
    <li className="flex items-center gap-2 px-3 py-2 text-xs">
      <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="flex-1 truncate">{att.name}</span>
      {sizeKb && <span className="text-muted-foreground">{sizeKb}</span>}
      <button onClick={() => open(false)} disabled={busy} className="inline-flex items-center gap-1 px-2 py-1 rounded border hover:bg-muted">
        <Eye className="h-3 w-3" /> Visualizar
      </button>
      <button onClick={() => open(true)} disabled={busy} className="inline-flex items-center gap-1 px-2 py-1 rounded border hover:bg-muted">
        <Download className="h-3 w-3" /> Baixar
      </button>
    </li>
  );
}


function RejectModal({ card, busy, onCancel, onConfirm }: { card: Card; busy: boolean; onCancel: () => void; onConfirm: (motivo: string) => void }) {
  const [motivo, setMotivo] = useState("");
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-1">Rejeitar cotação</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Card <span className="font-mono">#{card.codigo_unico}</span> — informe a justificativa (será registrada no histórico).
        </p>
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={4} placeholder="Motivo da rejeição…" className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} disabled={busy} className="rounded-md border px-4 py-2 text-sm">Cancelar</button>
          <button onClick={() => motivo.trim() && onConfirm(motivo.trim())} disabled={busy || !motivo.trim()} className="rounded-md bg-red-600 text-white px-4 py-2 text-sm font-semibold disabled:opacity-60 hover:bg-red-700">
            {busy ? "Registrando…" : "Confirmar rejeição"}
          </button>
        </div>
      </div>
    </div>
  );
}

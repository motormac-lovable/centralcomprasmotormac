import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import {
  X, Package, FileSignature, Truck, AlertCircle, Filter, Paperclip, Plus, Trash2,
  CheckCircle2, XCircle, Mail, MessageSquare, Download, FileText, Image as ImageIcon, File as FileIcon,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  KIND_LABEL, STATUS_COLUMNS, openSlaTag, approvalSlaTag, daysSince,
  type Status, type Observation, type Supplier, type Attachment,
} from "@/lib/cards";
import type { Database } from "@/integrations/supabase/types";

type Card = Database["public"]["Tables"]["kanban_cards"]["Row"];

export const Route = createFileRoute("/_authenticated/kanban")({
  head: () => ({ meta: [{ title: "Painel Kanban — Motormac" }] }),
  component: KanbanPage,
});

const iconFor = { compras: Package, contratos: FileSignature, frete: Truck, materiais: Package } as const;

type ColumnFilter = { kind: string; approver: string };

function KanbanPage() {
  const { isBuyer, loading } = useAuth();
  const [cards, setCards] = useState<Card[]>([]);
  const [open, setOpen] = useState<Card | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<Status, ColumnFilter>>(() =>
    STATUS_COLUMNS.reduce((acc, c) => ({ ...acc, [c.id]: { kind: "", approver: "" } }), {} as Record<Status, ColumnFilter>),
  );
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    let active = true;
    supabase.from("kanban_cards").select("*").order("created_at", { ascending: true })
      .then(({ data }) => { if (active) setCards(data ?? []); });
    const channel = supabase
      .channel("kanban_cards_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "kanban_cards" }, (payload) => {
        setCards((prev) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as Card;
            if (prev.some((c) => c.id === row.id)) return prev;
            toast.success(`Novo cartão: ${row.title}`);
            return [...prev, row];
          }
          if (payload.eventType === "UPDATE") {
            const row = payload.new as Card;
            return prev.map((c) => (c.id === row.id ? row : c));
          }
          if (payload.eventType === "DELETE") {
            const row = payload.old as Card;
            return prev.filter((c) => c.id !== row.id);
          }
          return prev;
        });
      })
      .subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, []);

  // Keep modal in sync with realtime updates
  useEffect(() => {
    if (!open) return;
    const fresh = cards.find((c) => c.id === open.id);
    if (fresh && fresh !== open) setOpen(fresh);
  }, [cards, open]);

  const approvers = useMemo(
    () => Array.from(new Set(cards.map((c) => c.approver_name).filter(Boolean))) as string[],
    [cards],
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-muted-foreground">
        Carregando painel…
      </div>
    );
  }
  void isBuyer;

  const onStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    if (!e.over) return;
    const cardId = String(e.active.id);
    const newStatus = String(e.over.id) as Status;
    const card = cards.find((c) => c.id === cardId);
    if (!card || card.status === newStatus) return;
    await moveCard(card, newStatus);
  };

  const moveCard = async (card: Card, newStatus: Status) => {
    const patch: Partial<Card> = { status: newStatus };
    // Auto-bind approver when entering "Aguardando Aprovação"
    if (newStatus === "aguardando_aprovacao" && !card.approver_id) {
      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        const { data: prof } = await supabase.from("profiles").select("full_name,email").eq("id", u.user.id).maybeSingle();
        patch.approver_id = u.user.id;
        patch.approver_name = prof?.full_name || prof?.email || u.user.email || "Aprovador";
        toast.info(`📧 Notificação simulada enviada para ${patch.approver_name}`);
      }
    }
    // Optimistic update
    setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, ...patch, status: newStatus, status_changed_at: new Date().toISOString() } : c)));
    const { error } = await supabase.from("kanban_cards").update(patch).eq("id", card.id);
    if (error) {
      toast.error("Falha ao mover: " + error.message);
      setCards((prev) => prev.map((c) => (c.id === card.id ? card : c)));
    } else {
      toast.success(`Movido para "${STATUS_COLUMNS.find((s) => s.id === newStatus)?.label}"`);
    }
  };

  const activeCard = cards.find((c) => c.id === activeId) || null;

  return (
    <div className="mx-auto max-w-[1700px] px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Painel de Compras</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Arraste os cartões entre as colunas. Cada coluna possui filtros e regras de SLA próprias.
        </p>
      </div>

      <DndContext sensors={sensors} onDragStart={onStart} onDragEnd={onEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 lg:grid lg:grid-cols-6 lg:overflow-visible snap-x snap-mandatory">
          {STATUS_COLUMNS.map((col) => (
            <div key={col.id} className="snap-start shrink-0 w-[85vw] sm:w-[55vw] md:w-[40vw] lg:w-auto">
              <Column
                id={col.id}
                label={col.label}
                tone={col.tone}
                bg={col.bg}
                allCards={cards.filter((c) => c.status === col.id)}
                filter={filters[col.id]}
                onFilterChange={(f) => setFilters((prev) => ({ ...prev, [col.id]: f }))}
                approvers={approvers}
                onOpen={setOpen}
              />
            </div>
          ))}
        </div>
        <DragOverlay>{activeCard && <CardView card={activeCard} dragging />}</DragOverlay>
      </DndContext>

      {open && <CardModal card={open} onClose={() => setOpen(null)} onMove={moveCard} />}
    </div>
  );
}

function Column({
  id, label, tone, bg, allCards, filter, onFilterChange, approvers, onOpen,
}: {
  id: Status; label: string; tone: string; bg: string;
  allCards: Card[]; filter: ColumnFilter;
  onFilterChange: (f: ColumnFilter) => void;
  approvers: string[];
  onOpen: (c: Card) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  let filtered = allCards;
  if (filter.kind) filtered = filtered.filter((c) => c.kind === filter.kind);
  if (filter.approver) filtered = filtered.filter((c) => c.approver_name === filter.approver);

  // "Solicitações abertas" → oldest first (already sorted asc)
  if (id !== "solicitacoes_abertas") {
    filtered = [...filtered].sort((a, b) => +new Date(b.status_changed_at) - +new Date(a.status_changed_at));
  }

  const hasFilter = !!(filter.kind || filter.approver);

  return (
    <div
      ref={setNodeRef}
      className={`rounded-2xl border p-3 min-h-[60vh] transition ${isOver ? "ring-2 ring-primary/40 bg-accent/40" : ""}`}
      style={{ background: bg || "color-mix(in oklab, var(--card) 60%, transparent)" }}
    >
      <div className="px-2 pb-2 border-b mb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: tone }} />
            <h3 className="font-semibold text-sm truncate">{label}</h3>
          </div>
          <span className="text-[11px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0">
            {filtered.length} de {allCards.length}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="h-3 w-3 text-muted-foreground shrink-0" />
          <select
            value={filter.kind}
            onChange={(e) => onFilterChange({ ...filter, kind: e.target.value })}
            className="text-[11px] bg-background border rounded px-1.5 py-1 flex-1 min-w-0"
            aria-label="Filtrar por grupo"
          >
            <option value="">Todos os grupos</option>
            {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select
            value={filter.approver}
            onChange={(e) => onFilterChange({ ...filter, approver: e.target.value })}
            className="text-[11px] bg-background border rounded px-1.5 py-1 flex-1 min-w-0"
            aria-label="Filtrar por aprovador"
          >
            <option value="">Todos compradores</option>
            {approvers.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          {hasFilter && (
            <button
              onClick={() => onFilterChange({ kind: "", approver: "" })}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Limpar filtros"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      <div className="space-y-2">
        {filtered.map((c) => <DraggableCard key={c.id} card={c} onOpen={() => onOpen(c)} />)}
        {filtered.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-8">
            {hasFilter ? "Nenhum cartão com esses filtros." : "Sem cartões aqui."}
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableCard({ card, onOpen }: { card: Card; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id });
  return (
    <div
      ref={setNodeRef} {...attributes} {...listeners}
      onClick={(e) => { if (!isDragging) { e.stopPropagation(); onOpen(); } }}
      className={`${isDragging ? "opacity-30" : ""}`}
    >
      <CardView card={card} />
    </div>
  );
}

function StatusTag({ card }: { card: Card }) {
  if (card.status === "solicitacoes_abertas") {
    const t = openSlaTag(card.created_at);
    return <Tag label={`${t.label} · ${daysSince(card.created_at)}d`} bg={t.bg} fg={t.fg} />;
  }
  if (card.status === "em_cotacao") {
    return <Tag label="Em cotação" bg="oklch(0.75 0.16 85)" fg="#1a1a1a" />;
  }
  if (card.status === "aguardando_aprovacao") {
    const t = approvalSlaTag(card.status_changed_at);
    return <Tag label={`${t.label} · ${daysSince(card.status_changed_at)}d`} bg={t.bg} fg={t.fg} />;
  }
  if (card.status === "cotacoes_rejeitadas") {
    return <Tag label="Rejeitada" bg="oklch(0.6 0.24 27)" fg="white" />;
  }
  if (card.status === "cotacoes_aprovadas") {
    return <Tag label="Aprovada · aguardando ERP" bg="oklch(0.65 0.18 160)" fg="white" />;
  }
  if (card.status === "pedidos_gerados") {
    return <Tag label={card.order_number ? `Pedido ${card.order_number}` : "Pedido gerado"} bg="oklch(0.6 0.18 150)" fg="white" />;
  }
  return null;
}

function Tag({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <span
      className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
      style={{ background: bg, color: fg }}
    >
      {label}
    </span>
  );
}

function CardView({ card, dragging = false }: { card: Card; dragging?: boolean }) {
  const Icon = iconFor[card.kind];
  return (
    <div className={`rounded-lg border bg-card p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition ${dragging ? "rotate-2 shadow-xl" : ""}`}>
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className="font-mono text-[11px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
          #{card.codigo_unico ?? "—"}
        </span>
        <StatusTag card={card} />
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
        <Icon className="h-3.5 w-3.5" />
        <span className="font-medium uppercase tracking-wider">{KIND_LABEL[card.kind]}</span>
      </div>
      <h4 className="text-sm font-semibold leading-snug line-clamp-2">{card.title}</h4>
      {card.summary && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{card.summary}</p>}
      {card.status === "pedidos_gerados" && (card.numero_pedido_linx || card.order_number) && (
        <div className="mt-2 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-1 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:border-emerald-900 dark:text-emerald-200">
          Pedido Linx Apollo: #{card.numero_pedido_linx ?? card.order_number}
        </div>
      )}
      {card.approver_name && (card.status === "cotacoes_aprovadas" || card.status === "pedidos_gerados" || card.status === "em_cotacao" || card.status === "aguardando_aprovacao") && (
        <div className="mt-2 text-[11px] font-semibold text-primary truncate">
          👤 Compradora: {card.approver_name}
        </div>
      )}
      {card.requester_name && (
        <div className="text-[11px] text-muted-foreground truncate">Solicitante: {card.requester_name}</div>
      )}
      <div className="flex items-center justify-between mt-2 text-[11px] text-muted-foreground">
        <span className="truncate">{card.unidade ?? "—"}</span>
        <span>{new Date(card.created_at).toLocaleDateString("pt-BR")}</span>
      </div>
    </div>
  );
}

/* ───────────────────────── Modal ───────────────────────── */

type ItemMaterial = {
  material: string;
  codigo: string;
  quantidade: string;
  unidadeMedida: string;
};

function CardModal({ card, onClose, onMove }: { card: Card; onClose: () => void; onMove: (c: Card, s: Status) => Promise<void> }) {
  const Icon = iconFor[card.kind];
  const rawData = (card.data as Record<string, unknown>) ?? {};
  const itensSolicitados = Array.isArray(rawData.itens) ? (rawData.itens as ItemMaterial[]) : [];
  const entries = Object.entries(rawData).filter(([k]) => k !== "itens" && k !== "files");
  const { fullName, user } = useAuth();

  const observations = (card.observations as unknown as Observation[]) ?? [];
  const suppliers = (card.suppliers as unknown as Supplier[]) ?? [];
  const attachments = (card.attachments as unknown as Attachment[]) ?? [];


  const [obsText, setObsText] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const patch = async (p: Partial<Card>) => {
    const { error } = await supabase.from("kanban_cards").update(p).eq("id", card.id);
    if (error) toast.error(error.message);
  };

  const removeItemMaterial = async (idx: number) => {
    const next = itensSolicitados.filter((_, i) => i !== idx);
    await patch({ data: { ...rawData, itens: next } as never });
    toast.success("Item removido da solicitação.");
  };



  const addObservation = async () => {
    const text = obsText.trim();
    if (!text) return;
    const next: Observation[] = [
      ...observations,
      { at: new Date().toISOString(), author: fullName || user?.email || "Comprador", text },
    ];
    setObsText("");
    await patch({ observations: next as never });
  };

  const upsertSupplier = async (s: Supplier) => {
    const exists = suppliers.some((x) => x.id === s.id);
    const next = exists ? suppliers.map((x) => (x.id === s.id ? s : x)) : [...suppliers, s];
    await patch({ suppliers: next as never });
  };
  const deleteSupplier = async (id: string) => {
    await patch({ suppliers: suppliers.filter((s) => s.id !== id) as never });
  };
  const chooseSupplier = async (id: string) => {
    await patch({ suppliers: suppliers.map((s) => ({ ...s, chosen: s.id === id })) as never });
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (attachments.length + files.length > 4) {
      toast.error("Máximo de 4 arquivos por card.");
      return;
    }
    const uploaded: Attachment[] = [];
    for (const file of Array.from(files)) {
      const safeName = file.name.normalize("NFKD").replace(/[^\w.\-]+/g, "_");
      const path = `${card.id}/${Date.now()}_${safeName}`;
      const { error } = await supabase.storage.from("orcamentos").upload(path, file);
      if (error) { toast.error(`${file.name}: ${error.message}`); continue; }
      uploaded.push({ name: file.name, path, size: file.size, uploaded_at: new Date().toISOString() });
    }
    if (uploaded.length) {
      await patch({ attachments: [...attachments, ...uploaded] as never });
      toast.success(`${uploaded.length} arquivo(s) enviado(s).`);
    }
  };

  const downloadAttachment = async (a: Attachment) => {
    const { data, error } = await supabase.storage
      .from("orcamentos")
      .createSignedUrl(a.path, 60, { download: a.name });
    if (error || !data) { toast.error("Não foi possível baixar o arquivo."); return; }
    const link = document.createElement("a");
    link.href = data.signedUrl;
    link.download = a.name;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const deleteAttachment = async (a: Attachment) => {
    await supabase.storage.from("orcamentos").remove([a.path]);
    await patch({ attachments: attachments.filter((x) => x.path !== a.path) as never });
  };

  const approve = async () => {
    await onMove(card, "cotacoes_aprovadas");
    toast.success("Cotação aprovada · aguardando retorno do ERP Linx Apollo.");
    onClose();
  };
  const reject = async () => {
    await onMove(card, "cotacoes_rejeitadas");
    onClose();
  };

  const [emailPreview, setEmailPreview] = useState(false);
  const sendApprovalEmail = () => {
    toast.success(`📧 E-mail de aprovação enviado para ${card.approver_name ?? "aprovador"}.`);
    setEmailPreview(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-accent text-primary shrink-0">
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                #{card.codigo_unico ?? "—"}
              </span>
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{KIND_LABEL[card.kind]}</span>
              <StatusTag card={card} />
            </div>
            <h2 className="text-xl font-semibold">{card.title}</h2>
            {card.summary && <p className="text-sm text-muted-foreground mt-1">{card.summary}</p>}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {/* ── Decision module (Aguardando Aprovação) ── */}
          {card.status === "aguardando_aprovacao" && (
            <section className="rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold mb-3">
                <Mail className="h-4 w-4 text-primary" />
                Módulo de Decisão
              </div>
              {card.approver_name && (
                <p className="text-xs text-muted-foreground mb-3">
                  Aprovador vinculado: <strong className="text-foreground">{card.approver_name}</strong>
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setEmailPreview(true)}
                  className="inline-flex items-center gap-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-semibold shadow-sm"
                  title="Enviar e-mail de aprovação"
                >
                  <Mail className="h-4 w-4" /> Enviar e-mail de aprovação
                </button>
                <button
                  onClick={approve}
                  className="inline-flex items-center gap-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-semibold"
                >
                  <CheckCircle2 className="h-4 w-4" /> Aprovar cotação
                </button>
                <button
                  onClick={reject}
                  className="inline-flex items-center gap-2 rounded-md bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-sm font-semibold"
                >
                  <XCircle className="h-4 w-4" /> Reprovar
                </button>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Ao aprovar, o card vai para <strong>Cotações Aprovadas</strong> e aguarda o retorno do ERP Linx Apollo com o número oficial do pedido.
              </p>
            </section>
          )}

          {emailPreview && (
            <EmailPreviewModal
              card={card}
              onClose={() => setEmailPreview(false)}
              onSend={sendApprovalEmail}
            />
          )}

          {/* ── All requester responses (always visible) ── */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Respostas do solicitante
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Detail label="Solicitante" value={card.requester_name} />
              <Detail label="E-mail" value={card.requester_email} />
              <Detail label="Unidade" value={card.unidade} />
              <Detail label="Empresa" value={card.empresa} />
              <Detail label="Criado em" value={new Date(card.created_at).toLocaleString("pt-BR")} />
              <Detail label="Nesta coluna desde" value={new Date(card.status_changed_at).toLocaleString("pt-BR")} />
            </div>
            {entries.length > 0 && (
              <dl className="grid gap-2 text-sm mt-3 pt-3 border-t">
                {entries.map(([k, v]) => (
                  <div key={k} className="grid grid-cols-3 gap-2">
                    <dt className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</dt>
                    <dd className="col-span-2 break-words whitespace-pre-wrap">{String(v ?? "—")}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          {/* ── Materiais solicitados (apenas para "materiais") ── */}
          {card.kind === "materiais" && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Itens solicitados ({itensSolicitados.length})
              </h3>
              {itensSolicitados.length === 0 ? (
                <div className="rounded-lg border border-dashed bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-900 px-4 py-3 text-sm text-amber-900 dark:text-amber-200 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Nenhum material associado a esta solicitação
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left">Código</th>
                        <th className="px-3 py-2 text-left">Descrição</th>
                        <th className="px-3 py-2 text-right">Qtd.</th>
                        <th className="px-3 py-2 text-left">Unidade</th>
                        <th className="px-3 py-2 w-12 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itensSolicitados.map((it, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-2 font-mono text-xs">{it.codigo || "—"}</td>
                          <td className="px-3 py-2">{it.material || "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{it.quantidade || "—"}</td>
                          <td className="px-3 py-2">{it.unidadeMedida || "—"}</td>
                          <td className="px-3 py-2 text-center">
                            <button
                              onClick={() => removeItemMaterial(i)}
                              className="text-destructive hover:opacity-80"
                              aria-label={`Remover item ${i + 1}`}
                              title="Remover item"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* ── Arquivos do solicitante (anexos originários do formulário) ── */}
          <RequesterFilesSection rawData={rawData} />




          {/* ── Observations log (Em cotação and onwards) ── */}
          {card.status !== "solicitacoes_abertas" && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5" /> Histórico de Observações
              </h3>
              <div className="space-y-2 mb-3">
                {observations.length === 0 && <p className="text-xs text-muted-foreground italic">Nenhuma observação registrada ainda.</p>}
                {observations.map((o, i) => (
                  <div key={i} className="rounded-lg border bg-muted/30 p-3 text-sm">
                    <div className="text-[11px] text-muted-foreground mb-1">
                      {new Date(o.at).toLocaleString("pt-BR")} · <strong>{o.author}</strong>
                    </div>
                    <p className="whitespace-pre-wrap">{o.text}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <textarea
                  value={obsText}
                  onChange={(e) => setObsText(e.target.value)}
                  placeholder="Adicionar observação…"
                  rows={2}
                  className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                />
                <button
                  onClick={addObservation}
                  className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium self-start"
                >
                  <Plus className="h-3.5 w-3.5" /> Registrar
                </button>
              </div>
            </section>
          )}

          {/* ── Attachments (all columns) ── */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Paperclip className="h-3.5 w-3.5" /> Anexos de Orçamentos ({attachments.length}/4)
            </h3>
            <div className="space-y-2 mb-3">
              {attachments.map((a) => (
                <div key={a.path} className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate">{a.name}</span>
                  <span className="text-[11px] text-muted-foreground">{(a.size / 1024).toFixed(0)} KB</span>
                  <button onClick={() => viewAttachment(a)} className="text-muted-foreground hover:text-primary" aria-label="Visualizar no navegador" title="Visualizar no navegador">
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => downloadAttachment(a)} className="text-primary hover:underline" aria-label="Baixar" title="Baixar no computador">
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => deleteAttachment(a)} className="text-destructive hover:opacity-80" aria-label="Remover" title="Remover">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {attachments.length === 0 && <p className="text-xs text-muted-foreground italic">Nenhum anexo.</p>}
            </div>
            {attachments.length < 4 && (
              <>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  accept=".pdf,.xls,.xlsx,.csv,image/*"
                  onChange={(e) => uploadFiles(e.target.files)}
                  className="hidden"
                />
                <button
                  onClick={() => fileInput.current?.click()}
                  className="inline-flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm hover:bg-muted"
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar arquivo (PDF / Excel / Imagem)
                </button>
              </>
            )}
          </section>


          {/* ── Suppliers map (Em cotação and onwards) ── */}
          {card.status !== "solicitacoes_abertas" && (
            <SuppliersTable
              suppliers={suppliers}
              onChange={upsertSupplier}
              onDelete={deleteSupplier}
              onChoose={chooseSupplier}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SuppliersTable({
  suppliers, onChange, onDelete, onChoose,
}: {
  suppliers: Supplier[];
  onChange: (s: Supplier) => void;
  onDelete: (id: string) => void;
  onChoose: (id: string) => void;
}) {
  const addRow = () => {
    onChange({
      id: crypto.randomUUID(),
      fornecedor: "",
      valor: "",
      prazo: "",
      condicao: "",
      chosen: false,
    });
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Mapa Comparativo de Fornecedores
        </h3>
        <button onClick={addRow} className="inline-flex items-center gap-1 text-xs rounded-md border px-2 py-1 hover:bg-muted">
          <Plus className="h-3 w-3" /> Fornecedor
        </button>
      </div>
      {suppliers.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Nenhum fornecedor adicionado.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="p-2 text-center w-12">Escolhido</th>
                <th className="p-2 text-left">Fornecedor</th>
                <th className="p-2 text-left">Valor Total</th>
                <th className="p-2 text-left">Prazo</th>
                <th className="p-2 text-left">Condição</th>
                <th className="p-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} className={`border-t ${s.chosen ? "bg-emerald-50 dark:bg-emerald-950/30" : ""}`}>
                  <td className="p-2 text-center">
                    <input
                      type="radio"
                      name="chosen-supplier"
                      checked={s.chosen}
                      onChange={() => onChoose(s.id)}
                      className="accent-emerald-600"
                    />
                  </td>
                  <td className="p-1"><CellInput value={s.fornecedor} onChange={(v) => onChange({ ...s, fornecedor: v })} placeholder="Nome" /></td>
                  <td className="p-1"><CellInput value={s.valor} onChange={(v) => onChange({ ...s, valor: v })} placeholder="R$ 0,00" /></td>
                  <td className="p-1"><CellInput value={s.prazo} onChange={(v) => onChange({ ...s, prazo: v })} placeholder="10 dias" /></td>
                  <td className="p-1"><CellInput value={s.condicao} onChange={(v) => onChange({ ...s, condicao: v })} placeholder="30/60" /></td>
                  <td className="p-1 text-center">
                    <button onClick={() => onDelete(s.id)} className="text-destructive hover:opacity-80">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CellInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <input
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => { if (local !== value) onChange(local); }}
      placeholder={placeholder}
      className="w-full bg-transparent px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary rounded"
    />
  );
}

type RequesterFile = { name: string; size?: number; url?: string; type?: string; path?: string; category?: string };

function RequesterFilesSection({ rawData }: { rawData: Record<string, unknown> }) {
  const raw = rawData.files;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const files: RequesterFile[] = raw.map((f) =>
    typeof f === "string" ? { name: f } : (f as RequesterFile),
  );

  const pickIcon = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    if (["png", "jpg", "jpeg", "webp", "gif", "heic"].includes(ext)) return ImageIcon;
    if (ext === "pdf") return FileText;
    return FileIcon;
  };
  const fmtSize = (s?: number) =>
    !s ? "" : s >= 1_048_576 ? `${(s / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(s / 1024))} KB`;

  const triggerDownload = (url: string, filename: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const open = async (f: RequesterFile) => {
    if (f.url) {
      triggerDownload(f.url, f.name);
      return;
    }
    if (f.path) {
      const { signRequesterFile } = await import("@/lib/requester-files");
      const url = await signRequesterFile(f.path, 120, f.name);
      if (!url) {
        toast.error("Não foi possível baixar o arquivo.");
        return;
      }
      triggerDownload(url, f.name);
      return;
    }
    toast.error("Anexo sem link disponível.");
  };

  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
        <Paperclip className="h-3.5 w-3.5" /> Arquivos e Documentos Anexados ({files.length})
      </h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {files.map((f, i) => {
          const Icon = pickIcon(f.name);
          const clickable = !!(f.url || f.path);
          return (
            <button
              key={i}
              type="button"
              onClick={() => open(f)}
              disabled={!clickable}
              className={`flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm text-left transition ${clickable ? "hover:bg-accent hover:border-primary/40 cursor-pointer" : "opacity-70 cursor-not-allowed"}`}
              title={clickable ? "Abrir/baixar arquivo" : "Anexo sem link disponível"}
            >
              <div className="w-9 h-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{f.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {f.category ? `${f.category} · ` : ""}{fmtSize(f.size) || (clickable ? "Clique para abrir" : "Sem link disponível")}
                </div>
              </div>
              {clickable && <Download className="h-4 w-4 text-muted-foreground shrink-0" />}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {

  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value || "—"}</div>
    </div>
  );
}

function EmailPreviewModal({
  card,
  onClose,
  onSend,
}: {
  card: Card;
  onClose: () => void;
  onSend: () => void;
}) {
  const suppliers = (card.suppliers as unknown as Supplier[]) ?? [];
  const chosen = suppliers.find((s) => s.chosen);
  const to = card.approver_name ? `${card.approver_name} <aprovador@motormac.com.br>` : "aprovador@motormac.com.br";
  const subject = `[Aprovação necessária] ${card.codigo_unico ?? card.id.slice(0, 8)} — ${card.title}`;
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col border-2 border-blue-500/40"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b bg-blue-50 dark:bg-blue-950/30 flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
            <Mail className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold">Pré-visualização do e-mail de aprovação</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Confira o conteúdo antes de enviar (simulação).</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto text-sm space-y-3">
          <div className="grid grid-cols-[80px_1fr] gap-2">
            <span className="text-muted-foreground">Para:</span><span className="font-medium">{to}</span>
            <span className="text-muted-foreground">Assunto:</span><span className="font-medium">{subject}</span>
          </div>
          <div className="rounded-lg border bg-muted/20 p-4 space-y-2 text-[13px] leading-relaxed">
            <p>Olá {card.approver_name ?? "responsável"},</p>
            <p>
              A solicitação <strong>#{card.codigo_unico ?? "—"}</strong> ({KIND_LABEL[card.kind]}) feita por{" "}
              <strong>{card.requester_name ?? "—"}</strong> está aguardando sua aprovação.
            </p>
            <p><strong>Título:</strong> {card.title}</p>
            {card.summary && <p><strong>Resumo:</strong> {card.summary}</p>}
            {chosen && (
              <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 p-2">
                <strong>Fornecedor escolhido:</strong> {chosen.fornecedor} · {chosen.valor} · {chosen.prazo} · {chosen.condicao}
              </div>
            )}
            <p>Acesse o painel para revisar a cotação completa e aprovar ou reprovar.</p>
            <p className="text-muted-foreground">— Central de Compras Motormac</p>
          </div>
        </div>
        <div className="p-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">Cancelar</button>
          <button
            onClick={onSend}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-semibold"
          >
            <Mail className="h-4 w-4" /> Enviar agora
          </button>
        </div>
      </div>
    </div>
  );
}

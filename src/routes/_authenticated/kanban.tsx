import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import {
  X, Package, FileSignature, Truck, AlertCircle, Filter, Paperclip, Plus, Trash2,
  CheckCircle2, XCircle, Mail, MessageSquare, Download, Eye, FileText, Image as ImageIcon, File as FileIcon, Send,
  ChevronDown,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  KIND_LABEL, STATUS_COLUMNS, openSlaTag, approvalSlaTag, daysSince,
  type Status, type Observation, type Supplier, type Attachment,
} from "@/lib/cards";
import { getCompradoraByCodigo } from "@/lib/apollo-buyers";
import { MATERIAIS_APOLLO, UNIDADES_MEDIDA_APOLLO } from "@/lib/apollo-data";
import { useUserStatuses, decorateUserName } from "@/lib/user-status";
import { DATA_DE_CORTE_PRODUCAO_ISO } from "@/lib/cutoff";
import type { Database } from "@/integrations/supabase/types";
import { translateError } from "@/lib/error-messages";

type Card = Database["public"]["Tables"]["kanban_cards"]["Row"];

export const Route = createFileRoute("/_authenticated/kanban")({
  head: () => ({ meta: [{ title: "Painel Kanban — Motormac" }] }),
  component: KanbanPage,
});

const iconFor = { compras: Package, contratos: FileSignature, frete: Truck, materiais: Package } as const;

function KanbanPage() {
  const { isBuyer, isAuditor, loading } = useAuth();
  const [cards, setCards] = useState<Card[]>([]);
  const [open, setOpen] = useState<Card | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [columnQueries, setColumnQueries] = useState<Record<Status, string>>(() =>
    STATUS_COLUMNS.reduce((acc, c) => ({ ...acc, [c.id]: "" }), {} as Record<Status, string>),
  );
  const [globalQuery, setGlobalQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    let active = true;
    // Para recuperar ou visualizar as solicitações DEMO anteriores aos testes reais, altere ou comente este filtro de data.
    supabase.from("kanban_cards").select("*")
      .gte("created_at", DATA_DE_CORTE_PRODUCAO_ISO)
      .order("created_at", { ascending: true })
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


  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center text-sm text-muted-foreground">
        Carregando painel…
      </div>
    );
  }
  

  const onStart = (e: DragStartEvent) => {
    if (isAuditor) return;
    setActiveId(String(e.active.id));
  };
  const onEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    if (isAuditor) return;
    if (!e.over) return;
    const cardId = String(e.active.id);
    const newStatus = String(e.over.id) as Status;
    const card = cards.find((c) => c.id === cardId);
    if (!card || card.status === newStatus) return;
    await moveCard(card, newStatus);
  };

  const moveCard = async (card: Card, requestedStatus: Status) => {
    if (isAuditor) {
      toast.error("Auditor: leitura apenas — movimentação de cards está bloqueada.");
      return;
    }
    // Frete pula a etapa de ERP: vai direto para "Pedidos gerados".
    const newStatus: Status =
      card.kind === "frete" && requestedStatus === "cotacoes_aprovadas"
        ? "pedidos_gerados"
        : requestedStatus;

    // Regra de compliance: para avançar a "Aguardando Aprovação" é obrigatório
    // ter ≥1 fornecedor no mapa comparativo E ≥1 anexo de orçamento.
    if (newStatus === "aguardando_aprovacao") {
      const suppliers = ((card.suppliers as unknown as Supplier[]) ?? []);
      const attachments = ((card.attachments as unknown as Attachment[]) ?? []);
      if (suppliers.length < 1 || attachments.length < 1) {
        toast.error(
          suppliers.length < 1 && attachments.length < 1
            ? "Cadastre ao menos 1 fornecedor no mapa comparativo e anexe ao menos 1 orçamento antes de avançar."
            : suppliers.length < 1
            ? "Cadastre ao menos 1 fornecedor no mapa comparativo antes de avançar."
            : "Anexe ao menos 1 orçamento antes de avançar.",
        );
        return;
      }
    }
    const patch: Partial<Card> = { status: newStatus };
    // Frete: número do pedido = código único da solicitação (não precisa do ERP).
    if (card.kind === "frete" && newStatus === "pedidos_gerados" && !card.numero_pedido_linx) {
      patch.numero_pedido_linx = card.codigo_unico;
      patch.order_number = card.codigo_unico;
    }
    // Contratos aprovados ficam prontos para o Apollo consumir via API/View.
    if (card.kind === "contratos" && newStatus === "cotacoes_aprovadas") {
      (patch as Partial<Card> & { ready_for_apollo_integration?: boolean }).ready_for_apollo_integration = true;
    }

    // Resolve current actor for the transition log
    const { data: u } = await supabase.auth.getUser();
    let actorName = "Usuário";
    if (u.user) {
      const { data: prof } = await supabase
        .from("profiles").select("full_name,email").eq("id", u.user.id).maybeSingle();
      actorName = prof?.full_name || prof?.email || u.user.email || "Usuário";
    }

    // Auto-bind approver when entering "Aguardando Aprovação"
    if (newStatus === "aguardando_aprovacao" && !card.approver_id && u.user) {
      patch.approver_id = u.user.id;
      patch.approver_name = actorName;
      toast.info(`📧 Notificação simulada enviada para ${actorName}`);
    }

    // Redundância: se não houver aprovador homologado para o departamento,
    // direciona a alçada para Administrador / Proprietário (fallback global).
    let fallbackLog: Observation | null = null;
    if (newStatus === "aguardando_aprovacao") {
      const cardData = ((card.data as Record<string, unknown>) ?? {}) as Record<string, unknown>;
      const dept = typeof cardData.departamento === "string" ? cardData.departamento.trim() : "";
      if (dept) {
        const { data: hasApprover } = await (supabase as any).rpc("has_approver_for_department", { _dept: dept });
        if (hasApprover === false) {
          patch.data = {
            ...cardData,
            aprovacao_fallback_global: true,
            aprovacao_fallback_global_em: new Date().toISOString(),
            aprovacao_fallback_departamento: dept,
          } as never;
          fallbackLog = {
            at: new Date().toISOString(),
            author: "Sistema",
            text: `⚠️ Alerta: Nenhum aprovador homologado para o departamento ${dept}. Aprovação direcionada para a alçada global (Administrador / Proprietário).`,
          };
        }
      }
    }

    // Append a transition log entry to observations (used by History panel)
    const targetLabel = STATUS_COLUMNS.find((s) => s.id === newStatus)?.label ?? newStatus;
    const prevObs = ((card.observations as unknown as Observation[]) ?? []);
    const transitionLog: Observation = {
      at: new Date().toISOString(),
      author: actorName,
      text:
        card.kind === "contratos"
          ? `📄 Card assumido/movimentado pelo Comprador ${actorName} em ${new Date().toLocaleString("pt-BR")} — destino: "${targetLabel}".`
          : `➡️ Movido para "${targetLabel}" por ${actorName}.`,
    };

    // Regra dinâmica: usuário Comprador que movimenta o card assume o campo "Comprador".
    let buyerLog: Observation | null = null;
    if (isBuyer && u.user && actorName && card.buyer_name !== actorName) {
      (patch as Partial<Card> & { buyer_name?: string | null; buyer_assigned_at?: string | null }).buyer_name = actorName;
      (patch as Partial<Card> & { buyer_name?: string | null; buyer_assigned_at?: string | null }).buyer_assigned_at = new Date().toISOString();
      buyerLog = {
        at: new Date().toISOString(),
        author: "Sistema",
        text: `👤 Campo Comprador atualizado para ${actorName} após movimentação na plataforma.`,
      };
    }

    patch.observations = [
      ...prevObs,
      transitionLog,
      ...(fallbackLog ? [fallbackLog] : []),
      ...(buyerLog ? [buyerLog] : []),
    ] as never;


    // Optimistic update
    setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, ...patch, status: newStatus, status_changed_at: new Date().toISOString() } : c)));
    const { error } = await supabase.from("kanban_cards").update(patch).eq("id", card.id);
    if (error) {
      toast.error(translateError(error, "Não foi possível mover o card. Tente novamente."));
      setCards((prev) => prev.map((c) => (c.id === card.id ? card : c)));
    } else {
      toast.success(`Movido para "${targetLabel}"`);
    }
  };

  const activeCard = cards.find((c) => c.id === activeId) || null;

  return (
    <div className="mx-auto max-w-[1700px] px-4 sm:px-6 py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight">Painel de Compras</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Arraste os cartões entre as colunas. Cada coluna possui filtros e regras de SLA próprias.
          </p>
        </div>
        <div className="sm:w-[28rem] shrink-0 space-y-2">
          <div className="relative">
            <Filter className="h-3.5 w-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={globalQuery}
              onChange={(e) => setGlobalQuery(e.target.value)}
              placeholder="Filtrar em todas as colunas..."
              className="w-full text-sm bg-background border rounded-md pl-8 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-ring/40"
              aria-label="Filtro global"
            />
            {globalQuery && (
              <button
                type="button"
                onClick={() => setGlobalQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Limpar filtro global"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-medium text-muted-foreground shrink-0">De</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="flex-1 min-w-0 text-sm bg-background border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring/40"
              aria-label="Data inicial"
            />
            <label className="text-[11px] font-medium text-muted-foreground shrink-0">até</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="flex-1 min-w-0 text-sm bg-background border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring/40"
              aria-label="Data final"
            />
            {(dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => { setDateFrom(""); setDateTo(""); }}
                className="text-[11px] text-muted-foreground hover:text-foreground underline shrink-0"
              >
                limpar
              </button>
            )}
          </div>
          {(globalQuery || dateFrom || dateTo) && (
            <p className="text-[11px] text-muted-foreground px-1">
              {globalQuery && <>Texto: “{globalQuery}”</>}
              {globalQuery && (dateFrom || dateTo) && " · "}
              {(dateFrom || dateTo) && <>Período: {dateFrom || "início"} → {dateTo || "hoje"}</>}
            </p>
          )}
        </div>
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
                query={columnQueries[col.id]}
                onQueryChange={(q) => setColumnQueries((prev) => ({ ...prev, [col.id]: q }))}
                onOpen={setOpen}
                globalQuery={globalQuery}
                dateFrom={dateFrom}
                dateTo={dateTo}
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
  id, label, tone, bg, allCards, query, onQueryChange, onOpen, globalQuery, dateFrom, dateTo,
}: {
  id: Status; label: string; tone: string; bg: string;
  allCards: Card[];
  query: string;
  onQueryChange: (q: string) => void;
  onOpen: (c: Card) => void;
  globalQuery: string;
  dateFrom: string;
  dateTo: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  let filtered = allCards;
  const cq = query.trim().toLowerCase();
  if (cq) filtered = filtered.filter((c) => cardMatchesQuery(c, cq));
  const q = globalQuery.trim().toLowerCase();
  if (q) filtered = filtered.filter((c) => cardMatchesQuery(c, q));
  if (dateFrom) {
    const from = new Date(dateFrom + "T00:00:00").getTime();
    filtered = filtered.filter((c) => new Date(c.created_at).getTime() >= from);
  }
  if (dateTo) {
    const to = new Date(dateTo + "T23:59:59.999").getTime();
    filtered = filtered.filter((c) => new Date(c.created_at).getTime() <= to);
  }

  // "Solicitações abertas" → oldest first (already sorted asc)
  if (id !== "solicitacoes_abertas") {
    filtered = [...filtered].sort((a, b) => +new Date(b.status_changed_at) - +new Date(a.status_changed_at));
  }

  const hasFilter = !!cq;

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
        <div className="relative">
          <Filter className="h-3 w-3 text-muted-foreground absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Filtrar nesta coluna..."
            aria-label={`Filtrar cartões da coluna ${label}`}
            className="text-[11px] bg-background border rounded w-full pl-6 pr-6 py-1 focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          {hasFilter && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Limpar filtro"
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
            {hasFilter ? "Nenhum cartão com esse filtro." : "Sem cartões aqui."}
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableCard({ card, onOpen }: { card: Card; onOpen: () => void }) {
  const { isAuditor } = useAuth();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id, disabled: isAuditor });
  const [historyOpen, setHistoryOpen] = useState(false);
  const showDetails = card.status === "cotacoes_aprovadas" || card.status === "cotacoes_rejeitadas" || card.status === "pedidos_gerados";
  const dragProps = isAuditor ? {} : { ...attributes, ...listeners };
  return (
    <>
      <div
        ref={setNodeRef} {...dragProps}
        onClick={(e) => { if (!isDragging) { e.stopPropagation(); onOpen(); } }}
        className={`${isDragging ? "opacity-30" : ""} ${isAuditor ? "cursor-pointer" : ""}`}
      >
        <CardView
          card={card}
          footerSlot={
            showDetails ? (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); setHistoryOpen(true); }}
                className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-md px-1.5 py-0.5 border border-transparent hover:border-primary/20 transition"
                aria-label="Ver histórico detalhado"
              >
                🔍 Detalhes
              </button>
            ) : null
          }
        />
      </div>
      {historyOpen && <HistoryModal card={card} onClose={() => setHistoryOpen(false)} />}
    </>
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

function suggestedBuyer(card: Card): string | null {
  if (card.kind !== "materiais") return null;
  const raw = (card.data as Record<string, unknown>) ?? {};
  const itens = Array.isArray(raw.itens) ? (raw.itens as Array<{ codigo?: string }>) : [];
  const buyers = new Set<string>();
  for (const it of itens) {
    const b = getCompradoraByCodigo(it?.codigo);
    if (b) buyers.add(b);
  }
  if (buyers.size === 0) return null;
  const list = Array.from(buyers);
  return list.length === 1 ? list[0] : `${list[0]} (+${list.length - 1})`;
}

function cardMatchesQuery(card: Card, q: string): boolean {
  const parts: string[] = [
    KIND_LABEL[card.kind] ?? "",
    card.kind,
    card.title ?? "",
    card.summary ?? "",
    card.requester_name ?? "",
    card.requester_email ?? "",
    card.approver_name ?? "",
    card.buyer_name ?? "",
    card.unidade ?? "",
    card.empresa ?? "",
    card.codigo_unico ?? "",
    suggestedBuyer(card) ?? "",
  ];
  try { parts.push(JSON.stringify(card.data ?? {})); } catch { /* noop */ }
  return parts.join(" \u0001 ").toLowerCase().includes(q);
}


function CardView({ card, dragging = false, footerSlot }: { card: Card; dragging?: boolean; footerSlot?: React.ReactNode }) {
  const Icon = iconFor[card.kind];
  const suggested = suggestedBuyer(card);
  const statuses = useUserStatuses();
  const requesterLabel = decorateUserName(card.requester_name, card.requester_email, statuses);
  const approverLabel = decorateUserName(card.approver_name, null, statuses);
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
      {card.buyer_name ? (
        <div className="mt-2 text-[11px] font-semibold text-primary truncate">
          👤 Comprador(a): {decorateUserName(card.buyer_name, null, statuses)}
        </div>
      ) : card.approver_name ? (
        (card.status === "cotacoes_aprovadas" || card.status === "pedidos_gerados" || card.status === "em_cotacao" || card.status === "aguardando_aprovacao") && (
          <div className="mt-2 text-[11px] font-semibold text-primary truncate">
            👤 Comprador(a): {approverLabel}
          </div>
        )
      ) : suggested && (
        <div className="mt-2 text-[11px] font-semibold text-primary/80 truncate" title="Sugestão baseada no material">
          👤 Comprador(a): {suggested}
        </div>
      )}

      {card.requester_name && (
        <div className="text-[11px] text-muted-foreground truncate">Solicitante: {requesterLabel}</div>
      )}
      <div className="flex items-center justify-between mt-2 text-[11px] text-muted-foreground">
        <span className="truncate">{card.unidade ?? "—"}</span>
        <span>{new Date(card.created_at).toLocaleDateString("pt-BR")}</span>
      </div>
      {footerSlot && (
        <div className="mt-2 pt-2 border-t flex justify-start">
          {footerSlot}
        </div>
      )}
    </div>
  );
}

/* ─────────────────── History Modal (Detalhes) ─────────────────── */

type AprovacaoMeta = {
  fornecedor_escolhido?: string | null;
  valor_escolhido?: string | null;
  is_menor_custo?: boolean | null;
  justificativa_custo_maior?: string | null;
  justificativa_custo_maior_em?: string | null;
  justificativa_fornecedor_unico?: string | null;
  justificativa_fornecedor_unico_em?: string | null;
  aprovador?: string | null;
  aprovado_em?: string | null;
};

function findObs(obs: Observation[], match: RegExp): Observation | undefined {
  return obs.find((o) => match.test(o.text || ""));
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "N/A (Card Anterior à Atualização)";
  try { return new Date(iso).toLocaleString("pt-BR"); } catch { return "N/A (Card Anterior à Atualização)"; }
}

const STATUS_ORDER: Status[] = [
  "solicitacoes_abertas",
  "em_cotacao",
  "aguardando_aprovacao",
  "cotacoes_aprovadas",
  "cotacoes_rejeitadas",
  "pedidos_gerados",
];
function reached(card: Card, target: Status): boolean {
  // Treat "rejeitadas" as having passed through aguardando_aprovacao
  const passOrder: Record<Status, number> = {
    solicitacoes_abertas: 0,
    em_cotacao: 1,
    aguardando_aprovacao: 2,
    cotacoes_aprovadas: 3,
    cotacoes_rejeitadas: 3,
    pedidos_gerados: 4,
  };
  void STATUS_ORDER;
  return passOrder[card.status] >= passOrder[target];
}

type HistValue = { text: string; estimated?: boolean };
type ComplianceJust = { texto?: string; registrado_em?: string; autor?: string };
function HistoryModal({ card, onClose }: { card: Card; onClose: () => void }) {
  const obs = ((card.observations as unknown as Observation[]) ?? []);
  const rawData = (card.data as Record<string, unknown>) ?? {};
  const aprov = (rawData.aprovacao as AprovacaoMeta | undefined) ?? undefined;
  const compliance = (rawData.compliance as Record<string, ComplianceJust> | undefined) ?? undefined;
  const suppliers = ((card.suppliers as unknown as Supplier[]) ?? []);
  const chosen = suppliers.find((s) => s.chosen) ?? null;
  const isRejected = card.status === "cotacoes_rejeitadas";

  const emCotacao = findObs(obs, /Em cotação/i);
  const aguardando = findObs(obs, /Aguardando Aprovação/i);
  const decisao = findObs(obs, /APROVADA|REJEITADA|Cotações Aprovadas|Cotações Rejeitadas/i);
  const rejeicao = findObs(obs, /REJEITADA|Cotações Rejeitadas/i);

  // Comprador Responsável: prioriza o campo persistido "buyer_name" (atribuição inicial/dinâmica).
  const compradorResponsavel =
    card.buyer_name ||
    emCotacao?.author ||
    (!isRejected && !aprov ? card.approver_name : null) ||
    card.approver_name ||

    "N/A (Card Anterior à Atualização)";

  // ─── Fallback inteligente para cards "em trânsito" / legados ───
  // Avanço para "Em Cotação"
  let emCotacaoVal: HistValue;
  if (emCotacao?.at) {
    emCotacaoVal = { text: fmtDate(emCotacao.at) };
  } else if (reached(card, "em_cotacao")) {
    // Estimativa: 1h após abertura
    const est = new Date(new Date(card.created_at).getTime() + 60 * 60 * 1000).toISOString();
    emCotacaoVal = { text: `${fmtDate(est)} · Pendente de transição (Fase Inicial)`, estimated: true };
  } else {
    emCotacaoVal = { text: "N/A (Card Anterior à Atualização)" };
  }

  // Envio para "Aguardando Aprovação"
  let aguardandoVal: HistValue;
  if (aguardando?.at) {
    aguardandoVal = { text: fmtDate(aguardando.at) };
  } else if (card.status === "aguardando_aprovacao") {
    // Card está nessa coluna agora → o carimbo de status é exatamente este momento
    aguardandoVal = { text: fmtDate(card.status_changed_at) };
  } else if (reached(card, "cotacoes_aprovadas")) {
    aguardandoVal = { text: "N/A (Card Anterior à Atualização)" };
  } else {
    aguardandoVal = { text: "N/A (Card Anterior à Atualização)" };
  }

  // Decision timestamp / actor
  const decisaoAt = aprov?.aprovado_em || decisao?.at || (reached(card, "cotacoes_aprovadas") ? card.status_changed_at : null);
  const decisor = aprov?.aprovador || decisao?.author || card.approver_name || "N/A (Card Anterior à Atualização)";
  const decisaoText = decisaoAt
    ? `${fmtDate(decisaoAt)} — por ${decisor}`
    : "N/A (Card Anterior à Atualização)";

  // Justificativa logic
  let justificativa = "N/A (Card Anterior à Atualização)";
  if (isRejected) {
    const motivo = rejeicao?.text?.replace(/.*Motivo:\s*/i, "").trim();
    justificativa = motivo || "Rejeitada (sem motivo registrado).";
  } else if (aprov) {
    if (aprov.justificativa_custo_maior && aprov.justificativa_custo_maior.trim()) {
      justificativa = aprov.justificativa_custo_maior;
    } else if (suppliers.length <= 1) {
      justificativa = "Fornecedor único — sem concorrência.";
    } else {
      justificativa = "Preço mais competitivo (Sem ressalvas).";
    }
  } else if (reached(card, "cotacoes_aprovadas") && !isRejected) {
    justificativa = "Preço mais competitivo (Sem ressalvas).";
  }

  const fornecedor =
    aprov?.fornecedor_escolhido ||
    chosen?.fornecedor ||
    (isRejected ? "Rejeitada — sem fornecedor aprovado" : "N/A (Card Anterior à Atualização)");
  const custo = aprov?.valor_escolhido || chosen?.valor || "N/A (Card Anterior à Atualização)";

  const rows: Array<{ label: string; value: React.ReactNode; mono?: boolean; estimated?: boolean }> = [
    { label: "Data de Abertura", value: fmtDate(card.created_at) },
    { label: "Comprador Responsável", value: compradorResponsavel },
    { label: 'Avanço para "Em Cotação"', value: emCotacaoVal.text, estimated: emCotacaoVal.estimated },
    { label: 'Envio para "Aguardando Aprovação"', value: aguardandoVal.text, estimated: aguardandoVal.estimated },
    { label: isRejected ? "Data da Rejeição" : "Data da Aprovação", value: decisaoText },
    { label: isRejected ? "Fornecedor" : "Fornecedor Aprovado", value: fornecedor },
    { label: isRejected ? "Custo (não aprovado)" : "Custo Aprovado", value: custo, mono: true },
    { label: isRejected ? "Motivo da Rejeição" : "Justificativa da Aprovação", value: justificativa },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-background rounded-xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">🔍</span>
              <h3 className="text-lg font-semibold tracking-tight">Detalhes da Solicitação</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="font-mono font-semibold text-primary">#{card.codigo_unico ?? "—"}</span>
              {" · "}{KIND_LABEL[card.kind]} · {card.title}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">
          <ol className="relative border-l border-border ml-2 space-y-4">
            {rows.map((r, i) => (
              <li key={i} className="pl-4 relative">
                <span
                  className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-background ${r.estimated ? "bg-amber-500" : "bg-primary"}`}
                  aria-hidden
                />
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-1.5">
                  {r.label}
                  {r.estimated && (
                    <span className="text-[9px] font-semibold text-amber-700 bg-amber-100 dark:bg-amber-950 dark:text-amber-300 px-1.5 py-0 rounded">
                      estimado
                    </span>
                  )}
                </div>
                <div className={`text-sm mt-0.5 ${r.mono ? "font-mono font-semibold" : "font-medium"} text-foreground break-words`}>
                  {r.value}
                </div>
              </li>
            ))}
          </ol>

          {/* ── Compliance Section ── */}
          <ComplianceSection
            card={card}
            compliance={compliance}
            aprov={aprov}
            suppliers={suppliers}
            isRejected={isRejected}
          />
        </div>
        <div className="p-4 border-t flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── Compliance Section (Detalhes) ─────────────── */

function ComplianceSection({
  card, compliance, aprov, suppliers, isRejected,
}: {
  card: Card;
  compliance: Record<string, ComplianceJust> | undefined;
  aprov: AprovacaoMeta | undefined;
  suppliers: Supplier[];
  isRejected: boolean;
}) {
  void card;
  const compradorUnico = compliance?.justificativa_fornecedor_unico_comprador;
  const aprovCustoMaior = aprov?.justificativa_custo_maior?.trim()
    ? { texto: aprov.justificativa_custo_maior, registrado_em: aprov.justificativa_custo_maior_em || aprov.aprovado_em || null, autor: aprov.aprovador || null }
    : null;
  const aprovFornUnico = aprov?.justificativa_fornecedor_unico?.trim()
    ? { texto: aprov.justificativa_fornecedor_unico, registrado_em: aprov.justificativa_fornecedor_unico_em || aprov.aprovado_em || null, autor: aprov.aprovador || null }
    : null;

  const entries: Array<{ label: string; texto: string; em?: string | null; autor?: string | null; tone: string }> = [];
  if (compradorUnico?.texto) {
    entries.push({
      label: "Justificativa do Comprador (Fornecedor Único)",
      texto: compradorUnico.texto, em: compradorUnico.registrado_em, autor: compradorUnico.autor,
      tone: "amber",
    });
  }
  if (aprovCustoMaior) {
    entries.push({
      label: "Justificativa do Aprovador (Maior Custo)",
      texto: aprovCustoMaior.texto!, em: aprovCustoMaior.registrado_em, autor: aprovCustoMaior.autor,
      tone: "orange",
    });
  }
  if (aprovFornUnico) {
    entries.push({
      label: "Justificativa do Aprovador (Cotação Única)",
      texto: aprovFornUnico.texto!, em: aprovFornUnico.registrado_em, autor: aprovFornUnico.autor,
      tone: "amber",
    });
  }

  const isStandardFlow = !isRejected && aprov && suppliers.length > 1 && aprov.is_menor_custo === true && entries.length === 0;

  return (
    <section className="mt-6 pt-5 border-t">
      <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <span>🛡️</span> Justificativas de Compliance
      </h4>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground italic rounded-md border border-dashed bg-muted/30 px-3 py-2">
          {isStandardFlow
            ? "Nenhuma ressalva identificada no processo (Fluxo Padrão)."
            : "Nenhuma justificativa de compliance registrada para este card."}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {entries.map((e, i) => (
            <li
              key={i}
              className={`rounded-lg border px-3 py-2.5 ${
                e.tone === "orange"
                  ? "border-orange-300 bg-orange-50 dark:bg-orange-950/20"
                  : "border-amber-300 bg-amber-50 dark:bg-amber-950/20"
              }`}
            >
              <div className="text-[11px] uppercase tracking-wider font-semibold text-foreground/80">
                {e.label}
              </div>
              <div className="text-sm mt-1 text-foreground break-words">“{e.texto}”</div>
              <div className="text-[11px] text-muted-foreground mt-1">
                Registrado em {fmtDate(e.em)}{e.autor ? ` · por ${e.autor}` : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}


type ItemMaterial = {
  material: string;
  codigo: string;
  quantidade: string;
  unidadeMedida: string;
};

function CardModal({ card: cardProp, onClose, onMove }: { card: Card; onClose: () => void; onMove: (c: Card, s: Status) => Promise<void> }) {
  // Defesa: sempre buscar o registro fresco do banco ao abrir o card,
  // garantindo que o "data" (incluindo materiais escolhidos pelo solicitante)
  // permaneça fixado no card em todas as etapas do Kanban.
  const [freshCard, setFreshCard] = useState<Card | null>(null);
  useEffect(() => {
    let active = true;
    supabase
      .from("kanban_cards")
      .select("*")
      .eq("id", cardProp.id)
      .maybeSingle()
      .then(({ data }) => {
        if (active && data) setFreshCard(data as Card);
      });
    return () => {
      active = false;
    };
  }, [cardProp.id]);
  const card: Card = freshCard ?? cardProp;
  const Icon = iconFor[card.kind];
  const rawData = (card.data as Record<string, unknown>) ?? {};
  const itensSolicitados = Array.isArray(rawData.itens) ? (rawData.itens as ItemMaterial[]) : [];
  const COMPRAS_KEYS = ["cnpj", "peca", "operacao", "especificacao", "os", "partNumbers", "pecas", "dataEsperada"];
  const BLOCO_KEYS = ["nome", "telefone", "email", "unidade", "empresa"];
  const hiddenKeys = new Set<string>(["itens", "files", ...BLOCO_KEYS, ...(card.kind === "compras" ? COMPRAS_KEYS : [])]);
  const entries = Object.entries(rawData).filter(([k]) => !hiddenKeys.has(k));
  const { fullName, user, isApprover, isOwner, isAdmin, isAuditor, isBuyer } = useAuth();
  const canDecide = (isApprover || isOwner || isAdmin) && !isAuditor;
  // Lock de governança: após avançar para Aprovação, o card fica somente-leitura
  // até que seja movido de volta para "Solicitações abertas" ou "Em cotação".
  const EDITABLE_STATUSES: Status[] = ["solicitacoes_abertas", "em_cotacao"];
  const isLocked = !EDITABLE_STATUSES.includes(card.status);
  const readOnly = isAuditor || isLocked;
  const canEditItens = !isAuditor && !isLocked && (isBuyer || isAdmin || isOwner) && card.status === "em_cotacao";
  const canQuickReject =
    !isAuditor &&
    (isBuyer || isAdmin || isOwner) &&
    (card.status === "solicitacoes_abertas" || card.status === "em_cotacao");
  const statuses = useUserStatuses();
  const requesterLabel = decorateUserName(card.requester_name, card.requester_email, statuses);
  const approverLabel = decorateUserName(card.approver_name, null, statuses);
  const suggested = suggestedBuyer(card);
  const buyerLabel = card.buyer_name
    ? decorateUserName(card.buyer_name, null, statuses)
    : card.approver_name && (card.status === "cotacoes_aprovadas" || card.status === "pedidos_gerados" || card.status === "em_cotacao" || card.status === "aguardando_aprovacao")
      ? approverLabel
      : suggested || null;

  const observations = (card.observations as unknown as Observation[]) ?? [];
  const suppliers = (card.suppliers as unknown as Supplier[]) ?? [];
  const attachments = (card.attachments as unknown as Attachment[]) ?? [];


  const [obsText, setObsText] = useState("");
  const [obsExpanded, setObsExpanded] = useState(false);
  const [showQuickReject, setShowQuickReject] = useState(false);
  const [quickRejectMotivo, setQuickRejectMotivo] = useState("");
  const [quickRejecting, setQuickRejecting] = useState(false);
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [novoMaterial, setNovoMaterial] = useState<ItemMaterial>({ material: "", codigo: "", quantidade: "", unidadeMedida: "" });
  const [novaPeca, setNovaPeca] = useState<{ pn: string; descricao: string; especificacao: string }>({ pn: "", descricao: "", especificacao: "" });
  const fileInput = useRef<HTMLInputElement>(null);

  const patch = async (p: Partial<Card>) => {
    // Atualização otimista: reflete imediatamente no modal enquanto o
    // update persiste no banco e o realtime propaga para o restante da UI.
    const previous = freshCard ?? cardProp;
    setFreshCard({ ...previous, ...p } as Card);
    const { data, error } = await supabase
      .from("kanban_cards")
      .update(p)
      .eq("id", card.id)
      .select("*")
      .maybeSingle();
    if (error) {
      setFreshCard(previous);
      toast.error(translateError(error, "Não foi possível salvar as alterações."));
      return;
    }
    if (data) setFreshCard(data as Card);
  };

  const buyerAuthor = fullName || user?.email || "Comprador";
  const appendObservation = (currentObs: Observation[], text: string): Observation[] => [
    ...currentObs,
    { at: new Date().toISOString(), author: buyerAuthor, text },
  ];
  const fmtNow = () => new Date().toLocaleString("pt-BR");

  const removeItemMaterial = async (idx: number) => {
    const item = itensSolicitados[idx];
    if (!item) return;
    const next = itensSolicitados.filter((_, i) => i !== idx);
    const codDesc = `${item.codigo || "s/ código"} - ${item.material || "s/ descrição"}`;
    const logText = `[${fmtNow()}] - O comprador ${buyerAuthor} removeu o material ${codDesc} da solicitação.`;
    const nextObs = appendObservation(observations, logText);
    await patch({ data: { ...rawData, itens: next } as never, observations: nextObs as never });
    toast.success("Item removido da solicitação.");
  };

  const addItemMaterial = async () => {
    const material = novoMaterial.material.trim();
    const codigo = novoMaterial.codigo.trim();
    const quantidade = novoMaterial.quantidade.trim();
    const unidadeMedida = (novoMaterial.unidadeMedida || "UN").trim().toUpperCase();
    if (!material || !codigo) { toast.error("Informe o material e o código."); return; }
    if (!quantidade || Number(quantidade) <= 0) { toast.error("Informe uma quantidade válida."); return; }
    const novo: ItemMaterial = { material, codigo, quantidade, unidadeMedida };
    const next = [...itensSolicitados, novo];
    const logText = `[${fmtNow()}] - O comprador ${buyerAuthor} incluiu o material ${codigo} - ${material} (Qtd: ${quantidade}) na solicitação.`;
    const nextObs = appendObservation(observations, logText);
    await patch({ data: { ...rawData, itens: next } as never, observations: nextObs as never });
    setNovoMaterial({ material: "", codigo: "", quantidade: "", unidadeMedida: "" });
    setShowAddMaterial(false);
    toast.success("Material incluído na solicitação.");
  };

  // Peças (Solicitação de Peças) — armazenadas como array estruturado { pn, descricao }.
  // Fallback: solicitações antigas gravadas como string CSV em `partNumbers`.
  const PECAS_MAX = 50;
  const pecasList: { pn: string; descricao: string; especificacao: string }[] = (() => {
    const arr = rawData.pecas;
    if (Array.isArray(arr)) {
      return arr
        .map((p) => {
          const obj = p as Record<string, unknown>;
          return {
            pn: String(obj?.pn ?? "").trim(),
            descricao: String(obj?.descricao ?? "").trim(),
            especificacao: String(obj?.especificacao ?? "").trim(),
          };
        })
        .filter((p) => p.pn || p.descricao || p.especificacao);
    }
    const raw = (rawData.partNumbers as string) || "";
    return raw
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((pn) => ({ pn, descricao: "", especificacao: "" }));
  })();

  const savePecas = async (list: { pn: string; descricao: string; especificacao: string }[], logText: string) => {
    const nextObs = appendObservation(observations, logText);
    await patch({
      data: {
        ...rawData,
        pecas: list,
        partNumbers: list.map((p) => p.pn).join(", "),
      } as never,
      observations: nextObs as never,
    });
  };

  const addPeca = async () => {
    const pn = novaPeca.pn.trim();
    const descricao = novaPeca.descricao.trim();
    const especificacao = novaPeca.especificacao.trim();
    if (!pn || !descricao || !especificacao) {
      toast.error("Informe Part Number, Descrição e Especificação Técnica.");
      return;
    }
    if (pecasList.length >= PECAS_MAX) {
      toast.error(`Limite máximo de ${PECAS_MAX} itens atingido por solicitação`);
      return;
    }
    const next = [...pecasList, { pn, descricao, especificacao }];
    const logText = `[${fmtNow()}] - O comprador ${buyerAuthor} incluiu a peça ${pn} - ${descricao} (Espec.: ${especificacao}) na solicitação.`;
    setNovaPeca({ pn: "", descricao: "", especificacao: "" });
    await savePecas(next, logText);
    toast.success("Peça incluída.");
  };

  const removePeca = async (idx: number) => {
    const item = pecasList[idx];
    if (!item) return;
    const next = pecasList.filter((_, i) => i !== idx);
    const logText = `[${fmtNow()}] - O comprador ${buyerAuthor} removeu a peça ${item.pn} - ${item.descricao || "s/ descrição"} da solicitação.`;
    await savePecas(next, logText);
    toast.success("Peça removida.");
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
    const arr = Array.from(files);
    const uploadedAt = new Date().toISOString();
    const results = await Promise.all(
      arr.map(async (file) => {
        const safeName = file.name.normalize("NFKD").replace(/[^\w.\-]+/g, "_");
        const path = `${card.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;
        const { error } = await supabase.storage.from("orcamentos").upload(path, file);
        if (error) {
          toast.error(`${file.name}: ${translateError(error, "Falha ao enviar o arquivo.")}`);
          return null;
        }
        return { name: file.name, path, size: file.size, uploaded_at: uploadedAt } as Attachment;
      }),
    );
    const uploaded = results.filter((x): x is Attachment => x !== null);
    if (uploaded.length) {
      const previous = freshCard ?? cardProp;
      setFreshCard({ ...previous, attachments: [...attachments, ...uploaded] as never } as Card);
      const { data, error } = await (supabase as any)
        .rpc("append_quotation_attachments", { _card_id: card.id, _files: uploaded });

      if (error) {
        await supabase.storage.from("orcamentos").remove(uploaded.map((a) => a.path));
        setFreshCard(previous);
        toast.error(translateError(error, "Não foi possível registrar o anexo no card."));
        return;
      }

      if (data) setFreshCard(data as Card);
      toast.success(`${uploaded.length} arquivo(s) enviado(s).`);
    }
    if (fileInput.current) fileInput.current.value = "";
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

  const viewAttachment = async (a: Attachment) => {
    const { data, error } = await supabase.storage.from("orcamentos").createSignedUrl(a.path, 60);
    if (error || !data) { toast.error("Não foi possível abrir o arquivo."); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const deleteAttachment = async (a: Attachment) => {
    await supabase.storage.from("orcamentos").remove([a.path]);
    const author = fullName || user?.email || "Comprador";
    const auditObs: Observation = {
      at: new Date().toISOString(),
      author,
      text: `🗑️ ${author} removeu o anexo "${a.name}" do card.`,
    };
    await patch({
      attachments: attachments.filter((x) => x.path !== a.path) as never,
      observations: [...observations, auditObs] as never,
    });
  };

  const approve = async () => {
    if (card.kind === "frete") {
      await onMove(card, "pedidos_gerados");
      toast.success("Frete aprovado · movido para Pedidos gerados.");
    } else {
      await onMove(card, "cotacoes_aprovadas");
      toast.success("Cotação aprovada · aguardando retorno do ERP Linx Apollo.");
    }
    onClose();
  };
  const reject = async () => {
    await onMove(card, "cotacoes_rejeitadas");
    onClose();
  };
  const confirmQuickReject = async () => {
    const motivo = quickRejectMotivo.trim();
    if (!motivo) {
      toast.error("Informe a justificativa para rejeitar a solicitação.");
      return;
    }
    setQuickRejecting(true);
    const author = fullName || user?.email || "Comprador";
    const log: Observation = {
      at: new Date().toISOString(),
      author,
      text: `❌ Solicitação rejeitada na etapa inicial por ${author}. Motivo: ${motivo}`,
    };
    const { error } = await supabase
      .from("kanban_cards")
      .update({ observations: [...observations, log] as never })
      .eq("id", card.id);
    if (error) {
      setQuickRejecting(false);
      toast.error(translateError(error, "Não foi possível registrar a rejeição."));
      return;
    }
    await onMove(card, "cotacoes_rejeitadas");
    setQuickRejecting(false);
    setShowQuickReject(false);
    setQuickRejectMotivo("");
    toast.success("Solicitação rejeitada e movida para Cotações Rejeitadas.");
    onClose();
  };
  const [simulandoErp, setSimulandoErp] = useState(false);
  const simulateErp = async () => {
    if (!card.codigo_unico) { toast.error("Card sem código único."); return; }
    setSimulandoErp(true);
    const { simulateLinxWebhook } = await import("@/services/api");
    const res = await simulateLinxWebhook(card.codigo_unico);
    setSimulandoErp(false);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(`Pedido Linx #${res.pedido} gerado para #${card.codigo_unico}.`);
    onClose();
  };

  // Fluxo 100% nativo: aprovação ocorre no painel exclusivo do Aprovador.

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card rounded-2xl shadow-2xl max-w-[1075px] w-full max-h-[90vh] overflow-hidden flex flex-col"
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
            canDecide ? (
              <section className="rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold mb-3">
                  <Mail className="h-4 w-4 text-primary" />
                  Módulo de Decisão
                </div>
                {card.approver_name && (
                  <p className="text-xs text-muted-foreground mb-3">
                   Aprovador vinculado: <strong className="text-foreground">{approverLabel}</strong>
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
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
                  Fluxo 100% nativo: o Aprovador decide pelo <strong>Painel de Cotações para Aprovação</strong>. Ao aprovar, o card vai para <strong>Cotações Aprovadas</strong>.
                </p>
              </section>
            ) : (
              <section
                aria-disabled="true"
                className="rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/40 p-4 opacity-70 select-none"
              >
                <div className="flex items-center gap-2 text-sm font-semibold mb-3 text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  Módulo de Decisão
                </div>
                {card.approver_name && (
                  <p className="text-xs text-muted-foreground mb-3">
                    Aprovador vinculado: <strong className="text-foreground">{approverLabel}</strong>
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2 pointer-events-none">
                  <button
                    disabled
                    className="inline-flex items-center gap-2 rounded-md bg-emerald-600/60 text-white px-4 py-2 text-sm font-semibold cursor-not-allowed"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Aprovar cotação
                  </button>
                  <button
                    disabled
                    className="inline-flex items-center gap-2 rounded-md bg-red-600/60 text-white px-4 py-2 text-sm font-semibold cursor-not-allowed"
                  >
                    <XCircle className="h-4 w-4" /> Reprovar
                  </button>
                </div>
                <p className="mt-3 text-[11px] text-amber-700 dark:text-amber-400">
                  ⚠️ Módulo restrito para perfis com alçada de aprovação. Você pode visualizar o mapa comparativo, anexos e histórico, mas não decidir esta cotação.
                </p>
              </section>
            )
          )}



          {card.status === "cotacoes_aprovadas" && (
            <section className="rounded-xl border-2 border-dashed border-emerald-500/50 bg-emerald-500/5 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold mb-2">
                <Send className="h-4 w-4 text-emerald-700" />
                Integração ERP Linx Apollo
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Cotação aprovada. Aguardando retorno do ERP com o número oficial do pedido. Use o botão abaixo para simular a resposta do webhook do Linx Apollo.
              </p>
              <button
                onClick={simulateErp}
                disabled={simulandoErp}
                className="inline-flex items-center gap-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                <Send className="h-4 w-4" /> {simulandoErp ? "Processando..." : "Simular retorno ERP"}
              </button>
            </section>
          )}

          {/* ── All requester responses (always visible) ── */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Respostas do solicitante
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Detail label="Solicitante" value={requesterLabel} />
              <Detail label="E-mail" value={card.requester_email} />
              <Detail label="Unidade" value={card.unidade} />
              <Detail label="Empresa" value={card.empresa} />
              <Detail label="Comprador(a)" value={buyerLabel || "—"} />
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

          {/* ── Detalhes da solicitação de Peças ── */}
          {card.kind === "compras" && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Detalhes da solicitação de Peças
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Detail label="CNPJ da unidade pagadora" value={(rawData.cnpj as string) || "—"} />
                <Detail label="Peça solicitada" value={(rawData.peca as string) || "—"} />
                <Detail label="Operação" value={(rawData.operacao as string) || "—"} />
                <Detail label="Ordem de Serviço" value={(rawData.os as string) || "—"} />
                <Detail label="Data esperada" value={(rawData.dataEsperada as string) || "—"} />
                <Detail label="Telefone do solicitante" value={(rawData.telefone as string) || "—"} />
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Peças solicitadas ({pecasList.length}/{PECAS_MAX})
                  </h4>
                </div>
                {pecasList.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic mb-2">Nenhuma peça cadastrada.</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border mb-2">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left">Part Number</th>
                          <th className="px-3 py-2 text-left">Descrição do Item</th>
                          <th className="px-3 py-2 text-left">Especificação Técnica</th>
                          {canEditItens && <th className="px-3 py-2 w-12 text-center">Ações</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {pecasList.map((p, i) => (
                          <tr key={`${p.pn}-${i}`} className="border-t align-top">
                            <td className="px-3 py-2 font-mono text-xs">{p.pn || "—"}</td>
                            <td className="px-3 py-2">{p.descricao || "—"}</td>
                            <td className="px-3 py-2 text-xs">{p.especificacao || "—"}</td>
                            {canEditItens && (
                              <td className="px-3 py-2 text-center">
                                <button
                                  onClick={() => removePeca(i)}
                                  className="text-destructive hover:opacity-80"
                                  aria-label={`Remover peça ${p.pn}`}
                                  title="Remover peça"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {canEditItens && (
                  <div className="space-y-2">
                    <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
                      <input
                        value={novaPeca.pn}
                        onChange={(e) => setNovaPeca((s) => ({ ...s, pn: e.target.value }))}
                        placeholder="Part Number"
                        className="rounded-md border bg-background px-3 py-2 text-sm"
                        disabled={pecasList.length >= PECAS_MAX}
                      />
                      <input
                        value={novaPeca.descricao}
                        onChange={(e) => setNovaPeca((s) => ({ ...s, descricao: e.target.value }))}
                        placeholder="Descrição do Item"
                        className="rounded-md border bg-background px-3 py-2 text-sm"
                        disabled={pecasList.length >= PECAS_MAX}
                      />
                      <input
                        value={novaPeca.especificacao}
                        onChange={(e) => setNovaPeca((s) => ({ ...s, especificacao: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPeca(); } }}
                        placeholder="Especificação Técnica"
                        className="rounded-md border bg-background px-3 py-2 text-sm"
                        disabled={pecasList.length >= PECAS_MAX}
                      />
                      <button
                        onClick={addPeca}
                        disabled={pecasList.length >= PECAS_MAX}
                        className="inline-flex items-center justify-center gap-1 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Plus className="h-3.5 w-3.5" /> Adicionar Peça
                      </button>
                    </div>
                    {pecasList.length >= PECAS_MAX && (
                      <p className="text-xs text-muted-foreground">Limite máximo de {PECAS_MAX} itens atingido por solicitação</p>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}


          {card.kind === "materiais" && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Itens solicitados ({itensSolicitados.length})
                </h3>
                {canEditItens && !showAddMaterial && (
                  <button
                    onClick={() => setShowAddMaterial(true)}
                    className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium"
                  >
                    <Plus className="h-3.5 w-3.5" /> Incluir Material
                  </button>
                )}
              </div>

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
                            {canEditItens && (
                              <button
                                onClick={() => removeItemMaterial(i)}
                                className="text-destructive hover:opacity-80"
                                aria-label={`Remover item ${i + 1}`}
                                title="Remover item"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {canEditItens && showAddMaterial && (
                <div className="mt-3 rounded-lg border bg-muted/30 p-3 space-y-3">
                  <div className="text-xs font-semibold text-muted-foreground">Incluir novo material (base Apollo)</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className="text-[11px] text-muted-foreground">Descrição</label>
                      <input
                        list="kanban-apollo-mat-desc"
                        value={novoMaterial.material}
                        onChange={(e) => {
                          const v = e.target.value;
                          const m = MATERIAIS_APOLLO.find((x) => x.descricao.toLowerCase() === v.trim().toLowerCase());
                          setNovoMaterial((s) => ({ ...s, material: v, ...(m ? { codigo: m.codigo } : {}) }));
                        }}
                        placeholder="Buscar por descrição"
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      />
                      <datalist id="kanban-apollo-mat-desc">
                        {MATERIAIS_APOLLO.filter((m) => {
                          const q = novoMaterial.material.trim().toLowerCase();
                          return !q || m.descricao.toLowerCase().includes(q);
                        }).slice(0, 50).map((m) => (
                          <option key={m.codigo} value={m.descricao}>{m.codigo}</option>
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground">Código</label>
                      <input
                        list="kanban-apollo-mat-cod"
                        value={novoMaterial.codigo}
                        onChange={(e) => {
                          const v = e.target.value;
                          const m = MATERIAIS_APOLLO.find((x) => x.codigo === v.trim());
                          setNovoMaterial((s) => ({ ...s, codigo: v, ...(m ? { material: m.descricao } : {}) }));
                        }}
                        placeholder="Código Apollo"
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
                      />
                      <datalist id="kanban-apollo-mat-cod">
                        {MATERIAIS_APOLLO.filter((m) => {
                          const q = novoMaterial.codigo.trim().toLowerCase();
                          return !q || m.codigo.toLowerCase().startsWith(q);
                        }).slice(0, 50).map((m) => (
                          <option key={m.codigo} value={m.codigo}>{m.descricao}</option>
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground">Quantidade</label>
                      <input
                        type="number" min={1} step={1}
                        value={novoMaterial.quantidade}
                        onChange={(e) => setNovoMaterial((s) => ({ ...s, quantidade: e.target.value }))}
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground">Unidade</label>
                      <input
                        list="kanban-apollo-mat-uni"
                        value={novoMaterial.unidadeMedida}
                        onChange={(e) => setNovoMaterial((s) => ({ ...s, unidadeMedida: e.target.value.toUpperCase() }))}
                        placeholder="UN"
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                      />
                      <datalist id="kanban-apollo-mat-uni">
                        {UNIDADES_MEDIDA_APOLLO.map((u) => <option key={u} value={u} />)}
                      </datalist>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => { setShowAddMaterial(false); setNovoMaterial({ material: "", codigo: "", quantidade: "", unidadeMedida: "" }); }}
                      className="rounded-md border px-3 py-1.5 text-xs"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={addItemMaterial}
                      className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium"
                    >
                      <Plus className="h-3.5 w-3.5" /> Adicionar à solicitação
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}


          {/* ── Arquivos do solicitante (anexos originários do formulário) ── */}
          <RequesterFilesSection rawData={rawData} />




          {/* ── Observations log (Em cotação and onwards) ── */}
          {card.status !== "solicitacoes_abertas" && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <MessageSquare className="h-3.5 w-3.5" /> Histórico de Observações
                </h3>
                <button
                  type="button"
                  onClick={() => setObsExpanded((v) => !v)}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition"
                  aria-expanded={obsExpanded}
                  aria-controls="observacoes-panel"
                >
                  {obsExpanded ? "Recolher" : "Saiba mais"}
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-300 ${obsExpanded ? "rotate-180" : ""}`} />
                </button>
              </div>
              <div
                id="observacoes-panel"
                className={`overflow-hidden transition-all duration-300 ease-in-out ${obsExpanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"}`}
              >
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
                {!readOnly && (
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
                )}
              </div>
            </section>
          )}

          {/* ── Attachments (all columns) ── */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Paperclip className="h-3.5 w-3.5" /> Anexos de Orçamentos ({attachments.length})
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
                  {!readOnly && (
                    <button onClick={() => deleteAttachment(a)} className="text-destructive hover:opacity-80" aria-label="Remover" title="Remover">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {attachments.length === 0 && <p className="text-xs text-muted-foreground italic">Nenhum anexo.</p>}
            </div>
            {!readOnly && (
              <>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  onChange={(e) => uploadFiles(e.target.files)}
                  className="hidden"
                />
                <button
                  onClick={() => fileInput.current?.click()}
                  className="inline-flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm hover:bg-muted"
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar arquivos (seleção múltipla · qualquer formato · sem limite)
                </button>
              </>
            )}
          </section>


          {/* ── Suppliers map (Em cotação and onwards) ── */}
          {card.status !== "solicitacoes_abertas" && (
            <SuppliersTable
              suppliers={suppliers}
              readOnly={readOnly}
              onChange={upsertSupplier}
              onDelete={deleteSupplier}
              onChoose={chooseSupplier}
            />
          )}

          {/* ── Avançar etapa (até "Aguardando Aprovação") ── */}
          {!readOnly &&
            (card.status === "solicitacoes_abertas" ||
              card.status === "em_cotacao" ||
              (card.kind === "contratos" && card.status !== "cotacoes_aprovadas" && card.status !== "cotacoes_rejeitadas" && card.status !== "pedidos_gerados")) && (
            <AdvanceStageSection
              card={card}
              suppliers={suppliers}
              attachments={attachments}
              author={fullName || user?.email || "Comprador"}
              onMove={onMove}
              onClose={onClose}
              patch={patch}
              rawData={rawData}
              observations={observations}
            />
          )}

          {/* ── Rejeição rápida (Solicitação Aberta / Em Cotação) ── */}
          {canQuickReject && (
            <section className="rounded-xl border-2 border-red-300/70 bg-red-50/60 dark:bg-red-950/20 p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-300">
                  <XCircle className="h-4 w-4" />
                  Rejeitar solicitação nesta etapa
                </div>
                {!showQuickReject && (
                  <button
                    type="button"
                    onClick={() => setShowQuickReject(true)}
                    className="inline-flex items-center gap-2 rounded-md border border-red-600 text-red-700 hover:bg-red-600 hover:text-white px-3 py-1.5 text-xs font-semibold transition"
                  >
                    <XCircle className="h-4 w-4" /> Rejeitar Cotação
                  </button>
                )}
              </div>
              <p className="mt-2 text-[11px] text-red-700/80 dark:text-red-300/80">
                Use quando a solicitação for inviável ou inconsistente. O card será movido para <strong>Cotações Rejeitadas</strong> e a justificativa ficará registrada no histórico.
              </p>
              {showQuickReject && (
                <div className="mt-3 space-y-2">
                  <label className="text-xs font-medium text-red-800 dark:text-red-200">
                    Justificativa (obrigatória)
                  </label>
                  <textarea
                    value={quickRejectMotivo}
                    onChange={(e) => setQuickRejectMotivo(e.target.value)}
                    placeholder="Por que esta solicitação está sendo rejeitada?"
                    rows={3}
                    className="w-full rounded-md border border-red-300 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => { setShowQuickReject(false); setQuickRejectMotivo(""); }}
                      disabled={quickRejecting}
                      className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={confirmQuickReject}
                      disabled={quickRejecting || !quickRejectMotivo.trim()}
                      className="inline-flex items-center gap-2 rounded-md bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 text-xs font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <XCircle className="h-4 w-4" />
                      {quickRejecting ? "Rejeitando..." : "Confirmar rejeição"}
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function SuppliersTable({
  suppliers, readOnly = false, onChange, onDelete, onChoose,
}: {
  suppliers: Supplier[];
  readOnly?: boolean;
  onChange: (s: Supplier) => void;
  onDelete: (id: string) => void;
  onChoose: (id: string) => void;
}) {
  const [showModal, setShowModal] = useState(false);

  const handleConfirm = (data: {
    fornecedor: string; valor: string; prazo: string; condicao: string; observacao: string;
    cnpj: string; email: string; telefone: string;
  }) => {
    onChange({
      id: crypto.randomUUID(),
      fornecedor: data.fornecedor,
      cnpj: data.cnpj,
      email: data.email,
      telefone: data.telefone,
      valor: data.valor,
      prazo: data.prazo,
      condicao: data.condicao,
      observacao: data.observacao,
      chosen: false,
    });
    setShowModal(false);
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Mapa Comparativo de Fornecedores
        </h3>
        {!readOnly && (
          <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-1 text-xs rounded-md border px-2 py-1 hover:bg-muted">
            <Plus className="h-3 w-3" /> Fornecedor
          </button>
        )}
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
                <th className="p-2 text-left">Observações</th>
                {!readOnly && <th className="p-2 w-10"></th>}
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
                      disabled={readOnly}
                      onChange={() => onChoose(s.id)}
                      className="accent-emerald-600 disabled:opacity-50"
                    />
                  </td>
                  <td className="p-1">
                    <div className="px-2 py-1 text-sm font-medium" title={[s.cnpj, s.email, s.telefone].filter(Boolean).join(" · ")}>
                      {s.fornecedor || <span className="text-muted-foreground italic">Sem nome</span>}
                      {(s.cnpj || s.email || s.telefone) && (
                        <div className="text-[10px] text-muted-foreground font-normal mt-0.5 truncate">
                          {[s.cnpj, s.email, s.telefone].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                  </td>
                  {readOnly ? (
                    <>
                      <td className="p-2 text-sm">{s.valor || "—"}</td>
                      <td className="p-2 text-sm">{s.prazo || "—"}</td>
                      <td className="p-2 text-sm">{s.condicao || "—"}</td>
                      <td className="p-2 text-sm max-w-[220px]"><span className="line-clamp-2" title={s.observacao || ""}>{s.observacao || "—"}</span></td>
                    </>
                  ) : (
                    <>
                      <td className="p-1"><CellInput value={s.valor} onChange={(v) => onChange({ ...s, valor: v })} placeholder="R$ 0,00" /></td>
                      <td className="p-1"><CellInput value={s.prazo} onChange={(v) => onChange({ ...s, prazo: v })} placeholder="10 dias" /></td>
                      <td className="p-1"><CellInput value={s.condicao} onChange={(v) => onChange({ ...s, condicao: v })} placeholder="30/60" /></td>
                      <td className="p-1"><CellInput value={s.observacao ?? ""} onChange={(v) => onChange({ ...s, observacao: v })} placeholder="Observações" /></td>
                    </>
                  )}
                  {!readOnly && (
                    <td className="p-1 text-center">
                      <button onClick={() => onDelete(s.id)} className="text-destructive hover:opacity-80">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showModal && <NewSupplierModal onClose={() => setShowModal(false)} onConfirm={handleConfirm} />}
    </section>
  );
}

function NewSupplierModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (data: {
    fornecedor: string; valor: string; prazo: string; condicao: string; observacao: string;
    cnpj: string; email: string; telefone: string;
  }) => void;
}) {
  const [fornecedor, setFornecedor] = useState("");
  const [valor, setValor] = useState("");
  const [prazo, setPrazo] = useState("");
  const [condicao, setCondicao] = useState("");
  const [observacao, setObservacao] = useState("");
  const [showContato, setShowContato] = useState(false);
  const [cnpj, setCnpj] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const valorDigits = valor.replace(/\D/g, "");

  const submit = () => {
    const e: Record<string, string> = {};
    if (!fornecedor.trim()) e.fornecedor = "Informe o nome do fornecedor.";
    if (!valorDigits || Number(valorDigits) === 0) e.valor = "Informe o valor da cotação.";
    if (!cnpj.trim() || cnpj.replace(/\D/g, "").length !== 14) e.cnpj = "Informe o CNPJ do fornecedor.";
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "E-mail inválido.";
    if (telefone && telefone.replace(/\D/g, "").length < 10) e.telefone = "Telefone inválido.";
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    onConfirm({
      fornecedor: fornecedor.trim(),
      valor: valor.trim(),
      prazo: prazo.trim(),
      condicao: condicao.trim(),
      observacao: observacao.trim(),
      cnpj,
      email: email.trim(),
      telefone,
    });
  };

  const condicoesSugeridas = ["À vista", "Faturado 28 dias", "30 dias", "30/60", "30/60/90", "Boleto 15 dias"];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-xl border bg-background p-6 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Nova cotação de fornecedor</h3>
            <p className="text-xs text-muted-foreground">Preencha os dados da cotação. A linha do mapa comparativo será criada já completa.</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-3">
          <SupplierField label="Fornecedor *" error={errors.fornecedor}>
            <input
              value={fornecedor}
              onChange={(e) => setFornecedor(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="Razão social ou nome fantasia"
              autoFocus
            />
          </SupplierField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SupplierField label="Valor total *" error={errors.valor}>
              <input
                value={valor}
                onChange={(e) => setValor(maskCurrencyBRL(e.target.value))}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="R$ 0,00"
                inputMode="numeric"
              />
            </SupplierField>
            <SupplierField label="Prazo de entrega">
              <input
                value={prazo}
                onChange={(e) => setPrazo(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="Ex.: 5 dias úteis"
              />
            </SupplierField>
          </div>

          <SupplierField label="Condição / prazo de pagamento">
            <input
              list="cond-pgto-sugeridas"
              value={condicao}
              onChange={(e) => setCondicao(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="Ex.: Faturado 28 dias, À vista, 30/60"
            />
            <datalist id="cond-pgto-sugeridas">
              {condicoesSugeridas.map((c) => <option key={c} value={c} />)}
            </datalist>
          </SupplierField>

          <SupplierField label="CNPJ *" error={errors.cnpj}>
            <input value={cnpj} onChange={(e) => setCnpj(maskCnpjLocal(e.target.value))} className="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="00.000.000/0000-00" inputMode="numeric" />
          </SupplierField>

          <SupplierField label="Observações">
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={3}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-y"
              placeholder="Ressalvas, escopo, itens inclusos, validade da proposta…"
            />
          </SupplierField>

          <div className="pt-2 border-t">
            <button
              type="button"
              onClick={() => setShowContato((v) => !v)}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {showContato ? "− Ocultar" : "+ Adicionar"} e-mail e telefone (opcional)
            </button>
            {showContato && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <SupplierField label="E-mail" error={errors.email}>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="contato@fornecedor.com" />
                </SupplierField>
                <SupplierField label="Telefone" error={errors.telefone}>
                  <input value={telefone} onChange={(e) => setTelefone(maskPhoneLocal(e.target.value))} className="w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="(00) 00000-0000" inputMode="tel" />
                </SupplierField>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">Cancelar</button>
          <button onClick={submit} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">Adicionar ao Mapa</button>
        </div>
      </div>
    </div>
  );
}

function maskCurrencyBRL(v: string) {
  const digits = v.replace(/\D/g, "").slice(0, 14);
  if (!digits) return "";
  const n = Number(digits) / 100;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function SupplierField({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

function maskCnpjLocal(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function maskPhoneLocal(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{0,2})(\d{0,4})(\d{0,4}).*/, (_, a, b, c) => [a && `(${a}`, a && a.length === 2 ? ") " : "", b, c && `-${c}`].filter(Boolean).join(""));
  return d.replace(/(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3");
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

/* ─────────────── Advance Stage Section (Buyer) ─────────────── */

function AdvanceStageSection({
  card, suppliers, attachments, author, onMove, onClose, patch, rawData, observations,
}: {
  card: Card;
  suppliers: Supplier[];
  attachments: Attachment[];
  author: string;
  onMove: (c: Card, s: Status) => Promise<void>;
  onClose: () => void;
  patch: (p: Partial<Card>) => Promise<void>;
  rawData: Record<string, unknown>;
  observations: Observation[];
}) {
  const [askingJust, setAskingJust] = useState(false);
  const [justText, setJustText] = useState("");
  const [busy, setBusy] = useState(false);

  const isContrato = card.kind === "contratos";
  const isToCotacao = card.status === "solicitacoes_abertas";
  const hasSupplier = suppliers.length >= 1;
  const hasAttachment = attachments.length >= 1;
  const blocked = !isContrato && !isToCotacao && (!hasSupplier || !hasAttachment);
  const isSingleSupplier = !isContrato && !isToCotacao && hasSupplier && hasAttachment && suppliers.length <= 1;

  const blockReason = !hasSupplier && !hasAttachment
    ? "É necessário cadastrar pelo menos 1 fornecedor no mapa comparativo e anexar pelo menos 1 orçamento."
    : !hasSupplier
    ? "Cadastre pelo menos 1 fornecedor no mapa comparativo para avançar."
    : "Anexe pelo menos 1 orçamento para avançar.";

  const doAdvance = async () => {
    setBusy(true);
    try {
      const next: Status = isToCotacao ? "em_cotacao" : "aguardando_aprovacao";

      if (isSingleSupplier) {
        const at = new Date().toISOString();
        const compliance = (rawData.compliance as Record<string, unknown> | undefined) ?? {};
        const nextData = {
          ...rawData,
          compliance: {
            ...compliance,
            justificativa_fornecedor_unico_comprador: {
              texto: justText.trim(),
              registrado_em: at,
              autor: author,
            },
          },
        };
        const log: Observation = {
          at,
          author,
          text: `⚠️ Justificativa do Comprador (Fornecedor Único): ${justText.trim()}`,
        };
        await patch({
          data: nextData as never,
          observations: [...observations, log] as never,
        });
      }

      await onMove(card, next);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  if (isContrato) {
    return (
      <section className="pt-4 border-t space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-muted-foreground">
            Após revisar as informações e baixar os documentos, aprove o contrato para liberá-lo à integração com o Apollo.
            <br />
            O card irá diretamente para <strong>Cotações Aprovadas</strong>, pulando as etapas intermediárias.
          </p>
          <button
            onClick={async () => {
              setBusy(true);
              try {
                await onMove(card, "cotacoes_aprovadas");
                onClose();
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60"
          >
            <CheckCircle2 className="h-4 w-4" />
            {busy ? "Aprovando..." : "Aprovar Contrato"}
          </button>
        </div>
      </section>
    );
  }

  if (askingJust) {
    return (
      <section className="pt-4 border-t space-y-3">
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3">
          <label className="text-xs font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" />
            Justificativa do Comprador — Fornecedor Único <span className="text-red-600">*</span>
          </label>
          <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5">
            Há apenas {suppliers.length} fornecedor cotado. Justifique o avanço sem mapa comparativo (será registrado no histórico de compliance).
          </p>
          <textarea
            value={justText}
            onChange={(e) => setJustText(e.target.value)}
            rows={3}
            placeholder="Ex: fornecedor exclusivo / homologação técnica / urgência operacional…"
            className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={() => setAskingJust(false)} disabled={busy} className="rounded-md border px-3 py-2 text-sm hover:bg-muted">Cancelar</button>
          <button
            onClick={doAdvance}
            disabled={busy || justText.trim().length < 5}
            className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60"
          >
            Confirmar e Avançar →
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="pt-4 border-t space-y-2">
      {blocked && (
        <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-xs text-red-800 dark:text-red-200 flex items-start gap-2">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{blockReason}</span>
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {isToCotacao
            ? "Avançar moverá o card para Em cotação."
            : blocked
            ? "Avanço bloqueado até cumprir os requisitos acima."
            : isSingleSupplier
            ? "Apenas 1 fornecedor cotado — será necessária justificativa para avançar."
            : "Avançar moverá o card para Aguardando Aprovação."}
        </p>
        <button
          onClick={async () => {
            if (blocked) {
              toast.error(blockReason);
              return;
            }
            if (isSingleSupplier) { setAskingJust(true); return; }
            setBusy(true);
            try {
              const next: Status = isToCotacao ? "em_cotacao" : "aguardando_aprovacao";
              await onMove(card, next);
              onClose();
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy || blocked}
          className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60"
        >
          Avançar etapa →
        </button>
      </div>
    </section>
  );
}



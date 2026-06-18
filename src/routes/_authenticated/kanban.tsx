import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { X, Package, FileSignature, Truck, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { KIND_LABEL, STATUS_COLUMNS } from "@/lib/cards";
import type { Database } from "@/integrations/supabase/types";

type Card = Database["public"]["Tables"]["kanban_cards"]["Row"];
type Status = Database["public"]["Enums"]["card_status"];

export const Route = createFileRoute("/_authenticated/kanban")({
  head: () => ({ meta: [{ title: "Painel Kanban — Motormac" }] }),
  component: KanbanPage,
});

const iconFor = { compras: Package, contratos: FileSignature, frete: Truck } as const;

function KanbanPage() {
  const { isBuyer } = useAuth();
  const [cards, setCards] = useState<Card[]>([]);
  const [open, setOpen] = useState<Card | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    let active = true;
    const load = () =>
      supabase.from("kanban_cards").select("*").order("created_at", { ascending: false })
        .then(({ data }) => { if (active) setCards(data ?? []); });
    load();
    const channel = supabase
      .channel("kanban_cards_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "kanban_cards" }, (payload) => {
        setCards((prev) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as Card;
            if (prev.some((c) => c.id === row.id)) return prev;
            toast.success(`Novo cartão: ${row.title}`);
            return [row, ...prev];
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

  if (!isBuyer) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <AlertCircle className="h-10 w-10 mx-auto text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-semibold">Acesso restrito a Compradores</h1>
        <p className="mt-2 text-sm text-muted-foreground">Aguarde a aprovação do seu cadastro pelos administradores.</p>
      </div>
    );
  }

  const onStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    if (!e.over) return;
    const cardId = String(e.active.id);
    const newStatus = String(e.over.id) as Status;
    const card = cards.find((c) => c.id === cardId);
    if (!card || card.status === newStatus) return;
    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, status: newStatus } : c)));
    const { error } = await supabase.from("kanban_cards").update({ status: newStatus }).eq("id", cardId);
    if (error) {
      toast.error("Falha ao atualizar status: " + error.message);
      setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, status: card.status } : c)));
    } else {
      toast.success(`Movido para "${STATUS_COLUMNS.find((s) => s.id === newStatus)?.label}"`);
    }
  };

  const activeCard = cards.find((c) => c.id === activeId) || null;

  return (
    <div className="mx-auto max-w-[1600px] px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Painel Kanban Operacional</h1>
        <p className="text-sm text-muted-foreground mt-1">Arraste os cartões entre as colunas para atualizar o status.</p>
      </div>

      <DndContext sensors={sensors} onDragStart={onStart} onDragEnd={onEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 md:grid md:grid-cols-2 md:overflow-visible xl:grid-cols-4 snap-x snap-mandatory">
          {STATUS_COLUMNS.map((col) => (
            <div key={col.id} className="snap-start shrink-0 w-[85vw] sm:w-[60vw] md:w-auto">
              <Column id={col.id} label={col.label} tone={col.tone}
                cards={cards.filter((c) => c.status === col.id)} onOpen={setOpen} />
            </div>
          ))}
        </div>
        <DragOverlay>{activeCard && <CardView card={activeCard} dragging />}</DragOverlay>
      </DndContext>

      {open && <CardModal card={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Column({ id, label, tone, cards, onOpen }: { id: Status; label: string; tone: string; cards: Card[]; onOpen: (c: Card) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`rounded-2xl border bg-card/60 p-3 min-h-[60vh] transition ${isOver ? "ring-2 ring-primary/40 bg-accent/40" : ""}`}>
      <div className="flex items-center justify-between px-2 pb-3 border-b mb-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: tone }} />
          <h3 className="font-semibold text-sm">{label}</h3>
        </div>
        <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{cards.length}</span>
      </div>
      <div className="space-y-2">
        {cards.map((c) => <DraggableCard key={c.id} card={c} onOpen={() => onOpen(c)} />)}
        {cards.length === 0 && <div className="text-xs text-muted-foreground text-center py-8">Sem cartões aqui.</div>}
      </div>
    </div>
  );
}

function DraggableCard({ card, onOpen }: { card: Card; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners}
      onClick={(e) => { if (!isDragging) { e.stopPropagation(); onOpen(); } }}
      className={`${isDragging ? "opacity-30" : ""}`}>
      <CardView card={card} />
    </div>
  );
}

function CardView({ card, dragging = false }: { card: Card; dragging?: boolean }) {
  const Icon = iconFor[card.kind];
  return (
    <div className={`rounded-lg border bg-card p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition ${dragging ? "rotate-2 shadow-xl" : ""}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
        <Icon className="h-3.5 w-3.5" />
        <span className="font-medium uppercase tracking-wider">{KIND_LABEL[card.kind]}</span>
      </div>
      <h4 className="text-sm font-semibold leading-snug line-clamp-2">{card.title}</h4>
      {card.summary && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{card.summary}</p>}
      <div className="flex items-center justify-between mt-3 text-[11px] text-muted-foreground">
        <span>{card.unidade ?? "—"}</span>
        <span>{new Date(card.created_at).toLocaleDateString("pt-BR")}</span>
      </div>
    </div>
  );
}

function CardModal({ card, onClose }: { card: Card; onClose: () => void }) {
  const Icon = iconFor[card.kind];
  const entries = Object.entries((card.data as Record<string, unknown>) ?? {});
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-accent text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{KIND_LABEL[card.kind]}</div>
            <h2 className="text-xl font-semibold mt-0.5">{card.title}</h2>
            {card.summary && <p className="text-sm text-muted-foreground mt-1">{card.summary}</p>}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-6 overflow-y-auto space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Detail label="Solicitante" value={card.requester_name} />
            <Detail label="E-mail" value={card.requester_email} />
            <Detail label="Unidade" value={card.unidade} />
            <Detail label="Empresa" value={card.empresa} />
            <Detail label="Status" value={STATUS_COLUMNS.find((s) => s.id === card.status)?.label} />
            <Detail label="Criado em" value={new Date(card.created_at).toLocaleString("pt-BR")} />
          </div>
          {entries.length > 0 && (
            <div className="pt-4 border-t">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Dados do formulário</h3>
              <dl className="grid gap-2 text-sm">
                {entries.map(([k, v]) => (
                  <div key={k} className="grid grid-cols-3 gap-2">
                    <dt className="text-muted-foreground capitalize">{k}</dt>
                    <dd className="col-span-2 break-words">{String(v ?? "—")}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </div>
    </div>
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

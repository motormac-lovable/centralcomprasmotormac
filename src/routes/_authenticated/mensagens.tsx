import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Inbox, Loader2, Lock, MessagesSquare, Search, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  buyerLabel,
  formatMessageDate,
  markConversationRead,
  markConversationsRead,
  sendCardMessage,
  type CardMessage,
} from "@/lib/messages";

export const Route = createFileRoute("/_authenticated/mensagens")({
  validateSearch: (search: Record<string, unknown>) => ({
    solicitacaoId: typeof search.solicitacaoId === "string" && search.solicitacaoId ? search.solicitacaoId : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Minhas Mensagens — Motormac" },
      { name: "description", content: "Converse com o comprador responsável pelas suas solicitações de compra." },
      { property: "og:title", content: "Minhas Mensagens — Motormac" },
      { property: "og:description", content: "Canal de comunicação entre solicitantes e compradores da Central de Compras." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MensagensPage,
});

type Row = CardMessage & {
  kanban_cards: { codigo_unico: string | null; title: string | null; buyer_name: string | null } | null;
};

type Conversation = {
  cardId: string;
  codigo: string | null;
  title: string | null;
  buyer: string | null;
  messages: Row[];
  unread: number;
  lastAt: string;
};

function MensagensPage() {
  const { solicitacaoId } = Route.useSearch();
  const { user, fullName, isBuyer, isAdmin, isOwner } = useAuth();
  const [lockedCard, setLockedCard] = useState<{ id: string; codigo_unico: string | null; title: string | null; buyer_name: string | null } | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [phone, setPhone] = useState("");

  const buyerOnly = isBuyer && !isAdmin && !isOwner;

  // Busca apenas o necessário: com contexto travado, só as mensagens daquele card.
  const load = async () => {
    if (!user?.id) return;
    let q = supabase
      .from("card_messages")
      .select("*, kanban_cards(codigo_unico, title, buyer_name)")
      .order("created_at", { ascending: true });
    if (solicitacaoId) q = q.eq("card_id", solicitacaoId);
    const { data } = await q;
    setRows((data ?? []) as Row[]);
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, solicitacaoId]);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("profiles")
      .select("phone")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setPhone((data as { phone?: string } | null)?.phone ?? ""));
    const ch = supabase
      .channel("card-messages-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "card_messages" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    if (!solicitacaoId) {
      setLockedCard(null);
      return;
    }
    supabase
      .from("kanban_cards")
      .select("id, codigo_unico, title, buyer_name")
      .eq("id", solicitacaoId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setLockedCard((data as typeof lockedCard) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [solicitacaoId]);

  const conversations = useMemo<Conversation[]>(() => {
    // O histórico pertence à SOLICITAÇÃO: o vínculo é sempre o comprador ATUAL do card
    // (kanban_cards.buyer_name). Ao trocar o comprador, o novo responsável passa a
    // enxergar todo o histórico anterior daquela solicitação.
    const currentBuyerByCard = new Map<string, string | null>();
    for (const r of rows) {
      if (r.kanban_cards) currentBuyerByCard.set(r.card_id, r.kanban_cards.buyer_name ?? null);
    }
    const scoped = rows.filter((r) => {
      if (solicitacaoId && r.card_id !== solicitacaoId) return false;
      if (!buyerOnly) return true;
      const buyer = currentBuyerByCard.get(r.card_id) ?? r.kanban_cards?.buyer_name ?? null;
      // Comprador: conversas das solicitações sob sua responsabilidade + fila geral.
      return !buyer || (fullName && buyer.toLowerCase() === fullName.toLowerCase()) || r.sender_id === user?.id;
    });

    const map = new Map<string, Conversation>();
    for (const r of scoped) {
      const c = map.get(r.card_id) ?? {
        cardId: r.card_id,
        codigo: r.kanban_cards?.codigo_unico ?? null,
        title: r.kanban_cards?.title ?? null,
        buyer: r.kanban_cards?.buyer_name ?? r.buyer_name ?? null,
        messages: [],
        unread: 0,
        lastAt: r.created_at,
      };
      c.messages.push(r);
      if (!r.read_at && r.sender_id !== user?.id) c.unread += 1;
      if (r.created_at > c.lastAt) c.lastAt = r.created_at;
      map.set(r.card_id, c);
    }
    if (solicitacaoId && !map.has(solicitacaoId)) {
      map.set(solicitacaoId, {
        cardId: solicitacaoId,
        codigo: lockedCard?.codigo_unico ?? null,
        title: lockedCard?.title ?? null,
        buyer: lockedCard?.buyer_name ?? null,
        messages: [],
        unread: 0,
        lastAt: new Date().toISOString(),
      });
    }
    const list = [...map.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
    if (solicitacaoId) return list;
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) =>
        (c.codigo ?? "").toLowerCase().includes(q) ||
        (c.title ?? "").toLowerCase().includes(q) ||
        (c.buyer ?? "").toLowerCase().includes(q) ||
        c.messages.some((m) => m.body.toLowerCase().includes(q) || m.sender_name.toLowerCase().includes(q)),
    );
  }, [rows, query, buyerOnly, fullName, user?.id, solicitacaoId, lockedCard]);

  const active = solicitacaoId
    ? conversations.find((c) => c.cardId === solicitacaoId) ?? null
    : conversations.find((c) => c.cardId === activeId) ?? conversations[0] ?? null;

  // A conversa aberta é marcada como lida imediatamente.
  useEffect(() => {
    if (!active || !user?.id || active.unread === 0) return;
    const cardId = active.cardId;
    const uid = user.id;
    // Marca como lido de forma otimista (sem recarregar a lista inteira).
    const now = new Date().toISOString();
    setRows((prev) =>
      prev.map((r) => (r.card_id === cardId && r.sender_id !== uid && !r.read_at ? { ...r, read_at: now } : r)),
    );
    void markConversationRead(cardId, uid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.cardId, active?.unread, user?.id]);

  // Visualização da tela: após alguns instantes, todas as conversas listadas são
  // marcadas como lidas — o badge do menu some e só reaparece com mensagem nova.
  const unreadCardIds = conversations.filter((c) => c.unread > 0).map((c) => c.cardId).join(",");
  useEffect(() => {
    const uid = user?.id;
    if (!uid || !unreadCardIds) return;
    const ids = unreadCardIds.split(",");
    const t = setTimeout(() => {
      const now = new Date().toISOString();
      setRows((prev) =>
        prev.map((r) => (ids.includes(r.card_id) && r.sender_id !== uid && !r.read_at ? { ...r, read_at: now } : r)),
      );
      void markConversationsRead(ids, uid);
    }, 1500);
    return () => clearTimeout(t);
  }, [unreadCardIds, user?.id]);

  const submitReply = async () => {
    if (!active || !user?.id || !reply.trim() || sending) return;
    const body = reply;
    const senderRole = isOwner || isAdmin || isBuyer ? "comprador" : isApprover ? "aprovador" : "solicitante";
    const senderName = fullName || user.email || "";
    const optimistic: Row = {
      id: `tmp-${Date.now()}`,
      card_id: active.cardId,
      sender_id: user.id,
      sender_name: senderName,
      sender_email: user.email || "",
      sender_phone: phone,
      sender_role: senderRole,
      buyer_name: active.buyer,
      body,
      read_at: null,
      created_at: new Date().toISOString(),
      kanban_cards: { codigo_unico: active.codigo, title: active.title, buyer_name: active.buyer },
    };
    // Feedback instantâneo: mensagem aparece na thread antes da confirmação do servidor.
    setReply("");
    setRows((prev) => [...prev, optimistic]);
    setSending(true);
    try {
      await sendCardMessage({
        card: { id: active.cardId, codigo_unico: active.codigo, buyer_name: active.buyer },
        body,
        sender: {
          id: user.id,
          name: senderName,
          email: user.email || "",
          phone,
          role: senderRole,
        },
      });
      void load();
    } catch (err) {
      setRows((prev) => prev.filter((r) => r.id !== optimistic.id));
      setReply(body);
      toast.error((err as Error).message || "Não foi possível enviar a mensagem.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 rounded-full bg-accent text-accent-foreground px-3 py-1 text-xs font-medium mb-3">
          <MessagesSquare className="h-3 w-3" />{" "}
          {isOwner || isAdmin ? "Visão de gestão — todas as conversas" : isBuyer ? "Visão do Comprador" : "Visão do Solicitante"}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Minhas Mensagens</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Comunicação vinculada a cada solicitação, entre solicitantes e o comprador responsável.
        </p>
      </div>

      {solicitacaoId ? (
        <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                <Lock className="h-3.5 w-3.5" /> Contexto travado nesta solicitação
              </div>
              <p className="text-sm font-semibold mt-1">
                Conversa referente à Solicitação nº{" "}
                {active?.codigo ?? lockedCard?.codigo_unico ?? solicitacaoId} —{" "}
                {active?.title ?? lockedCard?.title ?? "Solicitação"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Todas as mensagens enviadas aqui ficam vinculadas exclusivamente a esta solicitação.
              </p>
            </div>
            <Link
              to="/mensagens"
              search={{ solicitacaoId: undefined }}
              className="shrink-0 rounded-md border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              Ver todas as conversas
            </Link>
          </div>
        </div>
      ) : (
      <div className="mb-4 relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por código, título, comprador ou conteúdo…"
          className="w-full rounded-md border bg-card pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>
      )}


      {loading && !solicitacaoId ? (
        <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">Carregando…</div>
      ) : conversations.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card/50 p-12 text-center">
          <Inbox className="h-10 w-10 mx-auto text-muted-foreground" />
          <h2 className="mt-4 text-lg font-medium">Nenhuma mensagem por aqui</h2>
          <p className="text-sm text-muted-foreground mt-1">
            As conversas iniciadas em “Minhas Solicitações” aparecerão nesta tela.
          </p>
        </div>
      ) : (
        <div className={`grid gap-4 ${solicitacaoId ? "" : "md:grid-cols-[300px_1fr]"}`}>
          {!solicitacaoId && (
          <ul className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
            {conversations.map((c) => (
              <li key={c.cardId}>
                <button
                  onClick={() => setActiveId(c.cardId)}
                  className={`w-full text-left rounded-xl border p-3 transition ${
                    active?.cardId === c.cardId ? "bg-muted border-primary/40" : "bg-card hover:bg-muted/60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs">{c.codigo ? `#${c.codigo}` : "—"}</span>
                    {c.unread > 0 && (
                      <span className="bg-red-600 text-white text-[10px] font-bold h-5 min-w-5 px-1 rounded-full flex items-center justify-center">
                        {c.unread > 99 ? "99+" : c.unread}
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-medium truncate mt-0.5">{c.title ?? "Solicitação"}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{buyerLabel(c.buyer)}</div>
                  <div className="text-[11px] text-muted-foreground mt-1 truncate">
                    {c.messages[c.messages.length - 1]?.body}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          )}

          {active && (
            <div className="rounded-2xl border bg-card shadow-sm flex flex-col max-h-[70vh]">
              <div className="border-b p-4">
                <div className="text-sm font-semibold">
                  {active.codigo ? `#${active.codigo} · ` : ""}
                  {active.title ?? "Solicitação"}
                </div>
                <div className="text-xs text-muted-foreground">{buyerLabel(active.buyer)}</div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {active.messages.map((m) => {
                  const mine = m.sender_id === user?.id;
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                          mine ? "bg-primary text-primary-foreground" : "bg-muted"
                        }`}
                      >
                        <div className="text-[11px] font-medium opacity-80">
                          {m.sender_name || m.sender_email}
                          {m.sender_role === "comprador" ? " · Comprador" : " · Solicitante"}
                        </div>
                        <p className="whitespace-pre-wrap mt-0.5">{m.body}</p>
                        <div className="text-[10px] opacity-70 mt-1">{formatMessageDate(m.created_at)}</div>
                        {!mine && (m.sender_phone || m.sender_email) && (
                          <div className="text-[10px] opacity-70">
                            {m.sender_email}
                            {m.sender_phone ? ` · ${m.sender_phone}` : ""}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t p-3 flex items-end gap-2">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={2}
                  placeholder="Escreva sua resposta…"
                  className="flex-1 rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                />
                <button
                  onClick={submitReply}
                  disabled={sending || !reply.trim()}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Enviar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

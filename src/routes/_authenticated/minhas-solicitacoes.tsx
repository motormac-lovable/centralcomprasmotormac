import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment as FragmentRow, useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList, Inbox, RefreshCw, Search, Paperclip, Loader2, Eye, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { KIND_LABEL, STATUS_COLUMNS, type Status } from "@/lib/cards";
import type { Database } from "@/integrations/supabase/types";
import { DATA_DE_CORTE_PRODUCAO_ISO } from "@/lib/cutoff";
import { uploadRequesterFiles } from "@/lib/requester-files";
import { COMPLEMENTARY_MAX_FILES, COMPLEMENTARY_MAX_SIZE_MB, countExistingFiles } from "@/lib/complementary-upload";
import { InvoiceDocumentsSection } from "@/components/InvoiceDocumentsSection";
import { getFaturamento } from "@/lib/invoice-documents";
import { RequestDetailsModal, type DetailCard } from "@/components/RequestDetailsModal";
import { SendMessageModal } from "@/components/SendMessageModal";
import type { MessageCardRef } from "@/lib/messages";

function MessageButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Enviar mensagem ao comprador responsável"
      aria-label="Enviar mensagem ao comprador responsável"
      className="inline-flex items-center gap-1.5 rounded-md border border-input bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition"
    >
      <MessageSquare className="h-3.5 w-3.5" />
      Mensagem
    </button>
  );
}

function ViewButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Visualizar detalhes"
      aria-label="Visualizar detalhes da solicitação"
      className="inline-flex items-center gap-1.5 rounded-md border border-input bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition"
    >
      <Eye className="h-3.5 w-3.5 shrink-0" />
      <span className="hidden xl:inline">Visualizar</span>
    </button>
  );
}


type Card = Pick<
  Database["public"]["Tables"]["kanban_cards"]["Row"],
  "id" | "kind" | "title" | "summary" | "status" | "created_at" | "codigo_unico" | "numero_pedido_linx" | "requester_email" | "requester_id" | "data" | "buyer_name" | "status_changed_at"
>;

export const Route = createFileRoute("/_authenticated/minhas-solicitacoes")({
  head: () => ({
    meta: [
      { title: "Minhas Solicitações — Motormac" },
      { name: "description", content: "Acompanhe o status em tempo real das suas solicitações abertas." },
    ],
  }),
  component: MinhasSolicitacoesPage,
});

const STATUS_META: Record<Status, { label: string; tone: string }> =
  STATUS_COLUMNS.reduce((acc, c) => {
    acc[c.id] = { label: c.label, tone: c.tone };
    return acc;
  }, {} as Record<Status, { label: string; tone: string }>);

const UPLOAD_ALLOWED_STATUSES: Status[] = ["solicitacoes_abertas", "em_cotacao"];

function formatBR(iso: string | null | undefined) {
  if (!iso) return "-";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} às ${hh}:${mi}`;
}

function ComplementaryUploadButton({
  card,
  kind,
  disabled,
  existingCount,
  onUploaded,
}: {
  card: { id: string };
  kind: Database["public"]["Enums"]["card_kind"];
  disabled: boolean;
  existingCount: number;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const maxFiles = COMPLEMENTARY_MAX_FILES[kind] ?? 1;
  const maxSizeMB = COMPLEMENTARY_MAX_SIZE_MB[kind] ?? 10;
  const remaining = Math.max(0, maxFiles - existingCount);
  const noSlotsLeft = remaining <= 0;
  const effectivelyDisabled = disabled || noSlotsLeft;

  const handlePick = () => {
    if (effectivelyDisabled || busy) return;
    inputRef.current?.click();
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? Array.from(e.target.files) : [];
    if (inputRef.current) inputRef.current.value = "";
    if (list.length === 0) return;

    if (list.length > remaining) {
      toast.error(`Número de arquivos excedido. Limite total: ${maxFiles} (restam ${remaining}).`);
      return;
    }
    const tooBig = list.find((f) => f.size > maxSizeMB * 1024 * 1024);
    if (tooBig) {
      toast.error(`"${tooBig.name}" excede ${maxSizeMB}MB.`);
      return;
    }

    setBusy(true);
    try {
      const uploaded = await uploadRequesterFiles(
        kind,
        list.map((f) => ({ name: f.name, size: f.size, type: f.type, file: f })),
        "Complementar",
      );
      const now = new Date().toISOString();
      const results = await Promise.all(
        uploaded.map((u) =>
          supabase.rpc("append_requester_file", {
            _card_id: card.id,
            _file: {
              name: u.name,
              path: u.path,
              size: u.size,
              type: u.type,
              category: "Complementar",
              uploaded_at: now,
            } as never,
          }),
        ),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
      toast.success(
        uploaded.length === 1
          ? "Arquivo complementar anexado à solicitação."
          : `${uploaded.length} arquivos complementares anexados à solicitação.`,
      );
      onUploaded();
    } catch (err) {
      const msg = (err as Error).message || "Falha ao anexar arquivo";
      toast.error(msg.includes("Período de upload") ? "Período de upload expirado" : msg);
    } finally {
      setBusy(false);
    }
  };

  const tooltip = disabled
    ? "Período de upload expirado"
    : noSlotsLeft
    ? `Limite de ${maxFiles} anexos atingido`
    : `Anexar arquivos complementares (${remaining} restante${remaining === 1 ? "" : "s"} de ${maxFiles})`;

  return (
    <div className="relative group shrink-0 inline-block">
      <button
        type="button"
        onClick={handlePick}
        aria-label={tooltip}
        title={tooltip}
        disabled={effectivelyDisabled || busy}
        className={
          "inline-flex items-center justify-center h-8 w-8 rounded-md border transition " +
          (effectivelyDisabled
            ? "bg-muted text-muted-foreground/60 border-dashed cursor-not-allowed"
            : "bg-card hover:bg-muted text-foreground border-input")
        }
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 -top-9 z-10 whitespace-nowrap rounded-md bg-foreground text-background text-[11px] font-medium px-2 py-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 group-active:opacity-100 transition"
      >
        {tooltip}
      </span>
      <input ref={inputRef} type="file" multiple className="hidden" onChange={handleChange} />
    </div>
  );
}

function MinhasSolicitacoesPage() {
  const { user, fullName, isApprover, isBuyer, isOwner, isAdmin, approverDepartments } = useAuth();
  const [items, setItems] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<DetailCard | null>(null);
  const [msgCard, setMsgCard] = useState<MessageCardRef | null>(null);


  const approverScope = isApprover && !isOwner && !isAdmin && !isBuyer;
  const ownerScope = isOwner;

  const reload = async () => {
    if (!user?.id) return;
    setLoading(true);
    let q = supabase
      .from("kanban_cards")
      .select("id, kind, title, summary, status, created_at, codigo_unico, numero_pedido_linx, requester_email, requester_id, data, buyer_name, status_changed_at")
      .gte("created_at", DATA_DE_CORTE_PRODUCAO_ISO)
      .order("created_at", { ascending: false });

    if (ownerScope) {
      // Proprietário enxerga tudo em tempo real.
    } else if (approverScope && approverDepartments.length > 0) {
      const deptList = approverDepartments.map((d) => `"${d.replace(/"/g, '\\"')}"`).join(",");
      const emailFilter = user.email ? `,requester_email.ilike.${user.email}` : "";
      q = q.or(`requester_id.eq.${user.id}${emailFilter},data->>departamento.in.(${deptList})`);
    } else {
      // Solicitante: mesma regra do Histórico — casa por ID de auth (fonte de
      // verdade do Kanban) e também por e-mail para cobrir cards antigos e
      // envios via mobile em que o e-mail digitado difere do e-mail de login.
      const emailFilter = user.email ? `,requester_email.ilike.${user.email}` : "";
      q = q.or(`requester_id.eq.${user.id}${emailFilter}`);
    }

    const { data } = await q;
    setItems((data ?? []) as Card[]);
    setLoading(false);
  };

  useEffect(() => {
    reload();
    const ch = supabase
      .channel("minhas-solicitacoes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "kanban_cards" },
        () => reload(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.email, approverScope, ownerScope, approverDepartments.join("|")]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const dept = ((it.data as any)?.departamento as string | undefined) ?? "";
      return (
        it.title?.toLowerCase().includes(q) ||
        it.summary?.toLowerCase().includes(q) ||
        it.codigo_unico?.toLowerCase().includes(q) ||
        it.numero_pedido_linx?.toLowerCase().includes(q) ||
        it.requester_email?.toLowerCase().includes(q) ||
        it.buyer_name?.toLowerCase().includes(q) ||
        dept.toLowerCase().includes(q)
      );
    });
  }, [items, query]);

  const canAttach = (it: Card) => {
    if (it.kind !== "materiais" && it.kind !== "compras") return { show: false, enabled: false };
    const isOwnRow =
      (!!user?.id && it.requester_id === user.id) ||
      (!!user?.email && !!it.requester_email && it.requester_email.toLowerCase() === user.email.toLowerCase());
    if (!isOwnRow && !ownerScope) return { show: false, enabled: false };
    return { show: true, enabled: UPLOAD_ALLOWED_STATUSES.includes(it.status) };
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 py-10">
      <div className="flex flex-wrap items-end justify-between mb-8 gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-accent text-accent-foreground px-3 py-1 text-xs font-medium mb-3">
            <ClipboardList className="h-3 w-3" /> {ownerScope ? "Visão do Proprietário" : approverScope ? "Visão do Aprovador" : "Visão do Solicitante"}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Minhas Solicitações</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {fullName ? `${fullName} · ` : ""}
            {ownerScope
              ? "Todas as solicitações emitidas no sistema — atualizado em tempo real."
              : approverScope
              ? `Solicitações dos departamentos sob sua alçada${approverDepartments.length ? ` (${approverDepartments.join(", ")})` : ""} — atualizado em tempo real.`
              : "Acompanhamento em tempo real do status no fluxo de compras."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={reload}
            className="inline-flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
            title="Recarregar"
          >
            <RefreshCw className="h-4 w-4" /> Atualizar
          </button>
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Nova solicitação
          </Link>
        </div>
      </div>

      <div className="mb-4 relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por título, código, pedido, solicitante, comprador ou departamento…"
          className="w-full rounded-md border bg-card pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {loading ? (
        <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">Carregando…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card/50 p-12 text-center">
          <Inbox className="h-10 w-10 mx-auto text-muted-foreground" />
          <h2 className="mt-4 text-lg font-medium">
            {items.length === 0 ? "Nenhuma solicitação registrada" : "Nenhum resultado para a busca"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {items.length === 0
              ? "As requisições aparecerão aqui com o status atualizado em tempo real."
              : "Ajuste os termos de busca para ver mais resultados."}
          </p>
          {items.length === 0 && (
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground mt-6 hover:bg-primary/90"
            >
              Abrir primeira solicitação
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* Desktop: tabela */}
          <div className="hidden md:block rounded-2xl border bg-card shadow-sm overflow-hidden">
            <div className="w-full overflow-x-auto lg:overflow-x-visible">
              <table className="w-full table-fixed text-sm">
                <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-2 py-3 w-[80px]">Código</th>
                    <th className="text-left px-2 py-3 w-[96px]">Tipo</th>
                    <th className="text-left px-2 py-3 w-[260px]">Título / Resumo</th>
                    {(approverScope || ownerScope) && <th className="text-left px-2 py-3 w-[140px]">Solicitante</th>}
                    <th className="text-left px-2 py-3 w-[120px]">Comprador</th>
                    <th className="text-left px-2 py-3 w-[100px]">Última mov.</th>
                    <th className="text-left px-2 py-3 w-[100px]">Status</th>
                    <th className="text-left px-2 py-3 w-[84px]">Pedido ERP</th>
                    <th className="text-left px-2 py-3 w-[64px]">Anexar</th>
                    <th className="text-left px-2 py-3d w-[172px]">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((it) => {
                    const meta = STATUS_META[it.status];
                    const dept = ((it.data as any)?.departamento as string | undefined) ?? "";
                    const att = canAttach(it);
                    const fat = getFaturamento(it.data);
                    const hasFaturamento =
                      it.status === "pedidos_gerados" &&
                      ((fat.notas_fiscais?.length ?? 0) > 0 ||
                        (fat.boletos?.length ?? 0) > 0 ||
                        !!(fat.xml && fat.xml.trim()));
                    const totalCols = 9 + ((approverScope || ownerScope) ? 1 : 0);
                    return (
                      <FragmentRow key={it.id}>
                      <tr className="border-t align-top">
                        <td className="px-2 py-3 font-mono text-xs">{it.codigo_unico ?? "—"}</td>
                        <td className="px-2 py-3">
                          <span className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
                            {KIND_LABEL[it.kind]}
                          </span>
                        </td>
                        <td className="px-2 py-3 min-w-0">
                          <div className="font-medium truncate" title={it.title ?? undefined}>{it.title}</div>
                          {it.summary && <div className="text-xs text-muted-foreground truncate" title={it.summary}>{it.summary}</div>}
                          {(approverScope || ownerScope) && dept && (
                            <div className="mt-1">
                              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium truncate max-w-full">
                                {dept}
                              </span>
                            </div>
                          )}
                        </td>
                        {(approverScope || ownerScope) && (
                          <td className="px-2 py-3 text-xs text-muted-foreground truncate">
                            {it.requester_email ?? "—"}
                          </td>
                        )}
                        <td className="px-2 py-3 text-xs">
                          {it.buyer_name ? (
                            <span className="font-medium truncate block" title={it.buyer_name}>{it.buyer_name}</span>
                          ) : (
                            <span className="italic text-muted-foreground">Aguardando atribuição</span>
                          )}
                        </td>
                        <td className="px-2 py-3 text-xs text-muted-foreground">
                          {formatBR(it.status_changed_at || it.created_at)}
                        </td>
                        <td className="px-2 py-3">
                          <span
                            className="inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold leading-tight text-white"
                            style={{ background: meta?.tone ?? "var(--primary)" }}
                          >
                            {meta?.label ?? it.status}
                          </span>
                        </td>
                        <td className="px-2 py-3 font-mono text-xs">
                          {it.numero_pedido_linx ? (
                            <span className="text-emerald-700 font-semibold">#{it.numero_pedido_linx}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-2 py-3">
                          {att.show ? (
                            <ComplementaryUploadButton
                              card={{ id: it.id }}
                              kind={it.kind}
                              disabled={!att.enabled}
                              existingCount={countExistingFiles(it.data)}
                              onUploaded={reload}
                            />
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="px-2 py-3">
                          <div className="flex items-center gap-1.5">
                            <ViewButton onClick={() => setDetail(it as DetailCard)} />
                            <MessageButton
                              onClick={() =>
                                setMsgCard({ id: it.id, codigo_unico: it.codigo_unico, title: it.title, buyer_name: it.buyer_name })
                              }
                            />
                          </div>
                        </td>
                      </tr>
                      {hasFaturamento && (
                        <tr className="border-t bg-emerald-50/30 dark:bg-emerald-950/10">
                          <td colSpan={totalCols} className="p-4">
                            <InvoiceDocumentsSection
                              card={{ id: it.id, data: it.data }}
                              editable={false}
                            />
                          </td>
                        </tr>
                      )}
                      </FragmentRow>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile: cards */}
          <ul className="md:hidden space-y-3">
            {filtered.map((it) => {
              const meta = STATUS_META[it.status];
              const dept = ((it.data as any)?.departamento as string | undefined) ?? "";
              const att = canAttach(it);
              return (
                <li key={it.id} className="rounded-xl border bg-card p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {KIND_LABEL[it.kind]} {it.codigo_unico && <span className="font-mono normal-case">· #{it.codigo_unico}</span>}
                      </div>
                      <h3 className="font-medium mt-0.5 truncate">{it.title}</h3>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className="inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold text-white"
                        style={{ background: meta?.tone ?? "var(--primary)" }}
                      >
                        {meta?.label ?? it.status}
                      </span>
                      {att.show && (
                        <ComplementaryUploadButton
                          card={{ id: it.id }}
                          kind={it.kind}
                          disabled={!att.enabled}
                          existingCount={countExistingFiles(it.data)}
                          onUploaded={reload}
                        />
                      )}
                    </div>
                  </div>
                  {it.summary && <p className="text-xs text-muted-foreground mt-1 truncate">{it.summary}</p>}
                  <div className="mt-2 grid grid-cols-1 gap-1 text-xs">
                    {(approverScope || ownerScope) && (
                      <div>
                        <span className="text-muted-foreground">Solicitante: </span>
                        <span className="truncate">{it.requester_email ?? "—"}</span>
                      </div>
                    )}
                    {(approverScope || ownerScope) && dept && (
                      <div>
                        <span className="text-muted-foreground">Departamento: </span>
                        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">
                          {dept}
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground">👤 Comprador: </span>
                      {it.buyer_name ? (
                        <span className="font-medium">{it.buyer_name}</span>
                      ) : (
                        <span className="italic text-muted-foreground">Aguardando atribuição</span>
                      )}
                    </div>
                    <div>
                      <span className="text-muted-foreground">📅 Última movimentação: </span>
                      <span>{formatBR(it.status_changed_at || it.created_at)}</span>
                    </div>
                    {it.numero_pedido_linx && (
                      <div>
                        <span className="text-muted-foreground">Pedido ERP: </span>
                        <span className="font-mono text-emerald-700 font-semibold">#{it.numero_pedido_linx}</span>
                      </div>
                    )}
                  </div>
                  {it.status === "pedidos_gerados" && (() => {
                    const fat = getFaturamento(it.data);
                    const has = (fat.notas_fiscais?.length ?? 0) > 0 || (fat.boletos?.length ?? 0) > 0 || !!(fat.xml && fat.xml.trim());
                    if (!has) return null;
                    return (
                      <div className="mt-3">
                        <InvoiceDocumentsSection card={{ id: it.id, data: it.data }} editable={false} />
                      </div>
                    );
                  })()}
                  <div className="mt-3 flex items-center gap-2">
                    <ViewButton onClick={() => setDetail(it as DetailCard)} />
                    <MessageButton
                      onClick={() =>
                        setMsgCard({ id: it.id, codigo_unico: it.codigo_unico, title: it.title, buyer_name: it.buyer_name })
                      }
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {detail && <RequestDetailsModal card={detail} onClose={() => setDetail(null)} />}
      {msgCard && <SendMessageModal card={msgCard} onClose={() => setMsgCard(null)} />}
    </div>
  );
}

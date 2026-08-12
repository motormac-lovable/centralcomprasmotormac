import { useEffect, useState } from "react";
import { Eye, Download, FileText, Loader2, X, Paperclip, Table2 } from "lucide-react";
import { toast } from "sonner";
import { signRequesterFile } from "@/lib/requester-files";
import { supabase } from "@/integrations/supabase/client";
import { InvoiceDocumentsSection } from "@/components/InvoiceDocumentsSection";
import { KIND_LABEL, STATUS_COLUMNS, type Status } from "@/lib/cards";
import type { Database } from "@/integrations/supabase/types";

type Kind = Database["public"]["Enums"]["card_kind"];

export type DetailCard = {
  id: string;
  kind: Kind;
  title: string;
  summary: string | null;
  status: Status;
  created_at: string;
  codigo_unico: string | null;
  numero_pedido_linx: string | null;
  data: unknown;
  attachments?: unknown;
  suppliers?: unknown;
};

type Supplier = {
  id: string;
  fornecedor?: string;
  cnpj?: string;
  email?: string;
  telefone?: string;
  valor?: string;
  prazo?: string;
  condicao?: string;
  observacao?: string;
  chosen?: boolean;
};

type Attachment = { name: string; path: string; size?: number };

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}


const STATUS_META: Record<Status, { label: string; tone: string }> = STATUS_COLUMNS.reduce(
  (acc, c) => {
    acc[c.id] = { label: c.label, tone: c.tone };
    return acc;
  },
  {} as Record<Status, { label: string; tone: string }>,
);

function formatBR(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatSize(bytes?: number) {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

type ItemRow = { codigo: string; descricao: string; quantidade: string; unidade: string };

/** Normaliza os itens da solicitação (materiais x compras) apenas para leitura. */
function extractItems(data: unknown): ItemRow[] {
  const raw = (data ?? {}) as Record<string, unknown>;
  const itens = Array.isArray(raw.itens) ? (raw.itens as Record<string, string>[]) : [];
  if (itens.length > 0) {
    return itens.map((it) => ({
      codigo: it.codigo || "—",
      descricao: it.material || it.descricao || "—",
      quantidade: it.quantidade || "—",
      unidade: it.unidadeMedida || it.unidade || "—",
    }));
  }
  const pecas = Array.isArray(raw.pecas) ? (raw.pecas as Record<string, string>[]) : [];
  return pecas.map((p) => ({
    codigo: p.pn || "—",
    descricao: p.descricao || p.especificacao || "—",
    quantidade: p.quantidade || "1",
    unidade: p.unidade || "UN",
  }));
}

type FileRow = { name: string; path: string; size?: number; type?: string; category?: string };

function extractFiles(data: unknown): FileRow[] {
  const files = (data as { files?: unknown } | null | undefined)?.files;
  return Array.isArray(files) ? (files as FileRow[]) : [];
}

export function RequestDetailsModal({ card, onClose }: { card: DetailCard; onClose: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [quotationPreviewUrls, setQuotationPreviewUrls] = useState<Record<string, string>>({});
  const meta = STATUS_META[card.status];
  const items = extractItems(card.data);
  const files = extractFiles(card.data);
  const quotations = asArray<Attachment>(card.attachments);
  const suppliers = asArray<Supplier>(card.suppliers);
  const raw = (card.data ?? {}) as Record<string, unknown>;
  const departamento = (raw.departamento as string) || "";
  const descricaoSolicitante =
    (raw.descricao as string) ||
    (raw.objeto as string) ||
    (raw.descricaoServico as string) ||
    (raw.detalhes as string) ||
    "";
  const observacao =
    (raw.observacoes as string) || (raw.observacao as string) || (raw.justificativa as string) || "";

  useEffect(() => {
    let active = true;

    const preparePreviewUrls = async () => {
      const entries = await Promise.all(
        quotations.map(async (attachment) => {
          const { data, error } = await supabase.storage
            .from("orcamentos")
            .createSignedUrl(attachment.path, 600);
          return error || !data?.signedUrl ? null : ([attachment.path, data.signedUrl] as const);
        }),
      );

      if (active) {
        setQuotationPreviewUrls(Object.fromEntries(entries.filter((entry) => entry !== null)));
      }
    };

    if (quotations.length > 0) void preparePreviewUrls();
    return () => {
      active = false;
    };
  }, [card.id]);

  const openUrl = (url: string, filename?: string) => {
    if (filename) {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const openQuotation = async (a: Attachment, download: boolean) => {
    setBusy(a.path + String(download));
    try {
      const { data, error } = await supabase.storage
        .from("orcamentos")
        .createSignedUrl(a.path, 120, download ? { download: a.name } : undefined);
      if (error || !data) throw new Error(error?.message || "Não foi possível gerar o link do orçamento.");
      if (download) {
        openUrl(data.signedUrl, a.name);
      }
    } catch (err) {
      toast.error((err as Error).message || "Falha ao abrir o orçamento");
    } finally {
      setBusy(null);
    }
  };

  const openFile = async (f: FileRow, download: boolean) => {
    setBusy(f.path + String(download));
    try {
      const url = await signRequesterFile(f.path, 120, download ? f.name : false);
      if (!url) throw new Error("Não foi possível gerar o link do arquivo.");
      openUrl(url, download ? f.name : undefined);
    } catch (err) {
      toast.error((err as Error).message || "Falha ao abrir o arquivo");
    } finally {
      setBusy(null);
    }
  };


  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/40 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={`Detalhes da solicitação ${card.codigo_unico ?? ""}`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-2xl border bg-card shadow-xl my-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 p-5 border-b">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {KIND_LABEL[card.kind]} · Consulta somente leitura
            </div>
            <h2 className="text-lg font-semibold truncate">{card.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-card hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* 1. Descrição da Compra */}
          <section>
            <h3 className="text-sm font-semibold mb-3">Descrição da Compra</h3>
            <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
              <p className="text-sm">{card.summary || card.title}</p>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Descrição informada pelo solicitante
                </div>
                <p className="text-sm whitespace-pre-wrap">
                  {descricaoSolicitante || "Nenhuma descrição foi preenchida na abertura desta solicitação."}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Protocolo / ID: </span>
                  <span className="font-mono">{card.codigo_unico ?? card.id.slice(0, 8)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Data de criação: </span>
                  <span>{formatBR(card.created_at)}</span>
                </div>
                {departamento && (
                  <div>
                    <span className="text-muted-foreground">Departamento: </span>
                    <span>{departamento}</span>
                  </div>
                )}
                {card.numero_pedido_linx && (
                  <div>
                    <span className="text-muted-foreground">Pedido ERP: </span>
                    <span className="font-mono text-emerald-700 font-semibold">#{card.numero_pedido_linx}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Status atual:</span>
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold text-white"
                    style={{ background: meta?.tone ?? "var(--primary)" }}
                  >
                    {meta?.label ?? card.status}
                  </span>
                </div>
              </div>
              {observacao && (
                <p className="text-xs text-muted-foreground whitespace-pre-wrap border-t pt-3">{observacao}</p>
              )}
            </div>
          </section>

          {/* 2. Materiais Selecionados */}
          <section>
            <h3 className="text-sm font-semibold mb-3">Materiais Selecionados ({items.length})</h3>
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground rounded-xl border border-dashed p-4">
                Nenhum item detalhado nesta solicitação.
              </p>
            ) : (
              <div className="rounded-xl border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="text-left p-3">Código / SKU</th>
                        <th className="text-left p-3">Descrição</th>
                        <th className="text-left p-3">Qtd.</th>
                        <th className="text-left p-3">Unidade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-3 font-mono text-xs">{it.codigo}</td>
                          <td className="p-3">{it.descricao}</td>
                          <td className="p-3 text-xs">{it.quantidade}</td>
                          <td className="p-3 text-xs">{it.unidade}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* 3. Documentos & Anexos */}
          <section>
            <h3 className="text-sm font-semibold mb-3">Documentos &amp; Anexos ({files.length})</h3>
            {files.length === 0 ? (
              <p className="text-xs text-muted-foreground rounded-xl border border-dashed p-4">
                Nenhum arquivo anexado à abertura desta solicitação.
              </p>
            ) : (
              <ul className="space-y-2">
                {files.map((f) => (
                  <li
                    key={f.path}
                    className="flex items-center gap-3 rounded-lg border bg-card p-3"
                  >
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate">{f.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {[f.category, formatSize(f.size)].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openFile(f, false)}
                      disabled={busy === f.path + "false"}
                      className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
                    >
                      {busy === f.path + "false" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                      Visualizar
                    </button>
                    <button
                      type="button"
                      onClick={() => openFile(f, true)}
                      disabled={busy === f.path + "true"}
                      className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
                    >
                      {busy === f.path + "true" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      Baixar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 4. Anexos dos Orçamentos */}
          <section>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Paperclip className="h-4 w-4" /> Anexos dos Orçamentos ({quotations.length})
            </h3>
            {quotations.length === 0 ? (
              <p className="text-xs text-muted-foreground rounded-xl border border-dashed p-4">
                Nenhum orçamento anexado pelo comprador.
              </p>
            ) : (
              <ul className="space-y-2">
                {quotations.map((a) => (
                  <li key={a.path} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate">{a.name}</div>
                      <div className="text-[11px] text-muted-foreground">{formatSize(a.size)}</div>
                    </div>
                    <a
                      href={quotationPreviewUrls[a.path]}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-disabled={!quotationPreviewUrls[a.path]}
                      onClick={(event) => {
                        if (!quotationPreviewUrls[a.path]) event.preventDefault();
                      }}
                      className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-xs font-medium hover:bg-muted aria-disabled:pointer-events-none aria-disabled:opacity-60"
                    >
                      {quotationPreviewUrls[a.path] ? <Eye className="h-3.5 w-3.5" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Visualizar
                    </a>
                    <button
                      type="button"
                      onClick={() => openQuotation(a, true)}
                      disabled={busy === a.path + "true"}
                      className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-60"
                    >
                      {busy === a.path + "true" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      Baixar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 5. Mapa Comparativo de Fornecedores */}
          <section>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Table2 className="h-4 w-4" /> Mapa Comparativo de Fornecedores ({suppliers.length})
            </h3>
            {suppliers.length === 0 ? (
              <p className="text-xs text-muted-foreground rounded-xl border border-dashed p-4">
                Nenhum fornecedor cotado até o momento.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="p-2 text-center w-16">Escolhido</th>
                      <th className="p-2 text-left">Fornecedor</th>
                      <th className="p-2 text-left">Valor Total</th>
                      <th className="p-2 text-left">Prazo</th>
                      <th className="p-2 text-left">Condição</th>
                      <th className="p-2 text-left">Observações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers.map((s) => (
                      <tr key={s.id} className={`border-t ${s.chosen ? "bg-emerald-50 dark:bg-emerald-950/30" : ""}`}>
                        <td className="p-2 text-center">
                          {s.chosen ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                              Escolhido
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="p-2">
                          <div className="font-medium">{s.fornecedor || "Sem nome"}</div>
                          {(s.cnpj || s.email || s.telefone) && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {[s.cnpj, s.email, s.telefone].filter(Boolean).join(" · ")}
                            </div>
                          )}
                        </td>
                        <td className="p-2">{s.valor || "—"}</td>
                        <td className="p-2">{s.prazo || "—"}</td>
                        <td className="p-2">{s.condicao || "—"}</td>
                        <td className="p-2 max-w-[220px]">
                          <span className="line-clamp-2" title={s.observacao || ""}>{s.observacao || "—"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* 6. Documentos de Faturamento (NF, Boleto, XML) */}
          <InvoiceDocumentsSection card={{ id: card.id, data: card.data }} editable={false} />
        </div>

        <div className="flex items-center justify-between gap-3 border-t p-4">
          <p className="text-[11px] text-muted-foreground">
            Consulta somente leitura — nenhum dado pode ser alterado nesta tela.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border bg-card px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

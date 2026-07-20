import { useRef, useState } from "react";
import { toast } from "sonner";
import { Receipt, FileText, Trash2, Download, Eye, Plus, Loader2, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  INVOICE_ACCEPT,
  INVOICE_MAX_FILES,
  INVOICE_MAX_SIZE_MB,
  getFaturamento,
  removeInvoiceFile,
  signInvoiceFile,
  uploadInvoiceFiles,
  type Faturamento,
  type InvoiceFile,
} from "@/lib/invoice-documents";
import { translateError } from "@/lib/error-messages";

type CardShape = {
  id: string;
  data: unknown;
  observations?: unknown;
};

type Observation = { at: string; author: string; text: string };

function fmtSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

async function openFile(path: string, name: string, download: boolean) {
  const url = await signInvoiceFile(path, download ? name : false);
  if (!url) {
    toast.error("Não foi possível gerar o link do arquivo.");
    return;
  }
  if (download) {
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function FileRow({
  file,
  canDelete,
  onDelete,
}: {
  file: InvoiceFile;
  canDelete: boolean;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="flex-1 truncate" title={file.name}>{file.name}</span>
      <span className="text-[11px] text-muted-foreground">{fmtSize(file.size)}</span>
      <button
        type="button"
        onClick={() => openFile(file.path, file.name, false)}
        className="text-muted-foreground hover:text-primary"
        aria-label="Visualizar"
        title="Visualizar"
      >
        <Eye className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => openFile(file.path, file.name, true)}
        className="text-primary hover:underline"
        aria-label="Baixar"
        title="Baixar"
      >
        <Download className="h-3.5 w-3.5" />
      </button>
      {canDelete && onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="text-destructive hover:opacity-80"
          aria-label="Remover"
          title="Remover"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function InvoiceDocumentsSection({
  card,
  editable,
  author,
  onChanged,
}: {
  card: CardShape;
  editable: boolean;
  author?: string;
  onChanged?: (fat: Faturamento) => void;
}) {
  const initial = getFaturamento(card.data);
  const [notas, setNotas] = useState<InvoiceFile[]>(initial.notas_fiscais ?? []);
  const [boletos, setBoletos] = useState<InvoiceFile[]>(initial.boletos ?? []);
  const [xml, setXml] = useState<string>(initial.xml ?? "");
  const [xmlDirty, setXmlDirty] = useState(false);
  const [savingXml, setSavingXml] = useState(false);
  const [busy, setBusy] = useState<"nf" | "boleto" | null>(null);
  const [copied, setCopied] = useState(false);
  const nfInput = useRef<HTMLInputElement>(null);
  const boletoInput = useRef<HTMLInputElement>(null);

  const persist = async (
    patch: Partial<Pick<Faturamento, "notas_fiscais" | "boletos" | "xml">>,
    logText?: string,
  ) => {
    const currentData = (card.data as Record<string, unknown>) ?? {};
    const currentFat = getFaturamento(currentData);
    const nextFat: Faturamento = {
      ...currentFat,
      ...patch,
      updated_at: new Date().toISOString(),
      updated_by: author,
    };
    const nextData = { ...currentData, faturamento: nextFat };

    const update: Record<string, unknown> = { data: nextData };
    if (logText && author) {
      const obs = (Array.isArray(card.observations) ? card.observations : []) as Observation[];
      update.observations = [
        ...obs,
        { at: new Date().toISOString(), author, text: logText },
      ];
    }

    const { error } = await supabase.from("kanban_cards").update(update as never).eq("id", card.id);
    if (error) {
      toast.error(translateError(error, "Não foi possível salvar os documentos de faturamento."));
      return false;
    }
    onChanged?.(nextFat);
    return true;
  };

  const handlePick = async (
    kind: "nf" | "boleto",
    fileList: FileList | null,
  ) => {
    if (!fileList || fileList.length === 0) return;
    const current = kind === "nf" ? notas : boletos;
    const remaining = INVOICE_MAX_FILES - current.length;
    if (remaining <= 0) {
      toast.error(`Limite de ${INVOICE_MAX_FILES} arquivos atingido.`);
      return;
    }
    const arr = Array.from(fileList).slice(0, remaining);
    const tooBig = arr.find((f) => f.size > INVOICE_MAX_SIZE_MB * 1024 * 1024);
    if (tooBig) {
      toast.error(`"${tooBig.name}" excede o limite de ${INVOICE_MAX_SIZE_MB}MB.`);
      return;
    }
    if (arr.length < fileList.length) {
      toast.warning(`Apenas ${arr.length} arquivo(s) enviados — limite total: ${INVOICE_MAX_FILES}.`);
    }

    setBusy(kind);
    try {
      const uploaded = await uploadInvoiceFiles(card.id, kind, arr);
      const next = [...current, ...uploaded];
      const patch = kind === "nf" ? { notas_fiscais: next } : { boletos: next };
      const label = kind === "nf" ? "Nota(s) Fiscal(is)" : "Boleto(s)";
      const log = `📄 ${author ?? "Comprador"} anexou ${uploaded.length} ${label} ao card (Documentos de Faturamento).`;
      const ok = await persist(patch, log);
      if (ok) {
        if (kind === "nf") setNotas(next);
        else setBoletos(next);
        toast.success(`${uploaded.length} arquivo(s) enviado(s).`);
      } else {
        await Promise.all(uploaded.map((f) => removeInvoiceFile(f.path)));
      }
    } catch (err) {
      toast.error((err as Error).message || "Falha no upload.");
    } finally {
      setBusy(null);
      if (kind === "nf" && nfInput.current) nfInput.current.value = "";
      if (kind === "boleto" && boletoInput.current) boletoInput.current.value = "";
    }
  };

  const handleDelete = async (kind: "nf" | "boleto", file: InvoiceFile) => {
    if (!editable) return;
    const current = kind === "nf" ? notas : boletos;
    const next = current.filter((f) => f.path !== file.path);
    const patch = kind === "nf" ? { notas_fiscais: next } : { boletos: next };
    const label = kind === "nf" ? "Nota Fiscal" : "Boleto";
    const log = `🗑️ ${author ?? "Comprador"} removeu ${label} "${file.name}" dos Documentos de Faturamento.`;
    const ok = await persist(patch, log);
    if (ok) {
      await removeInvoiceFile(file.path);
      if (kind === "nf") setNotas(next);
      else setBoletos(next);
      toast.success("Arquivo removido.");
    }
  };

  const saveXml = async () => {
    setSavingXml(true);
    const trimmed = xml.trim();
    const log = trimmed
      ? `📑 ${author ?? "Comprador"} registrou o código/chave do XML da NF-e.`
      : `📑 ${author ?? "Comprador"} removeu o código/chave do XML da NF-e.`;
    const ok = await persist({ xml: trimmed }, log);
    setSavingXml(false);
    if (ok) {
      setXmlDirty(false);
      toast.success("Código do XML salvo.");
    }
  };

  const copyXml = async () => {
    const value = xml.trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      toast.success("Código copiado!");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  return (
    <section className="rounded-xl border-2 border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/10 dark:border-emerald-900 p-4 space-y-4">
      <h3 className="text-sm font-semibold flex items-center gap-2 text-emerald-800 dark:text-emerald-200">
        <Receipt className="h-4 w-4" /> Documentos de Faturamento e Entrega
      </h3>

      {/* Notas Fiscais */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            📄 Notas Fiscais ({notas.length}/{INVOICE_MAX_FILES})
          </h4>
          <span className="text-[11px] text-muted-foreground">PDF, PNG, JPG · até {INVOICE_MAX_SIZE_MB}MB cada</span>
        </div>
        <div className="space-y-2 mb-2">
          {notas.map((f) => (
            <FileRow key={f.path} file={f} canDelete={editable} onDelete={() => handleDelete("nf", f)} />
          ))}
          {notas.length === 0 && (
            <p className="text-xs text-muted-foreground italic">Nenhuma nota fiscal anexada.</p>
          )}
        </div>
        {editable && notas.length < INVOICE_MAX_FILES && (
          <>
            <input
              ref={nfInput}
              type="file"
              multiple
              accept={INVOICE_ACCEPT}
              className="hidden"
              onChange={(e) => handlePick("nf", e.target.files)}
            />
            <button
              type="button"
              onClick={() => nfInput.current?.click()}
              disabled={busy === "nf"}
              className="inline-flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
            >
              {busy === "nf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Anexar Nota Fiscal
            </button>
          </>
        )}
      </div>

      {/* Boletos */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            🎟️ Boletos ({boletos.length}/{INVOICE_MAX_FILES})
          </h4>
          <span className="text-[11px] text-muted-foreground">PDF, PNG, JPG · até {INVOICE_MAX_SIZE_MB}MB cada</span>
        </div>
        <div className="space-y-2 mb-2">
          {boletos.map((f) => (
            <FileRow key={f.path} file={f} canDelete={editable} onDelete={() => handleDelete("boleto", f)} />
          ))}
          {boletos.length === 0 && (
            <p className="text-xs text-muted-foreground italic">Nenhum boleto anexado.</p>
          )}
        </div>
        {editable && boletos.length < INVOICE_MAX_FILES && (
          <>
            <input
              ref={boletoInput}
              type="file"
              multiple
              accept={INVOICE_ACCEPT}
              className="hidden"
              onChange={(e) => handlePick("boleto", e.target.files)}
            />
            <button
              type="button"
              onClick={() => boletoInput.current?.click()}
              disabled={busy === "boleto"}
              className="inline-flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
            >
              {busy === "boleto" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Anexar Boleto
            </button>
          </>
        )}
      </div>

      {/* XML da NF-e */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          📑 Código/Chave do XML da NF-e
        </h4>
        {editable ? (
          <div className="space-y-2">
            <textarea
              value={xml}
              onChange={(e) => { setXml(e.target.value); setXmlDirty(true); }}
              placeholder="Cole aqui a chave de 44 dígitos ou o bloco XML da NF-e…"
              rows={4}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-primary/40"
            />
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={saveXml}
                  disabled={!xmlDirty || savingXml}
                  className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium disabled:opacity-60"
                >
                  {savingXml ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Salvar código XML
                </button>
                {xml.trim() && (
                  <button
                    type="button"
                    onClick={copyXml}
                    className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copiado!" : "Copiar código"}
                  </button>
                )}
              </div>
              <span className="text-[11px] text-muted-foreground">{xml.trim().length} caracteres</span>
            </div>
          </div>
        ) : xml.trim() ? (
          <div className="space-y-2">
            <div className="rounded-md border bg-background p-3 text-xs font-mono break-all max-h-40 overflow-auto">
              {xml}
            </div>
            <button
              type="button"
              onClick={copyXml}
              className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copiado!" : "Copiar código"}
            </button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">Nenhum código/chave XML informado.</p>
        )}
      </div>
    </section>
  );
}

import { supabase } from "@/integrations/supabase/client";

export const INVOICE_BUCKET = "invoice-documents";
export const INVOICE_MAX_FILES = 4;
export const INVOICE_MAX_SIZE_MB = 5;
export const INVOICE_ACCEPT = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";

export type InvoiceFile = {
  name: string;
  path: string;
  size: number;
  type: string;
  uploaded_at: string;
};

export type Faturamento = {
  notas_fiscais?: InvoiceFile[];
  boletos?: InvoiceFile[];
  xml?: string;
  updated_at?: string;
  updated_by?: string;
};

export function getFaturamento(data: unknown): Faturamento {
  const raw = (data as { faturamento?: Faturamento } | null | undefined)?.faturamento;
  if (!raw || typeof raw !== "object") return {};
  return {
    notas_fiscais: Array.isArray(raw.notas_fiscais) ? raw.notas_fiscais : [],
    boletos: Array.isArray(raw.boletos) ? raw.boletos : [],
    xml: typeof raw.xml === "string" ? raw.xml : "",
    updated_at: raw.updated_at,
    updated_by: raw.updated_by,
  };
}

export async function uploadInvoiceFiles(
  cardId: string,
  subtipo: "nf" | "boleto",
  files: File[],
): Promise<InvoiceFile[]> {
  const now = new Date().toISOString();
  const uploaded: InvoiceFile[] = [];
  for (const f of files) {
    const safe = f.name.normalize("NFKD").replace(/[^\w.\-]+/g, "_");
    const path = `${cardId}/${subtipo}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`;
    const { error } = await supabase.storage
      .from(INVOICE_BUCKET)
      .upload(path, f, { contentType: f.type || "application/octet-stream", upsert: false });
    if (error) throw new Error(`${f.name}: ${error.message}`);
    uploaded.push({ name: f.name, path, size: f.size, type: f.type, uploaded_at: now });
  }
  return uploaded;
}

export async function signInvoiceFile(
  path: string,
  download: string | boolean = false,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(INVOICE_BUCKET)
    .createSignedUrl(path, 120, download ? { download: download as never } : undefined);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function removeInvoiceFile(path: string): Promise<void> {
  await supabase.storage.from(INVOICE_BUCKET).remove([path]);
}

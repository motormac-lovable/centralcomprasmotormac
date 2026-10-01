import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { X, Send, Paperclip, Mail, Loader2 } from "lucide-react";

import { getBidAttachments, getBidBuyerEmail, sendBidRequest } from "@/lib/bid-email.functions";

type CardLike = {
  id: string;
  codigo_unico: string | null;
  title: string;
  summary: string | null;
  buyer_name: string | null;
  data: unknown;
};

type Anexo = { name: string; path: string };

function extrairDescricao(raw: Record<string, unknown>, card: CardLike): string {
  const keys = ["descricao", "descricao_solicitacao", "objeto", "detalhes", "observacoes", "justificativa"];
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return (card.summary ?? card.title ?? "").trim();
}

function extrairItens(raw: Record<string, unknown>): string[] {
  const itens = Array.isArray(raw.itens) ? (raw.itens as Array<Record<string, unknown>>) : [];
  return itens.map((it) => {
    const nome = String(it.material ?? it.descricao ?? it.peca ?? it.codigo ?? "Item").trim();
    const qtd = String(it.quantidade ?? it.qtd ?? "-").trim();
    const un = String(it.unidadeMedida ?? it.unidade ?? "UN").trim();
    return `  - ${nome} | Qtd: ${qtd} | Unidade: ${un}`;
  });
}

function extrairAnexos(raw: Record<string, unknown>): Anexo[] {
  const files = Array.isArray(raw.files) ? raw.files : [];
  return files
    .map((f) => (typeof f === "string" ? null : (f as { name?: string; path?: string })))
    .filter((f): f is { name?: string; path?: string } => !!f && !!f.path)
    .map((f) => ({ name: f.name ?? "anexo", path: f.path as string }));
}

function parseEmails(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[,;\s]+/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function s(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function fmtData(v: unknown): string {
  const t = s(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : t;
}

function num(v: unknown): number {
  const n = Number(s(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function montarCorpoFrete(raw: Record<string, unknown>): string | null {
  const isFrete =
    raw.cepOrigem !== undefined || raw.cidadeOrigem !== undefined || Array.isArray(raw.volumesList);
  if (!isFrete) return null;

  type V = Record<string, unknown>;
  const lista: V[] = Array.isArray(raw.volumesList) && raw.volumesList.length
    ? (raw.volumesList as V[])
    : [raw];

  const linhasVol: string[] = [];
  let totalVol = 0;
  let pesoTotal = 0;
  lista.forEach((v, i) => {
    const qtd = num(v.volumes) || 1;
    const peso = num(v.pesoBruto);
    totalVol += qtd;
    pesoTotal += peso * qtd;
    linhasVol.push(`Volume ${i + 1}:`);
    linhasVol.push(`  - Tipo de produto: ${s(v.tipoProduto) || "-"}`);
    linhasVol.push(
      `  - Dimensões (A x L x C): ${s(v.altura) || "-"} x ${s(v.largura) || "-"} x ${s(v.comprimento) || "-"} cm`,
    );
    linhasVol.push(`  - Peso bruto por volume: ${s(v.pesoBruto) || "-"} kg`);
    linhasVol.push(`  - Quantidade de volumes: ${s(v.volumes) || "-"}`);
    if (s(v.valorMercadoria)) linhasVol.push(`  - Valor da mercadoria: ${s(v.valorMercadoria)}`);
    linhasVol.push("");
  });

  const valorTotal = s(raw.valorTotalMercadorias) || s(raw.valorMercadoria) || s(raw.valorNotaFiscal);
  const obs = s(raw.observacoes) || s(raw.descricao);

  return [
    "Olá, Fornecedor.",
    "",
    "Solicitamos cotação de frete conforme as informações abaixo.",
    "",
    "**Rota:**",
    `  - Origem: ${s(raw.cidadeOrigem) || "-"} | CEP: ${s(raw.cepOrigem) || "-"}`,
    `  - Destino: ${s(raw.cidadeDestino) || "-"} | CEP: ${s(raw.cepDestino) || "-"}`,
    "",
    "**Datas previstas:**",
    `  - Coleta: ${fmtData(raw.dataColetaPrevista) || "-"}`,
    `  - Entrega: ${fmtData(raw.dataEntregaPrevista) || "-"}`,
    "",
    "**Partes envolvidas (CNPJ):**",
    `  - Remetente: ${s(raw.cnpjRemetente) || "-"}`,
    `  - Destinatário: ${s(raw.cnpjDestinatario) || "-"}`,
    `  - Pagador do frete: ${s(raw.cnpjPagador) || "-"}`,
    "",
    "**Carga / Volumes:**",
    ...linhasVol,
    "**Totais:**",
    `  - Total de volumes: ${totalVol}`,
    `  - Peso total: ${pesoTotal.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`,
    `  - Valor total da(s) mercadoria(s): ${valorTotal || "-"}`,
    ...(s(raw.observacoesCarga).trim() ? ["", "**Observações sobre a carga:**", s(raw.observacoesCarga).trim()] : []),
    ...(obs ? ["", "**Observações:**", obs] : []),
    "",
    "Favor informar no orçamento: valor do frete, prazo de entrega, tipo de veículo e validade da proposta.",
    "",
    "**Instrução importante:**",
    "Manter obrigatoriamente o e-mail do comprador em cópia no envio do orçamento.",
    "",
    "Atenciosamente,",
    "Central de Compras Motormac",
  ].join("\n");
}

export function BidRequestModal({ card, onClose }: { card: CardLike; onClose: () => void }) {
  const buyerEmailFn = useServerFn(getBidBuyerEmail);
  const attachmentsFn = useServerFn(getBidAttachments);
  const sendFn = useServerFn(sendBidRequest);

  const raw = useMemo(() => ((card.data as Record<string, unknown>) ?? {}), [card.data]);
  const anexosLocais = useMemo(() => extrairAnexos(raw), [raw]);
  const [anexosServidor, setAnexosServidor] = useState<Anexo[]>([]);
  const anexos = useMemo(() => {
    const seen = new Set<string>();
    return [...anexosServidor, ...anexosLocais].filter((a) =>
      seen.has(a.path) ? false : (seen.add(a.path), true),
    );
  }, [anexosServidor, anexosLocais]);
  const codigo = card.codigo_unico ?? card.id.slice(0, 8);

  const [cc, setCc] = useState("");
  const [loadingCc, setLoadingCc] = useState(true);
  const [bccInput, setBccInput] = useState("");
  const [sending, setSending] = useState(false);

  const subject = `Solicitação de Orçamento para o Grupo Motormac - Solicitação ID #${codigo}`;

  const [body, setBody] = useState(() => {
    const frete = montarCorpoFrete(raw);
    if (frete) return frete;
    const itens = extrairItens(raw);
    return [
      "Olá, Fornecedor.",
      "",
      "Estamos procurando fornecimento dos itens abaixo.",
      "Aguardamos o orçamento conforme a descrição e o material anexo.",
      "",
      "**Descrição da solicitação:**",
      extrairDescricao(raw, card),
      "",
      "**Lista de Materiais Solicitada:**",
      ...(itens.length ? itens : ["- (ver descrição e anexos)"]),
      "",
      "**Instrução importante:**",
      "Manter obrigatoriamente o e-mail do comprador em cópia no envio do orçamento.",
      "",
      "Atenciosamente,",
      "Central de Compras Motormac",
    ].join("\n");
  });

  useEffect(() => {
    let active = true;
    buyerEmailFn({ data: { cardId: card.id } })
      .then((r) => {
        if (active) setCc(r?.email ?? "");
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoadingCc(false);
      });
    return () => {
      active = false;
    };
  }, [buyerEmailFn, card.id]);

  useEffect(() => {
    let active = true;
    attachmentsFn({ data: { cardId: card.id } })
      .then((r) => {
        if (active && Array.isArray(r?.attachments)) setAnexosServidor(r.attachments as Anexo[]);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [attachmentsFn, card.id]);

  const bcc = parseEmails(bccInput);
  const invalidos = bcc.filter((e) => !EMAIL_RE.test(e));

  const enviar = async () => {
    if (bcc.length === 0) {
      toast.error("Informe ao menos um e-mail de fornecedor.");
      return;
    }
    if (invalidos.length) {
      toast.error(`E-mail inválido: ${invalidos[0]}`);
      return;
    }
    if (!cc || !EMAIL_RE.test(cc)) {
      toast.error("E-mail do comprador responsável não encontrado.");
      return;
    }
    setSending(true);
    try {
      const res = await sendFn({
        data: { cardId: card.id, bcc, cc, subject, body, attachments: anexos },
      });
      if (!res?.ok) {
        toast.error(res?.error ?? "Não foi possível enviar o pedido de orçamento.");
        return;
      }
      toast.success("Pedido de orçamento enviado com sucesso aos fornecedores!");
      onClose();
    } catch (e) {
      toast.error((e as Error).message || "Falha ao enviar o pedido de orçamento.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent text-primary flex items-center justify-center shrink-0">
            <Mail className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold">Solicitar Orçamento</h2>
            <p className="text-xs text-muted-foreground">Solicitação #{codigo} · {card.title}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Fornecedores (Cópia Oculta · BCC)
            </label>
            <textarea
              value={bccInput}
              onChange={(e) => setBccInput(e.target.value)}
              rows={2}
              placeholder="fornecedor1@empresa.com, fornecedor2@empresa.com"
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Separe por vírgula. Os fornecedores vão obrigatoriamente em cópia oculta e não veem os demais.
              {bcc.length > 0 && ` (${bcc.length} destinatário${bcc.length > 1 ? "s" : ""})`}
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Comprador responsável (Em cópia · CC)
            </label>
            <input
              readOnly
              value={loadingCc ? "Carregando…" : cc || "E-mail do comprador não localizado"}
              className="mt-1 w-full rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground cursor-not-allowed"
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assunto</label>
            <input
              readOnly
              value={subject}
              className="mt-1 w-full rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground cursor-not-allowed"
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Corpo da mensagem
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={12}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm font-mono leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Paperclip className="h-3.5 w-3.5" /> Anexos inclusos da solicitação ({anexos.length})
            </h3>
            {anexos.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">Nenhum anexo enviado pelo solicitante.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {anexos.map((a, i) => (
                  <li key={i} className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5 text-xs">
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{a.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="p-4 border-t flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={enviar}
            disabled={sending || loadingCc}
            className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar Orçamentos
          </button>
        </div>
      </div>
    </div>
  );
}

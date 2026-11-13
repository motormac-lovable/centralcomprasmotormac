import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, ExternalLink, Loader2, Send } from "lucide-react";
import { Field, inputCls } from "@/components/forms/FormShell";
import { CONDICOES_PAGAMENTO, getDadosPagamento, parseCondicaoMapa, parseValor, validarDadosPagamento, type CondicaoPagamento, type DadosPagamento, type Parcela } from "@/lib/pagamento";
import { getFaturamento } from "@/lib/invoice-documents";
import { fornecedorVencedor, type CardParaProtocolo } from "@/lib/pipefy-payload";
import { protocolarPipefy, salvarDadosPagamento } from "@/lib/pipefy.functions";

type Protocolo = { card_id: string; url: string; protocolado_em: string; protocolado_por: string };

export function ProtocoloBadge({ data }: { data: unknown }) {
  const p = (data as any)?.protocolo_pipefy as Protocolo | undefined;
  if (!p?.card_id) return null;
  return (
    <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:underline">
      Pipefy #{p.card_id} <ExternalLink className="h-3 w-3" />
    </a>
  );
}

export function useProtocolar() {
  const fn = useServerFn(protocolarPipefy);
  return async (cardId: string) => {
    const r = await fn({ data: { card_id: cardId } });
    if (r.ok) toast.success(r.jaExistia ? `Já protocolado no Pipefy (#${r.protocolo.card_id}).` : `Protocolado no Pipefy sob ID #${r.protocolo.card_id}.`);
    else toast.error(r.pendencias.join(" "), { duration: 9000 });
    return r;
  };
}

export function DadosPagamentoSection({ card, editable, onChanged }: { card: CardParaProtocolo; editable: boolean; onChanged?: (nextData: Record<string, unknown>) => void }) {
  const saved = getDadosPagamento(card.data);
  const fat = getFaturamento(card.data);
  const temBoleto = (fat.boletos?.length ?? 0) > 0;
  const venc = fornecedorVencedor(card);
  const valorTotal = parseValor(venc.valor);
  const mapa = useMemo(() => parseCondicaoMapa(venc.condicao, valorTotal), [venc.condicao, valorTotal]);
  const isContrato = (card as any).kind === "contratos";

  const [d, setD] = useState<Partial<DadosPagamento>>(() => ({
    condicao_de_pagamento: saved.condicao_de_pagamento ?? (temBoleto && !mapa.parcelado ? "Boleto" : mapa.parcelado ? "Parcelado" : "Boleto"),
    data_vencimento: saved.data_vencimento ?? "",
    banco: saved.banco ?? "", agencia: saved.agencia ?? "", conta_corrente: saved.conta_corrente ?? "", codigo_pix: saved.codigo_pix ?? "",
    parcelas_detalhe: saved.parcelas_detalhe?.length ? saved.parcelas_detalhe : mapa.parcelas.length ? mapa.parcelas : [{ numero: 1, data_vencimento: "", valor: "" }, { numero: 2, data_vencimento: "", valor: "" }],
    responsavel_pelo_cartao: saved.responsavel_pelo_cartao ?? "",
    despesa_contrato: saved.despesa_contrato ?? (isContrato ? "Sim" : "Não"),
    numero_contrato: saved.numero_contrato ?? ((card.data as any)?.numero_contrato ?? ""),
    numero_nf: saved.numero_nf ?? "",
    valor_documento: saved.valor_documento ?? (valorTotal > 0 ? valorTotal.toFixed(2) : ""),
  }));
  const [busy, setBusy] = useState(false);
  const salvar = useServerFn(salvarDadosPagamento);
  const protocolar = useProtocolar();
  const protocolo = (card.data as any)?.protocolo_pipefy as Protocolo | undefined;
  const ro = !editable || !!protocolo;
  const set = <K extends keyof DadosPagamento>(k: K, v: DadosPagamento[K]) => setD((s) => ({ ...s, [k]: v }));
  const parcelas = d.parcelas_detalhe ?? [];
  const setQtd = (n: number) => {
    const unit = valorTotal > 0 ? (valorTotal / n).toFixed(2) : "";
    const next: Parcela[] = Array.from({ length: n }, (_, i) => parcelas[i] ?? { numero: i + 1, data_vencimento: "", valor: unit });
    set("parcelas_detalhe", next.map((p, i) => ({ ...p, numero: i + 1 })));
  };
  const c = d.condicao_de_pagamento as CondicaoPagamento;
  const nfDiverge = valorTotal > 0 && Math.abs(parseValor(d.valor_documento) - valorTotal) > 0.01;

  const onSave = async () => {
    const payload = { ...d, numero_de_parcelas: c === "Parcelado" ? `${parcelas.length}x` : "" };
    const erros = validarDadosPagamento(payload, temBoleto);
    if (erros.length) { toast.error(erros.join(" ")); return; }
    setBusy(true);
    try {
      const r = await salvar({ data: { card_id: card.id, dados: payload as any } });
      toast.success("Dados de pagamento salvos.");
      let nextData: Record<string, unknown> = { ...((card.data as Record<string, unknown>) ?? {}), dados_pagamento: r.dados_pagamento };
      onChanged?.(nextData);
      // Protocolo automático assim que NF + dados de pagamento estiverem completos.
      if ((fat.notas_fiscais?.length ?? 0) > 0) {
        const p = await protocolar(card.id);
        if (p.ok) { nextData = { ...nextData, protocolo_pipefy: p.protocolo }; onChanged?.(nextData); }
      }
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível salvar.");
    } finally { setBusy(false); }
  };

  return (
    <section className="rounded-xl border bg-card p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <CreditCard className="h-4 w-4 text-primary" /> Dados de pagamento / Protocolo Pipefy
        </h3>
        <div className="flex items-center gap-2">
          {venc.condicao && <span className="rounded border bg-muted px-2 py-0.5 text-xs">Mapa comparativo: <strong>{venc.condicao}</strong></span>}
          <ProtocoloBadge data={card.data} />
        </div>
      </div>
      {protocolo && <p className="text-xs text-muted-foreground">Protocolado em {new Date(protocolo.protocolado_em).toLocaleString("pt-BR")} por {protocolo.protocolado_por}. Dados bloqueados para edição.</p>}

      <fieldset disabled={ro} className="grid gap-3 md:grid-cols-3">
        <Field label="Número da NF" required><input className={inputCls} value={d.numero_nf} onChange={(e) => set("numero_nf", e.target.value)} /></Field>
        <Field label="Valor do documento (R$)" required error={nfDiverge ? `Difere do orçamento aprovado (${venc.valor})` : undefined}>
          <input className={inputCls} inputMode="decimal" value={d.valor_documento} onChange={(e) => set("valor_documento", e.target.value)} />
        </Field>
        <Field label="Condição de pagamento" required>
          <select className={inputCls} value={c} onChange={(e) => set("condicao_de_pagamento", e.target.value as CondicaoPagamento)}>
            {CONDICOES_PAGAMENTO.map((o) => <option key={o}>{o}</option>)}
          </select>
        </Field>

        {c !== "Parcelado" && (
          <Field label="Data de vencimento" required><input type="date" className={inputCls} value={d.data_vencimento} onChange={(e) => set("data_vencimento", e.target.value)} /></Field>
        )}
        {(c === "Boleto" || c === "Parcelado") && (
          <p className={`md:col-span-2 self-end text-xs ${temBoleto ? "text-muted-foreground" : "text-destructive"}`}>
            {temBoleto ? `${fat.boletos!.length} boleto(s) anexado(s) em Documentos de Faturamento.` : "Anexe o boleto em Documentos de Faturamento acima."}
          </p>
        )}
        {c === "Depósito" && (<>
          <Field label="Banco" required><input className={inputCls} value={d.banco} onChange={(e) => set("banco", e.target.value)} /></Field>
          <Field label="Agência" required><input className={inputCls} value={d.agencia} onChange={(e) => set("agencia", e.target.value)} /></Field>
          <Field label="Conta corrente" required><input className={inputCls} value={d.conta_corrente} onChange={(e) => set("conta_corrente", e.target.value)} /></Field>
          <Field label="Código Pix"><input className={inputCls} value={d.codigo_pix} onChange={(e) => set("codigo_pix", e.target.value)} /></Field>
        </>)}
        {c === "Parcelado" && (
          <div className="md:col-span-3 space-y-2">
            <Field label="Número de parcelas" required>
              <select className={inputCls} value={parcelas.length} onChange={(e) => setQtd(Number(e.target.value))}>
                {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => <option key={n} value={n}>{n}x</option>)}
              </select>
            </Field>
            <div className="grid gap-2 md:grid-cols-2">
              {parcelas.map((p, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-2">
                  <Field label={`Vencimento ${i + 1}`} required>
                    <input type="date" className={inputCls} value={p.data_vencimento} onChange={(e) => set("parcelas_detalhe", parcelas.map((x, j) => j === i ? { ...x, data_vencimento: e.target.value } : x))} />
                  </Field>
                  <Field label={`Valor ${i + 1} (R$)`}>
                    <input className={inputCls} inputMode="decimal" value={p.valor} onChange={(e) => set("parcelas_detalhe", parcelas.map((x, j) => j === i ? { ...x, valor: e.target.value } : x))} />
                  </Field>
                </div>
              ))}
            </div>
          </div>
        )}
        {c === "Cartão corporativo" && (<>
          <Field label="Responsável pelo cartão" required><input className={inputCls} value={d.responsavel_pelo_cartao} onChange={(e) => set("responsavel_pelo_cartao", e.target.value)} /></Field>
          <Field label="É despesa de contrato?" required>
            <select className={inputCls} value={d.despesa_contrato} onChange={(e) => set("despesa_contrato", e.target.value as "Sim" | "Não")}><option>Não</option><option>Sim</option></select>
          </Field>
          {d.despesa_contrato === "Sim" && <Field label="Número do contrato" required><input className={inputCls} value={d.numero_contrato} onChange={(e) => set("numero_contrato", e.target.value)} /></Field>}
        </>)}
      </fieldset>

      {editable && (
        <div className="flex flex-wrap justify-end gap-2">
          {!protocolo && (
            <button type="button" disabled={busy} onClick={onSave} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Salvar e protocolar
            </button>
          )}
        </div>
      )}
    </section>
  );
}

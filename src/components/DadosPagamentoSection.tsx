import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { CreditCard, FileSearch, Loader2, Send } from "lucide-react";
import { Field, inputCls } from "@/components/forms/FormShell";
import { FORMAS_PAGAMENTO, isParcelado, getDadosPagamento, parseCondicaoMapa, parseValor, validarDadosPagamento, type CondicaoPagamento, type DadosPagamento, type Parcela } from "@/lib/pagamento";
import { getFaturamento } from "@/lib/invoice-documents";
import { fornecedorVencedor, type CardParaProtocolo } from "@/lib/pipefy-payload";
import { extrairDadosPagamento, protocolarPipefy, salvarDadosPagamento } from "@/lib/pipefy.functions";
import { translateError } from "@/lib/error-messages";
import { Button } from "@/components/ui/button";

type Protocolo = { card_id: string; url: string; protocolado_em: string; protocolado_por: string };

export function ProtocoloBadge({ data }: { data: unknown }) {
  const p = (data as any)?.protocolo_pipefy as Protocolo | undefined;
  if (!p?.card_id) return null;
  return (
    <Link to="/protocolo" className="inline-flex items-center gap-1 rounded-full border border-protocol-success/40 bg-protocol-success/10 px-2 py-0.5 text-xs font-medium text-protocol-success hover:underline">
      #{String(p.card_id).replace(/^#+/, "")}
    </Link>
  );
}

export function useProtocolar() {
  const fn = useServerFn(protocolarPipefy);
  return async (cardId: string) => {
    try {
    const r = await fn({ data: { card_id: cardId } });
    if (r.ok) toast.success(r.jaExistia ? `Já protocolado no Pipefy (#${r.protocolo.card_id}).` : `Protocolado no Pipefy sob ID #${r.protocolo.card_id}.`);
    else toast.error(r.pendencias.map((p) => translateError(p)).join(" "), { duration: 9000 });
    return r;
    } catch (e) {
      toast.error(translateError(e, "Não foi possível enviar o protocolo ao Pipefy."));
      return { ok: false as const, pendencias: [translateError(e)] };
    }
  };
}

export function DadosPagamentoSection({ card, editable, onChanged, boletosSlot, salvarAntes }: { card: CardParaProtocolo; editable: boolean; onChanged?: (nextData: Record<string, unknown>) => void; boletosSlot?: ReactNode; salvarAntes?: () => Promise<unknown | null | undefined> }) {
  const saved = getDadosPagamento(card.data);
  const fat = getFaturamento(card.data);
  const temBoleto = (fat.boletos?.length ?? 0) > 0;
  const venc = fornecedorVencedor(card);
  const valorTotal = parseValor(venc.valor);
  const mapa = useMemo(() => parseCondicaoMapa(venc.condicao, valorTotal), [venc.condicao, valorTotal]);
  const isContrato = (card as any).kind === "contratos";

  const [d, setD] = useState<Partial<DadosPagamento>>(() => ({
    condicao_de_pagamento: !saved.condicao_de_pagamento || saved.condicao_de_pagamento === "Parcelado" ? "Boleto" : saved.condicao_de_pagamento,
    parcelado: saved.condicao_de_pagamento ? isParcelado(saved) : mapa.parcelado,
    nome_favorecido: saved.nome_favorecido ?? "",
    banco: saved.banco ?? "", agencia: saved.agencia ?? "", conta_corrente: saved.conta_corrente ?? "", codigo_pix: saved.codigo_pix ?? "",
    parcelas_detalhe: saved.parcelas_detalhe?.length ? saved.parcelas_detalhe : mapa.parcelas.length ? mapa.parcelas : [{ numero: 1, valor: "" }, { numero: 2, valor: "" }],
    responsavel_pelo_cartao: saved.responsavel_pelo_cartao ?? "",
    despesa_contrato: saved.despesa_contrato ?? (isContrato ? "Sim" : "Não"),
    numero_contrato: saved.numero_contrato ?? ((card.data as any)?.numero_contrato ?? ""),
    numero_nf: saved.numero_nf ?? "",
    data_vencimento: saved.data_vencimento ?? "",
    valor_documento: saved.valor_documento ?? (valorTotal > 0 ? valorTotal.toFixed(2) : ""),
  }));
  const [busy, setBusy] = useState(false);
  const [lendo, setLendo] = useState(false);
  const extrair = useServerFn(extrairDadosPagamento);
  const jaLeu = useRef(false);
  const lerDocumentos = async (manual = false) => {
    setLendo(true);
    try {
      const r = await extrair({ data: { card_id: card.id } });
      if (!r.ok) { if (manual) toast.error(r.erro); return; }
      setD((s) => {
        const n = { ...s };
        if (r.fornecedor && !venc.fornecedor) n.fornecedor = r.fornecedor;
        if (manual || !s.numero_nf) n.numero_nf = r.numero_nf.replace(/^0+/, "");
        if (r.valor_documento && (manual || !saved.valor_documento)) n.valor_documento = r.valor_documento;
        const bols = r.boletos.filter((b) => parseValor(b.valor) > 0);
        if (bols.length >= 2) { n.condicao_de_pagamento = "Boleto"; n.parcelado = true; n.parcelas_detalhe = bols.slice(0, 12).map((b, i) => ({ numero: i + 1, valor: b.valor, vencimento: b.vencimento })); }
        else if (bols.length === 1) {
          if (!saved.condicao_de_pagamento) n.condicao_de_pagamento = "Boleto";
          if (manual || !s.data_vencimento) n.data_vencimento = bols[0].vencimento;
        }
        return n;
      });
      toast.success("Dados preenchidos a partir da NF e do boleto. Confira antes de salvar.");
      if (r.boletos.some((b) => !b.vencimento)) toast.warning("Não foi possível identificar todos os vencimentos. Confira os boletos e use Ler NF e boleto novamente.");
    } catch { if (manual) toast.error("Não foi possível ler os documentos."); }
    finally { setLendo(false); }
  };
  const salvar = useServerFn(salvarDadosPagamento);
  const protocolar = useProtocolar();
  const protocolo = (card.data as any)?.protocolo_pipefy as Protocolo | undefined;
  const ro = !editable || !!protocolo;
  const temNf = (fat.notas_fiscais?.length ?? 0) > 0;
  useEffect(() => {
    const faltaVencimento = temBoleto && (isParcelado(saved)
      ? !saved.parcelas_detalhe?.length || saved.parcelas_detalhe.some((p) => !p.vencimento)
      : !saved.data_vencimento);
    if (jaLeu.current || ro || !temNf || (saved.numero_nf && !faltaVencimento)) return;
    jaLeu.current = true;
    void lerDocumentos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ro, temNf]);
  const set = <K extends keyof DadosPagamento>(k: K, v: DadosPagamento[K]) => setD((s) => ({ ...s, [k]: v }));
  const parcelas = d.parcelas_detalhe ?? [];
  const setQtd = (n: number) => {
    const unit = valorTotal > 0 ? (valorTotal / n).toFixed(2) : "";
    const next: Parcela[] = Array.from({ length: n }, (_, i) => parcelas[i] ?? { numero: i + 1, valor: unit });
    set("parcelas_detalhe", next.map((p, i) => ({ ...p, numero: i + 1 })));
  };
  const c = d.condicao_de_pagamento as CondicaoPagamento;
  const parc = !!d.parcelado;
  const togglePar = (on: boolean) => { set("parcelado", on); if (on && parcelas.length < 2) setQtd(2); };
  const nfDiverge = valorTotal > 0 && Math.abs(parseValor(d.valor_documento) - valorTotal) > 0.01;

  const onSave = async () => {
    const payload = { ...d, numero_de_parcelas: parc ? `${parcelas.length}x` : "", parcelas_detalhe: parc ? parcelas : [] };
    const erros = validarDadosPagamento(payload, temBoleto);
    if (erros.length) { toast.error(erros.join(" ")); return; }
    setBusy(true);
    try {
      // Salva junto o código do XML da NF-e (sem botão próprio).
      const fatAtualizado = salvarAntes ? await salvarAntes() : undefined;
      if (fatAtualizado === null) return;
      const r = await salvar({ data: { card_id: card.id, dados: payload as any } });
      toast.success("Dados de pagamento salvos.");
      let nextData: Record<string, unknown> = { ...((card.data as Record<string, unknown>) ?? {}), dados_pagamento: r.dados_pagamento };
      if (fatAtualizado) nextData = { ...nextData, faturamento: fatAtualizado };
      onChanged?.(nextData);
      toast.info("Recebimento liberado ao solicitante. O protocolo no Pipefy será feito após o Recebido.");
      if (r.email?.ok) toast.success(`E-mail enviado ao solicitante (${r.email.para}).`);
      else if (r.email && !r.email.ok) toast.warning(r.email.erro ?? "E-mail ao solicitante não enviado.");
    } catch (e: any) {
      const mensagem = e instanceof Response ? await e.text() : e;
      toast.error(translateError(mensagem, "Não foi possível salvar os dados de pagamento."));
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4 border-t border-emerald-200 pt-4 dark:border-emerald-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <CreditCard className="h-4 w-4 text-primary" /> 💳 Condição de pagamento
        </h3>
        <div className="flex items-center gap-2">
          {venc.condicao && <span className="rounded border bg-muted px-2 py-0.5 text-xs">Mapa comparativo: <strong>{venc.condicao}</strong></span>}
          {!ro && temNf && (
            <Button type="button" variant="outline" size="sm" onClick={() => lerDocumentos(true)} disabled={lendo}>
              {lendo ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileSearch className="h-3 w-3" />} {lendo ? "Lendo NF e boleto…" : "Ler NF e boleto"}
            </Button>
          )}
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
            {FORMAS_PAGAMENTO.map((o) => <option key={o}>{o}</option>)}
          </select>
        </Field>
        <label className="md:col-span-3 inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={parc} onChange={(e) => togglePar(e.target.checked)} className="h-4 w-4" />
          Pagamento parcelado?
        </label>
        {c === "Boleto" && boletosSlot && <div className="md:col-span-3">{boletosSlot}</div>}
        {c === "Pagamento Pix" && (<>
          <Field label="Chave Pix" required><input className={inputCls} value={d.codigo_pix} onChange={(e) => set("codigo_pix", e.target.value)} /></Field>
          <Field label="Nome do favorecido" required><input className={inputCls} value={d.nome_favorecido ?? ""} onChange={(e) => set("nome_favorecido", e.target.value)} /></Field>
        </>)}

        {!parc && <Field label="Data de vencimento" required>
          <input aria-label="Data de vencimento" type="date" className={inputCls} value={d.data_vencimento ?? ""}
            readOnly={c === "Boleto"} onChange={(e) => set("data_vencimento", e.target.value)} />
        </Field>}
        {c === "Boleto" && !temBoleto && (
          <p className="md:col-span-2 self-end text-xs text-destructive">Anexe o boleto acima.</p>
        )}
        {c === "Depósito" && (<>
          <Field label="Banco" required><input className={inputCls} value={d.banco} onChange={(e) => set("banco", e.target.value)} /></Field>
          <Field label="Agência" required><input className={inputCls} value={d.agencia} onChange={(e) => set("agencia", e.target.value)} /></Field>
          <Field label="Conta corrente" required><input className={inputCls} value={d.conta_corrente} onChange={(e) => set("conta_corrente", e.target.value)} /></Field>
          <Field label="Código Pix"><input className={inputCls} value={d.codigo_pix} onChange={(e) => set("codigo_pix", e.target.value)} /></Field>
        </>)}
        {parc && (
          <div className="md:col-span-3 space-y-2">
            <Field label="Número de parcelas" required>
              <select className={inputCls} value={parcelas.length} onChange={(e) => setQtd(Number(e.target.value))}>
                {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => <option key={n} value={n}>{n}x</option>)}
              </select>
            </Field>
            <div className="grid gap-2 md:grid-cols-2">
              {parcelas.map((p, i) => (
                <div key={i} className="rounded-lg border bg-muted/30 p-2">
                  <Field label={`Valor da parcela ${i + 1} (R$)`} required>
                    <input className={inputCls} inputMode="decimal" value={p.valor} onChange={(e) => set("parcelas_detalhe", parcelas.map((x, j) => j === i ? { ...x, valor: e.target.value } : x))} />
                  </Field>
                  <Field label={`Vencimento da parcela ${i + 1}`} required>
                    <input aria-label={`Vencimento da parcela ${i + 1}`} type="date" className={inputCls} value={p.vencimento ?? ""} readOnly={c === "Boleto"}
                      onChange={(e) => set("parcelas_detalhe", parcelas.map((x, j) => j === i ? { ...x, vencimento: e.target.value } : x))} />
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
            <Button type="button" disabled={busy || lendo} onClick={onSave}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Salvar e liberar recebimento
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

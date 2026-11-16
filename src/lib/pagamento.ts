/** Dados de pagamento preenchidos pelo comprador em Pedidos Gerados (data.dados_pagamento). Browser-safe. */
export const CONDICOES_PAGAMENTO = [
  "Boleto", "Depósito", "Parcelado", "Cartão corporativo", "Adiantamento Fornecedor", "Adiantamento Viagem",
] as const;
export type CondicaoPagamento = (typeof CONDICOES_PAGAMENTO)[number];

export type Parcela = { numero: number; valor: string; vencimento?: string };

export type DadosPagamento = {
  condicao_de_pagamento: CondicaoPagamento;
  data_vencimento?: string;
  banco: string;
  fornecedor?: string;
  agencia: string;
  conta_corrente: string;
  codigo_pix: string;
  numero_de_parcelas: string;
  parcelas_detalhe: Parcela[];
  responsavel_pelo_cartao: string;
  despesa_contrato: "Sim" | "Não";
  numero_contrato: string;
  numero_nf: string;
  valor_documento: string;
  updated_at?: string;
  updated_by?: string;
};

export function getDadosPagamento(data: unknown): Partial<DadosPagamento> {
  const raw = (data as { dados_pagamento?: Partial<DadosPagamento> } | null)?.dados_pagamento;
  return raw && typeof raw === "object" ? raw : {};
}

/** Lê "30/60/90", "30, 60" ou "3x" do Mapa Comparativo e sugere parcelas. */
export function parseCondicaoMapa(texto: string, valorTotal: number, base = new Date()) {
  const t = (texto || "").trim();
  const mk = (dias: number[]) => {
    const qtd = dias.length;
    const valor = valorTotal > 0 ? (valorTotal / qtd).toFixed(2) : "";
    void base;
    return dias.map((_, i) => ({ numero: i + 1, valor }));
  };
  const mult = t.match(/(\d{1,2})\s*(x|parcelas?)/i);
  if (mult) {
    const qtd = Math.min(Math.max(Number(mult[1]), 2), 12);
    return { parcelado: true, parcelas: mk(Array.from({ length: qtd }, (_, i) => 30 * (i + 1))) };
  }
  const dias = (t.match(/\b\d{1,3}\b/g) ?? []).map(Number).slice(0, 12);
  if (dias.length >= 2) return { parcelado: true, parcelas: mk(dias) };
  return { parcelado: false, parcelas: [] as Parcela[] };
}

/** Converte "R$ 1.500,50" / "1500.50" em número. */
export function parseValor(v: string | number | null | undefined): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/[^\d,.-]/g, "");
  if (!s) return 0;
  const norm = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(norm);
  return Number.isFinite(n) ? n : 0;
}

/** Normaliza a data lida do documento sem inventar vencimentos ausentes. */
export function normalizarVencimento(value: unknown): string {
  const raw = String(value ?? "").trim();
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const iso = br ? `${br[3]}-${br[2]}-${br[1]}` : raw;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const date = new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : "";
}

/** Validação conforme De/Para Pipefy. `temBoleto` = boletos anexados no faturamento. Retorna lista de erros. */
export function validarDadosPagamento(d: Partial<DadosPagamento>, temBoleto: boolean): string[] {
  const e: string[] = [];
  if (!d.numero_nf?.trim()) e.push("Informe o Número da NF.");
  if (!(parseValor(d.valor_documento) > 0)) e.push("Informe o Valor do Documento.");
  const c = d.condicao_de_pagamento;
  if (!c) { e.push("Selecione a condição de pagamento."); return e; }
  if (c !== "Parcelado" && !normalizarVencimento(d.data_vencimento))
    e.push(c === "Boleto" ? "Leia o boleto para obter a data de vencimento." : "Informe uma data de vencimento válida.");
  if ((c === "Boleto" || c === "Parcelado") && !temBoleto) e.push("Anexe o boleto em Documentos de Faturamento.");
  if (c === "Depósito" && (!d.banco?.trim() || !d.agencia?.trim() || !d.conta_corrente?.trim()))
    e.push("Preencha Banco, Agência e Conta Corrente.");
  if (c === "Parcelado") {
    const p = d.parcelas_detalhe ?? [];
    if (p.length < 2 || p.length > 12) e.push("Parcelamento deve ter de 2 a 12 parcelas.");
    if (p.some((x) => !(parseValor(x.valor) > 0))) e.push("Preencha o valor de todas as parcelas.");
    if (p.some((x) => !normalizarVencimento(x.vencimento))) e.push("Leia os boletos para obter o vencimento de todas as parcelas.");
  }
  if (c === "Cartão corporativo") {
    if (!d.responsavel_pelo_cartao?.trim()) e.push("Informe o Responsável Pelo Cartão.");
    if (d.despesa_contrato === "Sim" && !d.numero_contrato?.trim()) e.push("Informe o Número do Contrato.");
  }
  return e;
}

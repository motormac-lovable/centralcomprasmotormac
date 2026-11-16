import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { resolverFilialFiscal } from "@/lib/filiais-fiscais";
import { MOTORMAC_LOGO_PNG_BASE64, MOTORMAC_LOGO_SIZE } from "@/lib/purchase-order-logo";

export type PurchaseOrderCard = {
  title: string;
  summary?: string | null;
  codigo_unico?: string | null;
  empresa?: string | null;
  unidade?: string | null;
  requester_name?: string | null;
  requester_email?: string | null;
  buyer_name?: string | null;
  suppliers?: unknown;
  data?: unknown;
};

export type FornecedorVencedor = { nome: string; cnpj: string; email: string; valor: string };

export function parseBRL(v: unknown): number {
  const s = String(v ?? "").replace(/[^\d,.-]/g, "");
  if (!s) return 0;
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return Number.isFinite(n) ? n : 0;
}

const brl = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Vencedor = fornecedor escolhido; com um único fornecedor no mapa, ele é o vencedor. */
export function fornecedorVencedor(suppliers: unknown): FornecedorVencedor | null {
  const list = Array.isArray(suppliers) ? (suppliers as Record<string, unknown>[]) : [];
  const w = list.find((s) => s.chosen === true || s.escolhido === true) ?? (list.length === 1 ? list[0] : null);
  if (!w) return null;
  return {
    nome: String(w.razao_social ?? w.fornecedor ?? "").trim(),
    cnpj: String(w.cnpj ?? "").trim(),
    email: String(w.email ?? "").trim(),
    valor: String(w.valor_total ?? w.valor ?? ""),
  };
}

export function emailValido(e: string | null | undefined): boolean {
  return !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}

function formatDateBR(d: Date) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(d);
}

/** Gera o PDF do Pedido de Compra. Funciona no navegador e no servidor. */
export function generatePurchaseOrderPDF(card: PurchaseOrderCard, numeroPedido: string, geradoEm = new Date()): jsPDF {
  const data = (card.data ?? {}) as Record<string, unknown>;
  const filial = resolverFilialFiscal(card.empresa, card.unidade);
  const vencedor = fornecedorVencedor(card.suppliers);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 14;
  const red: [number, number, number] = [200, 16, 46];
  const black: [number, number, number] = [20, 20, 20];

  const logoH = 16;
  const logoW = (MOTORMAC_LOGO_SIZE.width / MOTORMAC_LOGO_SIZE.height) * logoH;
  doc.addImage(`data:image/png;base64,${MOTORMAC_LOGO_PNG_BASE64}`, "PNG", M, 10, logoW, logoH);
  doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(...red);
  doc.text("PEDIDO DE COMPRA", W - M, 16, { align: "right" });
  doc.setFontSize(12).setTextColor(20, 20, 20);
  doc.text(`N° ${numeroPedido}`, W - M, 23, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(90, 90, 90);
  doc.text(`Solicitação #${card.codigo_unico ?? "—"} · Emitido em ${formatDateBR(geradoEm)}`, W - M, 28, { align: "right" });
  doc.setDrawColor(...red).setLineWidth(0.6).line(M, 32, W - M, 32);

  const bloco = (titulo: string, linhas: [string, string][], startY: number) => {
    autoTable(doc, {
      startY,
      margin: { left: M, right: M },
      head: [[{ content: titulo, colSpan: 2 }]],
      body: linhas,
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 1.8, textColor: [30, 30, 30] },
      headStyles: { fillColor: black, textColor: 255, fontStyle: "bold" },
      columnStyles: { 0: { cellWidth: 42, fontStyle: "bold", fillColor: [238, 238, 238] } },
    });
    return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  };

  let y = bloco("DADOS DO EMISSOR — GRUPO MOTORMAC", [
    ["Razão Social", filial?.razaoSocial ?? (card.empresa || "—")],
    ["CNPJ", filial?.cnpj ?? "—"],
    ["Inscrição Estadual", filial?.ie ?? "—"],
    ["Endereço", filial?.endereco ?? (card.unidade || "—")],
    ["Solicitante", [card.requester_name || (data.nome as string) || "", card.requester_email || ""].filter(Boolean).join(" · ") || "—"],
    ["Comprador", card.buyer_name || "—"],
  ], 36);

  y = bloco("DADOS DO FORNECEDOR VENCEDOR", [
    ["Razão Social", vencedor?.nome || "—"],
    ["CNPJ", vencedor?.cnpj || "—"],
    ["E-mail", vencedor?.email || "—"],
  ], y);

  const total = parseBRL(vencedor?.valor);
  const itens = Array.isArray(data.itens) ? (data.itens as Record<string, unknown>[]) : [];
  const linhas = itens.length
    ? itens.map((it, i) => {
        const qtd = parseBRL(it.quantidade) || 0;
        const unico = itens.length === 1 && total > 0 && qtd > 0;
        return [
          String(i + 1),
          String(it.material ?? it.descricao ?? it.servico ?? "—"),
          qtd ? qtd.toLocaleString("pt-BR") : String(it.quantidade ?? "—"),
          String(it.unidadeMedida ?? it.unidade_medida ?? "UN"),
          unico ? brl(total / qtd) : "—",
          unico ? brl(total) : "—",
        ];
      })
    : [["1", card.title, "1", "UN", total ? brl(total) : "—", total ? brl(total) : "—"]];

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [["Item", "Descrição do Material/Serviço", "Qtd", "Un", "Valor Unit. (R$)", "Valor Total (R$)"]],
    body: linhas,
    foot: [[{ content: "VALOR TOTAL DO PEDIDO (R$)", colSpan: 5, styles: { halign: "right" } }, total ? brl(total) : "—"]],
    theme: "grid",
    styles: { fontSize: 8.5, cellPadding: 1.8 },
    headStyles: { fillColor: black, textColor: 255 },
    footStyles: { fillColor: [238, 238, 238], textColor: [20, 20, 20], fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 12, halign: "center" }, 2: { cellWidth: 16, halign: "right" }, 3: { cellWidth: 16 }, 4: { cellWidth: 28, halign: "right" }, 5: { cellWidth: 30, halign: "right" } },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

  const obs = [
    (data.descricao as string) || card.summary || "",
    typeof data.observacoes === "string" ? (data.observacoes as string) : "",
  ].filter((s) => s && s.trim()).join("\n\n") || "—";
  bloco("OBSERVAÇÕES", [["Descrição", obs]], y);

  const H = doc.internal.pageSize.getHeight();
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "italic").setFontSize(7.5).setTextColor(110, 110, 110);
    doc.text(`Este documento foi gerado automaticamente pela Central de Compras do Grupo Motormac em ${formatDateBR(geradoEm)}.`, W / 2, H - 8, { align: "center" });
  }
  return doc;
}

export function nomeArquivoPedido(numero: string) {
  return `${numero.replace(/\s+/g, "")}.pdf`;
}

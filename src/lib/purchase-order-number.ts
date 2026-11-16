import { resolverFilialFiscal } from "@/lib/filiais-fiscais";

/** Formato: "PC - [CNPJ_FINAIS_2][MM][AA][CODIGO_4]". */
export const PURCHASE_ORDER_PATTERN = /^PC - \d{10}$/;

export function purchaseOrderPrefix(cnpj: string, date: Date): string {
  const digits = cnpj.replace(/\D/g, "");
  const parts = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", month: "2-digit", year: "2-digit" }).formatToParts(date);
  const mm = parts.find((p) => p.type === "month")?.value ?? "00";
  const aa = parts.find((p) => p.type === "year")?.value ?? "00";
  return `${digits.slice(-2)}${mm}${aa}`;
}

/**
 * Gera o número anti-fraude do Pedido de Compra. `isUsed` informa se o código de 4 dígitos
 * já foi usado na mesma filial no mesmo mês; nesse caso, sorteia outro.
 */
export async function generatePurchaseOrderNumber(
  empresa: string | null | undefined,
  unidade: string | null | undefined,
  createdDate: Date,
  isUsed: (numero: string) => boolean | Promise<boolean>,
  random: () => number = Math.random,
): Promise<string | null> {
  const filial = resolverFilialFiscal(empresa, unidade);
  if (!filial) return null;
  const prefix = purchaseOrderPrefix(filial.cnpj, createdDate);
  for (let i = 0; i < 200; i++) {
    const codigo = String(Math.floor(random() * 10000)).padStart(4, "0");
    const numero = `PC - ${prefix}${codigo}`;
    if (!(await isUsed(numero))) return numero;
  }
  throw new Error("Não foi possível gerar um número de pedido único para esta filial neste mês.");
}

export type PedidoCompraInfo = {
  numero?: string;
  gerado_em?: string;
  email_status?: "enviado" | "sem_email" | "falha" | "legado" | "sem_filial";
  email_destino?: string;
  email_em?: string;
  email_erro?: string;
};

export function pedidoCompraInfo(data: unknown): PedidoCompraInfo | null {
  const pc = (data as Record<string, unknown> | null)?.pedido_compra;
  return pc && typeof pc === "object" ? (pc as PedidoCompraInfo) : null;
}

/** Número exibido do pedido: PC quando existir; senão o número legado. */
export function numeroPedidoExibicao(card: { data?: unknown; numero_pedido_linx?: string | null; order_number?: string | null }): string | null {
  return pedidoCompraInfo(card.data)?.numero ?? card.numero_pedido_linx ?? card.order_number ?? null;
}

export function aplicaPedidoCompra(card: { kind: string; status: string }): boolean {
  return card.status === "pedidos_gerados" && card.kind !== "contratos";
}

/** Rótulo pronto para exibição: "PC - ..." no novo formato, "#123456" para números legados. */
export function rotuloPedido(card: { data?: unknown; numero_pedido_linx?: string | null; order_number?: string | null }): string | null {
  const pc = pedidoCompraInfo(card.data)?.numero;
  if (pc) return pc;
  const legado = card.numero_pedido_linx ?? card.order_number ?? null;
  return legado ? `#${legado}` : null;
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { generatePurchaseOrderNumber, pedidoCompraInfo, type PedidoCompraInfo } from "@/lib/purchase-order-number";
import { emailValido, fornecedorVencedor, generatePurchaseOrderPDF, nomeArquivoPedido } from "@/lib/purchase-order-pdf";
import { translateError } from "@/lib/error-messages";

const SENDER = "centraldecomprasmotormac@gmail.com";
/** Pedidos que entraram em "Pedidos Gerados" antes desta data recebem número, mas não e-mail automático. */
export const PEDIDO_COMPRA_EMAIL_INICIO = "2026-11-16T18:00:00Z";

type Admin = SupabaseClient<any>;
type CardRow = {
  id: string; kind: string; status: string; title: string; summary: string | null; codigo_unico: string | null;
  empresa: string | null; unidade: string | null; requester_name: string | null; requester_email: string | null;
  buyer_name: string | null; suppliers: unknown; attachments: unknown; data: unknown; observations: unknown;
  status_changed_at: string | null; created_at: string;
};
const COLS = "id, kind, status, title, summary, codigo_unico, empresa, unidade, requester_name, requester_email, buyer_name, suppliers, attachments, data, observations, status_changed_at, created_at";

const b64h = (s: string) => `=?UTF-8?B?${Buffer.from(s, "utf-8").toString("base64")}?=`;
const chunk76 = (s: string) => (s.match(/.{1,76}/g) ?? []).join("\r\n");
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

async function loadCard(admin: Admin, id: string) {
  const { data } = await admin.from("kanban_cards").select(COLS).eq("id", id).maybeSingle();
  return data as CardRow | null;
}

async function patchPedido(admin: Admin, id: string, patch: PedidoCompraInfo, obs?: string) {
  const card = await loadCard(admin, id);
  if (!card) return;
  const data = (card.data ?? {}) as Record<string, unknown>;
  const update: Record<string, unknown> = { data: { ...data, pedido_compra: { ...(pedidoCompraInfo(data) ?? {}), ...patch } } };
  if (obs) {
    const list = Array.isArray(card.observations) ? card.observations : [];
    update.observations = [...list, { at: new Date().toISOString(), text: obs, author: "Sistema" }];
  }
  await admin.from("kanban_cards").update(update as never).eq("id", id);
}

export function corpoEmailFornecedor(nome: string, codigo: string, numero: string) {
  return `Prezado(a) ${nome},

Temos a satisfação de informar que a sua proposta comercial foi vencedora no nosso processo orçamentário referente à solicitação ${codigo}.

Dessa forma, V.Sa. está formalmente autorizado(a) a iniciar o fornecimento das mercadorias ou a execução dos serviços orçados, conforme as condições comerciais, prazos e valores acordados na proposta aprovada.

Seguem anexos a este e-mail:
1. O Pedido de Compra oficial N° ${numero} (PDF);
2. A cópia da sua proposta comercial aprovada.

ORIENTAÇÕES IMPORTANTES PARA FATURAMENTO E ENTREGA:
- É indispensável mencionar o número do Pedido de Compra (${numero}) no campo de informações complementares/observações da Nota Fiscal;
- O faturamento deverá ser emitido rigorosamente para os dados fiscais (Razão Social, CNPJ e endereço) constantes no cabeçalho do Pedido de Compra em anexo;
- Em caso de dúvidas sobre entrega, agendamento ou faturamento, favor responder a este e-mail mantendo o comprador responsável em cópia.

Atenciosamente,

Equipe de Suprimentos / Compras
Grupo Motormac`;
}

/** Proposta vencedora: anexo de cotação cujo nome cita o fornecedor; com um único anexo, ele mesmo. */
function propostaVencedora(attachments: unknown, fornecedor: string) {
  const list = (Array.isArray(attachments) ? attachments : []) as { name?: string; path?: string }[];
  const valid = list.filter((a) => a.path);
  const tokens = fornecedor.split(/\s+/).map(norm).filter((t) => t.length >= 4);
  const hit = valid.find((a) => tokens.some((t) => norm(a.name ?? "").includes(t)));
  return hit ?? (valid.length === 1 ? valid[0] : null);
}

async function emailComprador(admin: Admin, buyer: string | null) {
  const name = (buyer ?? "").trim();
  if (!name) return "";
  const { data } = await admin.from("profiles").select("email").eq("full_name", name).limit(1).maybeSingle();
  return (data?.email as string | undefined) ?? "";
}

export type EmailOverride = { to: string[]; cc?: string; subject: string; body: string };

/** Modelo padrão do e-mail do Pedido de Compra (destinatário, cópia, assunto, corpo e anexos). */
export async function modeloEmailPedido(admin: Admin, cardId: string) {
  const card = await loadCard(admin, cardId);
  if (!card) throw new Error("Solicitação não encontrada.");
  const numero = pedidoCompraInfo(card.data)?.numero;
  if (!numero) throw new Error("Número do Pedido de Compra ainda não gerado.");
  const v = fornecedorVencedor(card.suppliers);
  const prop = propostaVencedora(card.attachments, v?.nome ?? "");
  return {
    numero,
    to: v && emailValido(v.email) ? [v.email] : [],
    cc: await emailComprador(admin, card.buyer_name),
    subject: `Aprovação de Orçamento e Pedido de Compra N° ${numero} - Grupo Motormac`,
    body: corpoEmailFornecedor(v?.nome || "Fornecedor", card.codigo_unico ?? "—", numero),
    anexos: [nomeArquivoPedido(numero), ...(prop?.name ? [prop.name] : [])],
  };
}

async function enviarEmail(admin: Admin, card: CardRow, numero: string, to: string, nome: string, override?: EmailOverride) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const gmailKey = process.env.GOOGLE_MAIL_API_KEY_1 || process.env.GOOGLE_MAIL_API_KEY;
  if (!lovableKey || !gmailKey) throw new Error("Serviço de e-mail não configurado.");
  const cc = override ? (override.cc ?? "") : await emailComprador(admin, card.buyer_name);
  const subject = override?.subject || `Aprovação de Orçamento e Pedido de Compra N° ${numero} - Grupo Motormac`;
  const body = override?.body || corpoEmailFornecedor(nome || "Fornecedor", card.codigo_unico ?? "—", numero);
  if (override?.to.length) to = override.to.join(", ");

  const pdf = Buffer.from(generatePurchaseOrderPDF(card, numero).output("arraybuffer"));
  const files: { name: string; mime: string; buf: Buffer }[] = [{ name: nomeArquivoPedido(numero), mime: "application/pdf", buf: pdf }];
  const prop = propostaVencedora(card.attachments, nome);
  if (prop?.path) {
    const { data: f } = await admin.storage.from("orcamentos").download(prop.path);
    if (f) files.push({ name: (prop.name ?? "proposta.pdf").replace(/"/g, ""), mime: f.type || "application/pdf", buf: Buffer.from(await f.arrayBuffer()) });
  }

  const mix = `mix_${Math.random().toString(36).slice(2)}`;
  const lines = [
    `From: Central de Compras Motormac <${SENDER}>`,
    `To: ${to}`,
    ...(cc ? [`Cc: ${cc}`, `Reply-To: ${cc}`] : []),
    `Subject: ${b64h(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${mix}"`,
    "",
    `--${mix}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    chunk76(Buffer.from(body, "utf-8").toString("base64")),
  ];
  for (const f of files) {
    lines.push(`--${mix}`, `Content-Type: ${f.mime}; name="${b64h(f.name)}"`, "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${b64h(f.name)}"`, "", chunk76(f.buf.toString("base64")));
  }
  lines.push(`--${mix}--`, "");
  const raw = Buffer.from(lines.join("\r\n"), "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const res = await fetch("https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": gmailKey, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    console.error("[pedido-compra] gmail", res.status, await res.text().catch(() => ""));
    throw new Error("Não foi possível enviar o e-mail ao fornecedor.");
  }
}

export type EmissaoResultado = { numero: string | null; email_status: PedidoCompraInfo["email_status"] | null; email?: string };

/**
 * Gera (uma única vez) o número PC do card em "Pedidos Gerados" e dispara o e-mail ao fornecedor vencedor.
 * Não altera status, aprovações nem regras do Kanban; grava apenas em data.pedido_compra e no histórico.
 */
export async function emitirPedidoCompra(admin: Admin, cardId: string, opts: { reenviar?: boolean; override?: EmailOverride } = {}): Promise<EmissaoResultado> {
  const card = await loadCard(admin, cardId);
  if (!card || card.status !== "pedidos_gerados" || card.kind === "contratos") return { numero: null, email_status: null };
  let info = pedidoCompraInfo(card.data);

  if (!info?.numero) {
    const when = new Date(card.status_changed_at ?? card.created_at);
    const numero = await generatePurchaseOrderNumber(card.empresa, card.unidade, when, async (n) => {
      const { count } = await admin.from("kanban_cards").select("id", { count: "exact", head: true }).eq("data->pedido_compra->>numero", n);
      return (count ?? 0) > 0;
    });
    if (!numero) {
      if (info?.email_status !== "sem_filial") await patchPedido(admin, cardId, { email_status: "sem_filial" }, "⚠️ Pedido de Compra não emitido: empresa/unidade sem cadastro fiscal.");
      return { numero: null, email_status: "sem_filial" };
    }
    const legado = when.toISOString() < PEDIDO_COMPRA_EMAIL_INICIO;
    await patchPedido(admin, cardId, { numero, gerado_em: new Date().toISOString(), ...(legado ? { email_status: "legado" as const } : {}) },
      `🧾 Pedido de Compra ${numero} gerado.`);
    const reread = pedidoCompraInfo((await loadCard(admin, cardId))?.data);
    if (reread?.numero !== numero) return { numero: reread?.numero ?? null, email_status: reread?.email_status ?? null };
    info = reread;
  }

  const numero = info.numero!;
  if (info.email_status && !opts.reenviar) return { numero, email_status: info.email_status, email: info.email_destino };

  const fresh = (await loadCard(admin, cardId))!;
  const vReal = fornecedorVencedor(fresh.suppliers);
  const v = opts.override?.to.length ? { nome: vReal?.nome ?? "", email: opts.override.to.join(", ") } : vReal;
  if (!v || (!opts.override?.to.length && !emailValido(v.email))) {
    await patchPedido(admin, cardId, { email_status: "sem_email" },
      "✉️ Pedido de Compra gerado sem envio automático por ausência de e-mail do fornecedor.");
    return { numero, email_status: "sem_email" };
  }
  try {
    await enviarEmail(admin, fresh, numero, v.email, v.nome, opts.override);
    await patchPedido(admin, cardId, { email_status: "enviado", email_destino: v.email, email_em: new Date().toISOString(), email_erro: undefined },
      `✉️ E-mail de aprovação e Pedido de Compra enviados ao fornecedor (${v.email}).`);
    return { numero, email_status: "enviado", email: v.email };
  } catch (e) {
    const msg = translateError(e instanceof Error ? e.message : String(e));
    await patchPedido(admin, cardId, { email_status: "falha", email_erro: msg }, `⚠️ Falha no envio do Pedido de Compra ao fornecedor: ${msg}`);
    return { numero, email_status: "falha", email: v.email };
  }
}

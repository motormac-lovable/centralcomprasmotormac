import { translateError } from "@/lib/error-messages";

const SENDER = "centraldecomprasmotormac@gmail.com";
const b64 = (s: string) => btoa(Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join(""));
const hdr = (v: string) => (/^[\x00-\x7F]*$/.test(v) ? v : `=?UTF-8?B?${b64(v)}?=`);
const emailOk = (e?: string | null) => !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

export function assuntoRecebimento(codigo: string) {
  return `Documentos Fiscais Disponíveis - Confirme o Recebimento (Solicitação #${codigo})`;
}

export function corpoRecebimento(codigo: string) {
  return [
    "Olá,",
    "",
    `A sua solicitação ${codigo} recebeu os documentos de cobrança relacionados ao serviço/mercadoria. Para que possamos realizar o protocolo automático junto a contabilidade, precisamos que confirme o recebimento dos itens relacionados a sua solicitação acessando o seguinte caminho:`,
    "",
    "Central de compras >> Minhas solicitações ou Histórico >> Recebimento",
    "",
    "Após a sua confirmação, nós efetuaremos o protocolo automático da nota dentro da contabilidade.",
    "",
    "Atenciosamente,",
    "Compras Motormac",
  ].join("\r\n");
}

/** Envia o aviso ao solicitante (CC comprador). Nunca lança: retorna resultado em pt-BR. */
export async function enviarEmailRecebimento(admin: any, card: any): Promise<{ ok: boolean; para?: string; erro?: string }> {
  try {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const gmailKey = process.env.GOOGLE_MAIL_API_KEY_1 || process.env.GOOGLE_MAIL_API_KEY;
    if (!lovableKey || !gmailKey) return { ok: false, erro: "Credenciais de e-mail não configuradas." };
    let para: string | null = card.requester_email ?? null;
    if (!emailOk(para) && card.requester_id) {
      const { data: p } = await admin.from("profiles").select("email").eq("id", card.requester_id).maybeSingle();
      para = p?.email ?? null;
    }
    if (!emailOk(para)) return { ok: false, erro: "Solicitante sem e-mail válido." };
    let cc: string | null = null;
    if (card.buyer_name) {
      const { data: b } = await admin.from("profiles").select("email").ilike("full_name", card.buyer_name).limit(1);
      cc = b?.[0]?.email ?? null;
    }
    const d = (card.data ?? {}) as Record<string, any>;
    const codigo = String(d.codigo_unico ?? d.codigo ?? card.id);
    const lines = [
      `From: ${hdr("Central de Compras Motormac")} <${SENDER}>`,
      `To: ${para!.trim()}`,
      ...(emailOk(cc) && cc!.trim().toLowerCase() !== para!.trim().toLowerCase() ? [`Cc: ${cc!.trim()}`] : []),
      `Subject: ${hdr(assuntoRecebimento(codigo))}`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      b64(corpoRecebimento(codigo)),
    ].join("\r\n");
    const raw = b64(lines).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const res = await fetch("https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": gmailKey, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) {
      console.error("[email recebimento]", res.status, await res.text());
      return { ok: false, erro: `Não foi possível enviar o e-mail ao solicitante (código ${res.status}).` };
    }
    return { ok: true, para: para!.trim() };
  } catch (e) {
    return { ok: false, erro: translateError(e, "Não foi possível enviar o e-mail ao solicitante.") };
  }
}

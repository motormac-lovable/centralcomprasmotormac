import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SENDER = "centraldecomprasmotormac@gmail.com";
const BUCKET = "solicitacao-anexos";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function b64(subject: string) {
  return `=?UTF-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`;
}

function chunk76(s: string) {
  return (s.match(/.{1,76}/g) ?? []).join("\r\n");
}

function textToHtml(body: string) {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => {
      const lines = p.split("\n").filter((l) => l.trim() !== "");
      if (lines.length === 0) return "";

      const isList = lines.every((l) => /^\s*[-•*]\s+/.test(l));
      if (isList) {
        const items = lines
          .map((l) => {
            const text = l.replace(/^\s*[-•*]\s+/, "").trim();
            return `<li style="margin:0 0 6px 0;padding:0;">${escapeHtml(text)}</li>`;
          })
          .join("");
        return `<ul style="margin:0 0 14px 18px;padding:0;">${items}</ul>`;
      }

      const inner = lines
        .map((l) => {
          const bold = l.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
          return escapeHtml(bold).replace(/&lt;strong&gt;(.+?)&lt;\/strong&gt;/g, "<strong>$1</strong>");
        })
        .join("<br>");
      return `<p style="margin:0 0 14px 0;padding:0;line-height:1.65;">${inner}</p>`;
    })
    .filter(Boolean)
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:24px;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #eceff3;border-radius:12px;padding:28px;">
    ${paragraphs}
    <div style="font-size:11px;color:#9aa0a6;padding-top:24px;border-top:1px solid #eceff3;margin-top:18px;">
      Central de Compras Motormac
    </div>
  </div>
</body></html>`;
}

const bidSchema = z.object({
  cardId: z.string().uuid(),
  bcc: z.array(z.string().email()).min(1),
  cc: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
  attachments: z.array(z.object({ name: z.string(), path: z.string() })).default([]),
});

/** Resolve o e-mail do comprador responsável pelo card (CC obrigatório). */
export const getBidBuyerEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cardId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: card } = await supabaseAdmin
      .from("kanban_cards")
      .select("buyer_name")
      .eq("id", data.cardId)
      .maybeSingle();

    const buyerName = (card?.buyer_name ?? "").trim();
    if (buyerName) {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("email")
        .eq("full_name", buyerName)
        .maybeSingle();
      if (prof?.email) return { email: prof.email as string, buyerName };
    }
    const claims = context.claims as { email?: string } | undefined;
    return { email: claims?.email ?? "", buyerName };
  });

type StoredFile = { name: string; path: string; type?: string };

/** Extrai os anexos enviados pelo solicitante a partir do payload do card. */
function extrairAnexosDoCard(raw: unknown): StoredFile[] {
  const data = (raw ?? {}) as Record<string, unknown>;
  const buckets = ["files", "arquivos", "anexos", "requester_files", "complementares"];
  const out: StoredFile[] = [];
  for (const key of buckets) {
    const arr = data[key];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const f = item as { name?: string; path?: string; type?: string };
      if (!f.path) continue;
      out.push({ name: f.name ?? "anexo", path: f.path, type: f.type });
    }
  }
  // remove duplicados por path
  const seen = new Set<string>();
  return out.filter((f) => (seen.has(f.path) ? false : (seen.add(f.path), true)));
}

/** Lista os anexos do solicitante gravados no card (fonte de verdade no servidor). */
export const getBidAttachments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cardId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: card } = await supabaseAdmin
      .from("kanban_cards")
      .select("data")
      .eq("id", data.cardId)
      .maybeSingle();
    return { attachments: extrairAnexosDoCard(card?.data) };
  });



export const sendBidRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bidSchema.parse(d))
  .handler(async ({ data }) => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const gmailKey = process.env.GOOGLE_MAIL_API_KEY;
    if (!lovableKey || !gmailKey) {
      return { ok: false as const, error: "Serviço de e-mail não configurado." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Anexos: sempre buscados do card no servidor (fonte de verdade),
    // unidos aos informados pelo cliente.
    const { data: cardRow } = await supabaseAdmin
      .from("kanban_cards")
      .select("data")
      .eq("id", data.cardId)
      .maybeSingle();

    const seen = new Set<string>();
    const lista: StoredFile[] = [];
    for (const a of [...extrairAnexosDoCard(cardRow?.data), ...data.attachments]) {
      if (!a.path || seen.has(a.path)) continue;
      seen.add(a.path);
      lista.push(a as StoredFile);
    }

    // Baixa os anexos do solicitante para embutir no e-mail.
    const parts: string[] = [];
    for (const a of lista) {
      try {
        const { data: file, error } = await supabaseAdmin.storage.from(BUCKET).download(a.path);
        if (error || !file) {
          console.error("[bid] anexo indisponível", a.path, error?.message);
          continue;
        }
        const buf = Buffer.from(await file.arrayBuffer());
        if (buf.byteLength > 18_000_000) continue;
        const nome = a.name.replace(/"/g, "");
        const mime = a.type || (file as Blob).type || "application/octet-stream";
        parts.push(
          [
            `Content-Type: ${mime}; name="${nome}"`,
            "Content-Transfer-Encoding: base64",
            `Content-Disposition: attachment; filename="${nome}"`,
            "",
            chunk76(buf.toString("base64")),
          ].join("\r\n"),
        );
      } catch {
        /* anexo indisponível: segue o envio sem ele */
      }
    }


    const altBoundary = `alt_${Math.random().toString(36).slice(2)}`;
    const mixBoundary = `mix_${Math.random().toString(36).slice(2)}`;

    const alternative = [
      `--${altBoundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      chunk76(Buffer.from(data.body, "utf-8").toString("base64")),
      `--${altBoundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      chunk76(Buffer.from(textToHtml(data.body), "utf-8").toString("base64")),
      `--${altBoundary}--`,
    ].join("\r\n");

    const headers = [
      `From: Central de Compras Motormac <${SENDER}>`,
      `To: ${SENDER}`,
      `Cc: ${data.cc}`,
      `Bcc: ${data.bcc.join(", ")}`,
      `Reply-To: ${data.cc}`,
      `Subject: ${b64(data.subject)}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${mixBoundary}"`,
      "",
      `--${mixBoundary}`,
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      "",
      alternative,
    ];

    for (const p of parts) {
      headers.push(`--${mixBoundary}`, p);
    }
    headers.push(`--${mixBoundary}--`, "");

    const raw = Buffer.from(headers.join("\r\n"), "utf-8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const res = await fetch(
      "https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": gmailKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      console.error("[bid] Gmail send failed", res.status, body);
      return { ok: false as const, error: `Falha no envio (${res.status}).` };
    }

    return { ok: true as const, sent: data.bcc.length, attached: parts.length };
  });

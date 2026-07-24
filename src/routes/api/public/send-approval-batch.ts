import { createFileRoute } from "@tanstack/react-router";

// Rota temporária para envio em lote do template "Cadastro Aprovado".
// Protegida por token compartilhado no header X-Batch-Token.

const APP_URL = "https://centralcomprasmotormac.lovable.app";
const LOGO_URL =
  "https://centralcomprasmotormac.lovable.app/__l5e/assets-v1/6af60dab-ff7d-4ed5-82ca-db58892a7fcb/logo-motormac.png";
const SENDER = "centraldecomprasmotormac@gmail.com";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildHtml(nome: string, perfil: string) {
  const n = esc(nome);
  const p = esc(perfil);
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:40px 16px;"><tr><td align="center"><table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:36px 36px 40px;border:1px solid #eceff3;"><tr><td align="center" style="padding:12px 0 28px;"><img src="${LOGO_URL}" alt="Motormac" width="110" height="110" style="display:block;border:0;width:110px;height:auto;max-width:45%;"></td></tr><tr><td align="center" style="font-size:22px;font-weight:700;color:#0f6b3f;padding-bottom:20px;">Olá, ${n}</td></tr><tr><td style="font-size:15px;line-height:1.65;color:#333;padding-bottom:14px;">Seu cadastro no sistema <strong>Central de Compras Motormac</strong> foi <strong>deferido</strong>.</td></tr><tr><td style="font-size:15px;line-height:1.65;color:#333;padding-bottom:22px;">Seu perfil aprovado é: <strong>${p}</strong></td></tr><tr><td style="font-size:14px;line-height:1.6;color:#555;padding-bottom:22px;">Acesse a plataforma para começar:</td></tr><tr><td align="center" style="padding-bottom:8px;"><a href="${APP_URL}" target="_blank" style="display:inline-block;background:#0f6b3f;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 28px;border-radius:8px;">Acessar Central de Compras</a></td></tr><tr><td align="center" style="font-size:12px;color:#777;padding-top:14px;"><a href="${APP_URL}" target="_blank" style="color:#0f6b3f;text-decoration:underline;">${APP_URL}</a></td></tr><tr><td align="center" style="font-size:11px;color:#9aa0a6;padding-top:32px;">Mensagem automática — favor não responder.</td></tr></table></td></tr></table></body></html>`;
}

function encodeRaw(to: string, subject: string, html: string): string {
  const lines = [
    `From: Central de Compras Motormac <${SENDER}>`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    html,
  ].join("\r\n");
  return Buffer.from(lines, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export const Route = createFileRoute("/api/public/send-approval-batch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-batch-token");
        if (!token || token !== process.env.LOVABLE_API_KEY) {
          return new Response("unauthorized", { status: 401 });
        }
        const lovableKey = process.env.LOVABLE_API_KEY;
        const gmailKey = process.env.GOOGLE_MAIL_API_KEY;
        if (!lovableKey || !gmailKey) {
          return Response.json({ ok: false, reason: "missing_credentials" }, { status: 500 });
        }
        const body = (await request.json()) as {
          recipients: Array<{ email: string; nome: string; perfil: string }>;
        };
        const results: Array<{ email: string; ok: boolean; error?: string }> = [];
        await Promise.all(
          body.recipients.map(async (r) => {
            try {
              const raw = encodeRaw(
                r.email,
                "Cadastro Aprovado - Central de Compras Motormac",
                buildHtml(r.nome, r.perfil),
              );
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
                const t = await res.text();
                results.push({ email: r.email, ok: false, error: `${res.status}: ${t.slice(0, 200)}` });
              } else {
                results.push({ email: r.email, ok: true });
              }
            } catch (e) {
              results.push({ email: r.email, ok: false, error: (e as Error).message });
            }
          }),
        );
        const sent = results.filter((r) => r.ok).length;
        return Response.json({ ok: sent > 0, sent, total: results.length, results });
      },
    },
  },
});

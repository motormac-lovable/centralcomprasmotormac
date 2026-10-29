import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const APP_URL = "https://centralcomprasmotormac.lovable.app";
const LOGO_URL =
  "https://centralcomprasmotormac.lovable.app/__l5e/assets-v1/6af60dab-ff7d-4ed5-82ca-db58892a7fcb/logo-motormac.png";
const SENDER = "centraldecomprasmotormac@gmail.com";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHtml() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:40px 16px;">
      <tr><td align="center">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:36px 36px 40px;border:1px solid #eceff3;">
          <tr><td align="center" style="padding:12px 0 36px;">
            <img src="${LOGO_URL}" alt="Motormac" width="110" height="110" style="display:block;border:0;width:110px;height:auto;max-width:45%;">
          </td></tr>
          <tr><td align="center" style="font-size:22px;font-weight:700;color:#0f6b3f;padding-bottom:20px;">
            Olá, Aprovador
          </td></tr>
          <tr><td align="center" style="font-size:15px;line-height:1.65;color:#333;padding-bottom:14px;">
            Você possui nova(s) Solicitação(ões) de compra aguardando aprovação na Central de Compras Motormac.
          </td></tr>
          <tr><td align="center" style="font-size:14px;line-height:1.6;color:#555;padding-bottom:20px;">
            Acesse a Central de Compras clicando no link abaixo:
          </td></tr>
          <tr><td align="center" style="padding-bottom:8px;">
            <a href="${APP_URL}" target="_blank" style="color:#0f6b3f;text-decoration:underline;font-size:15px;font-weight:600;">https://centralcomprasmotormac.lovable.app</a>
          </td></tr>
          <tr><td align="center" style="font-size:11px;color:#9aa0a6;padding-top:32px;">
            Mensagem automática — favor não responder.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function buildRejectedHtml(params: {
  greetingName: string;
  codigo: string;
  motivo: string;
  comprador: string;
}) {
  const g = escapeHtml(params.greetingName);
  const c = escapeHtml(params.codigo);
  const m = escapeHtml(params.motivo);
  const b = escapeHtml(params.comprador);
  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:40px 16px;">
      <tr><td align="center">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:36px 36px 40px;border:1px solid #eceff3;">
          <tr><td align="center" style="padding:12px 0 36px;">
            <img src="${LOGO_URL}" alt="Motormac" width="110" height="110" style="display:block;border:0;width:110px;height:auto;max-width:45%;">
          </td></tr>
          <tr><td align="center" style="font-size:22px;font-weight:700;color:#b42318;padding-bottom:20px;">
            Olá, ${g}
          </td></tr>
          <tr><td style="font-size:15px;line-height:1.65;color:#333;padding-bottom:14px;">
            Informamos que a solicitação número "<strong>${c}</strong>" foi <strong>rejeitada</strong> pelo motivo: ${m}.
          </td></tr>
          <tr><td style="font-size:15px;line-height:1.65;color:#333;padding-bottom:14px;">
            O comprador que rejeitou foi: <strong>${b}</strong>.
          </td></tr>
          <tr><td style="font-size:14px;line-height:1.6;color:#555;padding-bottom:20px;">
            Em caso de dúvidas interaja com o comprador.
          </td></tr>
          <tr><td align="center" style="padding-bottom:8px;">
            <a href="${APP_URL}" target="_blank" style="color:#0f6b3f;text-decoration:underline;font-size:15px;font-weight:600;">https://centralcomprasmotormac.lovable.app</a>
          </td></tr>
          <tr><td align="center" style="font-size:11px;color:#9aa0a6;padding-top:32px;">
            Mensagem automática — favor não responder.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function encodeRfc2822(to: string, subject: string, html: string): string {
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

const notifySchema = z.object({
  cardId: z.string().uuid(),
  departamento: z.string().nullable().optional(),
});

export const notifyApproversPending = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => notifySchema.parse(d))
  .handler(async ({ data }) => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const gmailKey = (process.env.GOOGLE_MAIL_API_KEY_1 || process.env.GOOGLE_MAIL_API_KEY);
    if (!lovableKey || !gmailKey) {
      console.error("[email] Missing LOVABLE_API_KEY or GOOGLE_MAIL_API_KEY");
      return { ok: false, sent: 0, reason: "missing_credentials" as const };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Resolve destinatários: aprovadores do departamento + fallback global (owner/admin)
    // quando nenhum aprovador local existir.
    const dept = (data.departamento ?? "").trim();
    const recipients = new Set<string>();

    if (dept) {
      const { data: settings } = await supabaseAdmin
        .from("approver_settings")
        .select("user_id, departments");
      const approverIds = (settings ?? [])
        .filter((s: any) => Array.isArray(s.departments) && s.departments.includes(dept))
        .map((s: any) => s.user_id as string);

      if (approverIds.length) {
        const { data: roles } = await supabaseAdmin
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", approverIds)
          .eq("role", "aprovador");
        const validIds = (roles ?? []).map((r: any) => r.user_id as string);
        if (validIds.length) {
          const { data: profs } = await supabaseAdmin
            .from("profiles")
            .select("email, is_active, is_deleted")
            .in("id", validIds);
          (profs ?? []).forEach((p: any) => {
            if (p?.email && p.is_active !== false && !p.is_deleted) recipients.add(p.email);
          });
        }
      }
    }

    // Fallback: nenhum aprovador local → notifica owners e admins ativos.
    if (recipients.size === 0) {
      const { data: roles } = await supabaseAdmin
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["owner", "admin"]);
      const ids = Array.from(new Set((roles ?? []).map((r: any) => r.user_id as string)));
      if (ids.length) {
        const { data: profs } = await supabaseAdmin
          .from("profiles")
          .select("email, is_active, is_deleted")
          .in("id", ids);
        (profs ?? []).forEach((p: any) => {
          if (p?.email && p.is_active !== false && !p.is_deleted) recipients.add(p.email);
        });
      }
    }

    // Regra cumulativa: o proprietário sempre recebe cópia das solicitações aguardando aprovação.
    recipients.add("herllon.souza@motormac.com.br");

    if (recipients.size === 0) {
      console.warn("[email] Nenhum destinatário para o departamento:", dept);
      return { ok: true, sent: 0 };
    }

    const html = buildHtml();
    const subject = "Solicitação aguarda a sua aprovação!";

    let sent = 0;
    const errors: string[] = [];
    await Promise.all(
      Array.from(recipients).map(async (to) => {
        try {
          const raw = encodeRfc2822(to, subject, html);
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
            errors.push(`[${to}] ${res.status}: ${body.slice(0, 300)}`);
            console.error("[email] Gmail send failed", to, res.status, body);
          } else {
            sent++;
          }
        } catch (e) {
          errors.push(`[${to}] ${(e as Error).message}`);
          console.error("[email] Exception sending to", to, e);
        }
      }),
    );

    return { ok: sent > 0, sent, total: recipients.size, errors };
  });

const rejectSchema = z.object({
  cardId: z.string().uuid(),
});

async function sendGmail(to: string, subject: string, html: string, lovableKey: string, gmailKey: string) {
  const raw = encodeRfc2822(to, subject, html);
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
    throw new Error(`Gmail ${res.status}: ${body.slice(0, 300)}`);
  }
}

export const notifyRequestRejected = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => rejectSchema.parse(d))
  .handler(async ({ data }) => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const gmailKey = (process.env.GOOGLE_MAIL_API_KEY_1 || process.env.GOOGLE_MAIL_API_KEY);
    if (!lovableKey || !gmailKey) {
      console.error("[email] Missing LOVABLE_API_KEY or GOOGLE_MAIL_API_KEY");
      return { ok: false, sent: 0, reason: "missing_credentials" as const };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: card, error } = await supabaseAdmin
      .from("kanban_cards")
      .select("id, codigo_unico, requester_email, requester_name, buyer_name, data, observations")
      .eq("id", data.cardId)
      .maybeSingle();

    if (error || !card) {
      console.error("[email] Card não encontrado para rejeição:", data.cardId, error);
      return { ok: false, sent: 0, reason: "card_not_found" as const };
    }

    const codigo = card.codigo_unico ?? card.id.slice(0, 8);
    const cardData = ((card.data as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
    const dept = typeof cardData.departamento === "string" ? (cardData.departamento as string).trim() : "";

    // Extrai o motivo e o autor da rejeição a partir do log mais recente
    // que contenha o padrão "Motivo: ..." ou "rejeitad".
    const obs = Array.isArray(card.observations) ? (card.observations as any[]) : [];
    let motivo = "Motivo não informado.";
    let comprador = card.buyer_name || "Comprador";
    for (let i = obs.length - 1; i >= 0; i--) {
      const o = obs[i];
      const text = typeof o?.text === "string" ? o.text : "";
      if (/rejeit|Motivo:/i.test(text)) {
        const m = text.match(/Motivo:\s*(.+?)\s*$/i);
        if (m) motivo = m[1].trim();
        if (typeof o?.author === "string" && o.author.trim()) comprador = o.author.trim();
        break;
      }
    }

    // Destinatários: solicitante + aprovadores do departamento.
    const recipients = new Map<string, string>(); // email -> nome
    if (card.requester_email) {
      recipients.set(card.requester_email, card.requester_name || "Solicitante");
    }

    if (dept) {
      const { data: settings } = await supabaseAdmin
        .from("approver_settings")
        .select("user_id, departments");
      const approverIds = (settings ?? [])
        .filter((s: any) => Array.isArray(s.departments) && s.departments.includes(dept))
        .map((s: any) => s.user_id as string);
      if (approverIds.length) {
        const { data: roles } = await supabaseAdmin
          .from("user_roles")
          .select("user_id, role")
          .in("user_id", approverIds)
          .eq("role", "aprovador");
        const validIds = (roles ?? []).map((r: any) => r.user_id as string);
        if (validIds.length) {
          const { data: profs } = await supabaseAdmin
            .from("profiles")
            .select("email, full_name, is_active, is_deleted")
            .in("id", validIds);
          (profs ?? []).forEach((p: any) => {
            if (p?.email && p.is_active !== false && !p.is_deleted) {
              if (!recipients.has(p.email)) recipients.set(p.email, p.full_name || "Aprovador");
            }
          });
        }
      }
    }

    if (recipients.size === 0) {
      console.warn("[email] Nenhum destinatário para rejeição do card:", codigo);
      return { ok: true, sent: 0 };
    }

    const subject = `Solicitação #${codigo} rejeitada`;
    let sent = 0;
    const errors: string[] = [];
    await Promise.all(
      Array.from(recipients.entries()).map(async ([to, name]) => {
        try {
          const html = buildRejectedHtml({ greetingName: name || "Solicitante", codigo, motivo, comprador });
          await sendGmail(to, subject, html, lovableKey, gmailKey);
          sent++;
        } catch (e) {
          errors.push(`[${to}] ${(e as Error).message}`);
          console.error("[email] Falha ao enviar rejeição:", to, e);
        }
      }),
    );

    return { ok: sent > 0, sent, total: recipients.size, errors };
  });

// ---------------------------------------------------------------------------
// Notificação de aprovação de cadastro: envia e-mail ao usuário recém-aprovado.
// ---------------------------------------------------------------------------
function buildApprovedHtml(params: { nome: string; perfil: string }) {
  const n = escapeHtml(params.nome);
  const p = escapeHtml(params.perfil);
  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:40px 16px;">
      <tr><td align="center">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:36px 36px 40px;border:1px solid #eceff3;">
          <tr><td align="center" style="padding:12px 0 28px;">
            <img src="${LOGO_URL}" alt="Motormac" width="110" height="110" style="display:block;border:0;width:110px;height:auto;max-width:45%;">
          </td></tr>
          <tr><td align="center" style="font-size:22px;font-weight:700;color:#0f6b3f;padding-bottom:20px;">
            Olá, ${n}
          </td></tr>
          <tr><td style="font-size:15px;line-height:1.65;color:#333;padding-bottom:14px;">
            Seu cadastro no sistema <strong>Central de Compras Motormac</strong> foi <strong>deferido</strong>.
          </td></tr>
          <tr><td style="font-size:15px;line-height:1.65;color:#333;padding-bottom:22px;">
            Seu perfil aprovado é: <strong>${p}</strong>
          </td></tr>
          <tr><td style="font-size:14px;line-height:1.6;color:#555;padding-bottom:22px;">
            Acesse a plataforma para começar:
          </td></tr>
          <tr><td align="center" style="padding-bottom:8px;">
            <a href="${APP_URL}" target="_blank" style="display:inline-block;background:#0f6b3f;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 28px;border-radius:8px;">Acessar Central de Compras</a>
          </td></tr>
          <tr><td align="center" style="font-size:12px;color:#777;padding-top:14px;">
            <a href="${APP_URL}" target="_blank" style="color:#0f6b3f;text-decoration:underline;">${APP_URL}</a>
          </td></tr>
          <tr><td align="center" style="font-size:11px;color:#9aa0a6;padding-top:32px;">
            Mensagem automática — favor não responder.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

const approvedSchema = z.object({
  email: z.string().email(),
  nome: z.string().min(1),
  perfil: z.string().min(1),
});

export const notifyUserApproved = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => approvedSchema.parse(d))
  .handler(async ({ data }) => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const gmailKey = (process.env.GOOGLE_MAIL_API_KEY_1 || process.env.GOOGLE_MAIL_API_KEY);
    if (!lovableKey || !gmailKey) {
      console.error("[email] Missing LOVABLE_API_KEY or GOOGLE_MAIL_API_KEY");
      return { ok: false, reason: "missing_credentials" as const };
    }
    try {
      const html = buildApprovedHtml({ nome: data.nome, perfil: data.perfil });
      await sendGmail(data.email, "Cadastro Aprovado - Central de Compras Motormac", html, lovableKey, gmailKey);
      return { ok: true };
    } catch (e) {
      console.error("[email] Falha ao enviar aprovação:", data.email, e);
      return { ok: false, error: (e as Error).message };
    }
  });



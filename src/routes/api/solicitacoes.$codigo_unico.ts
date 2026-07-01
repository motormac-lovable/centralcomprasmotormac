import { createFileRoute } from "@tanstack/react-router";
import { buildLinxPayload } from "@/services/api";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
  "Content-Type": "application/json",
};

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export const Route = createFileRoute("/api/solicitacoes/$codigo_unico")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ params, request }) => {
        const expected = process.env.LINX_API_SECRET;
        if (!expected) {
          return new Response(
            JSON.stringify({ error: "Endpoint não configurado." }),
            { status: 503, headers: CORS },
          );
        }
        const provided =
          request.headers.get("x-api-key") ??
          (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (!provided || !timingSafeEqualStr(provided, expected)) {
          return new Response(
            JSON.stringify({ error: "Não autorizado." }),
            { status: 401, headers: CORS },
          );
        }

        const codigo = params.codigo_unico?.trim().replace(/^#/, "");
        if (!codigo) {
          return new Response(
            JSON.stringify({ error: "codigo_unico ausente." }),
            { status: 400, headers: CORS },
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data, error } = await supabaseAdmin
          .from("kanban_cards")
          .select("*")
          .eq("codigo_unico", codigo)
          .maybeSingle();

        if (error) {
          return new Response(
            JSON.stringify({ error: "Falha ao consultar a solicitação." }),
            { status: 500, headers: CORS },
          );
        }
        if (!data) {
          return new Response(
            JSON.stringify({ error: `Solicitação ${codigo} não encontrada.` }),
            { status: 404, headers: CORS },
          );
        }

        const payload = buildLinxPayload(data);
        const body = {
          codigo_solicitacao: payload.identificacao.codigo_unico,
          ...payload,
        };

        return new Response(JSON.stringify(body), { status: 200, headers: CORS });
      },
    },
  },
});

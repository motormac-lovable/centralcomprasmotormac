import { createFileRoute } from "@tanstack/react-router";
import { buildLinxPayload } from "@/services/api";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

export const Route = createFileRoute("/api/solicitacoes/$codigo_unico")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ params }) => {
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

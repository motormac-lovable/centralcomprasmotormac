import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
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

        const supabase = createClient<Database>(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
        );

        const { data, error } = await supabase
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
          status_atual: payload.status_atual,
          data_ultima_atualizacao: payload.data_ultima_atualizacao,
          ...payload,
        };
        return new Response(JSON.stringify(body), { status: 200, headers: CORS });
      },
    },
  },
});

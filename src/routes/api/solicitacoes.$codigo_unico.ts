import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

// Mapeia o enum interno do Kanban para o rótulo público enviado à Linx.
const STATUS_LABEL: Record<string, string> = {
  solicitacoes_abertas: "Solicitação aberta",
  em_cotacao: "Em Cotação",
  aguardando_aprovacao: "Aguardando aprovação",
  cotacoes_rejeitadas: "Cotações Rejeitadas",
  cotacoes_aprovadas: "Cotações Aprovadas",
  pedidos_gerados: "Pedido Gerado",
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
          .select("codigo_unico, status, status_changed_at, updated_at")
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

        const body = {
          codigo_solicitacao: data.codigo_unico,
          status_atual: STATUS_LABEL[data.status] ?? data.status,
          data_ultima_atualizacao: data.status_changed_at ?? data.updated_at,
        };
        return new Response(JSON.stringify(body), { status: 200, headers: CORS });
      },
    },
  },
});

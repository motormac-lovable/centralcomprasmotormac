import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { translateError } from "@/lib/error-messages";

/** The existing RPC alone decides approval authority, ceilings and justifications. */
export const aprovarCotacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    cardId: z.string().uuid(), supplierId: z.string().min(1), justificativa: z.string(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: approved, error } = await context.supabase.rpc("approve_kanban_card", {
      _card_id: data.cardId, _selected_supplier_id: data.supplierId, _justificativa: data.justificativa,
    });
    if (error) throw new Error(translateError(error, "Não foi possível aprovar a cotação."));
    if (!approved || approved.status !== "pedidos_gerados") throw new Error("A aprovação não retornou um pedido gerado.");
    if (approved.kind === "contratos") return { pedido: null, aviso: null };
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { emitirPedidoCompra } = await import("@/lib/purchase-order.server");
      return { pedido: await emitirPedidoCompra(supabaseAdmin as never, approved.id), aviso: null };
    } catch (error) {
      return { pedido: null, aviso: translateError(error, "Cotação aprovada, mas não foi possível emitir o Pedido de Compra. Tente novamente no Kanban.") };
    }
  });
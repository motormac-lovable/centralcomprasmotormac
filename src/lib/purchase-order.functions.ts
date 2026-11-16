import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Garante número PC e e-mail automático; idempotente. Qualquer usuário que enxerga o card (RLS) pode acionar. */
export const gerarPedidoCompra = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cardId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: visivel } = await context.supabase.from("kanban_cards").select("id").eq("id", data.cardId).maybeSingle();
    if (!visivel) throw new Error("Solicitação não encontrada.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { emitirPedidoCompra } = await import("@/lib/purchase-order.server");
    return emitirPedidoCompra(supabaseAdmin as never, data.cardId);
  });

/** Reenvio manual ao fornecedor: comprador, administrador ou proprietário. */
export const reenviarPedidoFornecedor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cardId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    const ok = (roles ?? []).some((r: { role: string }) => ["buyer", "admin", "owner"].includes(r.role));
    if (!ok) throw new Error("Apenas compradores e administradores podem enviar o pedido ao fornecedor.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { emitirPedidoCompra } = await import("@/lib/purchase-order.server");
    return emitirPedidoCompra(supabaseAdmin as never, data.cardId, { reenviar: true });
  });

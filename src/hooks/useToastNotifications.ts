import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  shouldNotifyChat, chatToastText, TOAST_APROVACAO_PENDENTE, TOAST_MUDANCA_STATUS, TOAST_DURATION_MS,
} from "@/lib/chat-notify";

const opts = (id: string) => ({ id, duration: TOAST_DURATION_MS, closeButton: true });
const recent = (iso?: string | null) => !!iso && Date.now() - new Date(iso).getTime() < 60_000;

/** Toasts genéricos (sem IDs ou conteúdo de cards) disparados em tempo real. */
export function useToastNotifications() {
  const { user, fullName, isApprover, isOwner, isAdmin, approverDepartments } = useAuth();
  const uid = user?.id;

  useEffect(() => {
    if (!uid) return;
    const lastStatus = new Map<string, string>();

    const ch = supabase
      .channel(`toast-notify-${uid}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "card_messages" }, async (p) => {
        const m = p.new as { card_id: string; sender_id: string; sender_name: string };
        if (!m?.card_id || m.sender_id === uid) return;
        const { data: card } = await supabase
          .from("kanban_cards").select("requester_id, assigned_to, buyer_name").eq("id", m.card_id).maybeSingle();
        const me = { id: uid, name: fullName };
        if (!card || !shouldNotifyChat({ id: m.sender_id, name: m.sender_name }, me, card)) return;
        toast.info(chatToastText(me, card), opts("toast-novas-mensagens"));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "kanban_cards" }, (p) => {
        if (p.eventType === "DELETE") return;
        const c = p.new as { id: string; status: string; status_changed_at: string; requester_id: string | null; assigned_to: string | null; buyer_name: string | null; data: { departamento?: string } | null };
        const prev = lastStatus.get(c.id);
        lastStatus.set(c.id, c.status);
        if (prev === c.status || !recent(c.status_changed_at)) return;

        if (c.status === "aguardando_aprovacao") {
          const dept = c.data?.departamento ?? "";
          const inScope = isOwner || isAdmin || (isApprover && approverDepartments.includes(dept));
          if (inScope) toast.info(TOAST_APROVACAO_PENDENTE, opts("toast-aprovacao-pendente"));
        }
        if (p.eventType === "UPDATE" && (c.requester_id === uid || c.assigned_to === uid || (!!fullName && c.buyer_name?.trim().toLowerCase() === fullName.trim().toLowerCase()))) {
          toast.info(TOAST_MUDANCA_STATUS, opts("toast-mudanca-status"));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [uid, fullName, isApprover, isOwner, isAdmin, approverDepartments.join("|")]);
}

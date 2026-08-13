import { useEffect, useState } from "react";
import { Loader2, MessageSquare, Send, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { buyerLabel, fetchCardBuyer, sendCardMessage, type MessageCardRef } from "@/lib/messages";

function Frozen({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      <input
        readOnly
        disabled
        value={value}
        className="w-full rounded-md border bg-muted/60 px-3 py-2 text-sm text-foreground/80 cursor-not-allowed"
      />
    </div>
  );
}

export function SendMessageModal({ card, onClose }: { card: MessageCardRef; onClose: () => void }) {
  const { user, fullName, isBuyer, isAdmin, isOwner, isApprover } = useAuth();
  const [phone, setPhone] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [buyer, setBuyer] = useState<string | null>(card.buyer_name ?? null);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) return;
    supabase
      .from("profiles")
      .select("phone")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setPhone((data as { phone?: string } | null)?.phone ?? "");
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Comprador sempre lido do Kanban (fonte da verdade), não do estado da lista.
  useEffect(() => {
    let cancelled = false;
    fetchCardBuyer(card.id).then((b) => {
      if (!cancelled) setBuyer(b);
    });
    return () => {
      cancelled = true;
    };
  }, [card.id]);


  const submit = async () => {
    if (!user?.id) return;
    if (!body.trim()) {
      toast.error("Escreva a mensagem antes de enviar.");
      return;
    }
    setBusy(true);
    try {
      await sendCardMessage({
        card,
        body,
        sender: {
          id: user.id,
          name: fullName || user.email || "",
          email: user.email || "",
          phone,
          role: isOwner || isAdmin || isBuyer ? "comprador" : isApprover ? "aprovador" : "solicitante",
        },
      });
      toast.success("Mensagem enviada ao comprador responsável.");
      onClose();
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível enviar a mensagem.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border bg-card shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b p-5">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <MessageSquare className="h-3.5 w-3.5" /> Canal de comunicação
            </div>
            <h2 className="text-lg font-semibold mt-1">Enviar mensagem</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-muted" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <Frozen label="Solicitação de referência" value={card.codigo_unico ? `#${card.codigo_unico}` : card.id} />
          <Frozen label="Comprador Responsável" value={buyerLabel(buyer)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Frozen label="Nome completo" value={fullName || "—"} />
            <Frozen label="E-mail" value={user?.email || "—"} />
          </div>
          <Frozen label="Telefone" value={phone || "—"} />

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Mensagem</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="Descreva sua dúvida ou informação sobre esta solicitação…"
              className="w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t p-5">
          <button onClick={onClose} className="rounded-md border bg-card px-4 py-2 text-sm font-medium hover:bg-muted">
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar mensagem
          </button>
        </div>
      </div>
    </div>
  );
}

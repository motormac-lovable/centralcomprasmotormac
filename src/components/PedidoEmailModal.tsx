import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mail, Paperclip, Send, X } from "lucide-react";
import { toast } from "sonner";
import { obterModeloEmailPedido, reenviarPedidoFornecedor } from "@/lib/purchase-order.functions";
import { translateError } from "@/lib/error-messages";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const parse = (s: string) => s.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean);

/** Modelo editável do e-mail do Pedido de Compra (coluna Pedidos Gerados), enviado pela plataforma. */
export function PedidoEmailModal({ cardId, codigo, onClose }: { cardId: string; codigo: string; onClose: () => void }) {
  const modeloFn = useServerFn(obterModeloEmailPedido);
  const enviarFn = useServerFn(reenviarPedidoFornecedor);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [anexos, setAnexos] = useState<string[]>([]);

  useEffect(() => {
    let on = true;
    modeloFn({ data: { cardId } })
      .then((m) => { if (!on) return; setTo(m.to.join(", ")); setCc(m.cc); setSubject(m.subject); setBody(m.body); setAnexos(m.anexos); })
      .catch((e) => { toast.error(translateError(e instanceof Error ? e.message : String(e))); onClose(); })
      .finally(() => on && setLoading(false));
    return () => { on = false; };
  }, [cardId]); // eslint-disable-line react-hooks/exhaustive-deps

  const lista = parse(to);
  const enviar = async () => {
    if (!lista.length) return toast.error("Informe ao menos um destinatário.");
    const bad = lista.find((e) => !EMAIL_RE.test(e));
    if (bad) return toast.error(`E-mail inválido: ${bad}`);
    if (!subject.trim() || !body.trim()) return toast.error("Assunto e mensagem são obrigatórios.");
    setSending(true);
    try {
      const r = await enviarFn({ data: { cardId, to: lista, cc: cc.trim(), subject, body } });
      if (r.email_status === "enviado") { toast.success(`Pedido enviado (${lista.join(", ")}).`); onClose(); }
      else toast.error("Não foi possível enviar o e-mail ao fornecedor.");
    } catch (e) {
      toast.error(translateError(e instanceof Error ? e.message : String(e)));
    } finally { setSending(false); }
  };

  const input = "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary";
  const label = "text-xs font-semibold uppercase tracking-wider text-muted-foreground";
  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        <div className="p-5 border-b flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent text-primary flex items-center justify-center shrink-0"><Mail className="h-5 w-5" /></div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold">Enviar Pedido de Compra</h2>
            <p className="text-xs text-muted-foreground">Solicitação #{codigo}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>
        {loading ? (
          <div className="p-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="p-5 space-y-4 overflow-y-auto">
            <div>
              <label className={label}>Destinatários (Para)</label>
              <textarea value={to} onChange={(e) => setTo(e.target.value)} rows={2} placeholder="fornecedor@empresa.com, outro@empresa.com" className={input} />
              <p className="mt-1 text-[11px] text-muted-foreground">Separe por vírgula.{lista.length > 0 && ` (${lista.length} destinatário${lista.length > 1 ? "s" : ""})`}</p>
            </div>
            <div>
              <label className={label}>Comprador responsável (Cópia · CC)</label>
              <input value={cc} onChange={(e) => setCc(e.target.value)} className={input} />
            </div>
            <div>
              <label className={label}>Assunto</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} className={input} />
            </div>
            <div>
              <label className={label}>Corpo da mensagem</label>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={14} className={`${input} font-mono leading-relaxed`} />
            </div>
            <div>
              <h3 className={`${label} flex items-center gap-2`}><Paperclip className="h-3.5 w-3.5" /> Anexos ({anexos.length})</h3>
              <ul className="mt-2 space-y-1">
                {anexos.map((a) => (
                  <li key={a} className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5 text-xs">
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span className="truncate">{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        <div className="p-4 border-t flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">Cancelar</button>
          <button type="button" onClick={enviar} disabled={sending || loading}
            className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-60">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar Pedido
          </button>
        </div>
      </div>
    </div>
  );
}

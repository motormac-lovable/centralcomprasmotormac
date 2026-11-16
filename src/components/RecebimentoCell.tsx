import { useState } from "react";
import { ThumbsUp, ThumbsDown, Star } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RELATO_MAX, SUGESTAO_MAX, getRecebimento, recebimentoStatus } from "@/lib/recebimento";
import { registrarRecebimento } from "@/lib/recebimento.functions";
import { translateError } from "@/lib/error-messages";

const VERDE = "#16aa4f";
const VERMELHO = "#de2625";

export function recebimentoCellStyle(card: { status: string; data: unknown }): React.CSSProperties {
  const s = recebimentoStatus(card);
  if (s === "aguardando_docs") return { backgroundColor: "rgba(255, 240, 0, 0.4)" };
  if (s === "pendente_aceite") return { backgroundColor: "rgba(222, 38, 37, 0.4)" };
  return {};
}

function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex flex-col gap-1.5 mt-3">
      <span className="text-xs font-medium">Avaliação do atendimento/entrega (1 a 5 estrelas):</span>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => onChange(n)} aria-label={`${n} estrela(s)`} className="p-1 transition-transform hover:scale-110">
            <Star className="w-6 h-6" style={n <= value ? { fill: "#facc15", color: "#facc15" } : { color: "var(--muted-foreground)" }} />
          </button>
        ))}
      </div>
    </div>
  );
}

export function RecebimentoButtons({
  card,
  canAct,
  onUpdated,
}: {
  card: { id: string; status: string; data: unknown };
  canAct: boolean;
  onUpdated: () => void;
}) {
  const status = recebimentoStatus(card);
  const rec = getRecebimento(card.data);
  const [open, setOpen] = useState<null | "up" | "down">(null);
  const [estrelas, setEstrelas] = useState(0);
  const [texto, setTexto] = useState("");
  const [loading, setLoading] = useState(false);
  const locked = status !== "pendente_aceite" || !canAct;

  const abrir = (k: "up" | "down") => { setEstrelas(0); setTexto(""); setOpen(k); };

  const enviar = async () => {
    if (open === "down" && !texto.trim()) { toast.error("Por favor, explique o que aconteceu antes de confirmar."); return; }
    setLoading(true);
    try {
      await registrarRecebimento({
        data: {
          card_id: card.id,
          decisao: open === "up" ? "confirmado" : "problema",
          estrelas,
          ...(open === "up" ? { sugestao: texto } : { relato: texto }),
        },
      });
      toast.success(open === "up" ? "Recebimento confirmado." : "Ocorrência registrada e comprador avisado pelo chat da solicitação.");
      setOpen(null);
      onUpdated();
    } catch (e: any) {
      const msg = e instanceof Response ? await e.text() : e?.message;
      toast.error(translateError(msg, "Não foi possível registrar o recebimento."));
    } finally { setLoading(false); }
  };

  const titleUp = status === "confirmado" ? `Recebimento confirmado (${rec?.estrelas}/5)` :
    status === "aguardando_docs" ? "Aguardando anexos fiscais do comprador" :
    status === "pendente_aceite" ? (canAct ? "Confirmar recebimento" : "Aguardando confirmação do solicitante") : "Indisponível nesta etapa";
  const titleDown = status === "problema" ? `Problema reportado: ${rec?.relato ?? ""}` :
    status === "pendente_aceite" && canAct ? "Reportar problema na entrega" : "Indisponível nesta etapa";

  const btn = (active: boolean, color: string) =>
    active ? { backgroundColor: color, color: "#fff" } : undefined;

  return (
    <>
      <div className="inline-flex items-center gap-2">
        <button type="button" disabled={locked} onClick={() => abrir("up")} title={titleUp} aria-label={titleUp}
          style={btn(status === "confirmado", VERDE)}
          className={`p-1.5 rounded-md transition ${status === "confirmado" ? "" : locked ? "opacity-40 cursor-not-allowed" : "hover:bg-muted"}`}>
          <ThumbsUp className="w-4 h-4" />
        </button>
        <button type="button" disabled={locked} onClick={() => abrir("down")} title={titleDown} aria-label={titleDown}
          style={btn(status === "problema", VERMELHO)}
          className={`p-1.5 rounded-md transition ${status === "problema" ? "" : locked ? "opacity-40 cursor-not-allowed" : "hover:bg-muted"}`}>
          <ThumbsDown className="w-4 h-4" />
        </button>
      </div>

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle style={open === "down" ? { color: VERMELHO } : undefined}>
              {open === "up" ? "Confirmação de Recebimento" : "Reportar Falha na Entrega"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {open === "up" ? (
              <>
                <p className="font-medium">Ao confirmar o recebimento o solicitante indica que:</p>
                <ol className="list-decimal pl-5 space-y-1.5">
                  <li>Recebeu as mercadorias ou serviço citadas nessa solicitação. Em caso de dúvidas, clique em “visualizar” na guia Minhas solicitações e confira o que você pediu; e</li>
                  <li>Os requisitos de prestação serviço ou mercadoria foram atendidos;</li>
                </ol>
              </>
            ) : (
              <p className="font-medium">Olá, identificamos um problema com a sua solicitação. Poderia nos reportar com mais detalhes?</p>
            )}
            <div>
              <label className="block text-xs font-medium mb-1">
                {open === "up"
                  ? `Deixe uma sugestão (opcional - máx. ${SUGESTAO_MAX} caracteres):`
                  : <>Explique o que aconteceu <span style={{ color: VERMELHO }}>*</span> (máx. {RELATO_MAX} caracteres):</>}
              </label>
              <Textarea
                maxLength={open === "up" ? SUGESTAO_MAX : RELATO_MAX}
                rows={open === "up" ? 3 : 4}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={open === "up" ? "Digite sua sugestão ou elogio..." : "Descreva detalhadamente a divergência, avaria ou atraso..."}
              />
              <span className="text-[11px] text-muted-foreground float-right mt-0.5">
                {texto.length}/{open === "up" ? SUGESTAO_MAX : RELATO_MAX}
              </span>
            </div>
            <Stars value={estrelas} onChange={setEstrelas} />
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setOpen(null)} disabled={loading}>Cancelar</Button>
            <Button onClick={enviar} disabled={loading || (open === "down" && !texto.trim())}
              style={{ backgroundColor: open === "up" ? VERDE : VERMELHO, color: "#fff" }}>
              {loading ? "Processando..." : "Confirma"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Field, FormShell, inputCls } from "../components/forms/FormShell";
import {
  BlocoInicialPadrao,
  BLOCO_INICIAL_VAZIO,
  type BlocoInicial,
  validateBlocoInicial,
} from "../components/forms/BlocoInicialPadrao";
import { addHistory } from "../lib/history";
import { createCard } from "../lib/cards";
import { maskCEP, maskCNPJ, maskMoney } from "../lib/masks";
import { DepartamentoPicker } from "../components/forms/DepartamentoPicker";

export const Route = createFileRoute("/frete")({
  head: () => ({
    meta: [
      { title: "Solicitação de Frete — Motormac" },
      { name: "description", content: "Formulário de solicitação de cotação e agendamento de frete." },
    ],
  }),
  component: FretePage,
});

type Volume = {
  altura: string;
  largura: string;
  comprimento: string;
  tipoProduto: string;
  pesoBruto: string;
  volumes: string;
  valorMercadoria: string;
};

const VOLUME_VAZIO: Volume = {
  altura: "",
  largura: "",
  comprimento: "",
  tipoProduto: "",
  pesoBruto: "",
  volumes: "",
  valorMercadoria: "",
};

const VOLUME_LABELS: Record<keyof Volume, string> = {
  altura: "Altura",
  largura: "Largura",
  comprimento: "Comprimento",
  tipoProduto: "Tipo de produto",
  pesoBruto: "Peso bruto",
  volumes: "Número de volumes",
  valorMercadoria: "Valor da Mercadoria",
};

/** Converte "R$ 1.234,56" em número. */
function parseMoney(v: string): number {
  const d = (v || "").replace(/\D/g, "");
  return d ? parseInt(d, 10) / 100 : 0;
}

const formatBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function FretePage() {
  const navigate = useNavigate();
  const [bloco, setBloco] = useState<BlocoInicial>(BLOCO_INICIAL_VAZIO);
  const [f, setF] = useState({
    departamento: "",
    departamento_codigo: "",
    cnpjPagador: "", cnpjRemetente: "", cnpjDestinatario: "",
    cidadeOrigem: "", cepOrigem: "", cidadeDestino: "", cepDestino: "",
    dataColetaPrevista: "", dataEntregaPrevista: "",
  });
  const [volumesList, setVolumesList] = useState<Volume[]>([{ ...VOLUME_VAZIO }]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: string) => setF((s) => ({ ...s, [k]: v }));
  const setVol = (i: number, k: keyof Volume, v: string) =>
    setVolumesList((list) => list.map((vol, idx) => (idx === i ? { ...vol, [k]: v } : vol)));

  const valorTotalMercadorias = volumesList.reduce((sum, v) => sum + parseMoney(v.valorMercadoria), 0);
  const totalVolumes = volumesList.reduce((sum, v) => sum + (parseInt(v.volumes || "0", 10) || 0), 0);

  const REQUIRED_FREIGHT_LABELS: Record<string, string> = {
    departamento: "Departamento",
    cnpjPagador: "CNPJ do pagador do frete",
    cnpjRemetente: "CNPJ do remetente",
    cnpjDestinatario: "CNPJ do destinatário",
    cidadeOrigem: "Cidade de origem",
    cepOrigem: "CEP de origem",
    cidadeDestino: "Cidade de destino",
    cepDestino: "CEP de destino",
  };

  const submit = async (e: React.FormEvent) => {
    if (submitting) return;
    e.preventDefault();
    const blocoEr = validateBlocoInicial(bloco);
    const freightEr: Record<string, string> = {};
    for (const key of Object.keys(REQUIRED_FREIGHT_LABELS)) {
      if (!String((f as Record<string, string>)[key] ?? "").trim()) {
        freightEr[key] = "Campo obrigatório";
      }
    }
    volumesList.forEach((vol, i) => {
      (Object.keys(VOLUME_LABELS) as Array<keyof Volume>).forEach((k) => {
        if (!String(vol[k] ?? "").trim()) freightEr[`vol_${i}_${k}`] = "Campo obrigatório";
      });
    });
    const allErr = { ...blocoEr, ...freightEr };
    setErrors(allErr);
    if (Object.keys(allErr).length) {
      toast.error("Preencha todos os campos obrigatórios.");
      return;
    }
    setSubmitting(true);
    const primeiro = volumesList[0];
    const payload = {
      ...bloco,
      ...f,
      // Compatibilidade com consumidores antigos (primeiro volume consolidado)
      altura: primeiro.altura,
      largura: primeiro.largura,
      comprimento: primeiro.comprimento,
      tipoProduto: primeiro.tipoProduto,
      pesoBruto: primeiro.pesoBruto,
      volumes: String(totalVolumes),
      volumesList,
      valorTotalMercadorias: formatBRL(valorTotalMercadorias),
    };
    const titulo = `Frete: ${f.cidadeOrigem || "—"} → ${f.cidadeDestino || "—"}`;
    const resumo = `${formatBRL(valorTotalMercadorias)} · ${totalVolumes} vol. · ${volumesList.length} lançamento(s)`;
    try {
      await createCard({
        kind: "frete",
        title: titulo,
        summary: resumo,
        requester_name: bloco.nome,
        requester_email: bloco.email,
        unidade: bloco.unidade,
        empresa: bloco.empresa,
        // Fretes seguem o fluxo padrão: abertura → cotação → aprovação do gestor → pedido
        data: payload,
      });
    } catch (err) {
      toast.error("Falha ao enviar: " + (err as Error).message);
      setSubmitting(false);
      return;
    }
    addHistory({ kind: "frete", title: titulo, summary: resumo, data: payload });
    toast.success("Solicitação enviada com sucesso!");
    navigate({ to: "/historico" });
  };

  return (
    <FormShell
      title="Solicitação de Frete"
      description="Informe os dados de origem, destino e da carga para cotação."
      accent="oklch(0.6 0.18 150)"
    >
      <form onSubmit={submit} className="grid gap-5">
        <BlocoInicialPadrao value={bloco} onChange={setBloco} errors={errors as Partial<Record<keyof BlocoInicial, string>>} />

        <DepartamentoPicker
          required
          nome={f.departamento}
          codigo={f.departamento_codigo}
          error={errors.departamento}
          hint="Direciona a aprovação para o gestor responsável pelo departamento."
          onChange={({ nome, codigo }) =>
            setF((s) => ({ ...s, departamento: nome, departamento_codigo: codigo }))
          }
        />

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <Field label="CNPJ do pagador do frete" required error={errors.cnpjPagador}>
            <input className={inputCls} value={f.cnpjPagador} onChange={(e) => set("cnpjPagador", maskCNPJ(e.target.value))} />
          </Field>
          <Field label="CNPJ do remetente" required error={errors.cnpjRemetente}>
            <input className={inputCls} value={f.cnpjRemetente} onChange={(e) => set("cnpjRemetente", maskCNPJ(e.target.value))} />
          </Field>
          <Field label="CNPJ do destinatário" required error={errors.cnpjDestinatario}>
            <input className={inputCls} value={f.cnpjDestinatario} onChange={(e) => set("cnpjDestinatario", maskCNPJ(e.target.value))} />
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <Field label="Cidade de origem" required error={errors.cidadeOrigem}>
            <input className={inputCls} value={f.cidadeOrigem} onChange={(e) => set("cidadeOrigem", e.target.value)} />
          </Field>
          <Field label="CEP de origem" required error={errors.cepOrigem}>
            <input className={inputCls} placeholder="00000-000" value={f.cepOrigem} onChange={(e) => set("cepOrigem", maskCEP(e.target.value))} />
          </Field>
          <Field label="Cidade de destino" required error={errors.cidadeDestino}>
            <input className={inputCls} value={f.cidadeDestino} onChange={(e) => set("cidadeDestino", e.target.value)} />
          </Field>
          <Field label="CEP de destino" required error={errors.cepDestino}>
            <input className={inputCls} placeholder="00000-000" value={f.cepDestino} onChange={(e) => set("cepDestino", maskCEP(e.target.value))} />
          </Field>
        </div>

        {/* ── Volumes ── */}
        <div className="grid gap-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Volumes da carga</h3>
              <p className="text-xs text-muted-foreground">
                Volumes iguais podem ser lançados em um único registro. Para tamanhos ou valores distintos, adicione novos volumes.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setVolumesList((l) => [...l, { ...VOLUME_VAZIO }])}
              className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted transition"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar volume
            </button>
          </div>

          {volumesList.map((vol, i) => (
            <div key={i} className="rounded-xl border p-4 grid gap-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Volume {i + 1}
                </span>
                {volumesList.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setVolumesList((l) => l.filter((_, idx) => idx !== i))}
                    className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10 transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remover
                  </button>
                )}
              </div>

              <Field
                label="Dimensões das embalagens (Altura x Largura x Comprimento) em cm"
                required
                error={errors[`vol_${i}_altura`] || errors[`vol_${i}_largura`] || errors[`vol_${i}_comprimento`]}
              >
                <div className="grid grid-cols-3 gap-3">
                  <input className={inputCls} placeholder="Altura" value={vol.altura} onChange={(e) => setVol(i, "altura", e.target.value)} />
                  <input className={inputCls} placeholder="Largura" value={vol.largura} onChange={(e) => setVol(i, "largura", e.target.value)} />
                  <input className={inputCls} placeholder="Comprimento" value={vol.comprimento} onChange={(e) => setVol(i, "comprimento", e.target.value)} />
                </div>
              </Field>

              <Field label="Tipo de produto" required error={errors[`vol_${i}_tipoProduto`]}>
                <input
                  className={inputCls}
                  placeholder="Ex: peças automotivas, óleo lubrificante..."
                  value={vol.tipoProduto}
                  onChange={(e) => setVol(i, "tipoProduto", e.target.value)}
                />
              </Field>

              <div className="grid sm:grid-cols-3 gap-5">
                <Field label="Peso bruto (kg)" required error={errors[`vol_${i}_pesoBruto`]}>
                  <input className={inputCls} type="number" min="0" step="0.01" value={vol.pesoBruto} onChange={(e) => setVol(i, "pesoBruto", e.target.value)} />
                </Field>
                <Field label="Número de volumes" required error={errors[`vol_${i}_volumes`]}>
                  <input className={inputCls} type="number" min="0" value={vol.volumes} onChange={(e) => setVol(i, "volumes", e.target.value)} />
                </Field>
                <Field label="Valor da Mercadoria" required error={errors[`vol_${i}_valorMercadoria`]}>
                  <input className={inputCls} placeholder="R$ 0,00" value={vol.valorMercadoria} onChange={(e) => setVol(i, "valorMercadoria", maskMoney(e.target.value))} />
                </Field>
              </div>
            </div>
          ))}

          <Field label="Valor total da(s) Mercadoria(s)" hint="Calculado automaticamente pela soma dos volumes.">
            <input className={`${inputCls} bg-muted/50 font-semibold`} value={formatBRL(valorTotalMercadorias)} readOnly disabled />
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Data de coleta prevista" hint="Opcional">
            <input className={inputCls} type="date" value={f.dataColetaPrevista} onChange={(e) => set("dataColetaPrevista", e.target.value)} />
          </Field>
          <Field label="Data de entrega prevista" hint="Opcional">
            <input className={inputCls} type="date" value={f.dataEntregaPrevista} onChange={(e) => set("dataEntregaPrevista", e.target.value)} />
          </Field>
        </div>


        <div className="flex justify-stretch md:justify-end pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full md:w-auto items-center justify-center rounded-md bg-primary px-6 py-2.5 md:py-1.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition"
          >
            {submitting ? "Enviando…" : "Enviar solicitação"}
          </button>
        </div>
      </form>
    </FormShell>
  );
}

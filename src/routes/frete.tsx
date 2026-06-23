import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
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

export const Route = createFileRoute("/frete")({
  head: () => ({
    meta: [
      { title: "Solicitação de Frete — Motormac" },
      { name: "description", content: "Formulário de solicitação de cotação e agendamento de frete." },
    ],
  }),
  component: FretePage,
});

function FretePage() {
  const navigate = useNavigate();
  const [bloco, setBloco] = useState<BlocoInicial>(BLOCO_INICIAL_VAZIO);
  const [f, setF] = useState({
    cnpjPagador: "", cnpjRemetente: "", cnpjDestinatario: "",
    cidadeOrigem: "", cepOrigem: "", cidadeDestino: "", cepDestino: "",
    valorNF: "", pesoBruto: "", volumes: "",
    altura: "", largura: "", comprimento: "", tipoProduto: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof f>(k: K, v: string) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const blocoEr = validateBlocoInicial(bloco);
    setErrors(blocoEr);
    if (Object.keys(blocoEr).length) {
      toast.error("Verifique os campos obrigatórios.");
      return;
    }
    const payload = { ...bloco, ...f };
    try {
      await createCard({
        kind: "frete",
        title: `Frete: ${f.cidadeOrigem || "—"} → ${f.cidadeDestino || "—"}`,
        summary: `NF ${f.valorNF || "—"} · ${f.volumes || 0} vol.`,
        requester_name: bloco.nome,
        requester_email: bloco.email,
        unidade: bloco.unidade,
        empresa: bloco.empresa,
        status: "pedidos_gerados",
        data: payload,
      });
    } catch (err) {
      toast.error("Falha ao enviar: " + (err as Error).message);
      return;
    }
    addHistory({ kind: "frete", title: `Frete: ${f.cidadeOrigem || "—"} → ${f.cidadeDestino || "—"}`, summary: `NF ${f.valorNF || "—"} · ${f.volumes || 0} vol.`, data: payload });
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

        <div className="grid sm:grid-cols-3 gap-5">
          <Field label="CNPJ do pagador do frete">
            <input className={inputCls} value={f.cnpjPagador} onChange={(e) => set("cnpjPagador", maskCNPJ(e.target.value))} />
          </Field>
          <Field label="CNPJ do remetente">
            <input className={inputCls} value={f.cnpjRemetente} onChange={(e) => set("cnpjRemetente", maskCNPJ(e.target.value))} />
          </Field>
          <Field label="CNPJ do destinatário">
            <input className={inputCls} value={f.cnpjDestinatario} onChange={(e) => set("cnpjDestinatario", maskCNPJ(e.target.value))} />
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Cidade de origem">
            <input className={inputCls} value={f.cidadeOrigem} onChange={(e) => set("cidadeOrigem", e.target.value)} />
          </Field>
          <Field label="CEP de origem">
            <input className={inputCls} placeholder="00000-000" value={f.cepOrigem} onChange={(e) => set("cepOrigem", maskCEP(e.target.value))} />
          </Field>
          <Field label="Cidade de destino">
            <input className={inputCls} value={f.cidadeDestino} onChange={(e) => set("cidadeDestino", e.target.value)} />
          </Field>
          <Field label="CEP de destino">
            <input className={inputCls} placeholder="00000-000" value={f.cepDestino} onChange={(e) => set("cepDestino", maskCEP(e.target.value))} />
          </Field>
        </div>

        <div className="grid sm:grid-cols-3 gap-5">
          <Field label="Valor total da Nota Fiscal">
            <input className={inputCls} placeholder="R$ 0,00" value={f.valorNF} onChange={(e) => set("valorNF", maskMoney(e.target.value))} />
          </Field>
          <Field label="Peso bruto (kg)">
            <input className={inputCls} type="number" min="0" step="0.01" value={f.pesoBruto} onChange={(e) => set("pesoBruto", e.target.value)} />
          </Field>
          <Field label="Número de volumes">
            <input className={inputCls} type="number" min="0" value={f.volumes} onChange={(e) => set("volumes", e.target.value)} />
          </Field>
        </div>

        <Field label="Dimensões das embalagens (Altura x Largura x Comprimento) em cm">
          <div className="grid grid-cols-3 gap-3">
            <input className={inputCls} placeholder="Altura" value={f.altura} onChange={(e) => set("altura", e.target.value)} />
            <input className={inputCls} placeholder="Largura" value={f.largura} onChange={(e) => set("largura", e.target.value)} />
            <input className={inputCls} placeholder="Comprimento" value={f.comprimento} onChange={(e) => set("comprimento", e.target.value)} />
          </div>
        </Field>

        <Field label="Tipo de produto">
          <input className={inputCls} placeholder="Ex: peças automotivas, óleo lubrificante..." value={f.tipoProduto} onChange={(e) => set("tipoProduto", e.target.value)} />
        </Field>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition"
          >
            Enviar solicitação
          </button>
        </div>
      </form>
    </FormShell>
  );
}

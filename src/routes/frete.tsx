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

function FretePage() {
  const navigate = useNavigate();
  const [bloco, setBloco] = useState<BlocoInicial>(BLOCO_INICIAL_VAZIO);
  const [f, setF] = useState({
    departamento: "",
    departamento_codigo: "",
    cnpjPagador: "", cnpjRemetente: "", cnpjDestinatario: "",
    cidadeOrigem: "", cepOrigem: "", cidadeDestino: "", cepDestino: "",
    valorNF: "", pesoBruto: "", volumes: "",
    altura: "", largura: "", comprimento: "", tipoProduto: "",
    dataColetaPrevista: "", dataEntregaPrevista: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof f>(k: K, v: string) => setF((s) => ({ ...s, [k]: v }));

  const REQUIRED_FREIGHT_LABELS: Record<string, string> = {
    departamento: "Departamento",
    cnpjPagador: "CNPJ do pagador do frete",
    cnpjRemetente: "CNPJ do remetente",
    cnpjDestinatario: "CNPJ do destinatário",
    cidadeOrigem: "Cidade de origem",
    cepOrigem: "CEP de origem",
    cidadeDestino: "Cidade de destino",
    cepDestino: "CEP de destino",
    valorNF: "Valor total da Nota Fiscal",
    pesoBruto: "Peso bruto",
    volumes: "Número de volumes",
    altura: "Altura",
    largura: "Largura",
    comprimento: "Comprimento",
    tipoProduto: "Tipo de produto",
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const blocoEr = validateBlocoInicial(bloco);
    const freightEr: Record<string, string> = {};
    for (const key of Object.keys(REQUIRED_FREIGHT_LABELS)) {
      if (!String((f as Record<string, string>)[key] ?? "").trim()) {
        freightEr[key] = "Campo obrigatório";
      }
    }
    const allErr = { ...blocoEr, ...freightEr };
    setErrors(allErr);
    if (Object.keys(allErr).length) {
      toast.error("Preencha todos os campos obrigatórios.");
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
        // Fretes seguem o fluxo padrão: abertura → cotação → aprovação do gestor → pedido
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

        <div className="grid sm:grid-cols-3 gap-5">
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

        <div className="grid sm:grid-cols-2 gap-5">
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

        <div className="grid sm:grid-cols-3 gap-5">
          <Field label="Valor total da Nota Fiscal" required error={errors.valorNF}>
            <input className={inputCls} placeholder="R$ 0,00" value={f.valorNF} onChange={(e) => set("valorNF", maskMoney(e.target.value))} />
          </Field>
          <Field label="Peso bruto (kg)" required error={errors.pesoBruto}>
            <input className={inputCls} type="number" min="0" step="0.01" value={f.pesoBruto} onChange={(e) => set("pesoBruto", e.target.value)} />
          </Field>
          <Field label="Número de volumes" required error={errors.volumes}>
            <input className={inputCls} type="number" min="0" value={f.volumes} onChange={(e) => set("volumes", e.target.value)} />
          </Field>
        </div>

        <Field label="Dimensões das embalagens (Altura x Largura x Comprimento) em cm" required error={errors.altura || errors.largura || errors.comprimento}>
          <div className="grid grid-cols-3 gap-3">
            <input className={inputCls} placeholder="Altura" value={f.altura} onChange={(e) => set("altura", e.target.value)} />
            <input className={inputCls} placeholder="Largura" value={f.largura} onChange={(e) => set("largura", e.target.value)} />
            <input className={inputCls} placeholder="Comprimento" value={f.comprimento} onChange={(e) => set("comprimento", e.target.value)} />
          </div>
        </Field>

        <Field label="Tipo de produto" required error={errors.tipoProduto}>
          <input className={inputCls} placeholder="Ex: peças automotivas, óleo lubrificante..." value={f.tipoProduto} onChange={(e) => set("tipoProduto", e.target.value)} />
        </Field>

        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Data de coleta prevista" hint="Opcional">
            <input className={inputCls} type="date" value={f.dataColetaPrevista} onChange={(e) => set("dataColetaPrevista", e.target.value)} />
          </Field>
          <Field label="Data de entrega prevista" hint="Opcional">
            <input className={inputCls} type="date" value={f.dataEntregaPrevista} onChange={(e) => set("dataEntregaPrevista", e.target.value)} />
          </Field>
        </div>


        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition"
          >
            Enviar solicitação
          </button>
        </div>
      </form>
    </FormShell>
  );
}

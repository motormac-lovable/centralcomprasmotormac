import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Field, FormShell, inputCls } from "../components/forms/FormShell";
import { FileUpload, type PickedFile } from "../components/forms/FileUpload";
import { addHistory } from "../lib/history";
import { createCard } from "../lib/cards";
import { isValidEmail, maskCNPJ, maskMoney } from "../lib/masks";

export const Route = createFileRoute("/contratos")({
  head: () => ({
    meta: [
      { title: "Cadastro ou Renovação de Contratos — Motormac" },
      { name: "description", content: "Formulário de cadastro, renovação ou retificação de contratos." },
    ],
  }),
  component: ContratosPage,
});

const unidades = [
  "Porto Alegre/RS", "Passo Fundo/RS", "São Gabriel/RS", "São José/SC",
  "Chapecó/SC", "Colombo/PR", "Maringá/PR",
];
const empresas = [
  "Distribuidora Meridional de Motores Cummins LTDA (DMMC)",
  "NEST Inovação em energia (NEST)",
  "Motormac Administração e Locação de Bens (MALB)",
  "SV Parts",
];
const tipos = [
  "Cadastro de contrato novo",
  "Inclusão de aditivo de renovação de contrato",
  "Retificação de saldo de contrato",
];

function ContratosPage() {
  const navigate = useNavigate();
  const [f, setF] = useState({
    nome: "", email: "", telefone: "", unidade: "", empresa: "",
    objeto: "", tipo: "", contratoAnterior: "", cnpjFornecedor: "",
    razaoSocial: "", validacaoGestor: "", nomeGestor: "",
    validacaoJuridica: "", dataInicio: "", dataFim: "",
    valorMensal: "", valorTotal: "", declaracao: false,
  });
  const [contrato, setContrato] = useState<PickedFile[]>([]);
  const [financeiro, setFinanceiro] = useState<PickedFile[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!f.nome.trim()) er.nome = "Obrigatório";
    if (!isValidEmail(f.email)) er.email = "E-mail inválido";
    if (!f.unidade) er.unidade = "Obrigatório";
    if (!f.empresa) er.empresa = "Obrigatório";
    if (!f.objeto.trim()) er.objeto = "Obrigatório";
    if (!f.tipo) er.tipo = "Obrigatório";
    if (f.tipo !== "Cadastro de contrato novo" && !f.contratoAnterior.trim())
      er.contratoAnterior = "Obrigatório para aditivo/retificação";
    if (!f.razaoSocial.trim()) er.razaoSocial = "Obrigatório";
    if (!f.validacaoGestor) er.validacaoGestor = "Obrigatório";
    if (!f.nomeGestor.trim()) er.nomeGestor = "Obrigatório";
    if (!f.validacaoJuridica) er.validacaoJuridica = "Obrigatório";
    if (contrato.length === 0) er.contrato = "Envie o contrato assinado";
    if (!f.dataInicio) er.dataInicio = "Obrigatório";
    if (!f.dataFim) er.dataFim = "Obrigatório";
    if (!f.valorMensal.trim()) er.valorMensal = "Obrigatório";
    if (!f.valorTotal.trim()) er.valorTotal = "Obrigatório";
    if (!f.declaracao) er.declaracao = "Você deve concordar com a declaração";
    setErrors(er);
    if (Object.keys(er).length) {
      toast.error("Verifique os campos obrigatórios.");
      return;
    }
    try {
      await createCard({
        kind: "contratos",
        title: `${f.tipo} — ${f.razaoSocial}`,
        summary: `${f.empresa} · ${f.unidade}`,
        requester_name: f.nome,
        requester_email: f.email,
        unidade: f.unidade,
        empresa: f.empresa,
        data: { ...f, contrato: contrato.map((x) => x.name), financeiro: financeiro.map((x) => x.name) },
      });
    } catch (err) {
      toast.error("Falha ao enviar: " + (err as Error).message);
      return;
    }
    addHistory({
      kind: "contratos",
      title: `${f.tipo} — ${f.razaoSocial}`,
      summary: `${f.empresa} · ${f.unidade}`,
      data: { ...f, contrato: contrato.map((x) => x.name), financeiro: financeiro.map((x) => x.name) },
    });
    toast.success("Solicitação enviada com sucesso!");
    navigate({ to: "/historico" });
  };

  return (
    <FormShell
      title="Cadastro ou Renovação de Contratos"
      description="Preencha as informações contratuais e anexe a documentação."
      accent="oklch(0.55 0.18 250)"
    >
      <form onSubmit={submit} className="grid gap-5">
        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Nome" required error={errors.nome}>
            <input className={inputCls} value={f.nome} onChange={(e) => set("nome", e.target.value)} />
          </Field>
          <Field label="E-mail" required error={errors.email}>
            <input type="email" className={inputCls} value={f.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Telefone">
            <input className={inputCls} value={f.telefone} onChange={(e) => set("telefone", e.target.value)} />
          </Field>
          <Field label="Unidade de relação contratual" required error={errors.unidade}>
            <select className={inputCls} value={f.unidade} onChange={(e) => set("unidade", e.target.value)}>
              <option value="">Selecione...</option>
              {unidades.map((o) => <option key={o}>{o}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Empresa da relação do contrato" required error={errors.empresa}>
          <select className={inputCls} value={f.empresa} onChange={(e) => set("empresa", e.target.value)}>
            <option value="">Selecione...</option>
            {empresas.map((o) => <option key={o}>{o}</option>)}
          </select>
        </Field>

        <Field label="Objeto do Contrato (em resumo)" required error={errors.objeto}>
          <textarea className={`${inputCls} min-h-24`} value={f.objeto} onChange={(e) => set("objeto", e.target.value)} />
        </Field>

        <Field label="Tipo de solicitação" required error={errors.tipo}>
          <div className="grid gap-2">
            {tipos.map((t) => (
              <label key={t} className="flex items-center gap-2 rounded-md border p-3 cursor-pointer hover:bg-muted/40 transition">
                <input
                  type="radio"
                  name="tipo"
                  className="accent-primary"
                  checked={f.tipo === t}
                  onChange={() => set("tipo", t)}
                />
                <span className="text-sm">{t}</span>
              </label>
            ))}
          </div>
        </Field>

        <Field
          label="Número do contrato anterior"
          hint="Para Inclusão de aditivo ou Retificação de saldo, informar o número do contrato existente é obrigatório."
          error={errors.contratoAnterior}
        >
          <input className={inputCls} value={f.contratoAnterior} onChange={(e) => set("contratoAnterior", e.target.value)} />
        </Field>

        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="CNPJ do fornecedor">
            <input
              className={inputCls}
              placeholder="00.000.000/0000-00"
              value={f.cnpjFornecedor}
              onChange={(e) => set("cnpjFornecedor", maskCNPJ(e.target.value))}
            />
          </Field>
          <Field label="Razão social do fornecedor" required hint="Não será validado o nome fantasia." error={errors.razaoSocial}>
            <input className={inputCls} value={f.razaoSocial} onChange={(e) => set("razaoSocial", e.target.value)} />
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="O processo de cotação possui validação do gestor da área?" required error={errors.validacaoGestor}>
            <select className={inputCls} value={f.validacaoGestor} onChange={(e) => set("validacaoGestor", e.target.value)}>
              <option value="">Selecione...</option>
              <option>Sim</option>
              <option>Não</option>
            </select>
          </Field>
          <Field label="Nome do gestor responsável" required error={errors.nomeGestor}>
            <input className={inputCls} value={f.nomeGestor} onChange={(e) => set("nomeGestor", e.target.value)} />
          </Field>
        </div>

        <Field label="O contrato foi validado pelo jurídico, ou segue o modelo padrão Motormac?" required error={errors.validacaoJuridica}>
          <select className={inputCls} value={f.validacaoJuridica} onChange={(e) => set("validacaoJuridica", e.target.value)}>
            <option value="">Selecione...</option>
            <option>Sim</option>
            <option>Não</option>
            <option>Talvez, não sei</option>
          </select>
        </Field>

        <Field
          label="Upload do Contrato Assinado"
          required
          hint="O contrato deve possuir assinatura da CONTRATADA e da CONTRATANTE. Assinaturas digitais devem ser certificadas."
          error={errors.contrato}
        >
          <FileUpload files={contrato} onChange={setContrato} maxFiles={2} maxSizeMB={100} accept=".pdf,.doc,.docx,image/*" />
        </Field>

        <Field
          label="Validação do Financeiro"
          hint="O fornecedor foi validado pelo financeiro e está cadastrado no sistema? Anexe a validação."
        >
          <FileUpload files={financeiro} onChange={setFinanceiro} maxFiles={1} maxSizeMB={10} />
        </Field>

        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Data de início" required error={errors.dataInicio}>
            <input type="date" className={inputCls} value={f.dataInicio} onChange={(e) => set("dataInicio", e.target.value)} />
          </Field>
          <Field label="Data de término" required error={errors.dataFim}>
            <input type="date" className={inputCls} value={f.dataFim} onChange={(e) => set("dataFim", e.target.value)} />
          </Field>
          <Field label="Valor mensal" required hint="Valores em dólares serão convertidos pela cotação do dia (Apollo)." error={errors.valorMensal}>
            <input
              className={inputCls}
              placeholder="R$ 0,00"
              value={f.valorMensal}
              onChange={(e) => set("valorMensal", maskMoney(e.target.value))}
            />
          </Field>
          <Field label="Valor total" required hint="Valores em dólares serão convertidos pela cotação do dia (Apollo)." error={errors.valorTotal}>
            <input
              className={inputCls}
              placeholder="R$ 0,00"
              value={f.valorTotal}
              onChange={(e) => set("valorTotal", maskMoney(e.target.value))}
            />
          </Field>
        </div>

        <Field label="Termo de Ciência e Declaração" required error={errors.declaracao}>
          <label className="flex items-start gap-3 rounded-md border bg-muted/30 p-4 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 accent-primary"
              checked={f.declaracao}
              onChange={(e) => set("declaracao", e.target.checked)}
            />
            <span className="text-sm leading-relaxed">
              <strong>De acordo.</strong> DECLARO que as informações inseridas nesta solicitação sobre o contrato são verídicas.
              Tenho ciência de que o não preenchimento de informações obrigatórias ou inconsistências poderão acarretar no indeferimento do pedido.
            </span>
          </label>
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

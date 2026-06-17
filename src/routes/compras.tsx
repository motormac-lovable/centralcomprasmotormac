import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Field, FormShell, inputCls } from "../components/forms/FormShell";
import { FileUpload, type PickedFile } from "../components/forms/FileUpload";
import { addHistory } from "../lib/history";
import { isValidEmail, maskCNPJ, maskPhone } from "../lib/masks";

export const Route = createFileRoute("/compras")({
  head: () => ({
    meta: [
      { title: "Solicitação de Compra de Peças — Motormac" },
      { name: "description", content: "Formulário de solicitação de compra do módulo de peças." },
    ],
  }),
  component: ComprasPage,
});

const operacoes = [
  "Oficina Cummins",
  "Oficina JCB",
  "Balcão de Vendas de peças Cummins",
  "Balcão de Vendas de Peças JCB",
  "Outra",
];
const unidades = [
  "Porto Alegre/RS",
  "Passo Fundo/RS",
  "São Gabriel/RS",
  "São José/SC",
  "Chapecó/SC",
  "Colombo/PR",
  "Maringá/PR",
  "Outra",
];

function ComprasPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    nome: "",
    email: "",
    telefone: "",
    cnpj: "",
    peca: "",
    operacao: "",
    unidade: "",
    especificacao: "",
    os: "",
    partNumbers: "",
    dataEsperada: "",
  });
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!form.nome.trim()) er.nome = "Obrigatório";
    if (!form.email.trim()) er.email = "Obrigatório";
    else if (!isValidEmail(form.email)) er.email = "E-mail inválido";
    if (!form.telefone.trim()) er.telefone = "Obrigatório";
    if (form.cnpj.replace(/\D/g, "").length !== 14) er.cnpj = "CNPJ inválido";
    if (!form.peca.trim()) er.peca = "Obrigatório";
    if (!form.especificacao.trim()) er.especificacao = "Obrigatório";
    if (files.length === 0) er.files = "Envie ao menos 1 arquivo";
    if (!form.dataEsperada) er.dataEsperada = "Obrigatório";
    setErrors(er);
    if (Object.keys(er).length) {
      toast.error("Verifique os campos obrigatórios.");
      return;
    }
    addHistory({
      kind: "compras",
      title: `Compra: ${form.peca}`,
      summary: `${form.nome} · ${form.unidade || "Unidade não informada"}`,
      data: { ...form, files: files.map((f) => f.name) },
    });
    toast.success("Solicitação enviada com sucesso!", {
      description: "Você pode acompanhar pelo Histórico.",
    });
    navigate({ to: "/historico" });
  };

  return (
    <FormShell
      title="Solicitação de Compra do Módulo de Peças"
      description="Preencha os dados abaixo para abrir a requisição junto ao comprador."
      accent="var(--primary)"
    >
      <form onSubmit={submit} className="grid gap-5">
        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Nome" required error={errors.nome}>
            <input className={inputCls} value={form.nome} onChange={(e) => set("nome", e.target.value)} />
          </Field>
          <Field label="E-mail" required error={errors.email}>
            <input type="email" className={inputCls} value={form.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Telefone (DDD + número)" required error={errors.telefone}>
            <input
              className={inputCls}
              placeholder="(11) 99999-9999"
              value={form.telefone}
              onChange={(e) => set("telefone", maskPhone(e.target.value))}
            />
          </Field>
          <Field label="CNPJ da unidade pagadora" required error={errors.cnpj}>
            <input
              className={inputCls}
              placeholder="00.000.000/0000-00"
              value={form.cnpj}
              onChange={(e) => set("cnpj", maskCNPJ(e.target.value))}
            />
          </Field>
        </div>

        <Field label="Qual peça precisa ser comprada?" required error={errors.peca}>
          <input className={inputCls} value={form.peca} onChange={(e) => set("peca", e.target.value)} />
        </Field>

        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Para qual operação?">
            <select className={inputCls} value={form.operacao} onChange={(e) => set("operacao", e.target.value)}>
              <option value="">Selecione...</option>
              {operacoes.map((o) => <option key={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Unidade responsável pela compra">
            <select className={inputCls} value={form.unidade} onChange={(e) => set("unidade", e.target.value)}>
              <option value="">Selecione...</option>
              {unidades.map((o) => <option key={o}>{o}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Especificação técnica da peça" required error={errors.especificacao}>
          <textarea
            className={`${inputCls} min-h-28`}
            value={form.especificacao}
            onChange={(e) => set("especificacao", e.target.value)}
          />
        </Field>

        <Field
          label="Número da Ordem de Serviço"
          hint="Quando for peça de balcão, inserir número do contato da providência."
        >
          <input className={inputCls} value={form.os} onChange={(e) => set("os", e.target.value)} />
        </Field>

        <Field
          label="Envio de arquivos"
          required
          hint="Envie foto, ficha técnica do equipamento para que o comprador possa ter informações complementares na solicitação aos fornecedores."
          error={errors.files}
        >
          <FileUpload
            files={files}
            onChange={setFiles}
            maxFiles={5}
            maxSizeMB={100}
            accept=".doc,.docx,.xls,.xlsx,.ppt,.pptx,.pdf,image/*,video/*,audio/*"
          />
        </Field>

        <Field label="Lista de Part Numbers (PN)">
          <textarea
            className={`${inputCls} min-h-20`}
            placeholder="PN-12345, PN-67890..."
            value={form.partNumbers}
            onChange={(e) => set("partNumbers", e.target.value)}
          />
        </Field>

        <Field label="Para qual data a peça é esperada?" required error={errors.dataEsperada}>
          <input
            type="date"
            className={inputCls}
            value={form.dataEsperada}
            onChange={(e) => set("dataEsperada", e.target.value)}
          />
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

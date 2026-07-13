import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Field, FormShell, inputCls } from "../components/forms/FormShell";
import { FileUpload, type PickedFile } from "../components/forms/FileUpload";
import {
  BlocoInicialPadrao,
  BLOCO_INICIAL_VAZIO,
  type BlocoInicial,
  validateBlocoInicial,
} from "../components/forms/BlocoInicialPadrao";
import { addHistory } from "../lib/history";
import { createCard } from "../lib/cards";
import { uploadRequesterFiles } from "../lib/requester-files";
import { maskCNPJ } from "../lib/masks";
import { DepartamentoPicker } from "../components/forms/DepartamentoPicker";

export const Route = createFileRoute("/compras")({
  head: () => ({
    meta: [
      { title: "Solicitação de Peças — Motormac" },
      { name: "description", content: "Formulário de solicitação de peças do módulo de peças." },
    ],
  }),
  component: ComprasPage,
});

const operacoes = [
  "Oficina Cummins",
  "Oficina JCB",
  "Balcão Cummins",
  "Balcão JCB",
  "Outra",
];

const MAX_PECAS = 50;

type PecaItem = { pn: string; descricao: string };
const PECA_VAZIA: PecaItem = { pn: "", descricao: "" };

function ComprasPage() {
  const navigate = useNavigate();
  const [bloco, setBloco] = useState<BlocoInicial>(BLOCO_INICIAL_VAZIO);
  const [form, setForm] = useState({
    cnpj: "",
    departamento: "",
    departamento_codigo: "",
    peca: "",
    operacao: "",
    especificacao: "",
    os: "",
    dataEsperada: "",
  });
  const [pecas, setPecas] = useState<PecaItem[]>([{ ...PECA_VAZIA }]);
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const updatePeca = (idx: number, patch: Partial<PecaItem>) =>
    setPecas((arr) => arr.map((p, i) => (i === idx ? { ...p, ...patch } : p)));

  const removePeca = (idx: number) =>
    setPecas((arr) => (arr.length === 1 ? [{ ...PECA_VAZIA }] : arr.filter((_, i) => i !== idx)));

  const addPeca = () => {
    if (pecas.length >= MAX_PECAS) {
      toast.error(`Limite máximo de ${MAX_PECAS} itens atingido por solicitação`);
      return;
    }
    setPecas((arr) => [...arr, { ...PECA_VAZIA }]);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const blocoEr = validateBlocoInicial(bloco);
    const er: Record<string, string> = { ...blocoEr };
    if (form.cnpj.replace(/\D/g, "").length !== 14) er.cnpj = "CNPJ inválido";
    if (!form.departamento) er.departamento = "Selecione o departamento";
    if (!form.peca.trim()) er.peca = "Obrigatório";
    if (!form.especificacao.trim()) er.especificacao = "Obrigatório";
    if (files.length === 0) er.files = "Envie ao menos 1 arquivo";
    if (!form.dataEsperada) er.dataEsperada = "Obrigatório";
    const pecasLimpas = pecas
      .map((p) => ({ pn: p.pn.trim(), descricao: p.descricao.trim() }))
      .filter((p) => p.pn || p.descricao);
    if (pecasLimpas.length === 0) er.pecas = "Inclua ao menos 1 peça";
    else {
      pecasLimpas.forEach((p, i) => {
        if (!p.pn) er[`peca_${i}_pn`] = "Obrigatório";
        if (!p.descricao) er[`peca_${i}_descricao`] = "Obrigatório";
      });
    }
    setErrors(er);
    if (Object.keys(er).length) {
      toast.error("Verifique os campos obrigatórios.");
      return;
    }
    let uploaded;
    try {
      uploaded = await uploadRequesterFiles("compras", files);
    } catch (err) {
      toast.error("Falha ao enviar anexos: " + (err as Error).message);
      return;
    }
    const payload = {
      ...bloco,
      ...form,
      pecas: pecasLimpas,
      // compatibilidade com relatórios legados que esperam string de PNs
      partNumbers: pecasLimpas.map((p) => p.pn).join(", "),
      files: uploaded,
    };
    try {
      await createCard({
        kind: "compras",
        title: `Compra: ${form.peca}`,
        summary: `${bloco.nome} · ${bloco.empresa} · ${bloco.unidade}`,
        requester_name: bloco.nome,
        requester_email: bloco.email,
        unidade: bloco.unidade,
        empresa: bloco.empresa,
        data: payload,
      });
    } catch (err) {
      toast.error("Falha ao enviar: " + (err as Error).message);
      return;
    }
    addHistory({ kind: "compras", title: `Compra: ${form.peca}`, summary: `${bloco.nome} · ${bloco.unidade}`, data: payload });
    toast.success("Solicitação enviada com sucesso!", { description: "Você pode acompanhar pelo Histórico." });
    navigate({ to: "/historico" });
  };

  return (
    <FormShell
      title="Solicitação de Peças"
      description="Preencha os dados abaixo para abrir a requisição junto ao comprador."
      accent="var(--primary)"
    >
      <form onSubmit={submit} className="grid gap-5">
        <BlocoInicialPadrao value={bloco} onChange={setBloco} errors={errors as Partial<Record<keyof BlocoInicial, string>>} />

        <div className="grid gap-5 md:grid-cols-2">
          <Field label="CNPJ da unidade pagadora" required error={errors.cnpj}>
            <input className={inputCls} placeholder="00.000.000/0000-00" value={form.cnpj} onChange={(e) => set("cnpj", maskCNPJ(e.target.value))} />
          </Field>
          <DepartamentoPicker
            required
            nome={form.departamento}
            codigo={form.departamento_codigo}
            error={errors.departamento}
            hint="Direciona a aprovação para o gestor responsável."
            onChange={({ nome, codigo }) =>
              setForm((f) => ({ ...f, departamento: nome, departamento_codigo: codigo }))
            }
          />
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Qual peça precisa ser comprada?" required error={errors.peca}>
            <input className={inputCls} value={form.peca} onChange={(e) => set("peca", e.target.value)} />
          </Field>

          <Field label="Para qual operação?">
            <select className={inputCls} value={form.operacao} onChange={(e) => set("operacao", e.target.value)}>
              <option value="">Selecione...</option>
              {operacoes.map((o) => <option key={o}>{o}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Especificação técnica da peça" required error={errors.especificacao}>
          <textarea className={`${inputCls} min-h-28`} value={form.especificacao} onChange={(e) => set("especificacao", e.target.value)} />
        </Field>

        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Número da Ordem de Serviço" hint="Quando for peça de balcão, inserir número do contato da providência.">
            <input className={inputCls} value={form.os} onChange={(e) => set("os", e.target.value)} />
          </Field>
          <Field label="Para qual data a peça é esperada?" required error={errors.dataEsperada}>
            <input type="date" className={inputCls} value={form.dataEsperada} onChange={(e) => set("dataEsperada", e.target.value)} />
          </Field>
        </div>

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
          <textarea className={`${inputCls} min-h-20`} placeholder="PN-12345, PN-67890..." value={form.partNumbers} onChange={(e) => set("partNumbers", e.target.value)} />
        </Field>


        <div className="flex justify-stretch md:justify-end pt-2">
          <button
            type="submit"
            className="inline-flex w-full md:w-auto items-center justify-center rounded-md bg-primary px-6 py-2.5 md:py-1.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition"
          >
            Enviar solicitação
          </button>
        </div>
      </form>
    </FormShell>
  );
}

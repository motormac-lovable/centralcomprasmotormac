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

type PecaItem = { pn: string; descricao: string; especificacao: string };
const PECA_VAZIA: PecaItem = { pn: "", descricao: "", especificacao: "" };

function ComprasPage() {
  const navigate = useNavigate();
  const [bloco, setBloco] = useState<BlocoInicial>(BLOCO_INICIAL_VAZIO);
  const [form, setForm] = useState({
    cnpj: "",
    departamento: "",
    departamento_codigo: "",
    operacao: "",
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

        <div className="rounded-xl border bg-muted/30 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Peças solicitadas ({pecas.length}/{MAX_PECAS})
            </h3>
          </div>

          {errors.pecas && <p className="text-xs text-destructive">{errors.pecas}</p>}

          <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
            <div className="space-y-3 min-w-[560px] md:min-w-0">
              {pecas.map((p, idx) => (
                <div key={idx} className="rounded-lg border bg-card p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-muted-foreground">Item {idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => removePeca(idx)}
                      className="inline-flex items-center gap-1 text-xs text-destructive hover:underline"
                      aria-label={`Remover peça ${idx + 1}`}
                      title="Remover peça"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remover
                    </button>
                  </div>
                  <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                    <Field label="Part Number" required error={errors[`peca_${idx}_pn`]}>
                      <input
                        className={inputCls}
                        placeholder="Ex.: PN-12345"
                        value={p.pn}
                        onChange={(e) => updatePeca(idx, { pn: e.target.value })}
                      />
                    </Field>
                    <Field label="Descrição do Item" required error={errors[`peca_${idx}_descricao`]}>
                      <input
                        className={inputCls}
                        placeholder="Descrição da peça"
                        value={p.descricao}
                        onChange={(e) => updatePeca(idx, { descricao: e.target.value })}
                      />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={addPeca}
            disabled={pecas.length >= MAX_PECAS}
            className="inline-flex w-full md:w-auto items-center justify-center gap-2 rounded-md border border-dashed border-input bg-background px-3 py-2 text-sm font-medium text-foreground shadow-xs transition hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="h-4 w-4" />
            Adicionar Peça
          </button>
          {pecas.length >= MAX_PECAS && (
            <p className="text-xs text-muted-foreground">Limite máximo de {MAX_PECAS} itens atingido por solicitação</p>
          )}
        </div>


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

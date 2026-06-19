import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { maskCNPJ } from "../lib/masks";
import {
  DEPARTAMENTOS_APOLLO,
  ORIGENS_APOLLO,
  MATERIAIS_APOLLO,
} from "../lib/apollo-data";

export const Route = createFileRoute("/materiais")({
  head: () => ({
    meta: [
      { title: "Solicitação de Compras — Motormac" },
      {
        name: "description",
        content:
          "Formulário de solicitação de compras de materiais e serviços diversos pelo módulo de Gestão de Materiais.",
      },
    ],
  }),
  component: MateriaisPage,
});

function MateriaisPage() {
  const navigate = useNavigate();
  const [bloco, setBloco] = useState<BlocoInicial>(BLOCO_INICIAL_VAZIO);
  const [form, setForm] = useState({
    departamento: "Suprimentos",
    origem: "Estoque",
    material: "Óleo Diesel",
    codigo: "102030",
    descricao: "",
    tipo: "Convencional",
    fornecedorNome: "",
    fornecedorCnpj: "",
  });
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof typeof form>(k: K, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Lógica via dupla material <-> código
  const codigos = useMemo(() => MATERIAIS_APOLLO.map((m) => m.codigo), []);
  const descricoes = useMemo(() => MATERIAIS_APOLLO.map((m) => m.descricao), []);

  const onMaterialChange = (descricao: string) => {
    const m = MATERIAIS_APOLLO.find(
      (x) => x.descricao.toLowerCase() === descricao.toLowerCase(),
    );
    setForm((f) => ({ ...f, material: descricao, codigo: m ? m.codigo : f.codigo }));
  };

  const onCodigoChange = (codigo: string) => {
    const m = MATERIAIS_APOLLO.find((x) => x.codigo === codigo);
    setForm((f) => ({ ...f, codigo, material: m ? m.descricao : f.material }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const blocoEr = validateBlocoInicial(bloco);
    const er: Record<string, string> = { ...blocoEr };
    if (!form.departamento) er.departamento = "Selecione";
    if (!form.origem) er.origem = "Selecione";
    if (!form.material.trim()) er.material = "Obrigatório";
    if (!form.codigo.trim()) er.codigo = "Obrigatório";
    if (!form.descricao.trim()) er.descricao = "Obrigatório";
    if (
      form.fornecedorCnpj &&
      form.fornecedorCnpj.replace(/\D/g, "").length !== 14
    )
      er.fornecedorCnpj = "CNPJ inválido";
    setErrors(er);
    if (Object.keys(er).length) {
      toast.error("Verifique os campos obrigatórios.");
      return;
    }
    const payload = { ...bloco, ...form, files: files.map((f) => f.name) };
    try {
      await createCard({
        kind: "materiais",
        title: `Materiais: ${form.material}`,
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
    addHistory({
      kind: "materiais",
      title: `Materiais: ${form.material}`,
      summary: `${bloco.nome} · ${bloco.unidade}`,
      data: payload,
    });
    toast.success("Solicitação enviada com sucesso!", {
      description: "Você pode acompanhar pelo Histórico.",
    });
    navigate({ to: "/historico" });
  };

  return (
    <FormShell
      title="Solicitação de Compras"
      description="Preencha os dados abaixo para abrir a solicitação de compras de materiais e serviços diversos."
      accent="oklch(0.62 0.18 200)"
    >
      <form onSubmit={submit} className="grid gap-5">
        <BlocoInicialPadrao
          value={bloco}
          onChange={setBloco}
          errors={errors as Partial<Record<keyof BlocoInicial, string>>}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Departamento" required error={errors.departamento}>
            <select
              className={inputCls}
              value={form.departamento}
              onChange={(e) => set("departamento", e.target.value)}
            >
              <option value="">Selecione...</option>
              {DEPARTAMENTOS_APOLLO.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </Field>

          <Field label="Origem" required error={errors.origem}>
            <select
              className={inputCls}
              value={form.origem}
              onChange={(e) => set("origem", e.target.value)}
            >
              <option value="">Selecione...</option>
              {ORIGENS_APOLLO.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Material/Serviço solicitado"
            required
            hint="Selecione pela descrição — o código será preenchido automaticamente."
            error={errors.material}
          >
            <input
              list="apollo-materiais"
              className={inputCls}
              value={form.material}
              onChange={(e) => onMaterialChange(e.target.value)}
            />
            <datalist id="apollo-materiais">
              {descricoes.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </Field>

          <Field
            label="Código do material"
            required
            hint="Selecione pelo código — a descrição será preenchida automaticamente."
            error={errors.codigo}
          >
            <input
              list="apollo-codigos"
              className={inputCls}
              value={form.codigo}
              onChange={(e) => onCodigoChange(e.target.value)}
            />
            <datalist id="apollo-codigos">
              {codigos.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
        </div>

        <Field label="Descrição" required error={errors.descricao}>
          <textarea
            className={`${inputCls} min-h-28`}
            value={form.descricao}
            onChange={(e) => set("descricao", e.target.value)}
          />
        </Field>

        <Field
          label="Anexos"
          hint="Até 5 arquivos · 50MB cada"
          error={errors.files}
        >
          <FileUpload
            files={files}
            onChange={setFiles}
            maxFiles={5}
            maxSizeMB={50}
          />
        </Field>

        <Field label="Tipo de Solicitação" required>
          <select
            className={inputCls}
            value={form.tipo}
            onChange={(e) => set("tipo", e.target.value)}
          >
            <option value="Convencional">Convencional</option>
          </select>
        </Field>

        <div className="rounded-xl border bg-muted/30 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Indicação de Fornecedor (opcional)
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome do fornecedor">
              <input
                className={inputCls}
                value={form.fornecedorNome}
                onChange={(e) => set("fornecedorNome", e.target.value)}
              />
            </Field>
            <Field label="CNPJ do fornecedor" error={errors.fornecedorCnpj}>
              <input
                className={inputCls}
                placeholder="00.000.000/0000-00"
                value={form.fornecedorCnpj}
                onChange={(e) =>
                  set("fornecedorCnpj", maskCNPJ(e.target.value))
                }
              />
            </Field>
          </div>
        </div>

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

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
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
  ORIGENS_APOLLO,
  MATERIAIS_APOLLO,
  UNIDADES_MEDIDA_APOLLO,
} from "../lib/apollo-data";
import { DepartamentoPicker } from "../components/forms/DepartamentoPicker";
import { uploadRequesterFiles } from "../lib/requester-files";

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

const MAX_ITENS = 100;

type ItemMaterial = {
  material: string;
  codigo: string;
  quantidade: string;
  unidadeMedida: string;
};

const ITEM_VAZIO: ItemMaterial = {
  material: "",
  codigo: "",
  quantidade: "",
  unidadeMedida: "",
};

function MateriaisPage() {
  const navigate = useNavigate();
  const [bloco, setBloco] = useState<BlocoInicial>(BLOCO_INICIAL_VAZIO);
  const [form, setForm] = useState({
    departamento: "",
    departamento_codigo: "",
    origem: "",
    descricao: "",
    tipo: "Convencional",
    fornecedorNome: "",
    fornecedorCnpj: "",
  });
  const [itens, setItens] = useState<ItemMaterial[]>([{ ...ITEM_VAZIO }]);
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof typeof form>(k: K, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const updateItem = (idx: number, patch: Partial<ItemMaterial>) =>
    setItens((arr) => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const removeItem = (idx: number) =>
    setItens((arr) => (arr.length === 1 ? arr : arr.filter((_, i) => i !== idx)));

  const addItem = () => {
    if (itens.length >= MAX_ITENS) {
      toast.error(`Limite de ${MAX_ITENS} materiais por solicitação.`);
      return;
    }
    setItens((arr) => [...arr, { ...ITEM_VAZIO }]);
  };

  const onMaterialChange = (idx: number, descricao: string) => {
    const m = MATERIAIS_APOLLO.find(
      (x) => x.descricao.toLowerCase() === descricao.toLowerCase(),
    );
    updateItem(idx, { material: descricao, ...(m ? { codigo: m.codigo } : {}) });
  };

  const onCodigoChange = (idx: number, codigo: string) => {
    const m = MATERIAIS_APOLLO.find((x) => x.codigo === codigo);
    updateItem(idx, { codigo, ...(m ? { material: m.descricao } : {}) });
  };

  const ultimoItem = itens[itens.length - 1];
  const podeAdicionar =
    itens.length < MAX_ITENS &&
    ultimoItem.material.trim() !== "" &&
    ultimoItem.codigo.trim() !== "";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const blocoEr = validateBlocoInicial(bloco);
    const er: Record<string, string> = { ...blocoEr };
    if (!form.departamento) er.departamento = "Selecione";
    if (!form.origem) er.origem = "Selecione";
    itens.forEach((it, i) => {
      if (!it.material.trim()) er[`item_${i}_material`] = "Obrigatório";
      if (!it.codigo.trim()) er[`item_${i}_codigo`] = "Obrigatório";
      if (!it.quantidade.trim()) er[`item_${i}_quantidade`] = "Obrigatório";
      else if (!/^\d+$/.test(it.quantidade.trim()) || parseInt(it.quantidade, 10) <= 0)
        er[`item_${i}_quantidade`] = "Inteiro positivo";
      if (!it.unidadeMedida.trim()) er[`item_${i}_unidadeMedida`] = "Selecione";
      else if (!UNIDADES_MEDIDA_APOLLO.includes(it.unidadeMedida.trim().toUpperCase()))
        er[`item_${i}_unidadeMedida`] = "Unidade inválida";
    });
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
    let uploaded;
    try {
      uploaded = await uploadRequesterFiles("materiais", files);
    } catch (err) {
      toast.error("Falha ao enviar anexos: " + (err as Error).message);
      return;
    }
    const payload = {
      ...bloco,
      ...form,
      itens,
      files: uploaded,
    };

    const titulo =
      itens.length === 1
        ? `Materiais: ${itens[0].material}`
        : `Materiais: ${itens[0].material} (+${itens.length - 1})`;
    try {
      await createCard({
        kind: "materiais",
        title: titulo,
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
      title: titulo,
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
          <DepartamentoPicker
            required
            nome={form.departamento}
            codigo={form.departamento_codigo}
            error={errors.departamento}
            onChange={({ nome, codigo }) =>
              setForm((f) => ({ ...f, departamento: nome, departamento_codigo: codigo }))
            }
          />

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

        <div className="rounded-xl border bg-muted/30 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Materiais solicitados ({itens.length}/{MAX_ITENS})
            </h3>
          </div>

          {itens.map((it, idx) => (
            <ItemRow
              key={idx}
              idx={idx}
              item={it}
              errors={errors}
              onMaterialChange={onMaterialChange}
              onCodigoChange={onCodigoChange}
              updateItem={updateItem}
              removeItem={removeItem}
              canRemove={itens.length > 1}
            />
          ))}

          <button
            type="button"
            onClick={addItem}
            disabled={!podeAdicionar}
            className="inline-flex items-center gap-2 rounded-md border border-dashed border-input bg-background px-3 py-2 text-sm font-medium text-foreground shadow-xs transition hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="h-4 w-4" />
            Adicionar material
          </button>
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

function ItemRow({
  idx,
  item,
  errors,
  onMaterialChange,
  onCodigoChange,
  updateItem,
  removeItem,
  canRemove,
}: {
  idx: number;
  item: ItemMaterial;
  errors: Record<string, string>;
  onMaterialChange: (idx: number, descricao: string) => void;
  onCodigoChange: (idx: number, codigo: string) => void;
  updateItem: (idx: number, patch: Partial<ItemMaterial>) => void;
  removeItem: (idx: number) => void;
  canRemove: boolean;
}) {
  const sugestoesDescricoes = useMemo(() => {
    const q = item.material.trim().toLowerCase();
    if (!q) return MATERIAIS_APOLLO.slice(0, 50).map((m) => m.descricao);
    return MATERIAIS_APOLLO.filter((m) => m.descricao.toLowerCase().includes(q))
      .slice(0, 50)
      .map((m) => m.descricao);
  }, [item.material]);

  const sugestoesCodigos = useMemo(() => {
    const q = item.codigo.trim().toLowerCase();
    if (!q) return MATERIAIS_APOLLO.slice(0, 50).map((m) => m.codigo);
    return MATERIAIS_APOLLO.filter((m) => m.codigo.toLowerCase().startsWith(q))
      .slice(0, 50)
      .map((m) => m.codigo);
  }, [item.codigo]);

  const listIdMat = `apollo-materiais-${idx}`;
  const listIdCod = `apollo-codigos-${idx}`;
  const listIdUni = `apollo-unidades-${idx}`;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">
          Item {idx + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={() => removeItem(idx)}
            className="inline-flex items-center gap-1 text-xs text-destructive hover:underline"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remover
          </button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Material/Serviço solicitado"
          required
          error={errors[`item_${idx}_material`]}
        >
          <input
            list={listIdMat}
            className={inputCls}
            value={item.material}
            onChange={(e) => onMaterialChange(idx, e.target.value)}
          />
          <datalist id={listIdMat}>
            {sugestoesDescricoes.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </Field>

        <Field
          label="Código do material"
          required
          error={errors[`item_${idx}_codigo`]}
        >
          <input
            list={listIdCod}
            className={inputCls}
            value={item.codigo}
            onChange={(e) => onCodigoChange(idx, e.target.value)}
          />
          <datalist id={listIdCod}>
            {sugestoesCodigos.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Quantidade"
          required
          error={errors[`item_${idx}_quantidade`]}
        >
          <input
            type="number"
            min={1}
            step={1}
            className={inputCls}
            value={item.quantidade}
            onChange={(e) => updateItem(idx, { quantidade: e.target.value })}
          />
        </Field>

        <Field
          label="Unidade de Medida"
          required
          error={errors[`item_${idx}_unidadeMedida`]}
        >
          <input
            list={listIdUni}
            className={inputCls}
            value={item.unidadeMedida}
            onChange={(e) =>
              updateItem(idx, { unidadeMedida: e.target.value.toUpperCase() })
            }
          />
          <datalist id={listIdUni}>
            {UNIDADES_MEDIDA_APOLLO.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </Field>
      </div>
    </div>
  );
}

import { Field, inputCls } from "./FormShell";
import { maskPhone } from "@/lib/masks";

export const UNIDADES = [
  "Porto Alegre",
  "São José",
  "Colombo",
  "Maringá",
  "Chapecó",
  "São Gabriel",
  "Passo Fundo",
];

export const EMPRESAS = ["NEST", "DMMC", "SV Parts", "MALB"];

export type BlocoInicial = {
  nome: string;
  telefone: string;
  email: string;
  unidade: string;
  empresa: string;
};

export const BLOCO_INICIAL_VAZIO: BlocoInicial = {
  nome: "",
  telefone: "",
  email: "",
  unidade: "",
  empresa: "",
};

export function BlocoInicialPadrao({
  value,
  onChange,
  errors,
}: {
  value: BlocoInicial;
  onChange: (next: BlocoInicial) => void;
  errors?: Partial<Record<keyof BlocoInicial, string>>;
}) {
  const set = <K extends keyof BlocoInicial>(k: K, v: string) =>
    onChange({ ...value, [k]: v });

  return (
    <div className="rounded-xl border bg-muted/30 p-4 md:p-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        Identificação do solicitante
      </h3>
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        <Field label="Nome completo" required error={errors?.nome}>
          <input
            className={inputCls}
            value={value.nome}
            onChange={(e) => set("nome", e.target.value)}
          />
        </Field>
        <Field label="Telefone" required error={errors?.telefone}>
          <input
            className={inputCls}
            placeholder="(11) 99999-9999"
            value={value.telefone}
            onChange={(e) => set("telefone", maskPhone(e.target.value))}
          />
        </Field>
        <Field label="E-mail" required error={errors?.email}>
          <input
            type="email"
            className={inputCls}
            value={value.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </Field>
        <Field label="Unidade" required error={errors?.unidade}>
          <select
            className={inputCls}
            value={value.unidade}
            onChange={(e) => set("unidade", e.target.value)}
          >
            <option value="">Selecione...</option>
            {UNIDADES.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </Field>
        <Field label="Empresa" required error={errors?.empresa}>
          <select
            className={inputCls}
            value={value.empresa}
            onChange={(e) => set("empresa", e.target.value)}
          >
            <option value="">Selecione...</option>
            {EMPRESAS.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </Field>
      </div>
    </div>
  );
}

export function validateBlocoInicial(
  v: BlocoInicial,
): Partial<Record<keyof BlocoInicial, string>> {
  const er: Partial<Record<keyof BlocoInicial, string>> = {};
  if (!v.nome.trim()) er.nome = "Obrigatório";
  if (!v.telefone.trim()) er.telefone = "Obrigatório";
  if (!v.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email))
    er.email = "E-mail inválido";
  if (!v.unidade) er.unidade = "Selecione";
  if (!v.empresa) er.empresa = "Selecione";
  return er;
}

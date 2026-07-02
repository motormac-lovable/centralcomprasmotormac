import { Field, inputCls } from "./FormShell";
import { useDepartments } from "@/hooks/useDepartments";

type Props = {
  nome: string;
  codigo: string;
  onChange: (patch: { nome: string; codigo: string }) => void;
  error?: string;
  required?: boolean;
  hint?: string;
};

/**
 * Campo unificado de Departamento (Apollo) com busca em via dupla:
 * - Digitar o código preenche o nome automaticamente.
 * - Selecionar o nome preenche o código automaticamente.
 * Fonte única: tabela `departments` no banco (mesma base usada em Compras,
 * Peças e Fretes).
 */
export function DepartamentoPicker({
  nome,
  codigo,
  onChange,
  error,
  required,
  hint,
}: Props) {
  const { data: deps = [], isLoading, error: loadErr } = useDepartments();

  const handleCodigo = (raw: string) => {
    const only = raw.replace(/\D/g, "");
    const match = deps.find((d) => String(d.code) === only);
    onChange({ codigo: only, nome: match ? match.name : "" });
  };

  const handleNome = (name: string) => {
    const match = deps.find((d) => d.name === name);
    onChange({ nome: name, codigo: match ? String(match.code) : "" });
  };

  const loadHint =
    isLoading
      ? "Carregando departamentos..."
      : loadErr
        ? "Não foi possível carregar a lista de departamentos."
        : hint;

  return (
    <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
      <Field label="Código" required={required}>
        <input
          className={inputCls}
          inputMode="numeric"
          placeholder="Ex.: 199"
          value={codigo}
          onChange={(e) => handleCodigo(e.target.value)}
          disabled={isLoading || !!loadErr}
        />
      </Field>
      <Field label="Departamento" required={required} error={error} hint={loadHint}>
        <select
          className={inputCls}
          required={required}
          value={nome}
          onChange={(e) => handleNome(e.target.value)}
          disabled={isLoading || !!loadErr}
        >
          <option value="">Selecione...</option>
          {deps.map((d) => (
            <option key={d.code} value={d.name}>
              {d.code} — {d.name}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

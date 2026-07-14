import { Field, inputCls } from "./FormShell";
import { useOrigins } from "@/hooks/useOrigins";

type Props = {
  nome: string;
  codigo: string;
  onChange: (patch: { nome: string; codigo: string }) => void;
  error?: string;
  required?: boolean;
  hint?: string;
};

/**
 * Campo unificado de Origem (Apollo) com busca em via dupla:
 * - Digitar o código preenche o nome automaticamente.
 * - Selecionar o nome preenche o código automaticamente.
 * Fonte única: tabela `origins` no banco.
 */
export function OrigemPicker({
  nome,
  codigo,
  onChange,
  error,
  required,
  hint,
}: Props) {
  const { data: origins = [], isLoading, error: loadErr } = useOrigins();

  const codigoInformado = codigo.trim() !== "";
  const codigoValido =
    !codigoInformado || origins.some((o) => String(o.code) === codigo);

  const handleCodigo = (raw: string) => {
    const only = raw.replace(/\D/g, "");
    const match = origins.find((o) => String(o.code) === only);
    onChange({ codigo: only, nome: match ? match.name : "" });
  };

  const handleNome = (name: string) => {
    const match = origins.find((o) => o.name === name);
    onChange({ nome: name, codigo: match ? String(match.code) : "" });
  };

  const loadHint = isLoading
    ? "Carregando origens..."
    : loadErr
      ? "Não foi possível carregar a lista de origens."
      : hint;

  const codigoError =
    !isLoading && !loadErr && codigoInformado && !codigoValido
      ? "Código não encontrado."
      : undefined;

  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-[140px_minmax(0,1fr)]">
      <Field label="Código da Origem" required={required} error={codigoError}>
        <input
          className={inputCls}
          inputMode="numeric"
          placeholder="Ex.: 5123"
          value={codigo}
          onChange={(e) => handleCodigo(e.target.value)}
          disabled={isLoading || !!loadErr}
          aria-invalid={codigoError ? true : undefined}
        />
      </Field>
      <Field label="Origem" required={required} error={error} hint={loadHint}>
        <select
          className={inputCls}
          required={required}
          value={nome}
          onChange={(e) => handleNome(e.target.value)}
          disabled={isLoading || !!loadErr}
        >
          <option value="">Selecione...</option>
          {origins.map((o) => (
            <option key={o.code} value={o.name}>
              {o.code} — {o.name}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

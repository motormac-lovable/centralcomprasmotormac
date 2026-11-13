import { CENTROS_DE_CUSTO, centroCustoKey } from "@/lib/centros-de-custo";
import { Field } from "./FormShell";
import { SearchableSelect } from "./SearchableSelect";

const options = CENTROS_DE_CUSTO.map((c) => ({ value: centroCustoKey(c), label: centroCustoKey(c) }));

export function CentroCustoPicker({ codigo, descricao, onChange, error }: {
  codigo: string;
  descricao: string;
  onChange: (centro: { centro_custo_codigo: string; centro_custo_descricao: string }) => void;
  error?: string;
}) {
  return (
    <Field label="Centro de Custo" required error={error}>
      <SearchableSelect
        ariaLabel="Centro de Custo"
        options={options}
        value={codigo && descricao ? centroCustoKey({ codigo, descricao }) : ""}
        placeholder="Buscar por código ou descrição..."
        invalid={!!error}
        onChange={(key) => {
          const centro = CENTROS_DE_CUSTO.find((c) => centroCustoKey(c) === key);
          if (centro) onChange({ centro_custo_codigo: centro.codigo, centro_custo_descricao: centro.descricao });
        }}
      />
    </Field>
  );
}
import type { Database } from "@/integrations/supabase/types";

type Kind = Database["public"]["Enums"]["card_kind"];

/**
 * Teto máximo de anexos por tipo de formulário — deve ser IDÊNTICO ao
 * `maxFiles` usado nos formulários de origem (src/routes/materiais.tsx e
 * src/routes/compras.tsx). Alterou o teto do formulário? Atualize aqui também.
 */
export const COMPLEMENTARY_MAX_FILES: Partial<Record<Kind, number>> = {
  materiais: 5,
  compras: 5,
};

export const COMPLEMENTARY_MAX_SIZE_MB: Partial<Record<Kind, number>> = {
  materiais: 50,
  compras: 100,
};

export function countExistingFiles(data: unknown): number {
  const files = (data as { files?: unknown } | null | undefined)?.files;
  return Array.isArray(files) ? files.length : 0;
}

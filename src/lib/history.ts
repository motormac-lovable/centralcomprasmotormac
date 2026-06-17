export type RequestKind = "compras" | "contratos" | "frete";

export interface HistoryEntry {
  id: string;
  kind: RequestKind;
  title: string;
  summary: string;
  createdAt: string;
  status: "Enviada" | "Em análise" | "Concluída";
  data: Record<string, unknown>;
}

const KEY = "motormac.history.v1";

export function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function addHistory(entry: Omit<HistoryEntry, "id" | "createdAt" | "status">): HistoryEntry {
  const full: HistoryEntry = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: "Enviada",
  };
  const list = loadHistory();
  list.unshift(full);
  localStorage.setItem(KEY, JSON.stringify(list));
  return full;
}

export const kindLabel: Record<RequestKind, string> = {
  compras: "Compra de Peças",
  contratos: "Contratos",
  frete: "Frete",
};

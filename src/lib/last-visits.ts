// Controle de "última visita" por tela para badges de não-lidos.
// Persistência local por usuário (chave inclui user.id).
// Emite evento para recomputar badges imediatamente após marcar visita.

export type VisitKey = "minhas" | "historico" | "aprovacoes" | "admin" | "mensagens";

const STORAGE_PREFIX = "motormac.lastVisit.v1";
const EVENT = "motormac:lastVisitChanged";

function storageKey(userId: string, key: VisitKey) {
  return `${STORAGE_PREFIX}:${userId}:${key}`;
}

export function getLastVisit(userId: string | undefined, key: VisitKey): string | null {
  if (!userId || typeof window === "undefined") return null;
  try {
    return localStorage.getItem(storageKey(userId, key));
  } catch {
    return null;
  }
}

export function markVisit(userId: string | undefined, key: VisitKey) {
  if (!userId || typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(userId, key), new Date().toISOString());
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { key } }));
  } catch {
    /* noop */
  }
}

export function subscribeVisits(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

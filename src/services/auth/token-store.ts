/**
 * Fonte única do token de acesso (JWT) usado pelo cliente HTTP.
 *
 * - Backend "rest": token emitido pela API corporativa (JWT/OAuth2/AD-LDAP),
 *   persistido em localStorage.
 * - Backend "supabase": token da sessão atual (compatibilidade).
 */
import { DATA_BACKEND } from "@/services/data/provider";

const STORAGE_KEY = "motormac.auth.token";

export type StoredToken = {
  access_token: string;
  refresh_token?: string | null;
  expires_at?: number | null;
};

export function readStoredToken(): StoredToken | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredToken) : null;
  } catch {
    return null;
  }
}

export function writeStoredToken(token: StoredToken | null) {
  if (typeof window === "undefined") return;
  if (!token) window.localStorage.removeItem(STORAGE_KEY);
  else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(token));
}

/** Token corrente para o header Authorization: Bearer. */
export async function getAccessToken(): Promise<string | null> {
  const stored = readStoredToken();
  if (stored?.access_token) return stored.access_token;
  if (DATA_BACKEND === "supabase") {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }
  return null;
}

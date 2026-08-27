/**
 * Camada de autenticação desacoplada.
 *
 * Contrato único consumido pela aplicação; duas implementações:
 *  - "jwt"      → login validado na API da empresa (JWT / OAuth2 / AD / LDAP)
 *  - "supabase" → autenticação atual (padrão)
 *
 * Seleção: VITE_AUTH_BACKEND=jwt
 */
import { http } from "@/services/http";
import { ENDPOINTS } from "@/services/endpoints";
import { readStoredToken, writeStoredToken } from "./token-store";

export type AuthUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  roles: string[];
};

export interface AuthProvider {
  signIn(email: string, password: string): Promise<AuthUser>;
  signOut(): Promise<void>;
  getUser(): Promise<AuthUser | null>;
}

export const AUTH_BACKEND: "supabase" | "jwt" =
  (import.meta.env['VITE_AUTH_BACKEND'] as string | undefined) === "jwt" ? "jwt" : "supabase";

/** Autenticação corporativa via JWT emitido pela API própria. */
export const jwtAuthProvider: AuthProvider = {
  signIn: async (email, password) => {
    const res = await http.post<{
      access_token: string;
      refresh_token?: string | null;
      expires_at?: number | null;
      user: AuthUser;
    }>(ENDPOINTS.authLogin, { email, password });
    writeStoredToken({
      access_token: res.access_token,
      refresh_token: res.refresh_token ?? null,
      expires_at: res.expires_at ?? null,
    });
    return res.user;
  },
  signOut: async () => {
    try { await http.post(ENDPOINTS.authLogout); } catch { /* sessão já encerrada */ }
    writeStoredToken(null);
  },
  getUser: async () => {
    if (!readStoredToken()?.access_token) return null;
    try {
      return await http.get<AuthUser>(ENDPOINTS.authMe);
    } catch {
      return null;
    }
  },
};

/** Autenticação atual (backend Lovable Cloud). */
export const sessionAuthProvider: AuthProvider = {
  signIn: async (email, password) => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const user = data.user;
    return {
      id: user?.id ?? "",
      email: user?.email ?? null,
      full_name: (user?.user_metadata?.['full_name'] as string | undefined) ?? null,
      roles: [],
    };
  },
  signOut: async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    await supabase.auth.signOut();
    writeStoredToken(null);
  },
  getUser: async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getUser();
    if (!data.user) return null;
    return {
      id: data.user.id,
      email: data.user.email ?? null,
      full_name: (data.user.user_metadata?.['full_name'] as string | undefined) ?? null,
      roles: [],
    };
  },
};

export const authProvider: AuthProvider =
  AUTH_BACKEND === "jwt" ? jwtAuthProvider : sessionAuthProvider;

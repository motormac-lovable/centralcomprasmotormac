import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { isOwnerEmail } from "./owner-emails";

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  isBuyer: boolean;
  isSolicitante: boolean;
  isApprover: boolean;
  isAuditor: boolean;
  isActive: boolean;
  approverDepartments: string[];
  approverCeiling: number;
  hasAnyRole: boolean;
  fullName: string;
  refresh: () => Promise<void>;
}


const Ctx = createContext<AuthState>({
  user: null,
  session: null,
  loading: true,
  isOwner: false,
  isAdmin: false,
  isBuyer: false,
  isSolicitante: false,
  isApprover: false,
  isAuditor: false,
  isActive: true,
  approverDepartments: [],
  approverCeiling: 0,
  hasAnyRole: false,
  fullName: "",
  refresh: async () => {},
});


export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);
  const [fullName, setFullName] = useState("");
  const [approverDepartments, setApproverDepartments] = useState<string[]>([]);
  const [approverCeiling, setApproverCeiling] = useState<number>(0);
  const [isActive, setIsActive] = useState<boolean>(true);

  const forcedLogoutRef = useRef(false);
  // Rastreia para qual usuário o perfil já foi carregado, evitando estados
  // intermediários onde `session` existe mas os papéis ainda são do usuário anterior
  // (ou vazios) — causa raiz do "flash" da tela de restrição pós-login.
  const loadedForUserRef = useRef<string | null>(null);

  const enforceForceLogout = async (forceAt: string | null | undefined, sess: Session | null) => {
    if (forcedLogoutRef.current) return false;
    const iso = forceAt ? String(forceAt) : null;
    if (!iso) return false;
    const forceTs = new Date(iso).getTime();
    if (!Number.isFinite(forceTs)) return false;
    const lastSignIn = sess?.user?.last_sign_in_at ? new Date(sess.user.last_sign_in_at).getTime() : 0;
    if (forceTs <= lastSignIn) return false;
    forcedLogoutRef.current = true;
    try { await supabase.auth.signOut(); } catch { /* noop */ }
    toast.info(
      "Suas credenciais de acesso foram atualizadas por um administrador. Faça login novamente com o novo e-mail.",
      { duration: 8000 },
    );
    return true;
  };

  const loadRoles = async (uid: string | undefined, sess?: Session | null) => {
    if (!uid) {
      setRoles([]);
      setFullName("");
      setApproverDepartments([]);
      setApproverCeiling(0);
      setIsActive(true);
      loadedForUserRef.current = null;
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    try {
      const [{ data: rolesData }, { data: profile }, { data: approverCfg }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", uid),
        supabase.from("profiles").select("full_name, is_active, force_logout_at").eq("id", uid).maybeSingle(),
        (supabase as any).from("approver_settings").select("departments, teto_alcada").eq("user_id", uid).maybeSingle(),
      ]);
      const forced = await enforceForceLogout((profile as any)?.force_logout_at, sess ?? session);
      if (forced) return;
      setRoles((rolesData ?? []).map((r) => r.role as string));
      setFullName(profile?.full_name ?? "");
      setIsActive((profile as any)?.is_active !== false);
      setApproverDepartments((approverCfg?.departments as string[] | undefined) ?? []);
      setApproverCeiling(Number(approverCfg?.teto_alcada ?? 0));
      loadedForUserRef.current = uid;
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        forcedLogoutRef.current = false;
      }
      // Toast de boas-vindas: SOMENTE no evento real de SIGNED_IN.
      if (event === "SIGNED_IN" && typeof window !== "undefined") {
        const profile = sessionStorage.getItem("welcomeProfile");
        if (profile) {
          sessionStorage.removeItem("welcomeProfile");
          toast.success(`Bem Vindo, ${profile}!`);
        }
      }
      // Se o usuário mudou (login/logout/troca de conta), invalida imediatamente
      // o perfil carregado e sinaliza carregamento — evita renderizar rotas de
      // restrição com dados obsoletos enquanto o novo perfil chega.
      const newUid = s?.user?.id ?? null;
      if (newUid !== loadedForUserRef.current) {
        loadedForUserRef.current = null;
        setRoles([]);
        setProfileLoading(true);
      }
      setSession(s);
      setTimeout(() => loadRoles(s?.user.id, s), 0);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session?.user?.id) {
        setProfileLoading(false);
        setLoading(false);
        return;
      }
      loadRoles(data.session.user.id, data.session).finally(() => setLoading(false));
    });
    // Recheca ao voltar o foco da aba — "no próximo clique" após alteração.
    const onFocus = () => {
      supabase.auth.getSession().then(({ data }) => loadRoles(data.session?.user.id, data.session));
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("visibilitychange", onFocus);
    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("visibilitychange", onFocus);
    };
  }, []);


  const sessionUser = session?.user ?? null;
  // E-mails do Proprietário são sempre Proprietários — sem bloqueio possível.
  const isOwner = roles.includes("owner") || isOwnerEmail(sessionUser?.email);
  const isAdmin = isOwner || roles.includes("admin");
  const isSolicitante = roles.includes("solicitante");
  const isApprover = roles.includes("aprovador");
  const isBuyer = isAdmin || roles.includes("buyer");
  const isAuditor = roles.includes("auditor");
  const hasAnyRole = isOwner || isAdmin || isBuyer || isSolicitante || isApprover || isAuditor;
  const value: AuthState = {
    user: session?.user ?? null,
    session,
    // `loading` cobre tanto a sessão inicial quanto o carregamento do perfil
    // (papéis + status ativo). Rotas gated devem exibir splash enquanto true,
    // evitando renderizar "acesso restrito"/"aguardando aprovação" antes de
    // termos os dados do usuário logado.
    loading: loading || (!!session?.user && profileLoading),

    isOwner,
    isAdmin,
    isBuyer,
    isSolicitante,
    isApprover,
    isAuditor,
    isActive: isOwner ? true : isActive,
    approverDepartments,
    approverCeiling,
    hasAnyRole,
    fullName,
    refresh: () => loadRoles(session?.user.id, session),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

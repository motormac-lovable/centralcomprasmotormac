import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
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
  approverDepartments: [],
  approverCeiling: 0,
  hasAnyRole: false,
  fullName: "",
  refresh: async () => {},
});


export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);
  const [fullName, setFullName] = useState("");
  const [approverDepartments, setApproverDepartments] = useState<string[]>([]);
  const [approverCeiling, setApproverCeiling] = useState<number>(0);

  const loadRoles = async (uid: string | undefined) => {
    if (!uid) {
      setRoles([]);
      setFullName("");
      setApproverDepartments([]);
      setApproverCeiling(0);
      return;
    }
    const [{ data: rolesData }, { data: profile }, { data: approverCfg }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("profiles").select("full_name").eq("id", uid).maybeSingle(),
      (supabase as any).from("approver_settings").select("departments, teto_alcada").eq("user_id", uid).maybeSingle(),
    ]);
    setRoles((rolesData ?? []).map((r) => r.role as string));
    setFullName(profile?.full_name ?? "");
    setApproverDepartments((approverCfg?.departments as string[] | undefined) ?? []);
    setApproverCeiling(Number(approverCfg?.teto_alcada ?? 0));
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setTimeout(() => loadRoles(s?.user.id), 0);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      loadRoles(data.session?.user.id).finally(() => setLoading(false));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const sessionUser = session?.user ?? null;
  // E-mails do Proprietário são sempre Proprietários — sem bloqueio possível.
  const isOwner = roles.includes("owner") || isOwnerEmail(sessionUser?.email);
  const isAdmin = isOwner || roles.includes("admin");
  const isSolicitante = roles.includes("solicitante");
  const isApprover = roles.includes("aprovador");
  const isBuyer = isAdmin || roles.includes("buyer");
  const hasAnyRole = isOwner || isAdmin || isBuyer || isSolicitante || isApprover;
  const value: AuthState = {
    user: session?.user ?? null,
    session,
    loading,
    isOwner,
    isAdmin,
    isBuyer,
    isSolicitante,
    isApprover,
    approverDepartments,
    approverCeiling,
    hasAnyRole,
    fullName,
    refresh: () => loadRoles(session?.user.id),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

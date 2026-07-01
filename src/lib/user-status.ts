import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type UserStatus = { is_active: boolean; is_deleted: boolean };

let cache: Record<string, UserStatus> | null = null;
const listeners = new Set<() => void>();

async function refresh() {
  const { data } = await supabase
    .from("profiles")
    .select("email, is_active, is_deleted");
  const map: Record<string, UserStatus> = {};
  (data ?? []).forEach((r: any) => {
    if (!r.email && !r.is_deleted) return;
    const key = (r.email ?? "").toLowerCase();
    if (key) {
      map[key] = { is_active: r.is_active !== false, is_deleted: !!r.is_deleted };
    }
  });
  cache = map;
  listeners.forEach((cb) => cb());
}

/** React hook: maps email → { is_active, is_deleted }. */
export function useUserStatuses(): Record<string, UserStatus> {
  const [, force] = useState(0);
  useEffect(() => {
    const cb = () => force((n) => n + 1);
    listeners.add(cb);
    if (!cache) refresh();
    return () => {
      listeners.delete(cb);
    };
  }, []);
  return cache ?? {};
}

/** Decorate a user's display name with "(Inativo)" / "(Excluído)" when applicable. */
export function decorateUserName(
  name: string | null | undefined,
  email: string | null | undefined,
  statuses: Record<string, UserStatus>,
): string {
  const base = name?.trim() || email?.trim() || "—";
  if (!email) return base;
  const st = statuses[email.toLowerCase()];
  if (!st) return base;
  // If the profile itself already carries the suffix (anonymized), don't re-add.
  if (/\((Excluído|Inativo)\)$/i.test(base)) return base;
  if (st.is_deleted) return `${base} (Excluído)`;
  if (!st.is_active) return `${base} (Inativo)`;
  return base;
}

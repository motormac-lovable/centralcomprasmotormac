import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { DATA_DE_CORTE_PRODUCAO_ISO } from "@/lib/cutoff";
import { getLastVisit, markVisit, subscribeVisits, type VisitKey } from "@/lib/last-visits";


export function useNavBadges() {
  const { user, isApprover, isBuyer, isOwner, isAdmin, isAuditor, isSolicitante, approverDepartments } = useAuth();
  const [minhasCount, setMinhasCount] = useState(0);
  const [aprovacoesCount, setAprovacoesCount] = useState(0);
  const [adminCount, setAdminCount] = useState(0);
  const [historicoCount, setHistoricoCount] = useState(0);
  const [bump, setBump] = useState(0);

  const showMinhas = (isSolicitante || isApprover) && !isBuyer && !isAdmin && !isAuditor;
  const showAprovacoes = isApprover || isOwner || isAuditor;
  const showAdmin = isAdmin; // apenas Proprietário/Admin veem cadastros pendentes
  const showHistorico = isBuyer || isAuditor; // Histórico completo (compradores/auditores)
  const approverScope = isApprover && !isOwner && !isAdmin && !isBuyer;

  // Recomputa quando marcamos visita em alguma tela.
  useEffect(() => subscribeVisits(() => setBump((n) => n + 1)), []);

  useEffect(() => {
    let cancelled = false;
    const uid = user?.id;

    const sinceIso = (key: VisitKey) => {
      const lv = getLastVisit(uid, key);
      // Se nunca visitou, usa o corte de produção como piso — evita "999+" no primeiro acesso.
      return lv && lv > DATA_DE_CORTE_PRODUCAO_ISO ? lv : DATA_DE_CORTE_PRODUCAO_ISO;
    };

    const load = async () => {
      // Minhas Solicitações — novas desde a última visita
      if (showMinhas && user?.email) {
        const since = sinceIso("minhas");
        let q = supabase
          .from("kanban_cards")
          .select("id", { count: "exact", head: true })
          .gte("created_at", since);

        if (approverScope && approverDepartments.length > 0) {
          const deptList = approverDepartments.map((d) => `"${d.replace(/"/g, '\\"')}"`).join(",");
          q = q.or(`requester_email.ilike.${user.email},data->>departamento.in.(${deptList})`);
        } else {
          q = q.ilike("requester_email", user.email);
        }
        const { count } = await q;
        if (!cancelled) setMinhasCount(count ?? 0);
      } else if (!cancelled) {
        setMinhasCount(0);
      }

      // Aprovações — novas entradas em "aguardando_aprovacao" desde a última visita
      if (showAprovacoes) {
        const since = sinceIso("aprovacoes");
        let q = supabase
          .from("kanban_cards")
          .select("id", { count: "exact", head: true })
          .eq("status", "aguardando_aprovacao")
          // status_changed_at reflete a entrada na coluna; fallback para created_at.
          .gte("status_changed_at", since);

        if (isApprover && !isOwner && approverDepartments.length > 0) {
          const deptList = approverDepartments.map((d) => `"${d.replace(/"/g, '\\"')}"`).join(",");
          q = q.filter("data->>departamento", "in", `(${deptList})`);
        } else if (isApprover && !isOwner && approverDepartments.length === 0) {
          if (!cancelled) setAprovacoesCount(0);
        } else {
          const { count } = await q;
          if (!cancelled) setAprovacoesCount(count ?? 0);
          return;
        }
        const { count } = await q;
        if (!cancelled) setAprovacoesCount(count ?? 0);
      } else if (!cancelled) {
        setAprovacoesCount(0);
      }

      // Admin — novos cadastros pendentes desde a última visita
      if (showAdmin) {
        const since = sinceIso("admin");
        const { count } = await supabase
          .from("buyer_applications")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
          .gte("created_at", since);
        if (!cancelled) setAdminCount(count ?? 0);
      } else if (!cancelled) {
        setAdminCount(0);
      }

      // Histórico (compradores/auditores) — novos cards desde a última visita
      if (showHistorico) {
        const since = sinceIso("historico");
        const { count } = await supabase
          .from("kanban_cards")
          .select("id", { count: "exact", head: true })
          .gte("created_at", since);
        if (!cancelled) setHistoricoCount(count ?? 0);
      } else if (!cancelled) {
        setHistoricoCount(0);
      }
    };

    load();

    const ch = supabase
      .channel("nav-badges")
      .on("postgres_changes", { event: "*", schema: "public", table: "kanban_cards" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "buyer_applications" }, () => load())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.email, showMinhas, showAprovacoes, showAdmin, showHistorico, approverScope, isApprover, isOwner, approverDepartments.join("|"), bump]);

  return { minhasCount, aprovacoesCount, adminCount, historicoCount };
}

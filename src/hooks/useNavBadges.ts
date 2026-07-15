import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { DATA_DE_CORTE_PRODUCAO_ISO } from "@/lib/cutoff";

const FINAL_STATUSES = ["cotacoes_rejeitadas", "pedidos_gerados"];

export function useNavBadges() {
  const { user, isApprover, isBuyer, isOwner, isAdmin, isAuditor, isSolicitante, approverDepartments } = useAuth();
  const [minhasCount, setMinhasCount] = useState(0);
  const [aprovacoesCount, setAprovacoesCount] = useState(0);

  const showMinhas = (isSolicitante || isApprover) && !isBuyer && !isAdmin && !isAuditor;
  const showAprovacoes = isApprover || isOwner || isAuditor;
  const approverScope = isApprover && !isOwner && !isAdmin && !isBuyer;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      // Minhas Solicitações — ativas
      if (showMinhas && user?.email) {
        let q = supabase
          .from("kanban_cards")
          .select("id", { count: "exact", head: true })
          .gte("created_at", DATA_DE_CORTE_PRODUCAO_ISO)
          .not("status", "in", `(${FINAL_STATUSES.join(",")})`);

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

      // Aprovações — aguardando_aprovacao no depto do aprovador
      if (showAprovacoes) {
        let q = supabase
          .from("kanban_cards")
          .select("id", { count: "exact", head: true })
          .eq("status", "aguardando_aprovacao")
          .gte("created_at", DATA_DE_CORTE_PRODUCAO_ISO);

        // Owner/Auditor veem todos; Aprovador filtra pelos departamentos
        if (isApprover && !isOwner && approverDepartments.length > 0) {
          const deptList = approverDepartments.map((d) => `"${d.replace(/"/g, '\\"')}"`).join(",");
          q = q.filter("data->>departamento", "in", `(${deptList})`);
        } else if (isApprover && !isOwner && approverDepartments.length === 0) {
          if (!cancelled) setAprovacoesCount(0);
          return;
        }
        const { count } = await q;
        if (!cancelled) setAprovacoesCount(count ?? 0);
      } else if (!cancelled) {
        setAprovacoesCount(0);
      }
    };

    load();

    const ch = supabase
      .channel("nav-badges")
      .on("postgres_changes", { event: "*", schema: "public", table: "kanban_cards" }, () => load())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email, showMinhas, showAprovacoes, approverScope, isApprover, isOwner, approverDepartments.join("|")]);

  return { minhasCount, aprovacoesCount };
}

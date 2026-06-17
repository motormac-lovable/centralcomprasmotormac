import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, X, ShieldAlert, Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import type { Database } from "@/integrations/supabase/types";

type App = Database["public"]["Tables"]["buyer_applications"]["Row"];

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Painel Admin — Motormac" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { isAdmin, user } = useAuth();
  const [apps, setApps] = useState<App[]>([]);

  const reload = () => supabase.from("buyer_applications").select("*").order("created_at", { ascending: false })
    .then(({ data }) => setApps(data ?? []));

  useEffect(() => { reload(); }, []);

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <ShieldAlert className="h-10 w-10 mx-auto text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-semibold">Acesso restrito a Administradores</h1>
        <p className="mt-2 text-sm text-muted-foreground">Apenas aprovadores Motormac têm acesso a esta área.</p>
      </div>
    );
  }

  const decide = async (app: App, status: "approved" | "rejected") => {
    const { error } = await supabase.from("buyer_applications")
      .update({ status, decided_by: user?.id, decided_at: new Date().toISOString() })
      .eq("id", app.id);
    if (error) return toast.error(error.message);
    if (status === "approved" && app.user_id) {
      await supabase.from("user_roles").insert({ user_id: app.user_id, role: "buyer" });
    }
    if (status === "rejected" && app.user_id) {
      await supabase.from("user_roles").delete().eq("user_id", app.user_id).eq("role", "buyer");
    }
    toast.success(status === "approved" ? "Comprador aprovado!" : "Cadastro reprovado.", {
      description: `Simulação: notificação enviada para ${app.email}.`,
    });
    reload();
  };

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Painel Admin / Governança</h1>
        <p className="text-sm text-muted-foreground mt-1">Aprovar ou reprovar solicitações de cadastro de Compradores.</p>
      </div>

      <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left p-4">Nome</th>
              <th className="text-left p-4">Contato</th>
              <th className="text-left p-4">Áreas</th>
              <th className="text-left p-4">Status</th>
              <th className="text-right p-4">Ações</th>
            </tr>
          </thead>
          <tbody>
            {apps.length === 0 && (
              <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Nenhuma solicitação registrada.</td></tr>
            )}
            {apps.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="p-4">
                  <div className="font-medium">{a.full_name}</div>
                  <div className="text-xs text-muted-foreground">{a.cpf}</div>
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-1 text-xs"><Mail className="h-3 w-3" />{a.email}</div>
                  <div className="text-xs text-muted-foreground">{a.phone}</div>
                </td>
                <td className="p-4">
                  <div className="flex flex-wrap gap-1">
                    {a.checklist_types.map((t) => (
                      <span key={t} className="text-[11px] bg-accent text-accent-foreground px-2 py-0.5 rounded-full">{t}</span>
                    ))}
                  </div>
                </td>
                <td className="p-4">
                  <StatusPill status={a.status} />
                </td>
                <td className="p-4 text-right">
                  {a.status === "pending" ? (
                    <div className="inline-flex gap-2">
                      <button onClick={() => decide(a, "approved")}
                        className="inline-flex items-center gap-1 rounded-md bg-emerald-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-emerald-700">
                        <Check className="h-3.5 w-3.5" /> Aprovar
                      </button>
                      <button onClick={() => decide(a, "rejected")}
                        className="inline-flex items-center gap-1 rounded-md bg-destructive text-destructive-foreground px-3 py-1.5 text-xs font-semibold hover:opacity-90">
                        <X className="h-3.5 w-3.5" /> Reprovar
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {a.decided_at ? `Decidido em ${new Date(a.decided_at).toLocaleDateString("pt-BR")}` : "—"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800",
    approved: "bg-emerald-100 text-emerald-800",
    rejected: "bg-red-100 text-red-800",
  };
  const label: Record<string, string> = { pending: "Pendente", approved: "Aprovado", rejected: "Reprovado" };
  return <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-semibold ${map[status]}`}>{label[status]}</span>;
}

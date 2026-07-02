import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, X, ShieldAlert, Mail, Crown, UserPlus, UserMinus, Pencil, Trash2, Ban, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { isOwnerEmail } from "@/lib/owner-emails";
import { deleteUserCompletely, updateUserRole, setUserActiveState } from "@/lib/admin-users.functions";
import { approveBuyerApplication, rejectBuyerApplication } from "@/lib/buyer-applications.functions";
import { DEPARTAMENTOS_APOLLO } from "@/lib/apollo-data";
import type { Database } from "@/integrations/supabase/types";
import { translateError } from "@/lib/error-messages";

type App = Database["public"]["Tables"]["buyer_applications"]["Row"];
type RoleRow = { user_id: string; role: Database["public"]["Enums"]["app_role"] };
type ProfileRow = { id: string; full_name: string | null; email: string | null; cpf?: string | null; phone?: string | null; is_active?: boolean | null; is_deleted?: boolean | null };

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Painel Admin — Motormac" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { isAdmin, isOwner, isAuditor, isBuyer, user } = useAuth();
  const [apps, setApps] = useState<App[]>([]);

  const reload = () => supabase.from("buyer_applications").select("*").order("created_at", { ascending: false })
    .then(({ data }) => setApps(data ?? []));

  useEffect(() => { if (isAdmin) reload(); }, [isAdmin]);

  // Comprador (sem Admin): acesso parcial — Gestão de Solicitantes com Inativar/Reativar.
  // Auditor (sem Admin): acesso parcial — Gestão de Solicitantes com EXCLUSÃO apenas.
  const buyerOnly = !isAdmin && isBuyer && !isAuditor;
  const auditorOnly = !isAdmin && isAuditor;

  if (!isAdmin && !buyerOnly && !auditorOnly) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <ShieldAlert className="h-10 w-10 mx-auto text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-semibold">Acesso restrito</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Você não tem permissão para acessar esta área.
        </p>
      </div>
    );
  }

  if (buyerOnly || auditorOnly) {
    return (
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight">Gestão de Solicitantes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {auditorOnly
              ? "Acesso parcial do Auditor: você pode EXCLUIR usuários com o perfil Solicitante. Aprovação de cadastros, alterações de perfis, departamentos, tetos de alçada e demais gestões são bloqueadas."
              : "Acesso parcial do Comprador: você pode inativar ou reativar o acesso dos Solicitantes. Aprovação de novos cadastros, definição de perfis, departamentos e tetos de alçada são exclusivos do Administrador/Proprietário."}
          </p>
        </div>
        <RegisteredUsers restrictedTo="solicitante" mode={auditorOnly ? "auditor" : "buyer"} />
      </div>
    );
  }




  type AppRole = Database["public"]["Enums"]["app_role"];
  const roleLabel: Record<AppRole, string> = { owner: "Proprietário", admin: "Administrador", buyer: "Comprador", solicitante: "Solicitante", aprovador: "Aprovador", auditor: "Auditor" };
  const allowedRoles: AppRole[] = isOwner ? ["owner", "admin", "buyer", "solicitante", "aprovador", "auditor"] : ["admin", "buyer", "solicitante", "aprovador", "auditor"];
  const [selectedRole, setSelectedRole] = useState<Record<string, AppRole>>({});


  const approveFn = useServerFn(approveBuyerApplication);
  const rejectFn = useServerFn(rejectBuyerApplication);

  const approve = async (app: App) => {
    const fallback: AppRole = app.checklist_types.includes("aprovador") ? "aprovador" : app.checklist_types.includes("solicitante") ? "solicitante" : "buyer";
    const role = selectedRole[app.id] ?? fallback;
    if (role === "owner") return toast.error("Papel Proprietário não pode ser atribuído via aprovação.");
    if (!allowedRoles.includes(role)) return toast.error("Você não pode atribuir este nível.");
    try {
      const res = await approveFn({ data: { application_id: app.id, role: role as Exclude<AppRole, "owner"> } });
      // Se aprovador, materializa alçadas solicitadas.
      if (role === "aprovador" && (res as any)?.user_id) {
        const reqDepts = ((app as any).requested_departments as string[] | null) ?? [];
        const reqCeil = Number((app as any).requested_ceiling ?? 0);
        const { error: cfgErr } = await (supabase as any)
          .from("approver_settings")
          .upsert(
            { user_id: (res as any).user_id, departments: reqDepts, teto_alcada: reqCeil || 2000 },
            { onConflict: "user_id" },
          );
        if (cfgErr) toast.warning("Aprovado, mas falhou ao salvar alçada: " + cfgErr.message);
      }
      toast.success(`Cadastro aprovado como ${roleLabel[role]}!`, {
        description: `Usuário criado e notificação simulada enviada para ${app.email}.`,
      });
      reload();
    } catch (err) {
      toast.error("Falha ao aprovar: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const reject = async (app: App) => {
    try {
      await rejectFn({ data: { application_id: app.id } });
      toast.success("Cadastro reprovado.", { description: `Simulação: notificação enviada para ${app.email}.` });
      reload();
    } catch (err) {
      toast.error("Falha ao reprovar: " + (err instanceof Error ? err.message : String(err)));
    }
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
                  {a.checklist_types.includes("aprovador") && (
                    <div className="mt-1 text-[11px] text-cyan-800">
                      <div>
                        Alçada pretendida:{" "}
                        <strong>
                          {Number((a as any).requested_ceiling ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </strong>
                      </div>
                      <div>Depto(s): {((a as any).requested_departments ?? []).join(", ") || "—"}</div>
                    </div>
                  )}
                </td>
                <td className="p-4">
                  <StatusPill status={a.status} />
                </td>
                <td className="p-4 text-right">
                  {a.status === "pending" ? (
                    <div className="inline-flex items-center gap-2">
                      <select
                        value={selectedRole[a.id] ?? (a.checklist_types.includes("aprovador") ? "aprovador" : a.checklist_types.includes("solicitante") ? "solicitante" : "buyer")}
                        onChange={(e) => setSelectedRole((s) => ({ ...s, [a.id]: e.target.value as AppRole }))}
                        className="rounded-md border bg-background px-2 py-1.5 text-xs"
                        title="Nível a ser atribuído na aprovação"
                      >
                        {allowedRoles.map((r) => (
                          <option key={r} value={r}>{roleLabel[r]}</option>
                        ))}
                      </select>
                      <button onClick={() => approve(a)}
                        className="inline-flex items-center gap-1 rounded-md bg-emerald-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-emerald-700">
                        <Check className="h-3.5 w-3.5" /> Aprovar
                      </button>
                      <button onClick={() => reject(a)}
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

      <RegisteredUsers />

      {isOwner && <OwnerAdminManager />}
    </div>
  );
}

function RegisteredUsers({
  restrictedTo,
  mode = "admin",
}: { restrictedTo?: "solicitante"; mode?: "admin" | "buyer" | "auditor" } = {}) {
  type Row = ProfileRow & { roles: string[]; created_at?: string };
  const { isOwner, isAdmin, user } = useAuth();
  const buyerOnly = mode === "buyer";
  const auditorOnly = mode === "auditor";
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const deleteFn = useServerFn(deleteUserCompletely);
  const toggleActiveFn = useServerFn(setUserActiveState);

  const reload = async () => {
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, cpf, phone, is_active, is_deleted, created_at").eq("is_deleted", false).order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    const byUser = new Map<string, string[]>();
    (roles ?? []).forEach((r: any) => {
      const arr = byUser.get(r.user_id) ?? [];
      arr.push(r.role);
      byUser.set(r.user_id, arr);
    });
    setRows((profiles ?? []).map((p: any) => ({ ...p, roles: byUser.get(p.id) ?? [] })));
  };

  useEffect(() => { reload(); }, []);

  const roleLabel: Record<string, string> = { owner: "Proprietário", admin: "Administrador", buyer: "Comprador", solicitante: "Solicitante", aprovador: "Aprovador", auditor: "Auditor" };
  const roleStyle: Record<string, string> = {
    owner: "bg-amber-100 text-amber-800",
    admin: "bg-blue-100 text-blue-800",
    buyer: "bg-emerald-100 text-emerald-800",
    solicitante: "bg-violet-100 text-violet-800",
    aprovador: "bg-cyan-100 text-cyan-800",
    auditor: "bg-slate-200 text-slate-800",
  };

  const filtered = rows.filter((r) => {
    // Comprador/Auditor: Gestão de Solicitantes filtra usuários que TÊM (apenas) o perfil solicitante.
    if (restrictedTo === "solicitante") {
      if (!r.roles.includes("solicitante")) return false;
      // Auditor só pode agir em usuários exclusivamente Solicitantes.
      if (auditorOnly && r.roles.some((role) => role !== "solicitante")) return false;
    }
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return [r.full_name, r.email, r.cpf, r.phone].some((v) => (v ?? "").toString().toLowerCase().includes(s));
  });


  const isOwnerRow = (u: Row) => u.roles.includes("owner") || isOwnerEmail(u.email);

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteFn({ data: { user_id: deleting.id } });
      toast.success("Usuário excluído com sucesso.");
      setDeleting(null);
      reload();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao excluir usuário.");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (u: Row) => {
    const newState = !(u.is_active ?? true);
    const verb = newState ? "reativar" : "inativar";
    if (!confirm(`Confirma ${verb} o acesso de ${u.full_name || u.email}?`)) return;
    try {
      await toggleActiveFn({ data: { user_id: u.id, active: newState } });
      toast.success(newState ? "Usuário reativado." : "Usuário inativado. Acesso bloqueado até reativação.");
      reload();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao alterar status.");
    }
  };

  return (
    <div className="mt-10 rounded-2xl border bg-card shadow-sm overflow-hidden">
      <div className="p-5 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{restrictedTo === "solicitante" ? "Solicitantes" : "Usuários registrados"}</h2>
          <p className="text-xs text-muted-foreground">
            {auditorOnly
              ? "Auditor: exclusão restrita aos usuários com o perfil Solicitante. Demais ações são bloqueadas."
              : buyerOnly
                ? "Ative ou inative o acesso dos Solicitantes. Demais gestões são exclusivas do Administrador."
                : "Edite os dados cadastrais ou exclua usuários. Proprietários não podem ser excluídos."}
          </p>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nome, e-mail, CPF…"
          className="rounded-md border bg-background px-3 py-1.5 text-sm w-full sm:w-72"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left p-4">Nome</th>
              <th className="text-left p-4">Contato</th>
              <th className="text-left p-4">Nível(is)</th>
              <th className="text-left p-4">Cadastro</th>
              <th className="text-right p-4">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Nenhum usuário encontrado.</td></tr>
            )}
            {filtered.map((u) => {
              const owner = isOwnerRow(u);
              const isSelf = u.id === user?.id;
              const targetIsAdmin = u.roles.includes("admin");
              // Apenas o Proprietário pode gerenciar (editar/inativar/excluir) outros Administradores.
              const adminBlocked = targetIsAdmin && !isOwner;
              const canManage = !owner && !isSelf && !adminBlocked;
              // Auditor: apenas exclusão de Solicitantes; sem editar; sem inativar.
              const canDelete = canManage && (auditorOnly ? u.roles.includes("solicitante") && !u.roles.some((r) => r !== "solicitante") : !buyerOnly);
              const canToggle = canManage && !auditorOnly;
              const canEdit = !auditorOnly && !buyerOnly && !owner && !adminBlocked;
              const active = u.is_active ?? true;
              const blockedTitle = owner
                ? "Proprietários são intocáveis"
                : adminBlocked
                  ? "Somente o Proprietário pode gerenciar Administradores"
                  : isSelf
                    ? "Você não pode alterar o próprio usuário"
                    : "";
              return (
                <tr key={u.id} className={`border-t ${!active ? "bg-red-50/40" : ""}`}>
                  <td className="p-4">
                    <div className="font-medium flex items-center gap-2">
                      {u.full_name || "—"}
                      {!active && (
                        <span className="text-[10px] uppercase tracking-wider bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">Inativo</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{u.cpf || ""}</div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1 text-xs"><Mail className="h-3 w-3" />{u.email}</div>
                    <div className="text-xs text-muted-foreground">{u.phone}</div>
                  </td>
                  <td className="p-4">
                    {u.roles.length === 0 ? (
                      <span className="text-[11px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">Sem nível (pendente)</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {u.roles.map((r) => (
                          <span key={r} className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${roleStyle[r] ?? "bg-accent text-accent-foreground"}`}>
                            {roleLabel[r] ?? r}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="p-4 text-xs text-muted-foreground">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td className="p-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      {!buyerOnly && !auditorOnly && (
                        <button
                          onClick={() => canEdit && setEditing(u)}
                          disabled={!canEdit}
                          className="inline-flex items-center gap-1 rounded-md border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed"
                          title={canEdit ? "Editar dados do usuário" : blockedTitle || "Sem permissão"}
                        >
                          <Pencil className="h-3.5 w-3.5" /> Editar
                        </button>
                      )}
                      {!auditorOnly && (
                        <button
                          onClick={() => canToggle && toggleActive(u)}
                          disabled={!canToggle}
                          className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed ${
                            active
                              ? "bg-amber-500 text-white hover:bg-amber-600"
                              : "bg-emerald-600 text-white hover:bg-emerald-700"
                          }`}
                          title={canToggle ? (active ? "Inativar acesso" : "Reativar acesso") : blockedTitle || "Sem permissão"}
                        >
                          {active ? (<><Ban className="h-3.5 w-3.5" /> Inativar</>) : (<><RotateCcw className="h-3.5 w-3.5" /> Reativar</>)}
                        </button>
                      )}
                      {(!buyerOnly || auditorOnly) && (
                        <button
                          onClick={() => canDelete && setDeleting(u)}
                          disabled={!canDelete}
                          className="inline-flex items-center gap-1 rounded-md bg-destructive text-destructive-foreground px-3 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                          title={canDelete ? "Excluir usuário" : blockedTitle || "Sem permissão"}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Excluir
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <EditUserModal
          row={editing}
          allowedRoles={isOwner ? ["owner", "admin", "buyer", "solicitante", "aprovador", "auditor"] : ["admin", "buyer", "solicitante", "aprovador", "auditor"]}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}


      {deleting && (
        <ConfirmDeleteModal
          row={deleting}
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

const TETO_OPCOES = [2000, 5000, 10000, 30000, 200000];

function EditUserModal({ row, allowedRoles, onClose, onSaved }: { row: ProfileRow & { roles: string[] }; allowedRoles: string[]; onClose: () => void; onSaved: () => void }) {
  const [full_name, setFullName] = useState(row.full_name ?? "");
  const [email, setEmail] = useState(row.email ?? "");
  const [cpf, setCpf] = useState(row.cpf ?? "");
  const [phone, setPhone] = useState(row.phone ?? "");
  const currentRole = row.roles.includes("owner") || isOwnerEmail(row.email)
    ? "owner"
    : row.roles.includes("admin")
      ? "admin"
      : row.roles.includes("aprovador")
        ? "aprovador"
        : row.roles.includes("buyer")
          ? "buyer"
          : row.roles.includes("solicitante")
            ? "solicitante"
            : "buyer";
  const [role, setRole] = useState<string>(currentRole);
  const [saving, setSaving] = useState(false);
  const [departments, setDepartments] = useState<string[]>([]);
  const [teto, setTeto] = useState<number>(2000);
  const [deptFilter, setDeptFilter] = useState("");
  const updateRoleFn = useServerFn(updateUserRole);

  const roleLabel: Record<string, string> = { owner: "Proprietário", admin: "Administrador", buyer: "Comprador", solicitante: "Solicitante", aprovador: "Aprovador", auditor: "Auditor" };

  // Carrega configuração existente do Aprovador
  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("approver_settings")
        .select("departments, teto_alcada")
        .eq("user_id", row.id)
        .maybeSingle();
      if (data) {
        setDepartments((data.departments as string[]) ?? []);
        setTeto(Number(data.teto_alcada) || 2000);
      }
    })();
  }, [row.id]);

  const save = async () => {
    if (!full_name.trim()) return toast.error("Informe o nome.");
    if (role === "aprovador") {
      if (departments.length === 0) return toast.error("Selecione ao menos um departamento vinculado.");
      if (!TETO_OPCOES.includes(teto)) return toast.error("Selecione um teto de alçada válido.");
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: full_name.trim(), email: email.trim(), cpf: cpf.trim(), phone: phone.trim() })
        .eq("id", row.id);
      if (error) throw error;

      if (role !== currentRole && allowedRoles.includes(role)) {
        await updateRoleFn({ data: { user_id: row.id, role: role as any } });
      }

      if (role === "aprovador") {
        const { error: cfgErr } = await (supabase as any)
          .from("approver_settings")
          .upsert({ user_id: row.id, departments, teto_alcada: teto }, { onConflict: "user_id" });
        if (cfgErr) throw cfgErr;
      }

      toast.success("Usuário atualizado.");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao atualizar usuário.");
    } finally {
      setSaving(false);
    }
  };

  const allSelected = departments.length >= DEPARTAMENTOS_APOLLO.length;

  const toggleDept = (d: string) => {
    if (allSelected) return; // desabilitado quando "Todos" está marcado
    setDepartments((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const toggleAllDepartments = () => {
    if (allSelected) setDepartments([]);
    else setDepartments([...DEPARTAMENTOS_APOLLO]);
  };

  const filteredDepts = deptFilter
    ? DEPARTAMENTOS_APOLLO.filter((d) => d.toLowerCase().includes(deptFilter.toLowerCase()))
    : DEPARTAMENTOS_APOLLO;

  const selectAllFiltered = () => {
    if (allSelected) return;
    setDepartments((prev) => Array.from(new Set([...prev, ...filteredDepts])));
  };
  const clearAllFiltered = () => {
    if (allSelected) return;
    const set = new Set(filteredDepts);
    setDepartments((prev) => prev.filter((d) => !set.has(d)));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Editar usuário</h3>
          <button onClick={onClose} className="p-1 hover:bg-accent rounded-md"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <Field label="Nome completo" value={full_name} onChange={setFullName} />
          <Field label="E-mail" value={email} onChange={setEmail} type="email" />
          <Field label="CPF" value={cpf} onChange={setCpf} />
          <Field label="Telefone" value={phone} onChange={setPhone} />
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Nível de acesso</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              {allowedRoles.map((r) => (
                <option key={r} value={r}>{roleLabel[r] ?? r}</option>
              ))}
            </select>
          </label>

          {role === "aprovador" && (
            <div className="rounded-lg border-2 border-cyan-200 bg-cyan-50/50 p-3 space-y-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-cyan-800">Governança do Aprovador</div>

              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Teto de Alçada Permitido</span>
                <select
                  value={teto}
                  onChange={(e) => setTeto(Number(e.target.value))}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  {TETO_OPCOES.map((v) => (
                    <option key={v} value={v}>
                      {v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Departamentos Vinculados ({allSelected ? "Todos" : `${departments.length} selecionado${departments.length === 1 ? "" : "s"}`})
                  </span>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-cyan-800 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAllDepartments}
                    />
                    Todos os Departamentos
                  </label>
                </div>
                <input
                  type="text"
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                  placeholder="Buscar departamento…"
                  disabled={allSelected}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                />
                {!allSelected && deptFilter && filteredDepts.length > 0 && (
                  <div className="mt-1 flex items-center gap-2 text-[11px]">
                    <button type="button" onClick={selectAllFiltered}
                      className="rounded border border-cyan-300 bg-white px-2 py-0.5 text-cyan-800 hover:bg-cyan-100">
                      + Selecionar todos encontrados ({filteredDepts.length})
                    </button>
                    <button type="button" onClick={clearAllFiltered}
                      className="rounded border px-2 py-0.5 text-muted-foreground hover:bg-muted">
                      Limpar encontrados
                    </button>
                  </div>
                )}
                <div className={`mt-2 max-h-48 overflow-y-auto rounded-md border bg-background p-2 space-y-1 ${allSelected ? "opacity-60" : ""}`}>
                  {(allSelected ? DEPARTAMENTOS_APOLLO : filteredDepts).slice(0, 200).map((d) => (
                    <label key={d} className={`flex items-center gap-2 text-xs rounded px-1 py-0.5 ${allSelected ? "cursor-not-allowed" : "hover:bg-muted/60 cursor-pointer"}`}>
                      <input
                        type="checkbox"
                        checked={allSelected || departments.includes(d)}
                        disabled={allSelected}
                        onChange={() => toggleDept(d)}
                      />
                      <span className="truncate">{d}</span>
                    </label>
                  ))}
                  {!allSelected && filteredDepts.length === 0 && (
                    <p className="text-[10px] text-muted-foreground p-1">Nenhum departamento encontrado para "{deptFilter}".</p>
                  )}
                  {!allSelected && filteredDepts.length > 200 && (
                    <p className="text-[10px] text-muted-foreground p-1">Refine a busca para ver mais resultados.</p>
                  )}
                </div>
                {allSelected && (
                  <p className="mt-1 text-[11px] text-cyan-800">
                    Este aprovador atenderá <strong>qualquer departamento</strong>. Desmarque "Todos os Departamentos" para escolher individualmente.
                  </p>
                )}
              </div>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            Observação: a alteração de e-mail aqui ajusta o perfil exibido. O e-mail de login é mantido pelo sistema de autenticação.
          </p>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border px-4 py-2 text-sm">Cancelar</button>
          <button onClick={save} disabled={saving}
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-60">
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
      />
    </label>
  );
}

function ConfirmDeleteModal({ row, busy, onCancel, onConfirm }: { row: ProfileRow; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
            <Trash2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold">Excluir usuário?</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Esta ação removerá permanentemente <strong>{row.full_name || row.email}</strong> e todos os seus dados associados. Não é possível desfazer.
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onCancel} disabled={busy} className="rounded-md border px-4 py-2 text-sm">Cancelar</button>
          <button onClick={onConfirm} disabled={busy}
            className="rounded-md bg-destructive text-destructive-foreground px-4 py-2 text-sm font-semibold disabled:opacity-60">
            {busy ? "Excluindo…" : "Excluir definitivamente"}
          </button>
        </div>
      </div>
    </div>
  );
}


function OwnerAdminManager() {
  const [admins, setAdmins] = useState<Array<RoleRow & { profile?: ProfileRow }>>([]);
  const [approvedBuyers, setApprovedBuyers] = useState<Array<RoleRow & { profile?: ProfileRow }>>([]);

  const reload = async () => {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "buyer"]);
    const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
    let profiles: ProfileRow[] = [];
    if (ids.length) {
      const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      profiles = data ?? [];
    }
    const decorate = (r: RoleRow) => ({ ...r, profile: profiles.find((p) => p.id === r.user_id) });
    setAdmins(((roles ?? []).filter((r) => r.role === "admin") as RoleRow[]).map(decorate));
    setApprovedBuyers(((roles ?? []).filter((r) => r.role === "buyer") as RoleRow[]).map(decorate));
  };

  useEffect(() => { reload(); }, []);

  const promote = async (uid: string) => {
    const { error } = await supabase.from("user_roles").insert({ user_id: uid, role: "admin" });
    if (error) return toast.error(error.message);
    toast.success("Comprador promovido a Administrador.");
    reload();
  };

  const demote = async (uid: string) => {
    const { error } = await supabase.from("user_roles").delete().eq("user_id", uid).eq("role", "admin");
    if (error) return toast.error(error.message);
    toast.success("Papel de Administrador removido.");
    reload();
  };

  const adminIds = new Set(admins.map((a) => a.user_id));
  const buyersOnly = approvedBuyers.filter((b) => !adminIds.has(b.user_id));

  return (
    <div className="mt-10 rounded-2xl border bg-card shadow-sm overflow-hidden">
      <div className="p-5 border-b flex items-center gap-3 bg-gradient-to-r from-amber-50 to-transparent">
        <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
          <Crown className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Gerenciar Administradores</h2>
          <p className="text-xs text-muted-foreground">
            Área exclusiva do Proprietário. Promova um Comprador aprovado a Administrador ou revogue o papel.
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
        <div className="p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-primary" /> Administradores atuais</h3>
          {admins.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum administrador além do Proprietário.</p>
          ) : (
            <ul className="space-y-2">
              {admins.map((a) => (
                <li key={a.user_id} className="flex items-center justify-between rounded-md border p-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{a.profile?.full_name || "—"}</div>
                    <div className="text-xs text-muted-foreground truncate">{a.profile?.email}</div>
                  </div>
                  <button
                    onClick={() => demote(a.user_id)}
                    className="inline-flex items-center gap-1 rounded-md bg-destructive text-destructive-foreground px-3 py-1.5 text-xs font-semibold hover:opacity-90"
                  >
                    <UserMinus className="h-3.5 w-3.5" /> Revogar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><UserPlus className="h-4 w-4 text-primary" /> Compradores elegíveis</h3>
          {buyersOnly.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum comprador disponível para promoção.</p>
          ) : (
            <ul className="space-y-2">
              {buyersOnly.map((b) => (
                <li key={b.user_id} className="flex items-center justify-between rounded-md border p-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{b.profile?.full_name || "—"}</div>
                    <div className="text-xs text-muted-foreground truncate">{b.profile?.email}</div>
                  </div>
                  <button
                    onClick={() => promote(b.user_id)}
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-emerald-700"
                  >
                    <UserPlus className="h-3.5 w-3.5" /> Promover
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
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

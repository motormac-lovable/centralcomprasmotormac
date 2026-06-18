import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, X, ShieldAlert, Mail, Crown, UserPlus, UserMinus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { isOwnerEmail } from "@/lib/owner-emails";
import { deleteUserCompletely } from "@/lib/admin-users.functions";
import type { Database } from "@/integrations/supabase/types";

type App = Database["public"]["Tables"]["buyer_applications"]["Row"];
type RoleRow = { user_id: string; role: Database["public"]["Enums"]["app_role"] };
type ProfileRow = { id: string; full_name: string | null; email: string | null; cpf?: string | null; phone?: string | null };

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Painel Admin — Motormac" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { isAdmin, isOwner, user } = useAuth();
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

  type AppRole = Database["public"]["Enums"]["app_role"];
  const roleLabel: Record<AppRole, string> = { owner: "Proprietário", admin: "Administrador", buyer: "Comprador" };
  const allowedRoles: AppRole[] = isOwner ? ["owner", "admin", "buyer"] : ["admin", "buyer"];
  const [selectedRole, setSelectedRole] = useState<Record<string, AppRole>>({});

  const approve = async (app: App) => {
    const role = selectedRole[app.id] ?? "buyer";
    if (!allowedRoles.includes(role)) return toast.error("Você não pode atribuir este nível.");
    if (!app.user_id) return toast.error("Solicitação sem usuário vinculado.");
    const { error } = await supabase.from("buyer_applications")
      .update({ status: "approved", decided_by: user?.id, decided_at: new Date().toISOString() })
      .eq("id", app.id);
    if (error) return toast.error(error.message);
    // Limpa papéis anteriores (não-owner) para evitar duplicidade e atribui o novo.
    await supabase.from("user_roles").delete().eq("user_id", app.user_id).in("role", ["admin", "buyer"]);
    const { error: rErr } = await supabase.from("user_roles").insert({ user_id: app.user_id, role });
    if (rErr) return toast.error("Falha ao atribuir papel: " + rErr.message);
    toast.success(`Cadastro aprovado como ${roleLabel[role]}!`, {
      description: `Simulação: notificação enviada para ${app.email}.`,
    });
    reload();
  };

  const reject = async (app: App) => {
    const { error } = await supabase.from("buyer_applications")
      .update({ status: "rejected", decided_by: user?.id, decided_at: new Date().toISOString() })
      .eq("id", app.id);
    if (error) return toast.error(error.message);
    if (app.user_id) {
      await supabase.from("user_roles").delete().eq("user_id", app.user_id).in("role", ["admin", "buyer"]);
    }
    toast.success("Cadastro reprovado.", { description: `Simulação: notificação enviada para ${app.email}.` });
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
                    <div className="inline-flex items-center gap-2">
                      <select
                        value={selectedRole[a.id] ?? "buyer"}
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

function RegisteredUsers() {
  type Row = ProfileRow & { roles: string[]; created_at?: string };
  const { isOwner, user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const deleteFn = useServerFn(deleteUserCompletely);

  const reload = async () => {
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, cpf, phone, created_at").order("created_at", { ascending: false }),
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

  const roleLabel: Record<string, string> = { owner: "Proprietário", admin: "Administrador", buyer: "Comprador" };
  const roleStyle: Record<string, string> = {
    owner: "bg-amber-100 text-amber-800",
    admin: "bg-blue-100 text-blue-800",
    buyer: "bg-emerald-100 text-emerald-800",
  };
  const filtered = rows.filter((r) => {
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

  return (
    <div className="mt-10 rounded-2xl border bg-card shadow-sm overflow-hidden">
      <div className="p-5 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Usuários registrados</h2>
          <p className="text-xs text-muted-foreground">Edite os dados cadastrais ou exclua usuários. Proprietários não podem ser excluídos.</p>
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
              const canDelete = !owner && !isSelf;
              return (
                <tr key={u.id} className="border-t">
                  <td className="p-4">
                    <div className="font-medium">{u.full_name || "—"}</div>
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
                      <button
                        onClick={() => setEditing(u)}
                        className="inline-flex items-center gap-1 rounded-md border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-accent"
                        title="Editar dados do usuário"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </button>
                      <button
                        onClick={() => canDelete && setDeleting(u)}
                        disabled={!canDelete}
                        className="inline-flex items-center gap-1 rounded-md bg-destructive text-destructive-foreground px-3 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                        title={owner ? "Proprietários não podem ser excluídos" : isSelf ? "Você não pode excluir o próprio usuário" : "Excluir usuário"}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Excluir
                      </button>
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

function EditUserModal({ row, onClose, onSaved }: { row: ProfileRow & { roles: string[] }; onClose: () => void; onSaved: () => void }) {
  const [full_name, setFullName] = useState(row.full_name ?? "");
  const [email, setEmail] = useState(row.email ?? "");
  const [cpf, setCpf] = useState(row.cpf ?? "");
  const [phone, setPhone] = useState(row.phone ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!full_name.trim()) return toast.error("Informe o nome.");
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: full_name.trim(), email: email.trim(), cpf: cpf.trim(), phone: phone.trim() })
      .eq("id", row.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Usuário atualizado.");
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Editar usuário</h3>
          <button onClick={onClose} className="p-1 hover:bg-accent rounded-md"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <Field label="Nome completo" value={full_name} onChange={setFullName} />
          <Field label="E-mail" value={email} onChange={setEmail} type="email" />
          <Field label="CPF" value={cpf} onChange={setCpf} />
          <Field label="Telefone" value={phone} onChange={setPhone} />
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

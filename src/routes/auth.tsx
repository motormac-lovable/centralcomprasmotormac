import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { isOwnerEmail } from "@/lib/owner-emails";
import { Field, inputCls } from "@/components/forms/FormShell";
import { ShieldCheck } from "lucide-react";
import { maskPhone } from "@/lib/masks";
import { DEPARTAMENTOS_APOLLO } from "@/lib/apollo-data";
import logoAsset from "../assets/logo-motormac.png.asset.json";



export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar ou Cadastrar — Motormac" },
      { name: "description", content: "Acesso de compradores aprovados e cadastro para novos compradores." },
    ],
  }),
  component: AuthPage,
});

const CHECKLISTS = [
  { id: "compras", label: "Compra de Peças" },
  { id: "contratos", label: "Contratos" },
  { id: "frete", label: "Frete" },
];

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading, isAdmin, isBuyer, isSolicitante, isApprover, isAuditor } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  useEffect(() => {
    if (loading || !user) return;
    const hasAnyRole = isAdmin || isBuyer || isApprover || isAuditor || isSolicitante;
    if (hasAnyRole) navigate({ to: "/" });
    else navigate({ to: "/pending" });
  }, [user, loading, isAdmin, isBuyer, isSolicitante, isApprover, isAuditor, navigate]);


  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center px-4 sm:px-6 py-10 gap-6">
      <div className="flex flex-col items-center gap-3">
        <img src={logoAsset.url} alt="Motormac" className="h-[5.2rem] w-auto object-contain" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Central de Compras Motormac</h1>
      </div>
      <div className={`w-full rounded-2xl border bg-card shadow-sm overflow-hidden ${mode === "signin" ? "max-w-md" : "max-w-5xl"}`}>
        <div className="h-2 bg-gradient-to-r from-[var(--primary)] to-[var(--primary-glow)]" />
        <div className="p-6 sm:p-8 border-b flex flex-col items-center gap-3 text-center">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-accent text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {mode === "signin" ? "Entrar na plataforma" : "Cadastro de Usuário"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 text-center">
            {mode === "signin"
                ? "Acesso liberado após aprovação do time de Compras."
                : "Preencha seus dados - sua solicitação será avaliada pelo time de Compras."}
            </p>
          </div>
        </div>
        <div className="p-6 sm:p-8">
          {mode === "signin" ? <SignInForm /> : <SignUpForm onDone={() => setMode("signin")} />}
          <div className="mt-6 pt-4 border-t text-sm text-muted-foreground text-center">
            {mode === "signin" ? "Novo por aqui?" : "Já tem cadastro?"}{" "}
            <button
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="font-medium text-primary hover:underline"
            >
              {mode === "signin" ? "Solicitar cadastro" : "Entrar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    const uid = data.user?.id;
    const emailLogged = data.user?.email ?? email;
    let owner = isOwnerEmail(emailLogged);
    let admin = false, buyer = false, solicitante = false, approver = false, auditor = false;
    if (uid) {
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      owner = owner || (roles ?? []).some((r) => r.role === "owner");
      admin = (roles ?? []).some((r) => r.role === "admin");
      buyer = (roles ?? []).some((r) => r.role === "buyer");
      solicitante = (roles ?? []).some((r) => r.role === "solicitante");
      approver = (roles ?? []).some((r) => r.role === "aprovador");
      auditor = (roles ?? []).some((r) => r.role === "auditor");
    }
    if (owner) {
      toast.success("Bem-vindo, Proprietário!");
      navigate({ to: "/" });
    } else if (admin) {
      toast.success("Bem-vindo, Administrador!");
      navigate({ to: "/" });
    } else if (buyer) {
      toast.success("Bem-vindo de volta!");
      navigate({ to: "/" });
    } else if (approver) {
      toast.success("Bem-vindo, Aprovador!");
      navigate({ to: "/" });
    } else if (auditor) {
      toast.success("Bem-vindo, Auditor — acesso somente leitura.");
      navigate({ to: "/" });
    } else if (solicitante) {
      toast.success("Bem-vindo, Solicitante!");
      navigate({ to: "/" });
    } else {
      toast.info("Seu cadastro ainda está aguardando aprovação do proprietário.");
      navigate({ to: "/pending" });
    }

  };


  return (
    <>
      <form onSubmit={submit} className="grid gap-4">
        <Field label="E-mail" required>
          <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Senha" required>
          <input type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <div className="-mt-2 text-right">
          <button
            type="button"
            onClick={() => setForgotOpen(true)}
            className="text-xs text-primary hover:underline"
          >
            Esqueci minha senha
          </button>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {busy ? "Entrando..." : "Entrar"}
        </button>
      </form>
      {forgotOpen && <ForgotPasswordModal initialEmail={email} onClose={() => setForgotOpen(false)} />}
    </>
  );
}

function ForgotPasswordModal({ initialEmail, onClose }: { initialEmail: string; onClose: () => void }) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Um link de redefinição de senha foi enviado para o seu e-mail!");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-1">Recuperação de senha</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Informe seu e-mail e enviaremos um link para criar uma nova senha.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <Field label="E-mail" required>
            <input
              type="email"
              className={inputCls}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-md border hover:bg-muted"
            >
              Voltar ao login
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {busy ? "Enviando..." : "Enviar link"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SignUpForm({ onDone }: { onDone: () => void }) {
  const [perfil, setPerfil] = useState<"solicitante" | "comprador" | "aprovador" | "auditor">("solicitante");
  const [f, setF] = useState({ full_name: "", cpf: "", phone: "", email: "", password: "" });
  const [types, setTypes] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [deptFilter, setDeptFilter] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) =>
    setTypes((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  const toggleDept = (d: string) =>
    setDepartments((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]));

  const filteredDepts = deptFilter
    ? DEPARTAMENTOS_APOLLO.filter((d) => d.toLowerCase().includes(deptFilter.toLowerCase()))
    : DEPARTAMENTOS_APOLLO;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (perfil === "comprador" && types.length === 0) {
      return toast.error("Selecione ao menos um tipo de checklist.");
    }
    if (perfil === "aprovador" && departments.length === 0) {
      return toast.error("Selecione ao menos um departamento de alçada.");
    }
    if (f.password.length < 8) return toast.error("A senha deve ter ao menos 8 caracteres.");
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: f.email,
      password: f.password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth`,
        data: { full_name: f.full_name, cpf: f.cpf, phone: f.phone },
      },
    });
    if (error || !data.user) {
      setBusy(false);
      return toast.error(error?.message ?? "Erro ao cadastrar.");
    }
    // Marca o perfil pretendido nos checklist_types para orientar o aprovador.
    const checklistTypes =
      perfil === "solicitante" ? ["solicitante"]
        : perfil === "aprovador" ? ["aprovador"]
        : perfil === "auditor" ? ["auditor"]
        : types;
    const { error: appErr } = await supabase.from("buyer_applications").insert({
      user_id: data.user.id,
      full_name: f.full_name,
      cpf: f.cpf,
      phone: f.phone,
      email: f.email,
      checklist_types: checklistTypes,
      requested_departments: perfil === "aprovador" ? departments : [],
      requested_ceiling: null,
    } as any);
    setBusy(false);
    if (appErr) return toast.error("Cadastro criado, mas falhou ao enviar solicitação: " + appErr.message);
    toast.success("Solicitação enviada! Aguarde a aprovação do proprietário para acessar a plataforma.", { duration: 6000 });
    onDone();
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <Field label="Perfil pretendido" required>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {([
            { id: "solicitante", label: "Solicitante", desc: "Solicito compras para necessidades da minha área." },
            { id: "comprador", label: "Comprador", desc: "Atuo na operação de cotação e fechamento de compras." },
            { id: "aprovador", label: "Aprovador", desc: "Aprovo cotações dentro da minha alçada e departamentos." },
            { id: "auditor", label: "Auditor", desc: "Audita o processo, buscando conformidade." },
          ] as const).map((p) => (
            <label
              key={p.id}
              className={`flex flex-col gap-1 rounded-md border p-3 cursor-pointer transition ${perfil === p.id ? "border-primary bg-accent" : "hover:bg-muted/40"}`}
            >
              <div className="flex items-center gap-2">
                <input type="radio" name="perfil" checked={perfil === p.id} onChange={() => setPerfil(p.id)} className="accent-primary" />
                <span className="text-sm font-semibold">{p.label}</span>
              </div>
              <span className="text-xs text-muted-foreground">{p.desc}</span>
            </label>
          ))}
        </div>
      </Field>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Nome completo" required>
          <input className={inputCls} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} required />
        </Field>
        <Field label="CPF" required>
          <input className={inputCls} value={f.cpf} onChange={(e) => setF({ ...f, cpf: e.target.value })} required />
        </Field>
        <Field label="Telefone" required>
          <input className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: maskPhone(e.target.value) })} required />
        </Field>
        <Field label="E-mail corporativo" required>
          <input type="email" className={inputCls} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
        </Field>
      </div>
      <Field label="Senha (mín. 8 caracteres)" required>
        <input type="password" className={inputCls} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required minLength={8} />
      </Field>

      {perfil === "comprador" && (
        <Field label="Tipos de checklist que vai atender" required>
          <div className="grid sm:grid-cols-3 gap-2">
            {CHECKLISTS.map((c) => (
              <label key={c.id} className={`flex items-center gap-2 rounded-md border p-3 cursor-pointer transition ${types.includes(c.id) ? "border-primary bg-accent" : "hover:bg-muted/40"}`}>
                <input type="checkbox" checked={types.includes(c.id)} onChange={() => toggle(c.id)} className="accent-primary" />
                <span className="text-sm">{c.label}</span>
              </label>
            ))}
          </div>
        </Field>
      )}

      {perfil === "aprovador" && (
        <div className="rounded-lg border-2 border-cyan-200 bg-cyan-50/50 p-3 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-cyan-800">
            Departamentos de alçada pretendidos
          </div>
          <p className="text-[11px] text-muted-foreground">
            Selecione os departamentos em que deseja aprovar cotações. O <strong>teto de alçada</strong> (valor máximo) será definido pelo Proprietário/Administrador no Painel Admin ao aprovar seu cadastro.
          </p>
          <div>
            <span className="text-xs font-medium text-muted-foreground">
              Departamentos vinculados ({departments.length} selecionado{departments.length === 1 ? "" : "s"})
            </span>
            <input
              type="text"
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              placeholder="Filtrar departamentos…"
              className={inputCls + " mt-1"}
            />
            <div className="mt-2 max-h-48 overflow-y-auto rounded-md border bg-background p-2 space-y-1">
              {filteredDepts.slice(0, 200).map((d) => (
                <label key={d} className="flex items-center gap-2 text-xs hover:bg-muted/60 rounded px-1 py-0.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={departments.includes(d)}
                    onChange={() => toggleDept(d)}
                  />
                  <span className="truncate">{d}</span>
                </label>
              ))}
              {filteredDepts.length > 200 && (
                <p className="text-[10px] text-muted-foreground p-1">Refine a busca para ver mais resultados.</p>
              )}
            </div>
          </div>
        </div>
      )}


      <button
        type="submit"
        disabled={busy}
        className="w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        {busy ? "Enviando..." : "Enviar solicitação de cadastro"}
      </button>
    </form>
  );

}

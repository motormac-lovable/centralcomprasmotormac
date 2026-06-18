import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Field, inputCls } from "@/components/forms/FormShell";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { maskPhone } from "@/lib/masks";

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
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  useEffect(() => {
    if (!loading && user) navigate({ to: "/inicio" });
  }, [user, loading, navigate]);

  return (
    <div className="mx-auto max-w-xl px-4 sm:px-6 py-10">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" /> Voltar ao Hub
      </Link>
      <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
        <div className="h-2 bg-gradient-to-r from-[var(--primary)] to-[var(--primary-glow)]" />
        <div className="p-6 sm:p-8 border-b flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-accent text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {mode === "signin" ? "Entrar na plataforma" : "Cadastro de Comprador"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {mode === "signin"
                ? "Acesse o Kanban operacional e o Dashboard de indicadores."
                : "Preencha seus dados — sua solicitação será analisada pelos aprovadores."}
            </p>
          </div>
        </div>
        <div className="p-6 sm:p-8">
          {mode === "signin" ? <SignInForm /> : <SignUpForm onDone={() => setMode("signin")} />}
          <div className="mt-6 pt-4 border-t text-sm text-muted-foreground text-center">
            {mode === "signin" ? "Novo comprador?" : "Já tem cadastro?"}{" "}
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
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Bem-vindo de volta!");
    navigate({ to: "/inicio" });
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <Field label="E-mail" required>
        <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field label="Senha" required>
        <input type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      <button
        type="submit"
        disabled={busy}
        className="w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        {busy ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}

function SignUpForm({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ full_name: "", cpf: "", phone: "", email: "", password: "" });
  const [types, setTypes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) =>
    setTypes((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (types.length === 0) return toast.error("Selecione ao menos um tipo de checklist.");
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
    const { error: appErr } = await supabase.from("buyer_applications").insert({
      user_id: data.user.id,
      full_name: f.full_name,
      cpf: f.cpf,
      phone: f.phone,
      email: f.email,
      checklist_types: types,
    });
    setBusy(false);
    if (appErr) return toast.error("Cadastro criado, mas falhou ao enviar solicitação: " + appErr.message);
    toast.success("Cadastro realizado! Você já pode entrar.", { duration: 5000 });
    onDone();
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
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

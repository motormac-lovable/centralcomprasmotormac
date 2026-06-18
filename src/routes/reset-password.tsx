import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Field, inputCls } from "@/components/forms/FormShell";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [{ title: "Redefinir senha — Motormac" }],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // O link de recuperação do Supabase coloca os tokens no hash da URL
    // e dispara um evento PASSWORD_RECOVERY assim que o cliente os processa.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    // fallback: se não houver hash, deixamos o usuário tentar mesmo assim
    if (!window.location.hash.includes("type=recovery")) {
      supabase.auth.getSession().then(({ data }) => setReady(!!data.session));
    }
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return toast.error("Mínimo de 6 caracteres.");
    if (password !== confirm) return toast.error("As senhas não coincidem.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Senha redefinida com sucesso!");
    navigate({ to: "/auth" });
  };

  return (
    <div className="mx-auto max-w-md px-4 sm:px-6 py-10">
      <Link to="/auth" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" /> Voltar ao login
      </Link>
      <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
        <div className="h-2 bg-gradient-to-r from-[var(--primary)] to-[var(--primary-glow)]" />
        <div className="p-6 sm:p-8 border-b flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-accent text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Redefinir senha</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Defina uma nova senha de acesso (mínimo de 6 caracteres).
            </p>
          </div>
        </div>
        <form onSubmit={submit} className="p-6 sm:p-8 grid gap-4">
          {!ready && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
              Abra esta página pelo link recebido no e-mail para validar a sessão de recuperação.
            </p>
          )}
          <Field label="Nova senha" required>
            <div className="relative">
              <input
                type={show ? "text" : "password"}
                className={`${inputCls} pr-10`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={show ? "Ocultar" : "Mostrar"}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>
          <Field label="Confirmar nova senha" required>
            <input
              type={show ? "text" : "password"}
              className={inputCls}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={6}
            />
          </Field>
          <button
            type="submit"
            disabled={busy}
            className="w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {busy ? "Salvando..." : "Salvar nova senha"}
          </button>
        </form>
      </div>
    </div>
  );
}

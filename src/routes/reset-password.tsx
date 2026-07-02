import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Field, inputCls } from "@/components/forms/FormShell";
import { isStrongPassword, passwordChecks, PASSWORD_RULE_MESSAGE } from "@/lib/password";
import { updateOwnPassword } from "@/lib/password.functions";
import { PasswordChecklist } from "@/components/ProfileMenu";
import { translateError } from "@/lib/error-messages";

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
  const updatePwd = useServerFn(updateOwnPassword);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    if (!window.location.hash.includes("type=recovery")) {
      supabase.auth.getSession().then(({ data }) => setReady(!!data.session));
    }
    return () => sub.subscription.unsubscribe();
  }, []);

  const checks = passwordChecks(password);
  const strong = isStrongPassword(password);
  const matches = password.length > 0 && password === confirm;
  const canSubmit = ready && strong && matches && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!strong) return toast.error(PASSWORD_RULE_MESSAGE);
    if (password !== confirm) return toast.error("As senhas não coincidem.");
    setBusy(true);
    try {
      await updatePwd({ data: { password } });
      toast.success("Senha redefinida com sucesso!");
      navigate({ to: "/auth" });
    } catch (err: any) {
      toast.error(translateError(err, "Não foi possível redefinir a senha."));
    } finally {
      setBusy(false);
    }
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
              {PASSWORD_RULE_MESSAGE}
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
                minLength={8}
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
            <PasswordChecklist checks={checks} />
            {password.length > 0 && !strong && (
              <p className="text-xs text-destructive mt-1">{PASSWORD_RULE_MESSAGE}</p>
            )}
          </Field>
          <Field label="Confirmar nova senha" required>
            <input
              type={show ? "text" : "password"}
              className={inputCls}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
            />
            {confirm.length > 0 && (
              <p className={`text-xs mt-1 ${matches ? "text-emerald-600" : "text-destructive"}`}>
                {matches ? "As senhas coincidem." : "As senhas não coincidem."}
              </p>
            )}
          </Field>
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {busy ? "Salvando..." : "Salvar nova senha"}
          </button>
        </form>
      </div>
    </div>
  );
}

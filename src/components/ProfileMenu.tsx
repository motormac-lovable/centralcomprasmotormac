import { useState } from "react";
import { Settings, Eye, EyeOff, Loader2, Check, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { isStrongPassword, passwordChecks, PASSWORD_RULE_MESSAGE } from "@/lib/password";
import { updateOwnPassword } from "@/lib/password.functions";
import { translateError } from "@/lib/error-messages";

export function ProfileMenu() {
  const { user, fullName } = useAuth();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const updatePwd = useServerFn(updateOwnPassword);

  if (!user) return null;

  const checks = passwordChecks(next);
  const strong = isStrongPassword(next);
  const matches = next.length > 0 && next === confirm;
  const canSubmit = current.length > 0 && strong && matches && !saving;

  const reset = () => {
    setCurrent(""); setNext(""); setConfirm("");
    setShowCurrent(false); setShowNext(false); setShowConfirm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    if (!strong) { toast.error(PASSWORD_RULE_MESSAGE); return; }
    setSaving(true);
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user.email!,
        password: current,
      });
      if (signInErr) {
        toast.error("Senha atual incorreta");
        setSaving(false);
        return;
      }
      try {
        await updatePwd({ data: { password: next } });
      } catch (err: any) {
        toast.error(err?.message || "Não foi possível alterar a senha");
        setSaving(false);
        return;
      }
      toast.success("Sua senha foi alterada com sucesso!");
      reset();
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="ml-1 inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted"
        title="Meu Perfil"
      >
        <Settings className="h-4 w-4" />
        <span className="hidden sm:inline">Meu Perfil</span>
      </button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Segurança da Conta</DialogTitle>
            <DialogDescription>
              {fullName || user.email} — altere sua senha de acesso.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <PasswordField
              label="Senha Atual"
              value={current}
              onChange={setCurrent}
              show={showCurrent}
              onToggle={() => setShowCurrent((v) => !v)}
            />
            <div className="space-y-1.5">
              <PasswordField
                label="Nova Senha"
                value={next}
                onChange={setNext}
                show={showNext}
                onToggle={() => setShowNext((v) => !v)}
              />
              <PasswordChecklist checks={checks} />
              {next.length > 0 && !strong && (
                <p className="text-xs text-destructive">{PASSWORD_RULE_MESSAGE}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <PasswordField
                label="Confirmar Nova Senha"
                value={confirm}
                onChange={setConfirm}
                show={showConfirm}
                onToggle={() => setShowConfirm((v) => !v)}
              />
              {confirm.length > 0 && (
                <p className={`text-xs ${matches ? "text-emerald-600" : "text-destructive"}`}>
                  {matches ? "As senhas coincidem." : "As senhas não coincidem."}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar Nova Senha
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PasswordChecklist({ checks }: { checks: ReturnType<typeof passwordChecks> }) {
  const items = [
    { ok: checks.length, label: "Mínimo de 8 caracteres" },
    { ok: checks.letter, label: "Pelo menos uma letra" },
    { ok: checks.number, label: "Pelo menos um número" },
    { ok: checks.symbol, label: "Pelo menos um símbolo (ex: @, #, $, %)" },
  ];
  return (
    <ul className="text-xs space-y-1 mt-1">
      {items.map((it) => (
        <li key={it.label} className={`flex items-center gap-1.5 ${it.ok ? "text-emerald-600" : "text-muted-foreground"}`}>
          {it.ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
          {it.label}
        </li>
      ))}
    </ul>
  );
}

function PasswordField({
  label, value, onChange, show, onToggle,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="relative">
        <Input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          autoComplete="new-password"
          className="pr-10"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          tabIndex={-1}
          aria-label={show ? "Ocultar senha" : "Mostrar senha"}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

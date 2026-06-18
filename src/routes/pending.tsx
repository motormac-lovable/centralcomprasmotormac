import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Clock, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/pending")({
  head: () => ({ meta: [{ title: "Aguardando aprovação — Motormac" }] }),
  component: PendingPage,
});

function PendingPage() {
  const navigate = useNavigate();
  const { user, loading, isBuyer, isAdmin } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/auth" });
    else if (isAdmin) navigate({ to: "/admin" });
    else if (isBuyer) navigate({ to: "/inicio" });
  }, [user, loading, isBuyer, isAdmin, navigate]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div className="mx-auto max-w-xl px-4 sm:px-6 py-16">
      <div className="rounded-2xl border bg-card shadow-sm overflow-hidden text-center">
        <div className="h-2 bg-gradient-to-r from-amber-400 to-amber-600" />
        <div className="p-8">
          <div className="w-14 h-14 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
            <Clock className="h-7 w-7" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">Solicitação em análise</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Seu cadastro foi recebido e está aguardando a aprovação do proprietário.
            Assim que for liberado, você poderá acessar a plataforma com seu e-mail e senha.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Você receberá uma confirmação no e-mail informado no cadastro.
          </p>
          <button
            onClick={signOut}
            className="mt-6 inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      </div>
    </div>
  );
}

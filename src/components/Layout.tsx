import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { History, LayoutGrid, BarChart3, Trello, ShieldCheck, LogIn, LogOut, UserPlus, Code2, ClipboardList, CheckSquare } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import logoAsset from "../assets/logo-motormac.png.asset.json";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ProfileMenu } from "./ProfileMenu";

// Rotas que NÃO exigem autenticação. Qualquer outra rota redireciona para /auth.
const PUBLIC_PATHS = new Set<string>(["/auth", "/pending", "/reset-password"]);

export function Layout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, loading, isOwner, isAdmin, isBuyer, isSolicitante, isApprover, fullName } = useAuth();
  const navigate = useNavigate();

  // Bloqueio de tela dinâmico: nenhuma tela acessível sem login (exceto login/cadastro/reset).
  useEffect(() => {
    if (loading) return;
    if (user) return;
    if (PUBLIC_PATHS.has(pathname)) return;
    navigate({ to: "/auth" });
  }, [user, loading, pathname, navigate]);

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    navigate({ to: "/auth" });
  };

  // Render mínimo para evitar flash de conteúdo enquanto redireciona.
  if (!loading && !user && !PUBLIC_PATHS.has(pathname)) {
    return <div className="min-h-screen bg-background" />;
  }

  // Aprovador também pode emitir solicitações (acessa formulários e seu histórico pessoal).
  const showBuyerLinks = isBuyer;
  const canRequest = isSolicitante || isApprover || isBuyer;
  const showMinhasSolicitacoes = (isSolicitante || isApprover) && !isBuyer && !isAdmin;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-card/85 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3">
            <img src={logoAsset.url} alt="Motormac" className="h-10 w-auto object-contain" />
            <div className="hidden md:flex flex-col leading-tight">
              <span className="text-sm font-semibold tracking-tight">Central de Compras</span>
              <span className="text-xs text-muted-foreground">Plataforma Interna Motormac</span>
            </div>
          </Link>
          <nav className="flex items-center gap-1 flex-wrap">
            {/* Nova Solicitação — Solicitante, Aprovador, Comprador e Admin */}
            {canRequest && (
              <NavLink to="/" active={pathname === "/"} icon={<LayoutGrid className="h-4 w-4" />}>Nova Solicitação</NavLink>
            )}

            {/* Visão completa do Comprador */}
            {showBuyerLinks && (
              <>
                <NavLink to="/inicio" active={pathname.startsWith("/inicio")} icon={<LayoutGrid className="h-4 w-4" />}>Início</NavLink>
                <NavLink to="/dashboard" active={pathname.startsWith("/dashboard")} icon={<BarChart3 className="h-4 w-4" />}>Dashboard</NavLink>
                <NavLink to="/kanban" active={pathname.startsWith("/kanban")} icon={<Trello className="h-4 w-4" />}>Kanban</NavLink>
                <NavLink to="/historico" active={pathname.startsWith("/historico")} icon={<History className="h-4 w-4" />}>Histórico</NavLink>
              </>
            )}
            {isAdmin && (
              <NavLink to="/admin" active={pathname.startsWith("/admin")} icon={<ShieldCheck className="h-4 w-4" />}>Admin</NavLink>
            )}
            {isOwner && (
              <NavLink to="/dev" active={pathname.startsWith("/dev")} icon={<Code2 className="h-4 w-4" />}>Dev</NavLink>
            )}

            {/* Histórico pessoal — Solicitante e Aprovador (compradores usam o histórico completo) */}
            {showMinhasSolicitacoes && (
              <NavLink
                to="/minhas-solicitacoes"
                active={pathname.startsWith("/minhas-solicitacoes")}
                icon={<ClipboardList className="h-4 w-4" />}
              >
                Minhas Solicitações
              </NavLink>
            )}

            {/* Painel exclusivo do Aprovador (e Proprietário para alçada >R$ 200k) */}
            {(isApprover || isOwner) && (
              <NavLink
                to="/aprovacoes"
                active={pathname.startsWith("/aprovacoes")}
                icon={<CheckSquare className="h-4 w-4" />}
              >
                Aprovações
              </NavLink>
            )}




            {user && <ProfileMenu />}
            {user ? (
              <button
                onClick={signOut}
                className="ml-1 inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted"
                title={fullName || user.email || ""}
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sair</span>
              </button>
            ) : (
              <Link
                to="/auth"
                className="ml-1 inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <LogIn className="h-4 w-4" />
                <span className="hidden sm:inline">Entrar</span>
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t bg-card/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 text-xs text-muted-foreground flex flex-wrap gap-2 justify-between">
          <span>© {new Date().getFullYear()} Motormac. Todos os direitos reservados.</span>
          <span className="flex items-center gap-3">
            {!user && (
              <Link to="/auth" className="inline-flex items-center gap-1 hover:text-foreground">
                <UserPlus className="h-3 w-3" /> Cadastro
              </Link>
            )}
            <span>v1.0</span>
          </span>
        </div>
      </footer>
    </div>
  );
}

function NavLink({ to, active, icon, children }: { to: string; active: boolean; icon: ReactNode; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
        active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted"
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{children}</span>
    </Link>
  );
}

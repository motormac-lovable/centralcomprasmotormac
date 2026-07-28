import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { History, LayoutGrid, BarChart3, Trello, ShieldCheck, LogIn, LogOut, UserPlus, Code2, ClipboardList, CheckSquare } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import logoAsset from "../assets/logo-motormac.png.asset.json";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ProfileMenu } from "./ProfileMenu";

import { useNavBadges } from "@/hooks/useNavBadges";
import { markVisit, type VisitKey } from "@/lib/last-visits";

// Rotas que NÃO exigem autenticação. Qualquer outra rota redireciona para /auth.
const PUBLIC_PATHS = new Set<string>(["/auth", "/pending", "/reset-password"]);

export function Layout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, loading, isOwner, isAdmin, isBuyer, isSolicitante, isApprover, isAuditor, fullName } = useAuth();
  const navigate = useNavigate();
  const { minhasCount, aprovacoesCount, adminCount, historicoCount } = useNavBadges();

  // Marca visita para limpar o badge assim que a tela é aberta.
  useEffect(() => {
    if (!user?.id) return;
    const map: Array<[string, VisitKey]> = [
      ["/minhas-solicitacoes", "minhas"],
      ["/historico", "historico"],
      ["/aprovacoes", "aprovacoes"],
      ["/admin", "admin"],
    ];
    for (const [prefix, key] of map) {
      if (pathname.startsWith(prefix)) {
        markVisit(user.id, key);
        break;
      }
    }
  }, [pathname, user?.id]);

  // Bloqueio de tela dinâmico: nenhuma tela acessível sem login (exceto login/cadastro/reset).
  useEffect(() => {
    if (loading) return;
    if (user) return;
    if (PUBLIC_PATHS.has(pathname)) return;
    navigate({ to: "/auth" });
  }, [user, loading, pathname, navigate]);

  // Governança: o Aprovador "puro" só acessa Nova Solicitação (formulários),
  // Minhas Solicitações, Aprovações e o próprio perfil. Qualquer outra rota
  // (Kanban, Dashboard, Histórico completo, Início, Admin, Dev) é bloqueada
  // também por digitação direta da URL.
  const approverOnly = isApprover && !isBuyer && !isAdmin && !isOwner && !isAuditor;
  useEffect(() => {
    if (loading || !user || !approverOnly) return;
    if (PUBLIC_PATHS.has(pathname)) return;
    const allowed = APPROVER_PATHS.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
    if (!allowed) navigate({ to: "/aprovacoes", replace: true });
  }, [approverOnly, loading, user, pathname, navigate]);

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
  // Auditor: PODE emitir solicitações e acessar Admin (parcial — Gestão de Solicitantes com exclusão),
  // mas é somente leitura no Kanban e no Painel de Aprovações.
  const showBuyerLinks = isBuyer || isAuditor;
  const canRequest = isSolicitante || isApprover || isBuyer || isAuditor;
  const showMinhasSolicitacoes = (isSolicitante || isApprover) && !isBuyer && !isAdmin && !isAuditor;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-card/85 backdrop-blur-md">
        <div className="mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-6">
          <Link to="/" className="flex items-center gap-3 shrink-0">
            <img src={logoAsset.url} alt="Motormac" className="h-12 w-auto object-contain" />
            <div className="hidden lg:flex flex-col leading-tight">
              <span className="text-sm font-semibold tracking-tight">Central de Compras</span>
              <span className="text-xs text-muted-foreground">
                {isAuditor ? "Modo Auditor — Somente leitura" : "Plataforma Interna Motormac"}
              </span>
            </div>
          </Link>
          <nav className="flex items-center gap-1 flex-nowrap overflow-x-auto">
            {/* Nova Solicitação — Solicitante, Aprovador, Comprador, Auditor e Admin */}
            {canRequest && (
              <NavLink to="/" active={pathname === "/"} icon={<LayoutGrid className="h-4 w-4" />}>Nova Solicitação</NavLink>
            )}

            {/* Visão completa do Comprador / Auditor (Auditor em somente leitura) */}
            {showBuyerLinks && (
              <>
                {!isAuditor && (
                  <NavLink to="/inicio" active={pathname.startsWith("/inicio")} icon={<LayoutGrid className="h-4 w-4" />}>Início</NavLink>
                )}
                <NavLink to="/dashboard" active={pathname.startsWith("/dashboard")} icon={<BarChart3 className="h-4 w-4" />}>Dashboard</NavLink>
                <NavLink to="/kanban" active={pathname.startsWith("/kanban")} icon={<Trello className="h-4 w-4" />}>Kanban</NavLink>
                <NavLink to="/historico" active={pathname.startsWith("/historico")} icon={<History className="h-4 w-4" />} badge={historicoCount}>Histórico</NavLink>
              </>
            )}
            {/* Admin: Proprietário/Administrador com poder total; Comprador com Gestão de Solicitantes;
                Auditor com Gestão de Solicitantes (apenas exclusão). */}
            {(isAdmin || isBuyer || isAuditor) && (
              <NavLink to="/admin" active={pathname.startsWith("/admin")} icon={<ShieldCheck className="h-4 w-4" />} badge={isAdmin ? adminCount : 0}>Admin</NavLink>
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
                badge={minhasCount}
              >
                Minhas Solicitações
              </NavLink>
            )}

            {/* Painel de Aprovações — Aprovador, Proprietário e Auditor (este último em modo leitura) */}
            {(isApprover || isOwner || isAuditor) && (
              <NavLink
                to="/aprovacoes"
                active={pathname.startsWith("/aprovacoes")}
                icon={<CheckSquare className="h-4 w-4" />}
                badge={aprovacoesCount}
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

function NavLink({ to, active, icon, children, badge }: { to: string; active: boolean; icon: ReactNode; children: ReactNode; badge?: number }) {
  return (
    <Link
      to={to}
      className={`relative inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
        active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted"
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{children}</span>
      {badge && badge > 0 ? (
        <span className="absolute -top-1 -right-2 bg-red-600 text-white text-[10px] font-bold h-5 w-5 rounded-full flex items-center justify-center animate-pulse shadow">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}

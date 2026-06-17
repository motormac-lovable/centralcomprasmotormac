import { Link, useRouterState } from "@tanstack/react-router";
import { History, LayoutGrid } from "lucide-react";
import type { ReactNode } from "react";

export function Layout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-card/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3 group">
            <img
              src="/logo-motormac.png"
              alt="Motormac"
              className="h-10 w-auto object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
            <div className="hidden sm:flex flex-col leading-tight">
              <span className="text-sm font-semibold tracking-tight">Central de Solicitações</span>
              <span className="text-xs text-muted-foreground">Plataforma Interna Motormac</span>
            </div>
          </Link>
          <nav className="flex items-center gap-1">
            <NavLink to="/" active={pathname === "/"} icon={<LayoutGrid className="h-4 w-4" />}>
              Hub
            </NavLink>
            <NavLink to="/historico" active={pathname.startsWith("/historico")} icon={<History className="h-4 w-4" />}>
              Histórico
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t bg-card/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 text-xs text-muted-foreground flex justify-between">
          <span>© {new Date().getFullYear()} Motormac. Todos os direitos reservados.</span>
          <span>v1.0</span>
        </div>
      </footer>
    </div>
  );
}

function NavLink({
  to,
  active,
  icon,
  children,
}: {
  to: string;
  active: boolean;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{children}</span>
    </Link>
  );
}

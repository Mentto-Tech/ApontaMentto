import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Clock, FolderOpen, MapPin, User, BarChart3, LogOut, Calendar, FileText, Users, Settings, Upload, History } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

const AppLayout = () => {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const mainNavItems = [
    { to: "/", icon: Clock, label: "Registros" },
    { to: "/monthly", icon: Calendar, label: "Mensal" },
    { to: "/dashboard", icon: BarChart3, label: "Dashboard" },
    { to: "/timesheet", icon: FileText, label: "Folha" },
    { to: "/justifications", icon: Upload, label: "Justificativas" },
    { to: "/projects", icon: FolderOpen, label: "Projetos" },
    { to: "/locations", icon: MapPin, label: "Locais" },
    { to: "/profile", icon: User, label: "Perfil" },
  ];

  const adminNavItems = isAdmin
    ? [
        { to: "/admin/users", icon: Users, label: "Usuários" },
        { to: "/admin/logs", icon: History, label: "Logs" },
        { to: "/admin/settings", icon: Settings, label: "Backup" },
      ]
    : [];

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden md:flex w-56 flex-col bg-sidebar border-r border-sidebar-border fixed left-0 top-0 bottom-0 h-full min-h-0">
        <div className="p-5 flex items-center gap-2">
          <Clock className="h-6 w-6 text-sidebar-primary" strokeWidth={2.5} />
          <span className="text-lg font-bold text-sidebar-foreground tracking-tight">
            Aponta<span className="text-sidebar-primary">Mentto</span>
          </span>
        </div>
        <nav className="flex-1 px-3 py-2 flex flex-col min-h-0">
          <div className="sidebar-scroll space-y-1 overflow-y-auto pr-1 min-h-0 flex-1">
            {mainNavItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-sidebar-accent text-sidebar-primary"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}

            {adminNavItems.length > 0 && (
              <>
                <div className="pt-3 mt-2 border-t border-sidebar-border">
                  <div className="px-3 pb-2 text-[10px] font-semibold text-sidebar-foreground/50 uppercase tracking-wide">
                    Admin
                  </div>
                  <div className="space-y-1">
                    {adminNavItems.map(({ to, icon: Icon, label }) => (
                      <NavLink
                        key={to}
                        to={to}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                            isActive
                              ? "bg-sidebar-accent text-sidebar-primary"
                              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                          }`
                        }
                      >
                        <Icon className="h-4 w-4" />
                        {label}
                      </NavLink>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="mt-auto px-3 py-4 border-t border-sidebar-border">
          <div className="flex items-center gap-2 px-3 mb-2">
            <div className="w-7 h-7 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-bold text-sidebar-primary">
              {user?.username?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-sidebar-foreground truncate">{user?.username}</div>
              <div className="text-[10px] text-sidebar-foreground/50 capitalize">{user?.isAdmin ? 'Admin' : 'User'}</div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 text-xs"
          >
            <LogOut className="h-3.5 w-3.5 mr-2" />
            Sair
          </Button>
        </div>
        </nav>
      </aside>

      {/* Mobile bottom nav - show only key items */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border flex gap-2 px-2 py-2 overflow-x-auto flex-nowrap">
        {[...mainNavItems, ...adminNavItems].map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `shrink-0 flex flex-col items-center gap-0.5 text-xs font-medium px-2 py-1 rounded-lg transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`
            }
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </nav>

      <main className="flex-1 pb-20 md:pb-0 md:ml-56">
        <Outlet />
      </main>
    </div>
  );
};

export default AppLayout;

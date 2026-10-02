import React, { useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import {
  ADMIN_LOGIN_EXPIRED_PATH,
  ADMIN_SESSION_EXPIRED_EVENT,
  isAdminSessionValid,
} from "../../utils/adminSession";

// Intervalo para conferir se o token de admin ainda vale com a aba aberta.
const ADMIN_SESSION_CHECK_MS = 60_000;

type IconProps = { className?: string };

const HomeIcon: React.FC<IconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 11.5 12 4l9 7.5M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
  </svg>
);

const TagIcon: React.FC<IconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m20.59 13.41-7.17 7.17a2 2 0 0 1-2.83 0L3 13V4a1 1 0 0 1 1-1h9l7.59 7.59a2 2 0 0 1 0 2.82Z" />
    <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

const CartIcon: React.FC<IconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.76L20.5 8H6.2" />
    <circle cx="9.5" cy="19.5" r="1.3" />
    <circle cx="17" cy="19.5" r="1.3" />
  </svg>
);

const ChartIcon: React.FC<IconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 20V10m6 10V4m6 16v-7" />
  </svg>
);

const BriefcaseIcon: React.FC<IconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <rect x="3" y="7.5" width="18" height="12" rx="2" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7.5V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1.5M3 12.5h18" />
  </svg>
);

const ClockIcon: React.FC<IconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <circle cx="12" cy="12" r="9" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 7v5l3.5 2" />
  </svg>
);

const ImageIcon: React.FC<IconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <rect x="3" y="4.5" width="18" height="15" rx="2" />
    <circle cx="8.5" cy="9.5" r="1.5" />
    <path strokeLinecap="round" strokeLinejoin="round" d="m4 17 4.5-4.5 3 3L15 12l5 5" />
  </svg>
);

const LogoutIcon: React.FC<IconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0-4-4m4 4H7m6 4v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v1" />
  </svg>
);

interface AdminNavItem {
  to: string;
  label: string;
  icon: React.FC<IconProps>;
}

const NAV_ITEMS: AdminNavItem[] = [
  { to: "/admin", label: "Painel", icon: HomeIcon },
  { to: "/admin/categories", label: "Categorias", icon: TagIcon },
  { to: "/admin/banners", label: "Banners", icon: ImageIcon },
  { to: "/admin/carts", label: "Carrinhos", icon: CartIcon },
  { to: "/admin/reports", label: "Relatórios", icon: ChartIcon },
  { to: "/admin/management-report", label: "Gestão", icon: BriefcaseIcon },
  { to: "/historico", label: "Histórico de Pedidos", icon: ClockIcon },
];

const navLinkClasses = (isActive: boolean) =>
  `admin-nav-link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold transition-colors whitespace-nowrap ${
    isActive
      ? "bg-blue-600 text-white shadow"
      : "text-stone-600 hover:bg-blue-50 hover:text-blue-700"
  }`;

const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  // Com a aba admin aberta por muito tempo o token vence e as ações param de
  // funcionar sem aviso. Confere periodicamente (e ao voltar para a janela)
  // e, se vencido, pede a senha do admin de novo sem deslogar do sistema.
  useEffect(() => {
    const requireAdminLogin = () =>
      navigate(ADMIN_LOGIN_EXPIRED_PATH, { replace: true });
    const check = () => {
      if (!isAdminSessionValid()) requireAdminLogin();
    };

    const intervalId = window.setInterval(check, ADMIN_SESSION_CHECK_MS);
    window.addEventListener("focus", check);
    window.addEventListener(ADMIN_SESSION_EXPIRED_EVENT, requireAdminLogin);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", check);
      window.removeEventListener(ADMIN_SESSION_EXPIRED_EVENT, requireAdminLogin);
    };
  }, [navigate]);

  const handleLogout = async () => {
    if (!window.confirm("Deseja realmente sair?")) return;
    await logout();
    navigate("/admin/login");
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
      <nav className="lg:sticky lg:top-4 lg:w-56 lg:shrink-0">
        <div className="flex gap-1 overflow-x-auto rounded-xl bg-white p-2 shadow lg:flex-col lg:gap-1 lg:overflow-visible">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/admin"}
              className={({ isActive }) => navLinkClasses(isActive)}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </NavLink>
          ))}
          <div className="my-1 hidden border-t border-stone-200 lg:block" />
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-bold text-red-600 transition-colors hover:bg-red-50"
          >
            <LogoutIcon className="h-4 w-4 shrink-0" />
            Sair
          </button>
        </div>
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
};

export default AdminLayout;

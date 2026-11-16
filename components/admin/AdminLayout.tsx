import React, { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import {
  ADMIN_LOGIN_EXPIRED_PATH,
  ADMIN_SESSION_EXPIRED_EVENT,
  isAdminSessionValid,
} from "../../utils/adminSession";
import "./admin.css";
import {
  IconBox,
  IconChart,
  IconChevronRight,
  IconClock,
  IconDashboard,
  IconImage,
  IconLogout,
  IconMenu,
  IconReceipt,
  IconSearch,
  IconShield,
  IconSidebar,
  IconStore,
  IconTag,
  IconUsers,
  IconWallet,
} from "./icons";
import { Avatar, Modal, confirmAction } from "./ui";

// Intervalo para conferir se o token de admin ainda vale com a aba aberta.
const ADMIN_SESSION_CHECK_MS = 60_000;
const COLLAPSED_KEY = "pp-admin-sidebar-collapsed";

type IconComponent = React.FC<{ className?: string }>;

interface AdminNavItem {
  to: string;
  label: string;
  icon: IconComponent;
  /** Palavras extras para a busca rápida */
  keywords?: string;
}

interface AdminNavGroup {
  label: string;
  items: AdminNavItem[];
}

const NAV_GROUPS: AdminNavGroup[] = [
  {
    label: "Visão geral",
    items: [
      { to: "/admin", label: "Dashboard", icon: IconDashboard, keywords: "inicio painel resumo" },
    ],
  },
  {
    label: "Vendas",
    items: [
      { to: "/historico", label: "Pedidos", icon: IconReceipt, keywords: "historico entregas pagamentos" },
      { to: "/admin/clientes", label: "Clientes", icon: IconUsers, keywords: "usuarios compradores" },
    ],
  },
  {
    label: "Catálogo",
    items: [
      { to: "/admin/produtos", label: "Produtos e estoque", icon: IconBox, keywords: "pelucias estoque movimentacoes" },
      { to: "/admin/categories", label: "Categorias", icon: IconTag },
      { to: "/admin/banners", label: "Banners", icon: IconImage, keywords: "home vitrine" },
    ],
  },
  {
    label: "Análises",
    items: [
      { to: "/admin/management-report", label: "Gestão e financeiro", icon: IconWallet, keywords: "faturamento receber gira kids abc" },
      { to: "/admin/reports", label: "Relatórios", icon: IconChart, keywords: "vendas ia recomendacoes" },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((group) =>
  group.items.map((item) => ({ ...item, group: group.label })),
);

// Página ativa: a rota mais específica que casa com o caminho atual
const findActiveItem = (pathname: string) => {
  if (pathname.startsWith("/historico")) {
    return ALL_ITEMS.find((item) => item.to === "/historico");
  }
  return [...ALL_ITEMS]
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) =>
      item.to === "/admin" ? pathname === "/admin" : pathname.startsWith(item.to),
    );
};

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
};

// ---------- Busca rápida (Ctrl/⌘ + K) ----------

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  icon: IconComponent;
  run: () => void;
}

const CommandPalette: React.FC<{ open: boolean; onClose: () => void }> = ({
  open,
  onClose,
}) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  const items = useMemo<CommandItem[]>(() => {
    const term = normalize(query.trim());
    const go = (to: string) => () => {
      onClose();
      navigate(to);
    };
    const pages: CommandItem[] = ALL_ITEMS.filter(
      (item) =>
        !term ||
        normalize(`${item.label} ${item.group} ${item.keywords || ""}`).includes(term),
    ).map((item) => ({
      id: item.to,
      label: item.label,
      hint: item.group,
      icon: item.icon,
      run: go(item.to),
    }));

    if (!query.trim()) return pages;

    const q = encodeURIComponent(query.trim());
    return [
      ...pages,
      {
        id: "search-orders",
        label: `Buscar pedidos por “${query.trim()}”`,
        hint: "Pedidos",
        icon: IconReceipt,
        run: go(`/historico?q=${q}`),
      },
      {
        id: "search-customers",
        label: `Buscar clientes por “${query.trim()}”`,
        hint: "Clientes",
        icon: IconUsers,
        run: go(`/admin/clientes?q=${q}`),
      },
      {
        id: "search-products",
        label: `Buscar produtos por “${query.trim()}”`,
        hint: "Catálogo",
        icon: IconBox,
        run: go(`/admin/produtos?q=${q}`),
      },
    ];
  }, [query, navigate, onClose]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((prev) => Math.min(items.length - 1, prev + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((prev) => Math.max(0, prev - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[active]?.run();
    }
  };

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <Modal open={open} onClose={onClose} size="md">
      <div className="-mx-2 -mt-2" onKeyDown={onKeyDown}>
        <div className="pp-input-icon mb-3 px-2">
          <IconSearch />
          <input
            autoFocus
            className="pp-input"
            style={{ height: 44, fontSize: 15 }}
            placeholder="Ir para página, buscar pedido, cliente ou produto..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Busca rápida"
          />
        </div>
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto px-1">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-[color:var(--pp-text-3)]">
              Nada encontrado.
            </p>
          ) : (
            items.map((item, index) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-index={index}
                  data-active={index === active}
                  className="pp-cmd-item"
                  onMouseEnter={() => setActive(index)}
                  onClick={item.run}
                >
                  <Icon />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.hint && (
                    <span className="text-xs text-[color:var(--pp-text-3)]">
                      {item.hint}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
        <div className="mt-3 flex items-center gap-3 border-t border-[color:var(--pp-border)] px-3 pt-3 text-xs text-[color:var(--pp-text-3)]">
          <span><span className="pp-kbd">↑↓</span> navegar</span>
          <span><span className="pp-kbd">Enter</span> abrir</span>
          <span><span className="pp-kbd">Esc</span> fechar</span>
        </div>
      </div>
    </Modal>
  );
};

// ---------- Layout ----------

const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, currentUser } = useAuth();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

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

  // Fecha a gaveta do celular ao trocar de página
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      // armazenamento indisponível: só não lembra a preferência
    }
  }, [collapsed]);

  // Ctrl/⌘ + K abre a busca rápida
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleLogout = async () => {
    const confirmed = await confirmAction({
      title: "Sair do painel?",
      text: "Você precisará entrar novamente para acessar o admin.",
      confirmText: "Sair",
    });
    if (!confirmed) return;
    await logout();
    navigate("/admin/login");
  };

  const activeItem = findActiveItem(location.pathname);
  const isOrderDetail = location.pathname === "/historico/detalhes";
  const isMac =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <div className="pp-admin">
      <div className="pp-shell">
        {mobileOpen && (
          <div className="pp-backdrop lg:hidden" onClick={() => setMobileOpen(false)} />
        )}

        <aside
          className="pp-sidebar"
          data-collapsed={collapsed}
          data-open={mobileOpen}
          aria-label="Menu do painel"
        >
          <div className="pp-sidebar-brand">
            <img src="/logonova.png" alt="" className="pp-sidebar-logo" />
            <div className="pp-nav-label min-w-0">
              <div className="text-[15px] font-semibold leading-tight text-[color:var(--pp-text)]">
                Prime Plush
              </div>
              <div className="text-xs text-[color:var(--pp-text-3)]">Painel administrativo</div>
            </div>
          </div>

          <nav className="pp-sidebar-nav">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="pp-nav-group">
                <div className="pp-nav-group-label">{group.label}</div>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeItem?.to === item.to;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === "/admin"}
                      className="pp-nav-link"
                      data-active={isActive}
                      data-tip={item.label}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <Icon />
                      <span className="pp-nav-label">{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            ))}

            <div className="pp-nav-group">
              <div className="pp-nav-group-label">Atalhos</div>
              <NavLink to="/menu" className="pp-nav-link" data-tip="Ver loja">
                <IconStore />
                <span className="pp-nav-label">Ver loja</span>
              </NavLink>
              <NavLink to="/superadmin/login" className="pp-nav-link" data-tip="SuperAdmin">
                <IconShield />
                <span className="pp-nav-label">SuperAdmin</span>
              </NavLink>
            </div>
          </nav>

          <div className="pp-sidebar-footer">
            <button
              type="button"
              onClick={handleLogout}
              className="pp-nav-link w-full border-0 bg-transparent text-[color:var(--pp-danger)] hover:!bg-[color:var(--pp-danger-soft)] hover:!text-[color:var(--pp-danger)]"
              data-tip="Sair"
            >
              <IconLogout />
              <span className="pp-nav-label">Sair</span>
            </button>
            <button
              type="button"
              onClick={() => setCollapsed((prev) => !prev)}
              className="pp-nav-link hidden w-full border-0 bg-transparent lg:flex"
              data-tip={collapsed ? "Expandir menu" : "Recolher menu"}
              aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            >
              <IconSidebar />
              <span className="pp-nav-label">Recolher menu</span>
            </button>
          </div>
        </aside>

        <div className="pp-main">
          <header className="pp-topbar">
            <button
              type="button"
              className="pp-btn pp-btn-ghost pp-btn-icon lg:hidden"
              aria-label="Abrir menu"
              onClick={() => setMobileOpen(true)}
            >
              <IconMenu />
            </button>

            <nav className="pp-breadcrumbs" aria-label="Você está em">
              <span className="hidden sm:inline">Admin</span>
              {activeItem && (
                <>
                  <IconChevronRight className="hidden h-3.5 w-3.5 sm:inline" />
                  <span className="hidden sm:inline">{activeItem.group}</span>
                  <IconChevronRight className="hidden h-3.5 w-3.5 sm:inline" />
                  {isOrderDetail ? (
                    <>
                      <NavLink to="/historico" className="hover:text-[color:var(--pp-text)]">
                        Pedidos
                      </NavLink>
                      <IconChevronRight className="h-3.5 w-3.5" />
                      <strong>Detalhes</strong>
                    </>
                  ) : (
                    <strong>{activeItem.label}</strong>
                  )}
                </>
              )}
            </nav>

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                className="pp-search-trigger hidden md:flex"
                onClick={() => setPaletteOpen(true)}
              >
                <IconSearch />
                <span className="flex-1 text-left">Buscar...</span>
                <span className="pp-kbd">{isMac ? "⌘" : "Ctrl"} K</span>
              </button>
              <button
                type="button"
                className="pp-btn pp-btn-ghost pp-btn-icon md:hidden"
                aria-label="Buscar"
                onClick={() => setPaletteOpen(true)}
              >
                <IconSearch />
              </button>
              <button
                type="button"
                className="pp-btn pp-btn-ghost pp-btn-icon"
                aria-label="Pedidos recentes"
                title="Pedidos recentes"
                onClick={() => navigate("/historico")}
              >
                <IconClock />
              </button>
              <div className="ml-1 flex items-center gap-2.5 border-l border-[color:var(--pp-border)] pl-3">
                <Avatar name={currentUser?.name || "Administrador"} size={32} />
                <div className="hidden leading-tight sm:block">
                  <div className="max-w-[160px] truncate text-sm font-semibold text-[color:var(--pp-text)]">
                    {currentUser?.name || "Administrador"}
                  </div>
                  <div className="text-xs text-[color:var(--pp-text-3)]">Administrador</div>
                </div>
              </div>
            </div>
          </header>

          <main className="pp-content">
            <div key={location.pathname} className="pp-page">
              {children}
            </div>
          </main>
        </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
};

export default AdminLayout;

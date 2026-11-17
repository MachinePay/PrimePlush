import RegisterPage from "./pages/RegisterPage";
import React, { useEffect } from "react";
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"; // <--- IMPORTANTE
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { CartProvider } from "./contexts/CartContext";
import { FavoritesProvider } from "./contexts/FavoritesContext";
import { StoreProvider, useStore } from "./contexts/StoreContext"; // 🏪 MULTI-TENANT
import {
  ADMIN_LOGIN_EXPIRED_PATH,
  isAdminSessionValid,
} from "./utils/adminSession";
import LoginPage from "./pages/LoginPage";
import StoreNotFound from "./pages/StoreNotFound";
import MenuPage from "./pages/MenuPage";
import PaymentPage from "./pages/PaymentPage";
import OrderHistoryPage from "./pages/OrderHistoryPage";
import SuperAdminPage from "./pages/SuperAdminPage";
import AdminPage from "./pages/AdminPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import AdminReportsPage from "./pages/AdminReportsPage";
import AdminManagementReportPage from "./pages/AdminManagementReportPage";
import AdminCategoriesPage from "./pages/AdminCategoriesPage"; // 🆕
import AdminBannersPage from "./pages/AdminBannersPage"; // 🆕
import Header from "./components/Header";
import Chatbot from "./components/Chatbot";
import InactivityGuard from "./components/InactivityGuard";
import type { UserRole } from "./types";

import OrderDetailPage from "./pages/OrderDetailPage";
import CustomerOrdersPage from "./pages/CustomerOrdersPage";
import FavoritesPage from "./pages/FavoritesPage";
import InfoPage from "./pages/InfoPage";
import AdminLayout from "./components/admin/AdminLayout";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import AdminCustomersPage from "./pages/AdminCustomersPage";
import AdminStaffPage from "./pages/AdminStaffPage";
import AdminNoAccessPage from "./pages/AdminNoAccessPage";
import {
  type AdminPermission,
  STAFF_ADMIN_PATH,
  firstAllowedAdminPath,
  hasAdminPermission,
  isMasterAdmin,
} from "./utils/adminPermissions";

// 1. Configuração do Cliente React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // Não recarregar ao trocar de aba
      retry: 1, // Tenta apenas 1 vez se der erro de rede
    },
  },
});

// Proteção de rota para clientes (customer)
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { currentUser } = useAuth();
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }
  if (currentUser.role === "kitchen") {
    return <Navigate to="/cozinha" replace />;
  }
  return <>{children}</>;
};

// Proteção de rota por role específico
const RoleProtectedRoute: React.FC<{
  children: React.ReactNode;
  allowedRoles: UserRole[];
  redirectTo?: string;
  /** Aba do painel exigida (funcionário precisa ter liberada); "master" = só o admin master */
  permission?: AdminPermission | "master";
}> = ({ children, allowedRoles, redirectTo = "/login", permission }) => {
  const { currentUser } = useAuth();

  if (!currentUser) {
    return <Navigate to={redirectTo} replace />;
  }

  const userRole = currentUser.role || "customer";
  if (!allowedRoles.includes(userRole)) {
    return <Navigate to={redirectTo} replace />;
  }

  // Admin continua logado no sistema, mas o token de admin vence (8h). Sem
  // token válido as telas abrem vazias/sem permissão, então pede a senha de
  // novo na aba admin.
  if (userRole === "admin" && !isAdminSessionValid()) {
    return <Navigate to={ADMIN_LOGIN_EXPIRED_PATH} replace />;
  }

  // Funcionário sem a aba liberada vai para a primeira aba que pode ver.
  if (userRole === "admin" && permission) {
    const allowed =
      permission === "master"
        ? isMasterAdmin(currentUser)
        : hasAdminPermission(currentUser, permission);
    if (!allowed) {
      const fallback = firstAllowedAdminPath(currentUser) || "/admin/sem-acesso";
      return <Navigate to={fallback} replace />;
    }
  }

  return <>{children}</>;
};

// Telas do painel admin: usam o layout próprio (sidebar + topbar), sem o
// cabeçalho e o rodapé da loja. /admin/login continua com o visual da loja.
const isAdminShellPath = (pathname: string, role?: string) =>
  (pathname.startsWith("/admin") && pathname !== "/admin/login") ||
  (pathname.startsWith("/historico") && role === "admin");

// Pedidos são usados pelo admin e pela cozinha; só o admin ganha o layout
// do painel (que exige o token de admin).
const OrdersShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  if (currentUser?.role === "admin") {
    return <AdminLayout>{children}</AdminLayout>;
  }
  return <>{children}</>;
};

const SiteFooter: React.FC = () => {
  const { pathname } = useLocation();
  const { currentUser } = useAuth();
  if (isAdminShellPath(pathname, currentUser?.role)) return null;
  return <Footer />;
};

// Leva a visão para o topo sempre que o usuário navega para uma página
// diferente (filtros por query string, como busca/categoria no catálogo,
// não disparam o reset). Sem isso, o SPA mantém o scroll de onde o link
// foi clicado, dando a impressão de que a navegação não aconteceu.
const ScrollToTop: React.FC = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
};

const App: React.FC = () => {
  // Configurar Point Smart 2 na inicialização do sistema

  // Integração com maquininha removida

  return (
    // 2. Envolvendo a aplicação com os Providers (incluindo StoreProvider para Multi-tenant)
    <QueryClientProvider client={queryClient}>
      <StoreProvider>
        <AuthProvider>
          <CartProvider>
            <FavoritesProvider>
              <HashRouter>
                <ScrollToTop />
                <RouterBody />
                <SiteFooter />
              </HashRouter>
            </FavoritesProvider>
          </CartProvider>
        </AuthProvider>
      </StoreProvider>
    </QueryClientProvider>
  );
};

const RouterBody: React.FC = () => {
  const location = useLocation();
  const { store, loading, error } = useStore(); // 🏪 MULTI-TENANT
  const { currentUser } = useAuth();
  const isAdminShell = isAdminShellPath(location.pathname, currentUser?.role);
  const isLoginRoute =
    location.pathname === "/" ||
    location.pathname === "/login" ||
    location.pathname === "/register";
  const isFullBleedRoute = isLoginRoute || location.pathname === "/menu";
  // Tema antigo (overrides globais) só no SuperAdmin; o painel admin e o
  // login do admin usam o design system próprio (.pp-admin).
  const isAdminThemeRoute = location.pathname.startsWith("/superadmin");
  const isAdminLoginRoute = location.pathname === "/admin/login";
  const isCheckoutThemeRoute = location.pathname === "/payment";
  const mainClassName = isAdminShell || isAdminLoginRoute
    ? ""
    : isLoginRoute
    ? "bg-white"
    : location.pathname === "/menu"
      ? "bg-white"
      : isAdminThemeRoute
      ? "admin-modern-theme p-4 md:p-8"
      : isCheckoutThemeRoute
        ? "checkout-modern-theme p-4 md:p-8"
        : "p-4 md:p-8";

  // Loading state enquanto carrega a loja
  if (loading) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-amber-200 border-t-amber-600 mx-auto mb-4"></div>
          <p className="text-stone-600 font-medium">Carregando loja...</p>
        </div>
      </div>
    );
  }

  // Erro ao carregar loja (404, etc)
  if (error || !store) {
    return <StoreNotFound />;
  }

  return (
    <div className="min-h-screen bg-stone-100 text-stone-800">
      <InactivityGuard />
      {!isAdminShell && <Header />}
      <main
        className={mainClassName}
        style={
          isAdminShell ||
          isAdminLoginRoute ||
          isFullBleedRoute ||
          isAdminThemeRoute ||
          isCheckoutThemeRoute
            ? undefined
            : { background: "#FFF6E5" }
        }
      >
        <Routes>
          <Route path="/superadmin/login" element={<SuperAdminPage />} />
          {/* Rota protegida para detalhamento do superadmin */}
          <Route
            path="/superadmin/detalhes"
            element={
              <RoleProtectedRoute
                allowedRoles={["superadmin"]}
                redirectTo="/superadmin/login"
              >
                <SuperAdminPage />
              </RoleProtectedRoute>
            }
          />
          <Route path="/" element={<LoginPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Páginas institucionais (rodapé) */}
          <Route path="/pagina/:slug" element={<InfoPage />} />

          {/* Catálogo é público: navegar e ver produtos não exige login.
              O login só é solicitado ao tentar adicionar um item ao carrinho
              (ver MenuPage -> handleAddToCart). */}
          <Route path="/menu" element={<MenuPage />} />

          {/* Rota protegida para pagamento */}
          <Route
            path="/payment"
            element={
              <ProtectedRoute>
                <PaymentPage />
              </ProtectedRoute>
            }
          />

          {/* Rotas de login especiais */}
          <Route path="/cozinha/login" element={<OrderHistoryPage />} />
          <Route path="/admin/login" element={<AdminLoginPage />} />

          {/* Rota protegida para histórico de pedidos */}
          <Route
            path="/historico"
            element={
              <RoleProtectedRoute
                allowedRoles={["admin", "kitchen"]}
                redirectTo="/admin/login"
                permission="pedidos"
              >
                <OrdersShell>
                  <OrderHistoryPage />
                </OrdersShell>
              </RoleProtectedRoute>
            }
          />

          {/* Rota protegida para detalhes do pedido */}
          <Route
            path="/historico/detalhes"
            element={
              <RoleProtectedRoute
                allowedRoles={["admin", "kitchen"]}
                redirectTo="/admin/login"
                permission="pedidos"
              >
                <OrdersShell>
                  <OrderDetailPage />
                </OrdersShell>
              </RoleProtectedRoute>
            }
          />

          {/* Rota protegida para '/meus-pedidos' */}
          <Route
            path="/meus-pedidos"
            element={
              <ProtectedRoute>
                <CustomerOrdersPage />
              </ProtectedRoute>
            }
          />

          {/* Rota protegida para favoritos */}
          <Route
            path="/favoritos"
            element={
              <ProtectedRoute>
                <FavoritesPage />
              </ProtectedRoute>
            }
          />

          {/* Rota protegida para admin */}
          <Route
            path="/admin"
            element={
              <RoleProtectedRoute
                allowedRoles={["admin"]}
                redirectTo="/admin/login"
                permission="dashboard"
              >
                <AdminLayout>
                  <AdminDashboardPage />
                </AdminLayout>
              </RoleProtectedRoute>
            }
          />

          {/* Produtos e estoque (antes ficava em /admin) */}
          <Route
            path="/admin/produtos"
            element={
              <RoleProtectedRoute
                allowedRoles={["admin"]}
                redirectTo="/admin/login"
                permission="produtos"
              >
                <AdminLayout>
                  <AdminPage />
                </AdminLayout>
              </RoleProtectedRoute>
            }
          />

          {/* Clientes cadastrados (somente leitura) */}
          <Route
            path="/admin/clientes"
            element={
              <RoleProtectedRoute
                allowedRoles={["admin"]}
                redirectTo="/admin/login"
                permission="clientes"
              >
                <AdminLayout>
                  <AdminCustomersPage />
                </AdminLayout>
              </RoleProtectedRoute>
            }
          />

          {/* 🆕 Rota protegida para gerenciar categorias */}
          <Route
            path="/admin/categories"
            element={
              <RoleProtectedRoute
                allowedRoles={["admin"]}
                redirectTo="/admin/login"
                permission="categorias"
              >
                <AdminLayout>
                  <AdminCategoriesPage />
                </AdminLayout>
              </RoleProtectedRoute>
            }
          />

          {/* 🆕 Rota protegida para gerenciar banners da home */}
          <Route
            path="/admin/banners"
            element={
              <RoleProtectedRoute
                allowedRoles={["admin"]}
                redirectTo="/admin/login"
                permission="banners"
              >
                <AdminLayout>
                  <AdminBannersPage />
                </AdminLayout>
              </RoleProtectedRoute>
            }
          />

          {/* Rota protegida para relatórios do admin */}
          <Route
            path="/admin/reports"
            element={
              <RoleProtectedRoute
                allowedRoles={["admin"]}
                redirectTo="/admin/login"
                permission="relatorios"
              >
                <AdminLayout>
                  <AdminReportsPage />
                </AdminLayout>
              </RoleProtectedRoute>
            }
          />

          {/* Rota protegida para relatório de gestão (admin) */}
          <Route
            path="/admin/management-report"
            element={
              <RoleProtectedRoute
                allowedRoles={["admin"]}
                redirectTo="/admin/login"
                permission="gestao"
              >
                <AdminLayout>
                  <AdminManagementReportPage />
                </AdminLayout>
              </RoleProtectedRoute>
            }
          />
          {/* Logins de funcionários e abas liberadas (só admin master) */}
          <Route
            path={STAFF_ADMIN_PATH}
            element={
              <RoleProtectedRoute
                allowedRoles={["admin"]}
                redirectTo="/admin/login"
                permission="master"
              >
                <AdminLayout>
                  <AdminStaffPage />
                </AdminLayout>
              </RoleProtectedRoute>
            }
          />

          {/* Funcionário sem nenhuma aba liberada */}
          <Route
            path="/admin/sem-acesso"
            element={
              <RoleProtectedRoute allowedRoles={["admin"]} redirectTo="/admin/login">
                <AdminLayout>
                  <AdminNoAccessPage />
                </AdminLayout>
              </RoleProtectedRoute>
            }
          />
        </Routes>
      </main>
    </div>
  );
};

import Footer from "./components/Footer";
export default App;

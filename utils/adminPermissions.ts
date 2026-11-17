import type { User } from "../types";

// Abas do painel que o admin master libera para cada funcionário.
// As chaves precisam bater com STAFF_PERMISSIONS no backend.
export type AdminPermission =
  | "dashboard"
  | "pedidos"
  | "clientes"
  | "produtos"
  | "categorias"
  | "banners"
  | "gestao"
  | "relatorios"
  | "valores";

export interface AdminPermissionDef {
  key: AdminPermission;
  label: string;
  description: string;
  /** Rota da aba (ausente = permissão que não é uma aba) */
  path?: string;
  group: string;
}

export const ADMIN_PERMISSIONS: AdminPermissionDef[] = [
  { key: "dashboard", label: "Dashboard", description: "Visão geral de vendas e indicadores", path: "/admin", group: "Visão geral" },
  { key: "pedidos", label: "Pedidos", description: "Lista, detalhes, pagamento e entrega dos pedidos", path: "/historico", group: "Vendas" },
  { key: "clientes", label: "Clientes", description: "Clientes cadastrados e seus pedidos", path: "/admin/clientes", group: "Vendas" },
  { key: "produtos", label: "Produtos e estoque", description: "Cadastro de produtos, estoque e movimentações", path: "/admin/produtos", group: "Catálogo" },
  { key: "categorias", label: "Categorias", description: "Categorias do catálogo", path: "/admin/categories", group: "Catálogo" },
  { key: "banners", label: "Banners", description: "Banners da página inicial", path: "/admin/banners", group: "Catálogo" },
  { key: "gestao", label: "Gestão e financeiro", description: "Relatório de gestão e financeiro (ainda pede a senha especial)", path: "/admin/management-report", group: "Análises" },
  { key: "relatorios", label: "Relatórios", description: "Relatórios de vendas e recomendações", path: "/admin/reports", group: "Análises" },
  { key: "valores", label: "Ver valores em R$", description: "Pode usar o olhinho (com a senha) para ver valores de vendas", group: "Valores" },
];

export const STAFF_ADMIN_PATH = "/admin/funcionarios";

/** Admin master: entrou com a senha geral do admin (não é funcionário). */
export const isMasterAdmin = (user?: User | null) =>
  user?.role === "admin" && !user.staffId;

export const hasAdminPermission = (
  user: User | null | undefined,
  permission: AdminPermission,
) => {
  if (!user || user.role !== "admin") return false;
  if (!user.staffId) return true;
  return (user.permissions || []).includes(permission);
};

/** Permissão necessária para abrir uma rota do painel. */
export const permissionForPath = (pathname: string): AdminPermission | null => {
  if (pathname === "/admin") return "dashboard";
  if (pathname.startsWith("/historico")) return "pedidos";
  const match = ADMIN_PERMISSIONS.find(
    (perm) => perm.path && perm.path !== "/admin" && pathname.startsWith(perm.path),
  );
  return match ? match.key : null;
};

/** Primeira aba que o usuário pode abrir (para onde mandar quem não pode ver o dashboard). */
export const firstAllowedAdminPath = (user?: User | null): string | null => {
  if (isMasterAdmin(user)) return "/admin";
  const first = ADMIN_PERMISSIONS.find(
    (perm) => perm.path && hasAdminPermission(user, perm.key),
  );
  return first?.path || null;
};

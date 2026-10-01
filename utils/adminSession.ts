// Evento disparado quando a API recusa o token (401/403), para a UI pedir
// novo acesso à aba admin sem deslogar o usuário do sistema.
export const ADMIN_SESSION_EXPIRED_EVENT = "admin-session-expired";

// Rota da tela de senha do admin já sinalizando que a sessão expirou.
export const ADMIN_LOGIN_EXPIRED_PATH = "/admin/login?expired=1";

interface TokenPayload {
  role?: string;
  exp?: number;
}

const decodeTokenPayload = (token: string): TokenPayload | null => {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64)) as TokenPayload;
  } catch {
    return null;
  }
};

/**
 * True quando existe um JWT de admin ainda dentro da validade.
 * O backend emite o token com validade de 8h; depois disso as rotas de admin
 * respondem 401/403 mesmo com o usuário ainda "logado" no front.
 */
export const isAdminSessionValid = (): boolean => {
  const token = localStorage.getItem("jwt_token");
  if (!token) return false;
  const payload = decodeTokenPayload(token);
  if (!payload || payload.role !== "admin") return false;
  // Margem de 30s para não usar um token que expira no meio da requisição.
  if (payload.exp && payload.exp * 1000 <= Date.now() + 30_000) return false;
  return true;
};

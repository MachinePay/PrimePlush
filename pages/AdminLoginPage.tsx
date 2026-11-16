import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { login as apiLogin } from "../services/apiService";
import { isAdminSessionValid } from "../utils/adminSession";
import "../components/admin/admin.css";
import { Button } from "../components/admin/ui";
import {
  IconAlert,
  IconChevronLeft,
  IconClock,
  IconShield,
} from "../components/admin/icons";

// Ícones de mostrar/ocultar senha no mesmo traço do kit do painel
const IconEye: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const IconEyeOff: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M9.9 5.2A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2" />
    <path d="M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7c1.9 0 3.6-.6 5-1.5" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    <path d="m2 2 20 20" />
  </svg>
);

const AdminLoginPage: React.FC = () => {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // Apenas visual: alterna a exibição da senha digitada
  const [showPassword, setShowPassword] = useState(false);
  const { login, currentUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Para onde voltar após entrar (ex.: checkout que pediu acesso de admin).
  const returnTo =
    (location.state as { from?: string } | null)?.from || "/admin";
  // Admin ainda logado no sistema, mas com o token de admin vencido.
  const sessionExpired =
    new URLSearchParams(location.search).get("expired") === "1" ||
    currentUser?.role === "admin";

  useEffect(() => {
    // Só pula a senha se o token de admin ainda for válido; com o token
    // vencido, redirecionar para /admin deixaria as telas sem permissão.
    if (isAdminSessionValid()) {
      navigate(returnTo, { replace: true });
    }
  }, [navigate, returnTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      // Usa o novo serviço de autenticação JWT
      const success = await apiLogin("admin", password);

      if (success) {
        // Atualiza o contexto local com o usuário admin
        const adminUser = {
          id: "admin_user",
          name: "Administrador",
          historico: [],
          role: "admin" as const,
        };
        login(adminUser);
        navigate(returnTo, { replace: true });
      } else {
        setError("Senha incorreta");
        setPassword("");
      }
    } catch (err) {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="pp-admin">
      <div className="relative flex min-h-[calc(100vh-80px)] items-center justify-center overflow-hidden px-4 py-12">
        {/* Fundo decorativo suave */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(600px circle at 15% 10%, rgba(37,99,235,0.10), transparent 60%), radial-gradient(500px circle at 85% 90%, rgba(124,58,237,0.10), transparent 60%)",
          }}
        />

        <div className="pp-animate-in relative w-full max-w-[420px]">
          <div className="pp-card overflow-hidden shadow-[var(--pp-shadow-lg)]">
            <div className="h-1 bg-gradient-to-r from-blue-600 via-violet-500 to-fuchsia-500" />
            <div className="px-6 pb-6 pt-8 sm:px-8">
              <div className="mb-7 text-center">
                <img
                  src="/logonova.png"
                  alt="Prime Plush"
                  className="mx-auto mb-5 h-16 w-auto object-contain"
                />
                <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[color:var(--pp-brand-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--pp-brand)]">
                  <IconShield className="h-3.5 w-3.5" />
                  Área restrita
                </div>
                <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--pp-text)]">
                  Acesso administrador
                </h1>
                <p className="mt-1 text-sm text-[color:var(--pp-text-2)]">
                  Digite a senha para acessar
                </p>
                {/* Loja: single-tenant, não exibe mais storeId */}
              </div>

              {sessionExpired && (
                <div className="mb-5 flex gap-3 rounded-xl border border-amber-200 bg-[color:var(--pp-warning-soft)] px-4 py-3 text-sm text-amber-800">
                  <IconClock className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--pp-warning)]" />
                  <p>
                    Sua sessão de administrador expirou. Você continua logado no
                    sistema, mas precisa digitar a senha para acessar a aba
                    admin novamente.
                  </p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="password" className="pp-label">
                    Senha
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setError("");
                      }}
                      placeholder="Digite a senha"
                      className="pp-input pr-11"
                      style={{ height: 44 }}
                      autoFocus
                      autoComplete="current-password"
                      disabled={isLoading}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? "password-error" : undefined}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[color:var(--pp-text-3)] transition-colors hover:bg-[color:var(--pp-surface-2)] hover:text-[color:var(--pp-text)]"
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                      title={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showPassword ? (
                        <IconEyeOff className="h-[18px] w-[18px]" />
                      ) : (
                        <IconEye className="h-[18px] w-[18px]" />
                      )}
                    </button>
                  </div>
                  {error && (
                    <p
                      id="password-error"
                      role="alert"
                      className="pp-error flex items-center gap-1.5"
                    >
                      <IconAlert className="h-3.5 w-3.5 shrink-0" />
                      {error}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  loading={isLoading}
                  className="w-full justify-center"
                >
                  {isLoading ? "Verificando..." : "Entrar"}
                </Button>
              </form>
            </div>
          </div>

          <div className="mt-4 text-center">
            <Button
              variant="ghost"
              size="sm"
              icon={<IconChevronLeft />}
              onClick={() => navigate("/")}
            >
              Voltar ao início
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLoginPage;

import React, { useState, useEffect } from "react";
import "../assets/animated-gradient.css";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useCart } from "../contexts/CartContext";

import type { User } from "../types";

// --- Componente WelcomeScreen ---
interface WelcomeScreenProps {
  onNameSubmit: (name: string) => void;
  isLoading?: boolean;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onNameSubmit,
  isLoading = false,
}) => {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError("Por favor, digite seu nome");
      return;
    }

    if (trimmedName.length < 2) {
      setError("Nome deve ter pelo menos 2 caracteres");
      return;
    }

    onNameSubmit(trimmedName);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen animated-gradient p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-10">
        <div className="text-center mb-8">
          <img
            src="/selfMachine.jpg"
            alt="Self Machine"
            className="w-48 h-auto mx-auto mb-6 rounded-xl"
          />
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Pastel Kiosk
          </h1>
          <p className="text-stone-600">
            Bem-vindo à nossa deliciosa experiência!
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-semibold text-stone-700 mb-2"
            >
              Como você se chama?
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
              placeholder="Digite seu nome"
              className="w-full px-4 py-3 border-2 border-stone-200 rounded-lg focus:outline-none focus:border-blue-600 transition-colors"
              autoFocus
              disabled={isLoading}
            />
            {error && <p className="text-blue-600 text-sm mt-2">{error}</p>}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-colors text-lg disabled:bg-blue-300 disabled:cursor-wait"
          >
            {isLoading ? "Carregando..." : "Começar Pedido"}
          </button>
        </form>

        <p className="text-center text-sm text-stone-500 mt-6">
          Você poderá fazer login depois para ganhar pontos! ⭐
        </p>
      </div>
    </div>
  );
};

// --- Componente Login por Documento (CPF/CNPJ) ---
interface CPFLoginProps {
  onBack: () => void;
  onLoginSuccess: (user: User) => void;
}

const CPFLogin: React.FC<CPFLoginProps> = ({ onBack, onLoginSuccess }) => {
  const [documentInput, setDocumentInput] = useState("");
  const [cleanedDoc, setCleanedDoc] = useState("");
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [userFound, setUserFound] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [requiresRegistration, setRequiresRegistration] = useState(false);

  // Formata dinamicamente entre CPF e CNPJ
  const formatDocument = (value: string) => {
    const cleaned = value.replace(/\D/g, "");
    if (cleaned.length <= 11) {
      return cleaned
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    } else {
      return cleaned
        .slice(0, 14)
        .replace(/^(\d{2})(\d)/, "$1.$2")
        .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/\.(\d{3})(\d)/, ".$1/$2")
        .replace(/(\d{4})(\d)/, "$1-$2");
    }
  };

  const handleDocChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatDocument(e.target.value);
    setDocumentInput(formatted);
    setError("");
    setRequiresRegistration(false);
  };

  // PASSO 1: Verificar se Documento existe
  const checkDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = documentInput.replace(/\D/g, "");

    if (clean.length !== 11 && clean.length !== 14) {
      setError("Documento inválido. Digite 11 dígitos (CPF) ou 14 (CNPJ).");
      return;
    }

    setIsLoading(true);
    setError("");
    setCleanedDoc(clean);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:3001"}/api/users/check-cpf`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cpf: clean }), // Mantendo a chave 'cpf' para compatibilidade com seu backend atual
        },
      );

      if (!response.ok) throw new Error("Erro ao verificar documento");

      const data = await response.json();

      if (data.exists && data.user) {
        setUserFound(data.user);
        setShowPassword(true);
      } else if (data.requiresRegistration) {
        setRequiresRegistration(true);
      }
    } catch (err) {
      setError("Erro ao verificar documento. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  // PASSO 2: Cadastrar novo usuário
  const registerUser = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || name.trim().length < 3) {
      setError("Nome deve ter pelo menos 3 caracteres");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:3001"}/api/users/register`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cpf: cleanedDoc, name: name.trim() }),
        },
      );

      if (!response.ok) {
        if (response.status === 409) {
          setError("Documento já cadastrado.");
          setRequiresRegistration(false);
          return;
        }
        throw new Error("Erro ao cadastrar");
      }

      const data = await response.json();
      if (data.user) {
        onLoginSuccess(data.user);
      }
    } catch (err) {
      setError("Erro ao cadastrar. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  // PASSO 3: Login com Senha
  const handleLoginWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:3001"}/api/users/login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cpf: cleanedDoc, password }),
        },
      );

      const data = await response.json();
      if (response.ok && data.user) {
        onLoginSuccess(data.user);
      } else {
        setError(data.message || "Senha incorreta.");
      }
    } catch (err) {
      setError("Erro ao autenticar. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-stone-100 to-blue-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            {requiresRegistration
              ? "Cadastrar Conta"
              : showPassword
                ? "Digite sua senha"
                : "Fazer Login"}
          </h1>
          <p className="text-stone-600">
            {requiresRegistration
              ? "Complete seu cadastro para continuar"
              : showPassword
                ? `Olá, ${userFound?.name}!`
                : "Digite seu CPF ou CNPJ para começar"}
          </p>
        </div>

        {/* FLUXO CPF/CNPJ */}
        {!requiresRegistration && !showPassword && (
          <form onSubmit={checkDocument} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-stone-700 mb-2">
                CPF ou CNPJ
              </label>
              <input
                type="text"
                value={documentInput}
                onChange={handleDocChange}
                placeholder="000.000.000-00 ou 00.000.000/0000-00"
                className="w-full px-4 py-3 border-2 border-stone-200 rounded-lg focus:outline-none focus:border-blue-600 transition-colors text-lg"
                autoFocus
              />
              {error && <p className="text-blue-600 text-sm mt-2">{error}</p>}
            </div>
            <button
              type="submit"
              disabled={isLoading || (documentInput.replace(/\D/g, "").length !== 11 && documentInput.replace(/\D/g, "").length !== 14)}
              className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-300"
            >
              {isLoading ? "Verificando..." : "Continuar"}
            </button>
          </form>
        )}

        {/* FLUXO SENHA */}
        {showPassword && (
          <form onSubmit={handleLoginWithPassword} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-stone-700 mb-2">
                Senha
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Sua senha"
                className="w-full px-4 py-3 border-2 border-stone-200 rounded-lg focus:outline-none focus:border-blue-600 transition-colors"
                autoFocus
              />
              {error && <p className="text-blue-600 text-sm mt-2">{error}</p>}
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-colors"
            >
              {isLoading ? "Entrando..." : "Entrar"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowPassword(false);
                setError("");
              }}
              className="w-full text-sm text-stone-500 hover:text-stone-700"
            >
              ← Voltar
            </button>
          </form>
        )}

        {/* FLUXO CADASTRO */}
        {requiresRegistration && (
          <form onSubmit={registerUser} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-stone-700 mb-2">
                Nome Completo
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Como deseja ser chamado?"
                className="w-full px-4 py-3 border-2 border-stone-200 rounded-lg focus:outline-none focus:border-blue-600 transition-colors"
                autoFocus
              />
              {error && <p className="text-blue-600 text-sm mt-2">{error}</p>}
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-colors"
            >
              {isLoading ? "Cadastrando..." : "Cadastrar e Iniciar"}
            </button>
            <button
              type="button"
              onClick={() => {
                setRequiresRegistration(false);
                setError("");
              }}
              className="w-full text-sm text-stone-500 hover:text-stone-700"
            >
              ← Voltar
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

// --- Componente LoginPage Principal ---
const LoginPage: React.FC = () => {
  const { login, currentUser } = useAuth();
  const { clearCart } = useCart();
  const navigate = useNavigate();

  useEffect(() => {
    if (currentUser) {
      navigate("/menu");
    }
  }, [currentUser, navigate]);

  const handleLoginSuccess = (user: User) => {
    clearCart();
    login(user);
    localStorage.removeItem("guestUserName");
    navigate("/menu");
  };

  return <CPFLogin onBack={() => {}} onLoginSuccess={handleLoginSuccess} />;
};

export default LoginPage;
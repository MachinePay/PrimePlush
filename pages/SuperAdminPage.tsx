import React, { useState, useEffect } from "react";
import { login, isAuthenticated, logout } from "../services/apiService";
import logo from "../assets/primeplush-logo.png";

interface StatsData {
  stats: {
    totalToReceive: number;
    totalReceived: number;
    alreadyReceived: number;
  };
  history: Array<{
    id: number;
    amount: number;
    date: string;
  }>;
}

export default function SuperAdminPage() {
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(isAuthenticated());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<StatsData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (loggedIn) {
      fetchStats();
      // Atualiza a cada 30 segundos
      const interval = setInterval(fetchStats, 30000);
      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn]);

  async function fetchStats() {
    const wasLoading = loading;
    if (!wasLoading) setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:3001"}/api/super-admin/receivables`,
        {
          headers: {
            "x-super-admin-password": password,
          },
        }
      );
      if (!response.ok) {
        throw new Error("Erro ao buscar dados");
      }
      const result = await response.json();
      setData(result);
    } catch (e: any) {
      setError(e.message || "Erro ao buscar dados");
    }
    if (!wasLoading) setLoading(false);
  }

  async function handleMarkReceived() {
    if (!data || data.stats.totalToReceive <= 0) {
      setError("Não há valores a receber");
      return;
    }

    const confirmed = window.confirm(
      `Confirmar recebimento de R$ ${data.stats.totalToReceive.toFixed(2)}?`
    );
    if (!confirmed) return;

    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:3001"}/api/super-admin/receivables/mark-received`,
        {
          method: "POST",
          headers: {
            "x-super-admin-password": password,
          },
        }
      );
      if (!response.ok) {
        throw new Error("Erro ao marcar como recebido");
      }
      await fetchStats(); // Atualiza os dados
      alert("Recebimento registrado com sucesso!");
    } catch (e: any) {
      setError(e.message || "Erro ao marcar como recebido");
    }
    setLoading(false);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const ok = await login("superadmin", password);
    setLoading(false);
    if (ok) setLoggedIn(true);
    else setError("Senha incorreta");
  }

  function handleLogout() {
    logout();
    setLoggedIn(false);
    setPassword("");
    setData(null);
    setError("");
  }

  if (!loggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-pink-50">
        <form
          onSubmit={handleLogin}
          className="bg-white shadow-2xl rounded-2xl p-10 w-full max-w-md flex flex-col gap-6 border-2 border-purple-200"
        >
          <div className="flex flex-col items-center gap-3">
            <img src={logo} alt="PrimePlush Logo" className="w-24 h-24 mb-2" />
            <h2 className="text-3xl font-bold text-purple-600">Super Admin</h2>
            <p className="text-gray-600 text-sm text-center">
              Controle Financeiro PrimePlush
            </p>
          </div>
          <input
            type="password"
            placeholder="Senha Super Admin"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            className="border-2 border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
            autoFocus
          />
          <button
            type="submit"
            disabled={loading || !password}
            className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
          {error && (
            <div className="text-red-600 text-sm text-center bg-red-50 p-3 rounded-lg">
              {error}
            </div>
          )}
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white shadow-xl rounded-2xl p-6 mb-6 border-2 border-purple-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img src={logo} alt="PrimePlush Logo" className="w-16 h-16" />
              <div>
                <h1 className="text-3xl font-bold text-purple-600">
                  Dashboard Super Admin
                </h1>
                <p className="text-gray-600 text-sm">
                  Visão financeira em tempo real
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="bg-red-500 hover:bg-red-600 text-white font-semibold px-6 py-3 rounded-lg transition-all shadow-lg hover:shadow-xl"
            >
              Sair
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        {loading && !data && (
          <div className="text-center py-12">
            <div className="inline-block w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-4 text-gray-600">Carregando dados...</p>
          </div>
        )}

        {error && !data && (
          <div className="bg-red-50 border-2 border-red-200 text-red-600 p-6 rounded-lg text-center">
            {error}
          </div>
        )}

        {data && (
          <>
            {/* Card Total a Receber - DESTAQUE */}
            <div className="bg-gradient-to-br from-purple-500 to-pink-500 shadow-2xl rounded-3xl p-8 mb-6 border-4 border-white">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center">
                  <span className="text-4xl">💰</span>
                </div>
                <h2 className="text-2xl font-bold text-white">
                  Total a Receber
                </h2>
              </div>
              <p className="text-6xl font-bold text-white mb-2">
                R$ {data.stats.totalToReceive.toFixed(2)}
              </p>
              <p className="text-white text-opacity-90 mb-6">
                Receita total confirmada
              </p>
              <button
                onClick={handleMarkReceived}
                disabled={loading || data.stats.totalToReceive === 0}
                className="bg-white text-purple-600 hover:bg-gray-100 font-bold py-4 px-8 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl text-lg w-full"
              >
                {loading ? "Processando..." : "✅ Marcar como Recebido"}
              </button>
            </div>

            {/* Histórico de Recebimentos */}
            <div className="bg-white shadow-xl rounded-2xl p-6 border-2 border-gray-200">
              <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                <span>📋</span> Histórico de Recebimentos
              </h2>

              {data.history.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p className="text-lg">
                    Nenhum recebimento registrado ainda
                  </p>
                  <p className="text-sm mt-2">
                    Os recebimentos aparecerão aqui após marcar como recebido
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.history.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                          <span className="text-xl">✅</span>
                        </div>
                        <div>
                          <p className="font-bold text-green-600 text-xl">
                            R$ {item.amount.toFixed(2)}
                          </p>
                          <p className="text-sm text-gray-600">
                            Recebido em{" "}
                            {new Date(item.date).toLocaleString("pt-BR")}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Indicador de atualização */}
        {data && (
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></span>
                  Atualizando...
                </span>
              ) : (
                "Atualização automática a cada 30 segundos"
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
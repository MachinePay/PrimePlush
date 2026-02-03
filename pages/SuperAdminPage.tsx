import React, { useState, useEffect } from "react";
import { login, isAuthenticated, logout } from "../services/apiService";
import logo from "../assets/primeplush-logo.png";

interface StatsData {
  total_paid_orders: number;
  total_received: number;
  last_received_at: string | null;
}

interface Order {
  id: string;
  userName: string;
  total: number;
  timestamp: string;
  paymentStatus: string;
  paymentMethod?: string;
  items: any[];
}

export default function SuperAdminPage() {
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(isAuthenticated());
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");
  const [showOrders, setShowOrders] = useState(false);

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
        },
      );
      if (!response.ok) {
        throw new Error("Erro ao buscar dados");
      }
      const data = await response.json();
      setStats(data);
    } catch (e: any) {
      setError(e.message || "Erro ao buscar dados");
    }
    if (!wasLoading) setLoading(false);
  }

  async function fetchRecentOrders() {
    setLoading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:3001"}/api/orders/history?limit=10`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        },
      );
      if (!response.ok) throw new Error("Erro ao buscar pedidos");
      const data = await response.json();
      setRecentOrders(data.slice(0, 10));
      setShowOrders(true);
    } catch (e: any) {
      setError(e.message || "Erro ao buscar pedidos");
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
    setStats(null);
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
        {loading && !stats && (
          <div className="text-center py-12">
            <div className="inline-block w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-4 text-gray-600">Carregando dados...</p>
          </div>
        )}

        {error && !stats && (
          <div className="bg-red-50 border-2 border-red-200 text-red-600 p-6 rounded-lg text-center">
            {error}
          </div>
        )}

        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card Total de Pedidos Pagos */}
            <div className="bg-white shadow-xl rounded-2xl p-6 border-2 border-green-200">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl">✅</span>
                </div>
                <h3 className="text-lg font-semibold text-gray-700">
                  Pedidos Pagos
                </h3>
              </div>
              <p className="text-4xl font-bold text-green-600">
                {stats.total_paid_orders}
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Total de pedidos confirmados
              </p>
            </div>

            {/* Card Valor Total Recebido */}
            <div className="bg-white shadow-xl rounded-2xl p-6 border-2 border-purple-200">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl">💰</span>
                </div>
                <h3 className="text-lg font-semibold text-gray-700">
                  Total Recebido
                </h3>
              </div>
              <p className="text-4xl font-bold text-purple-600">
                R$ {stats.total_received.toFixed(2)}
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Receita total confirmada
              </p>
            </div>

            {/* Card Último Recebimento */}
            <div className="bg-white shadow-xl rounded-2xl p-6 border-2 border-blue-200">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-2xl">🕒</span>
                </div>
                <h3 className="text-lg font-semibold text-gray-700">
                  Último Recebimento
                </h3>
              </div>
              <p className="text-lg font-semibold text-blue-600">
                {stats.last_received_at
                  ? new Date(stats.last_received_at).toLocaleString("pt-BR")
                  : "Nenhum recebimento"}
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Data e hora do último pedido pago
              </p>
            </div>
          </div>
        )}

        {/* Ações rápidas */}
        {stats && (
          <div className="mt-6">
            <div className="bg-white shadow-xl rounded-2xl p-6 border-2 border-gray-200">
              <h2 className="text-xl font-bold text-gray-800 mb-4">
                Ações Rápidas
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={fetchRecentOrders}
                  disabled={loading}
                  className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg transition-all shadow-lg hover:shadow-xl disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  📋 Ver Últimos Pedidos
                </button>
                <button
                  onClick={fetchStats}
                  disabled={loading}
                  className="bg-green-500 hover:bg-green-600 text-white font-semibold py-3 px-6 rounded-lg transition-all shadow-lg hover:shadow-xl disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  🔄 Atualizar Dados
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tabela de pedidos recentes */}
        {showOrders && recentOrders.length > 0 && (
          <div className="mt-6">
            <div className="bg-white shadow-xl rounded-2xl p-6 border-2 border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-800">
                  Últimos 10 Pedidos
                </h2>
                <button
                  onClick={() => setShowOrders(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="text-left p-3 text-gray-700 font-semibold">
                        ID
                      </th>
                      <th className="text-left p-3 text-gray-700 font-semibold">
                        Cliente
                      </th>
                      <th className="text-left p-3 text-gray-700 font-semibold">
                        Valor
                      </th>
                      <th className="text-left p-3 text-gray-700 font-semibold">
                        Status
                      </th>
                      <th className="text-left p-3 text-gray-700 font-semibold">
                        Data/Hora
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((order) => (
                      <tr
                        key={order.id}
                        className="border-b border-gray-100 hover:bg-gray-50"
                      >
                        <td className="p-3 text-sm font-mono">
                          {order.id.substring(0, 12)}...
                        </td>
                        <td className="p-3">{order.userName}</td>
                        <td className="p-3 font-semibold text-green-600">
                          R$ {order.total.toFixed(2)}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-semibold ${
                              order.paymentStatus === "paid"
                                ? "bg-green-100 text-green-700"
                                : order.paymentStatus === "pending"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : "bg-red-100 text-red-700"
                            }`}
                          >
                            {order.paymentStatus === "paid"
                              ? "✅ Pago"
                              : order.paymentStatus === "pending"
                                ? "⏳ Pendente"
                                : "❌ Cancelado"}
                          </span>
                        </td>
                        <td className="p-3 text-sm text-gray-600">
                          {new Date(order.timestamp).toLocaleString("pt-BR")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Indicador de atualização */}
        {stats && (
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


import React, { useState, useEffect } from "react";
import { login, isAuthenticated, logout } from "../services/apiService";
import logo from "../assets/primeplush-logo.png";

// --- CÓDIGO INLINE DO COMPONENTE DE DETALHES ---
interface ItemDetail {
  name: string;
  price: number;
  precoBruto: number;
  quantity: number;
  valueToReceive: number;
}

interface OrderDetail {
  id: string;
  timestamp: string;
  userName?: string;
  total: number;
  orderValueToReceive: number;
  items: ItemDetail[];
}

interface SuperAdminReceivablesDetailsProps {
  orders: OrderDetail[];
  totalToReceive: number;
  totalReceived: number;
  alreadyReceived: number;
}

const SuperAdminReceivablesDetails: React.FC<SuperAdminReceivablesDetailsProps> = ({ orders, totalToReceive, totalReceived, alreadyReceived }) => {
  return (
    <div className="bg-white shadow-xl rounded-2xl p-6 border-2 border-purple-200 mt-8">
      <h2 className="text-2xl font-bold text-purple-800 mb-4">Pedidos detalhados para cálculo do valor a receber</h2>
      <div className="mb-4">
        <span className="font-semibold text-purple-700">Valor a receber (total):</span> <span className="text-lg">R${totalToReceive.toFixed(2)}</span><br />
        <span className="font-semibold">Total já recebido:</span> R${alreadyReceived.toFixed(2)}<br />
        <span className="font-semibold">Total recebido (histórico):</span> R${totalReceived.toFixed(2)}
      </div>
      {orders.length === 0 && <div>Nenhum pedido encontrado.</div>}
      {orders.map((order) => (
        <div key={order.id} className="order-card border rounded-lg p-4 mb-6 bg-purple-50">
          <div className="mb-2">
            <b>Pedido #{order.id}</b> | Cliente: {order.userName || '-'} | Data: {new Date(order.timestamp).toLocaleString()}
          </div>
          <div className="mb-2">
            Total do pedido: R$ {order.total?.toFixed(2) ?? "0.00"} | Valor a receber deste pedido: <b>R$ {order.orderValueToReceive?.toFixed(2) ?? "0.00"}</b>
          </div>
          <table className="w-full text-xs mb-2">
            <thead>
              <tr className="bg-purple-100">
                <th className="py-1 px-2 text-left">Produto</th>
                <th className="py-1 px-2 text-left">Preço Venda</th>
                <th className="py-1 px-2 text-left">Preço Bruto</th>
                <th className="py-1 px-2 text-left">Qtd</th>
                <th className="py-1 px-2 text-left">Valor a Receber</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item, idx) => (
                <tr key={idx} className="border-b">
                  <td className="py-1 px-2">{item.name}</td>
                  <td className="py-1 px-2">R$ {item.price?.toFixed(2) ?? "0.00"}</td>
                  <td className="py-1 px-2">R$ {item.precoBruto?.toFixed(2) ?? "0.00"}</td>
                  <td className="py-1 px-2">{item.quantity}</td>
                  <td className="py-1 px-2">R$ {item.valueToReceive?.toFixed(2) ?? "0.00"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <div className="text-xs text-gray-500">
        <span>O valor a receber é calculado como: <br />
        <span className="font-mono">(Preço de venda - Preço bruto) x quantidade para cada item, somando todos os pedidos.</span></span>
      </div>
    </div>
  );
};
import { useNavigate } from "react-router-dom";
import type { Order } from "../types";
import { useAuth } from "../contexts/AuthContext";

interface ItemDetail {
  name: string;
  price: number;
  precoBruto: number;
  quantity: number;
  valueToReceive: number;
}

interface OrderDetail {
  id: string;
  timestamp: string;
  userName?: string;
  total: number;
  orderValueToReceive: number;
  items: ItemDetail[];
}

interface SuperAdminReceivablesDetailsProps {
  orders: OrderDetail[];
  totalToReceive: number;
  totalReceived: number;
  alreadyReceived: number;
}

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
  orders?: Order[]; // Adiciona lista de pedidos para detalhamento
}

function SuperAdminPage() {
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<StatsData | null>(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { login: authLogin } = useAuth();

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
    if (ok) {
      setLoggedIn(true);
      // Salva usuário superadmin no AuthContext
      authLogin({
        id: "superadmin",
        name: "Super Admin",
        historico: [],
        role: "superadmin"
      });
      navigate("/superadmin/detalhes");
    } else setError("Senha incorreta");
  }

  function handleLogout() {
    logout();
    setLoggedIn(false);
    setPassword("");
    setData(null);
    setError("");
    // Limpa qualquer persistência de login
    if (window && window.localStorage) {
      window.localStorage.removeItem("superadmin_logged_in");
    }
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

            {/* Detalhamento dos pedidos e cálculo */}
            {data.orders && (
              <SuperAdminReceivablesDetails
                orders={data.orders.map((order: any) => {
                  // Se já está no formato detalhado, retorna direto
                  if (order.orderValueToReceive !== undefined && order.items && order.items[0]?.valueToReceive !== undefined) {
                    return order;
                  }
                  // Caso contrário, faz o mapeamento mínimo
                  let orderValueToReceive = 0;
                  const items = (order.items || []).map((item: any) => {
                    const price = Number(item.price) || 0;
                    const precoBruto = Number(item.precoBruto) || 0;
                    const quantity = Number(item.quantity) || 1;
                    const valueToReceive = (price - precoBruto) * quantity;
                    orderValueToReceive += valueToReceive;
                    return {
                      name: item.name || '',
                      price,
                      precoBruto,
                      quantity,
                      valueToReceive
                    };
                  });
                  return {
                    id: order.id,
                    timestamp: order.timestamp,
                    userName: order.userName,
                    total: order.total,
                    orderValueToReceive,
                    items
                  };
                })}
                totalToReceive={data.stats.totalToReceive}
                totalReceived={data.stats.totalReceived}
                alreadyReceived={data.stats.alreadyReceived}
              />
            )}

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

export default SuperAdminPage;
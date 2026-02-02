import React, { useState, useEffect } from "react";
import { login, isAuthenticated, logout } from "../services/apiService";
import {
  getSuperAdminStats,
  markSuperAdminReceived,
} from "../services/superAdminService";
import logo from "../assets/primeplush-logo.png";

export default function SuperAdminPage() {
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(isAuthenticated());
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (loggedIn) {
      fetchStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn]);

  async function fetchStats() {
    setLoading(true);
    setError("");
    try {
      const { stats, history } = await getSuperAdminStats(password);
      setStats(stats);
      setHistory(history);
    } catch (e: any) {
      setError(e.message || "Erro ao buscar dados");
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

  async function handleMarkReceived() {
    setLoading(true);
    setError("");
    try {
      await markSuperAdminReceived(password);
      await fetchStats();
    } catch (e: any) {
      setError(e.message || "Erro ao registrar recebimento");
    }
    setLoading(false);
  }

  if (!loggedIn) {
    // Import da logo para uso no src
    // @ts-ignore

    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-primary-light)]">
        <form
          onSubmit={handleLogin}
          className="bg-white shadow-lg rounded-xl p-8 w-full max-w-sm flex flex-col gap-6 border border-[var(--color-primary)]"
        >
          <div className="flex flex-col items-center gap-2">
            <img src={logo} alt="PrimePlush Logo" className="w-20 h-20 mb-2" />
            <h2 className="text-2xl font-bold text-[var(--color-primary)]">
              Área Super Admin
            </h2>
            <p className="text-stone-500 text-sm text-center">
              Acesso restrito para controle financeiro PrimePlush
            </p>
          </div>
          <input
            type="password"
            placeholder="Senha Super Admin"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            className="border rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            autoFocus
          />
          <button
            type="submit"
            disabled={loading || !password}
            className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-semibold py-2 rounded transition-colors disabled:opacity-60"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
          {error && (
            <div className="text-red-600 text-sm text-center mt-2">{error}</div>
          )}
        </form>
      </div>
    );
  }

  function handleLogout() {
    logout();
    setLoggedIn(false);
    setPassword("");
    setStats(null);
    setHistory([]);
    setError("");
  }

  return (
    <div className="superadmin-page min-h-screen flex flex-col items-center justify-center bg-[var(--color-primary-light)]">
      <div className="bg-white shadow-lg rounded-xl p-8 w-full max-w-md flex flex-col gap-6 border border-[var(--color-primary)]">
        <div className="flex flex-col items-center gap-2">
          <img src={logo} alt="PrimePlush Logo" className="w-20 h-20 mb-2" />
          <h2 className="text-2xl font-bold text-[var(--color-primary)]">
            Dashboard Super Admin
          </h2>
        </div>
        <button
          onClick={handleLogout}
          className="self-end bg-red-500 hover:bg-red-600 text-white font-semibold px-4 py-2 rounded transition-colors mb-2"
        >
          Sair
        </button>
        {loading && <div>Carregando...</div>}
        {error && (
          <div className="error text-red-600 text-sm text-center">{error}</div>
        )}
        {stats && (
          <div className="stats">
            <h3 className="font-semibold mb-2">Total a Receber</h3>
            <p className="text-2xl font-bold mb-4">
              R$ {stats.totalToReceive.toFixed(2)}
            </p>
            <button
              onClick={handleMarkReceived}
              disabled={loading || stats.totalToReceive === 0}
              className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-semibold py-2 px-4 rounded transition-colors disabled:opacity-60"
            >
              Marcar como Recebido
            </button>
          </div>
        )}
        <h3 className="font-semibold mt-6">Histórico de Recebimentos</h3>
        <ul className="list-disc pl-5">
          {(history || []).map((h, i) => (
            <li key={i}>
              Recebido R$ {h.amount.toFixed(2)} em{" "}
              {new Date(h.date).toLocaleString()}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

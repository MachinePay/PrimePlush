import React, { useState, useEffect } from "react";
import { login, isAuthenticated, logout } from "../services/apiService";
import {
  getSuperAdminStats,
  markSuperAdminReceived,
} from "../services/superAdminService";

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
  }, [loggedIn]);

  async function fetchStats() {
    setLoading(true);
    setError("");
    try {
      const { stats, history } = await getSuperAdminStats();
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
      await markSuperAdminReceived();
      await fetchStats();
    } catch (e: any) {
      setError(e.message || "Erro ao registrar recebimento");
    }
    setLoading(false);
  }

  if (!loggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-primary-light)]">
        <form
          onSubmit={handleLogin}
          className="bg-white shadow-lg rounded-xl p-8 w-full max-w-sm flex flex-col gap-6 border border-[var(--color-primary)]"
        >
          <div className="flex flex-col items-center gap-2">
            <img
              src={require("../assets/primeplush-logo.png")}
              alt="PrimePlush Logo"
              className="w-20 h-20 mb-2"
            />
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

  return (
    <div className="superadmin-page">
      <h2>Dashboard Super Admin</h2>
      <button onClick={logout}>Sair</button>
      {loading && <div>Carregando...</div>}
      {error && <div className="error">{error}</div>}
      {stats && (
        <div className="stats">
          <h3>Total a Receber</h3>
          <p>R$ {stats.totalToReceive.toFixed(2)}</p>
          <button
            onClick={handleMarkReceived}
            disabled={loading || stats.totalToReceive === 0}
          >
            Marcar como Recebido
          </button>
        </div>
      )}
      <h3>Histórico de Recebimentos</h3>
      <ul>
        {history.map((h, i) => (
          <li key={i}>
            Recebido R$ {h.amount.toFixed(2)} em{" "}
            {new Date(h.date).toLocaleString()}
          </li>
        ))}
      </ul>
    </div>
  );
}

import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useStore } from "../contexts/StoreContext"; // 🏪 MULTI-TENANT
import Chatbot from "./Chatbot";
import logo from "../assets/primeplush-logo.png";

const Header: React.FC = () => {
  const { currentUser, logout } = useAuth();
  const { store } = useStore(); // 🏪 Obtém configurações da loja
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const activeLinkStyle = {
    color: "#2563eb", // azul escuro
    fontWeight: 600,
  };

  return (
    <>
      <header className="bg-gradient-to-r from-white via-blue-800 to-blue-900 border-b border-stone-200 sticky top-0 z-50 h-16">
        <div className="container mx-auto px-4 h-full flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <NavLink
            to={currentUser ? "/menu" : "/"}
            className="flex items-center gap-2 group"
          >
            <img
              src={logo}
              alt="PrimePlush logo"
              className="w-12 h-12 rounded-lg group-hover:scale-105 transition-transform object-cover"
            />
            <span className="text-xl font-bold text-stone-800 tracking-tight">
              PrimePlush
            </span>
          </NavLink>
        </div>

        {/* Navegação Central (Desktop) */}
        <nav className="hidden md:flex items-center gap-8">
          {currentUser &&
            (!currentUser.role || currentUser.role === "customer") && (
              <NavLink
                to="/menu"
                
                className="text-white transition-colors font-medium"
              >
                Catálogo
              </NavLink>
            )}

          {currentUser?.role === "kitchen" && (
            <NavLink
              to="/cozinha"
              style={({ isActive }) => (isActive ? activeLinkStyle : undefined)}
              className="text-stone-500 hover:text-blue-700 transition-colors font-medium"
            >
              Pedidos Cozinha
            </NavLink>
          )}

          {currentUser?.role === "admin" && (
            <>
              <NavLink
                to="/admin"
                
                className="text-white hover:text-blue-700 transition-colors font-medium"
              >
                Produtos
              </NavLink>
              <NavLink
                to="/admin/reports"
                
                className="text-[#FFA500] hover:text-blue-700 transition-colors font-medium"
              >
                Relatórios IA
              </NavLink>
            </>
          )}
        </nav>

        {/* Área do Usuário (Direita) */}
        <div className="flex items-center gap-4">
          {currentUser ? (
            <>
              {/* Chatbot agora mora aqui no Header */}
              <Chatbot />

              <div className="h-6 w-px bg-stone-200 mx-1"></div>

              <div className="flex items-center gap-3">
                <div className="hidden sm:block text-right leading-tight">
                  <p className="text-xs text-white font-medium">Olá,</p>
                  <p className="text-sm font-bold max-w-[100px] truncate" style={{ color: 'orange' }}>
                    {currentUser.name}
                  </p>
                </div>
                <button
                  onClick={handleLogout}
                  className="text-white hover:text-blue-600 hover:bg-blue-100 p-2 rounded-full transition-all duration-300 ease-in-out transform hover:scale-105 shadow-lg"
                  title="Sair"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                </button>
              </div>
            </>
          ) : (
            <span className="text-sm text-white">Bem-vindo!</span>
          )}
        </div>
        </div>
      </header>
      {/* Traço laranja embaixo do header */}
      <div style={{ height: '4px', background: 'orange', width: '100%' }} />
    </>
  );
};

export default Header;

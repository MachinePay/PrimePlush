// Componente de menu lateral para navegação de categorias
import React from "react";

export default function PlushMenu() {
  return (
    <nav className="bg-gradient-to-b from-yellow-400 to-orange-500 text-white w-[220px] pt-8 shadow-lg flex flex-col items-center">
      <h2 className="text-2xl mb-6 tracking-wider font-bold font-sans">MENU</h2>
      <ul className="w-full">
        <li className="py-3 pl-8 text-base font-bold cursor-pointer border-l-4 border-yellow-300 bg-white/80 text-orange-500 opacity-100 transition-all">
          🐻 Todos
        </li>
        <li className="py-3 pl-8 text-base font-bold cursor-pointer border-l-4 border-transparent hover:bg-white/60 hover:text-orange-500 hover:border-yellow-300 opacity-85 transition-all">
          ⭐ Destaques
        </li>
        <li className="py-3 pl-8 text-base font-bold cursor-pointer border-l-4 border-transparent hover:bg-white/60 hover:text-orange-500 hover:border-yellow-300 opacity-85 transition-all">
          🧸 Ursos
        </li>
        <li className="py-3 pl-8 text-base font-bold cursor-pointer border-l-4 border-transparent hover:bg-white/60 hover:text-orange-500 hover:border-yellow-300 opacity-85 transition-all">
          🐰 Coelhos
        </li>
        <li className="py-3 pl-8 text-base font-bold cursor-pointer border-l-4 border-transparent hover:bg-white/60 hover:text-orange-500 hover:border-yellow-300 opacity-85 transition-all">
          🦊 Outros
        </li>
      </ul>
    </nav>
  );
}

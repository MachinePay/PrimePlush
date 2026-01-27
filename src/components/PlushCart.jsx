// Carrinho lateral
import React from "react";

export default function PlushCart() {
  return (
    <aside className="w-[320px] bg-white shadow-lg p-8 flex flex-col items-start rounded-tr-3xl rounded-br-3xl">
      <h2 className="text-xl font-bold text-slate-800 mb-6 font-sans">
        Minha Cesta <span className="text-orange-500 text-base">(0)</span>
      </h2>
      <div className="flex flex-col items-center text-gray-400 mt-8 text-base">
        <span role="img" aria-label="sacola" className="text-4xl mb-2">
          🛍️
        </span>
        <p>Seu carrinho está vazio.</p>
      </div>
    </aside>
  );
}

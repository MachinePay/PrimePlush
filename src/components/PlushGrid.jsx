// Grid de produtos de pelúcia
import React from "react";

const plushies = [
  {
    name: "Urso Caramelo",
    image:
      "https://images.unsplash.com/photo-1519125323398-675f0ddb6308?auto=format&fit=crop&w=400&q=80",
    price: "R$ 59,90",
  },
  {
    name: "Coelho Fofo",
    image:
      "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=400&q=80",
    price: "R$ 49,90",
  },
  {
    name: "Estrela Amarela",
    image:
      "https://images.unsplash.com/photo-1464983953574-0892a716854b?auto=format&fit=crop&w=400&q=80",
    price: "R$ 39,90",
  },
  {
    name: "Raposa Charmosa",
    image:
      "https://images.unsplash.com/photo-1518717758536-85ae29035b6d?auto=format&fit=crop&w=400&q=80",
    price: "R$ 54,90",
  },
];

export default function PlushGrid() {
  return (
    <section>
      <h2 className="text-2xl mb-6 text-orange-500 font-bold font-sans">
        Pelúcias
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
        {plushies.map((item) => (
          <div
            className="bg-white rounded-3xl shadow-md p-6 flex flex-col items-center border-2 border-yellow-200 hover:scale-105 hover:shadow-lg hover:border-yellow-300 transition-transform"
            key={item.name}
          >
            <img
              src={item.image}
              alt={item.name}
              className="w-28 h-28 object-cover rounded-full mb-4 border-4 border-yellow-400 bg-yellow-50"
            />
            <h3 className="mb-2 text-lg font-bold text-slate-800">
              {item.name}
            </h3>
            <span className="text-orange-500 font-bold mb-3 text-base">
              {item.price}
            </span>
            <button className="bg-gradient-to-r from-yellow-300 to-orange-400 text-white rounded-xl px-6 py-2 font-bold shadow hover:from-yellow-400 hover:to-orange-500 transition-colors">
              Adicionar
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

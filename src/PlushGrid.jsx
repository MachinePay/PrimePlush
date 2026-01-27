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
    <section className="plush-grid">
      <h2>Pelúcias</h2>
      <div className="grid">
        {plushies.map((item) => (
          <div className="plush-card" key={item.name}>
            <img src={item.image} alt={item.name} />
            <h3>{item.name}</h3>
            <span className="price">{item.price}</span>
            <button>Adicionar</button>
          </div>
        ))}
      </div>
    </section>
  );
}

import React from "react";

export default function PlushCart() {
  return (
    <aside className="cart">
      <h2>
        Minha Cesta <span className="cart-count">(0)</span>
      </h2>
      <div className="cart-empty">
        <span role="img" aria-label="sacola">
          🛍️
        </span>
        <p>Seu carrinho está vazio.</p>
      </div>
    </aside>
  );
}

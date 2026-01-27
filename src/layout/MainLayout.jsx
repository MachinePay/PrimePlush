// Exemplo de layout base para páginas
import React from "react";
import PlushMenu from "../components/PlushMenu";
import PlushCart from "../components/PlushCart";

export default function MainLayout({ children }) {
  return (
    <div className="flex min-h-screen bg-[#f6f8fc]">
      <PlushMenu />
      <main className="flex-1 px-8 py-10 min-w-0">{children}</main>
      <PlushCart />
    </div>
  );
}

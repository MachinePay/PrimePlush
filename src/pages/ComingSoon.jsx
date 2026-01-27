import React from "react";
import logo from "../assets/LogoPrimePlush.jpeg";

export default function ComingSoon() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center ">
      <img src={logo} alt="Prime Plush Logo" className="w-90 h-90 " />
      <h1 className="text-4xl md:text-5xl font-extrabold text-orange-500 mb-4 text-center drop-shadow-sm">
        A Prime Plush está chegando para transformar o mercado de pelúcias.
      </h1>
      <h3
        className="text-blue-900 text-lg font-bold"
        style={{ fontFamily: "Open Sans, Arial, sans-serif" }}
      >
        Produtos selecionados, alto giro e qualidade premium. 🧸 Novidades em
        pelúcias muito em breve. Prepare-se para vender mais.
      </h3>
    </div>
  );
}

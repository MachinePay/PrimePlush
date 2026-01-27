import React from "react";
import logo from "../assets/LogoPrimePlush.jpeg";

export default function ComingSoon() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white">
      <img
        src={logo}
        alt="Prime Plush Logo"
        className="w-72 h-72 object-contain mb-10 drop-shadow-lg"
      />
      <h1 className="text-4xl md:text-5xl font-extrabold text-orange-500 mb-4 text-center drop-shadow-sm">
        Em breve novidades!
      </h1>
    </div>
  );
}

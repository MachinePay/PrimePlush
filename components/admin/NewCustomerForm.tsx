import React, { useState } from "react";
import type { User } from "../../types";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

interface NewCustomerFormProps {
  onCreated: (user: User) => void;
  onCancel: () => void;
}

// Cadastro de cliente feito pelo admin no checkout. Usa o mesmo cadastro do
// cliente (/api/users/register): o cliente já sai com login (CPF/CNPJ + senha).
const NewCustomerForm: React.FC<NewCustomerFormProps> = ({
  onCreated,
  onCancel,
}) => {
  const [form, setForm] = useState({
    cpf: "",
    name: "",
    email: "",
    phone: "",
    cep: "",
    address: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const setField = (field: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const validate = (): string => {
    const doc = form.cpf.replace(/\D/g, "");
    if (doc.length !== 11 && doc.length !== 14)
      return "CPF (11 dígitos) ou CNPJ (14 dígitos) inválido.";
    if (form.name.trim().length < 3)
      return "Nome deve ter pelo menos 3 caracteres.";
    if (!form.email.includes("@")) return "Email inválido.";
    if (form.phone.replace(/\D/g, "").length < 9) return "Telefone inválido.";
    if (form.cep.replace(/\D/g, "").length !== 8)
      return "CEP inválido. Digite 8 dígitos.";
    if (form.address.trim().length < 5) return "Endereço completo obrigatório.";
    if (form.password.length < 6)
      return "Senha obrigatória (mínimo 6 caracteres).";
    return "";
  };

  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const response = await fetch(`${BACKEND_URL}/api/users/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          cpf: form.cpf.replace(/\D/g, ""),
          email: form.email.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Erro ao cadastrar cliente.");
      }
      onCreated(data.user as User);
    } catch (err: any) {
      setError(err?.message || "Erro ao cadastrar cliente.");
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass =
    "w-full border-2 border-stone-200 rounded-lg px-3 py-2 bg-white text-stone-800 focus:outline-none focus:border-blue-500";

  return (
    <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
      <p className="mb-3 font-bold text-stone-800">Novo cliente</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          className={inputClass}
          placeholder="CPF ou CNPJ"
          inputMode="numeric"
          value={form.cpf}
          onChange={setField("cpf")}
        />
        <input
          className={inputClass}
          placeholder="Nome completo"
          value={form.name}
          onChange={setField("name")}
        />
        <input
          className={inputClass}
          placeholder="Email"
          type="email"
          value={form.email}
          onChange={setField("email")}
        />
        <input
          className={inputClass}
          placeholder="Telefone"
          inputMode="tel"
          value={form.phone}
          onChange={setField("phone")}
        />
        <input
          className={inputClass}
          placeholder="CEP"
          inputMode="numeric"
          value={form.cep}
          onChange={setField("cep")}
        />
        <input
          className={inputClass}
          placeholder="Endereço completo"
          value={form.address}
          onChange={setField("address")}
        />
        <input
          className={`${inputClass} sm:col-span-2`}
          placeholder="Senha de acesso do cliente (mín. 6 caracteres)"
          type="text"
          autoComplete="new-password"
          value={form.password}
          onChange={setField("password")}
        />
      </div>
      <p className="mt-2 text-xs text-stone-500">
        O cliente entra no site com o CPF/CNPJ e essa senha.
      </p>
      {error && (
        <p className="mt-2 text-sm font-semibold text-red-600">{error}</p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="rounded-lg bg-stone-200 px-4 py-2 font-bold text-stone-700 hover:bg-stone-300 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSaving}
          className="rounded-lg bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isSaving ? "Cadastrando..." : "Cadastrar e selecionar"}
        </button>
      </div>
    </div>
  );
};

export default NewCustomerForm;

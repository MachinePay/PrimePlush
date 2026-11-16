// Componente de formulário para criar/editar categorias (abre em modal)
import React, { useState, useEffect } from "react";
import type { Category } from "../services/categoryService";
import { Button, Field, Modal } from "./admin/ui";

interface CategoryFormProps {
  category: Category | null; // null = criar nova categoria
  onSave: (categoryData: {
    name: string;
    icon: string;
    order: number;
  }) => void | Promise<void>;
  onCancel: () => void;
}

const FORM_ID = "pp-category-form";

// Lista de ícones comuns para categorias de comida
const commonIcons = [
  "📦",
  "🍕",
  "🍔",
  "🌮",
  "🍜",
  "🍱",
  "🍰",
  "🥤",
  "☕",
  "🍺",
  "🥗",
  "🍝",
  "🍣",
  "🥘",
  "🍛",
  "🥙",
  "🌯",
  "🧁",
  "🍩",
  "🍪",
];

//atualizando deploy
const CategoryForm: React.FC<CategoryFormProps> = ({
  category,
  onSave,
  onCancel,
}) => {
  const [formData, setFormData] = useState({
    name: "",
    icon: "📦",
    order: 0,
  });
  const [nameError, setNameError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Preenche o formulário quando editar categoria existente
  useEffect(() => {
    if (category) {
      setFormData({
        name: category.name,
        icon: category.icon,
        order: category.order,
      });
    } else {
      setFormData({
        name: "",
        icon: "📦",
        order: 0,
      });
    }
    setNameError("");
  }, [category]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    if (name === "name") setNameError("");
    setFormData((prev) => ({
      ...prev,
      [name]: name === "order" ? parseInt(value) || 0 : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setNameError("Nome da categoria é obrigatório");
      return;
    }
    setIsSaving(true);
    try {
      await onSave(formData);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onCancel}
      locked={isSaving}
      title={category ? "Editar categoria" : "Nova categoria"}
      description="Categorias organizam os produtos nas abas do catálogo."
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={isSaving}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            type="submit"
            form={FORM_ID}
            loading={isSaving}
          >
            {category ? "Atualizar" : "Criar"}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-5">
        {/* Pré-visualização */}
        <div className="flex items-center gap-3 rounded-xl border border-[color:var(--pp-border)] bg-[color:var(--pp-surface-2)] p-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-2xl shadow-sm">
            {formData.icon || "📦"}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-[color:var(--pp-text)]">
              {formData.name.trim() || "Nome da categoria"}
            </div>
            <div className="text-xs text-[color:var(--pp-text-3)]">
              Ordem de exibição: {formData.order}
            </div>
          </div>
        </div>

        {/* Nome da Categoria */}
        <Field label="Nome da categoria *" htmlFor="category-name" error={nameError}>
          <input
            id="category-name"
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="Ex: Pastel de queijo, pastel de carne, pastel doce..."
            className="pp-input"
            required
            autoFocus
          />
        </Field>

        {/* Ícone */}
        <Field label="Ícone (emoji)" htmlFor="category-icon">
          <div className="mb-2 grid grid-cols-8 gap-1.5 sm:grid-cols-10">
            {commonIcons.map((icon) => {
              const selected = formData.icon === icon;
              return (
                <button
                  key={icon}
                  type="button"
                  aria-pressed={selected}
                  aria-label={`Usar ícone ${icon}`}
                  onClick={() => setFormData((prev) => ({ ...prev, icon }))}
                  className={`flex aspect-square items-center justify-center rounded-lg border text-xl transition-all ${
                    selected
                      ? "border-[color:var(--pp-brand)] bg-[color:var(--pp-brand-soft)] shadow-[0_0_0_3px_var(--pp-brand-ring)]"
                      : "border-[color:var(--pp-border)] bg-white hover:border-[color:var(--pp-border-strong)] hover:bg-[color:var(--pp-surface-2)]"
                  }`}
                >
                  {icon}
                </button>
              );
            })}
          </div>
          <input
            id="category-icon"
            type="text"
            name="icon"
            value={formData.icon}
            onChange={handleChange}
            placeholder="Ou digite um emoji personalizado"
            className="pp-input"
          />
        </Field>

        {/* Ordem */}
        <Field
          label="Ordem de exibição"
          htmlFor="category-order"
          help="Menor número = aparece primeiro"
        >
          <input
            id="category-order"
            type="number"
            name="order"
            value={formData.order}
            onChange={handleChange}
            min="0"
            className="pp-input"
          />
        </Field>
      </form>
    </Modal>
  );
};

export default CategoryForm;

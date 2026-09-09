// Componente de formulário para criar/editar banners da home
import React, { useState, useEffect } from "react";
import type { Banner, BannerPayload } from "../services/bannerService";
import type { Category } from "../services/categoryService";

interface BannerFormProps {
  banner: Banner | null; // null = criar novo banner
  categories: Category[];
  onSave: (bannerData: BannerPayload) => void;
  onCancel: () => void;
}

// Para onde o botão do banner leva. "category" usa uma categoria já
// cadastrada (seleciona a aba certa em /menu); "query" é o fallback por
// busca de texto para coleções que ainda não têm categoria própria.
type LinkType = "none" | "category" | "query";

const BannerForm: React.FC<BannerFormProps> = ({
  banner,
  categories,
  onSave,
  onCancel,
}) => {
  const [formData, setFormData] = useState({
    image: "",
    alt: "",
    buttonLabel: "Ver coleção",
    active: true,
  });
  const [linkType, setLinkType] = useState<LinkType>("none");
  const [linkValue, setLinkValue] = useState("");
  const [previewFailed, setPreviewFailed] = useState(false);

  // Preenche o formulário quando editar banner existente
  useEffect(() => {
    if (banner) {
      setFormData({
        image: banner.image,
        alt: banner.alt || "",
        buttonLabel: banner.buttonLabel || "Ver coleção",
        active: banner.active,
      });
      if (banner.category) {
        setLinkType("category");
        setLinkValue(banner.category);
      } else if (banner.query) {
        setLinkType("query");
        setLinkValue(banner.query);
      } else {
        setLinkType("none");
        setLinkValue("");
      }
    } else {
      setFormData({
        image: "",
        alt: "",
        buttonLabel: "Ver coleção",
        active: true,
      });
      setLinkType("none");
      setLinkValue("");
    }
    setPreviewFailed(false);
  }, [banner]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    if (name === "image") setPreviewFailed(false);
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleLinkTypeChange = (
    e: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    setLinkType(e.target.value as LinkType);
    setLinkValue("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.image.trim()) {
      alert("A imagem do banner é obrigatória");
      return;
    }
    if (linkType !== "none" && !linkValue.trim()) {
      alert("Informe o destino do botão ou escolha 'Catálogo completo'");
      return;
    }

    onSave({
      image: formData.image.trim(),
      alt: formData.alt.trim(),
      buttonLabel: formData.buttonLabel.trim() || "Ver coleção",
      // Enviamos ambos os campos sempre: assim, trocar o tipo de destino
      // limpa o vínculo anterior no backend.
      category: linkType === "category" ? linkValue.trim() : "",
      query: linkType === "query" ? linkValue.trim() : "",
      active: formData.active,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4 overflow-y-auto">
      <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-2xl w-full max-w-lg my-8">
        <h2 className="text-2xl font-bold mb-6 text-purple-800">
          {banner ? "Editar Banner" : "Novo Banner"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* URL da imagem */}
          <div>
            <label className="block text-sm font-semibold text-stone-700 mb-2">
              Imagem do Banner (URL) *
            </label>
            <input
              type="text"
              name="image"
              value={formData.image}
              onChange={handleChange}
              placeholder="/1.jpg ou https://exemplo.com/banner.jpg"
              className="w-full px-4 py-2 border-2 border-stone-200 rounded-lg focus:outline-none focus:border-purple-500"
              required
            />
            <p className="text-xs text-stone-500 mt-1">
              Use um caminho do site (ex: <code>/1.jpg</code>) ou o link
              completo de uma imagem hospedada.
            </p>
          </div>

          {/* Pré-visualização */}
          {formData.image.trim() && (
            <div className="rounded-lg overflow-hidden border-2 border-stone-200 bg-stone-100">
              {previewFailed ? (
                <p className="text-sm text-red-600 p-4 text-center">
                  Não foi possível carregar esta imagem. Confira a URL.
                </p>
              ) : (
                <img
                  src={formData.image.trim()}
                  alt="Pré-visualização do banner"
                  className="w-full h-40 object-cover"
                  onError={() => setPreviewFailed(true)}
                />
              )}
            </div>
          )}

          {/* Texto alternativo */}
          <div>
            <label className="block text-sm font-semibold text-stone-700 mb-2">
              Descrição da Imagem
            </label>
            <input
              type="text"
              name="alt"
              value={formData.alt}
              onChange={handleChange}
              placeholder="Ex: Coleção Pokémon GG"
              className="w-full px-4 py-2 border-2 border-stone-200 rounded-lg focus:outline-none focus:border-purple-500"
            />
            <p className="text-xs text-stone-500 mt-1">
              Aparece para leitores de tela e quando a imagem não carrega.
            </p>
          </div>

          {/* Rótulo do botão */}
          <div>
            <label className="block text-sm font-semibold text-stone-700 mb-2">
              Texto do Botão
            </label>
            <input
              type="text"
              name="buttonLabel"
              value={formData.buttonLabel}
              onChange={handleChange}
              placeholder="Ver coleção"
              className="w-full px-4 py-2 border-2 border-stone-200 rounded-lg focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* Destino do botão */}
          <div>
            <label className="block text-sm font-semibold text-stone-700 mb-2">
              Destino do Botão
            </label>
            <select
              value={linkType}
              onChange={handleLinkTypeChange}
              className="w-full px-4 py-2 border-2 border-stone-200 rounded-lg focus:outline-none focus:border-purple-500"
            >
              <option value="none">Catálogo completo</option>
              <option value="category">Categoria cadastrada</option>
              <option value="query">Busca por texto</option>
            </select>

            {linkType === "category" && (
              <select
                value={linkValue}
                onChange={(e) => setLinkValue(e.target.value)}
                className="w-full mt-2 px-4 py-2 border-2 border-stone-200 rounded-lg focus:outline-none focus:border-purple-500"
              >
                <option value="">Selecione a categoria...</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.name}>
                    {category.icon} {category.name}
                  </option>
                ))}
              </select>
            )}

            {linkType === "query" && (
              <>
                <input
                  type="text"
                  value={linkValue}
                  onChange={(e) => setLinkValue(e.target.value)}
                  placeholder="Ex: Capitão América"
                  className="w-full mt-2 px-4 py-2 border-2 border-stone-200 rounded-lg focus:outline-none focus:border-purple-500"
                />
                <p className="text-xs text-stone-500 mt-1">
                  O botão abre o catálogo já filtrado por esse texto.
                </p>
              </>
            )}
          </div>

          {/* Visibilidade */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.active}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, active: e.target.checked }))
              }
              className="h-5 w-5 accent-purple-600"
            />
            <span className="text-sm font-semibold text-stone-700">
              Exibir este banner na página principal
            </span>
          </label>

          {/* Botões */}
          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-3 bg-stone-200 text-stone-700 rounded-lg font-semibold hover:bg-stone-300 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition-colors"
            >
              {banner ? "Atualizar" : "Criar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BannerForm;

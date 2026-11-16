// Componente de formulário para criar/editar banners da home (abre em modal)
import React, { useState, useEffect } from "react";
import type { Banner, BannerPayload } from "../services/bannerService";
import type { Category } from "../services/categoryService";
import { Button, Field, Modal, Segmented } from "./admin/ui";
import { IconAlert, IconImage } from "./admin/icons";

interface BannerFormProps {
  banner: Banner | null; // null = criar novo banner
  categories: Category[];
  onSave: (bannerData: BannerPayload) => void | Promise<void>;
  onCancel: () => void;
}

// Para onde o botão do banner leva. "category" usa uma categoria já
// cadastrada (seleciona a aba certa em /menu); "query" é o fallback por
// busca de texto para coleções que ainda não têm categoria própria.
type LinkType = "none" | "category" | "query";

const FORM_ID = "pp-banner-form";

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
  const [imageError, setImageError] = useState("");
  const [linkError, setLinkError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

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
    setImageError("");
    setLinkError("");
  }, [banner]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    if (name === "image") {
      setPreviewFailed(false);
      setImageError("");
    }
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleLinkTypeChange = (value: LinkType) => {
    setLinkType(value);
    setLinkValue("");
    setLinkError("");
  };

  const handleLinkValueChange = (value: string) => {
    setLinkValue(value);
    setLinkError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.image.trim()) {
      setImageError("A imagem do banner é obrigatória");
      return;
    }
    if (linkType !== "none" && !linkValue.trim()) {
      setLinkError("Informe o destino do botão ou escolha 'Catálogo completo'");
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        image: formData.image.trim(),
        alt: formData.alt.trim(),
        buttonLabel: formData.buttonLabel.trim() || "Ver coleção",
        // Enviamos ambos os campos sempre: assim, trocar o tipo de destino
        // limpa o vínculo anterior no backend.
        category: linkType === "category" ? linkValue.trim() : "",
        query: linkType === "query" ? linkValue.trim() : "",
        active: formData.active,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const imageUrl = formData.image.trim();

  return (
    <Modal
      open
      onClose={onCancel}
      locked={isSaving}
      size="lg"
      title={banner ? "Editar banner" : "Novo banner"}
      description="Banners aparecem no carrossel da página principal."
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
            {banner ? "Atualizar" : "Criar"}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-5">
        {/* Pré-visualização */}
        <div className="relative overflow-hidden rounded-xl border border-[color:var(--pp-border)] bg-[color:var(--pp-surface-2)]">
          {imageUrl && !previewFailed ? (
            <img
              src={imageUrl}
              alt="Pré-visualização do banner"
              className="aspect-[16/6] w-full object-cover"
              onError={() => setPreviewFailed(true)}
            />
          ) : (
            <div className="flex aspect-[16/6] w-full flex-col items-center justify-center gap-2 p-4 text-center">
              {previewFailed ? (
                <>
                  <IconAlert className="h-6 w-6 text-[color:var(--pp-danger)]" />
                  <p className="text-sm text-[color:var(--pp-danger)]">
                    Não foi possível carregar esta imagem. Confira a URL.
                  </p>
                </>
              ) : (
                <>
                  <IconImage className="h-6 w-6 text-[color:var(--pp-text-3)]" />
                  <p className="text-sm text-[color:var(--pp-text-3)]">
                    A pré-visualização aparece ao informar a imagem
                  </p>
                </>
              )}
            </div>
          )}
          {imageUrl && !previewFailed && (
            <span className="absolute bottom-3 left-3 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-slate-900 shadow">
              {formData.buttonLabel.trim() || "Ver coleção"}
            </span>
          )}
        </div>

        {/* URL da imagem */}
        <Field
          label="Imagem do banner (URL) *"
          htmlFor="banner-image"
          error={imageError}
          help={
            <>
              Use um caminho do site (ex: <code>/1.jpg</code>) ou o link
              completo de uma imagem hospedada.
            </>
          }
        >
          <input
            id="banner-image"
            type="text"
            name="image"
            value={formData.image}
            onChange={handleChange}
            placeholder="/1.jpg ou https://exemplo.com/banner.jpg"
            className="pp-input"
            required
            autoFocus
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Texto alternativo */}
          <Field
            label="Descrição da imagem"
            htmlFor="banner-alt"
            help="Aparece para leitores de tela e quando a imagem não carrega."
          >
            <input
              id="banner-alt"
              type="text"
              name="alt"
              value={formData.alt}
              onChange={handleChange}
              placeholder="Ex: Coleção Pokémon GG"
              className="pp-input"
            />
          </Field>

          {/* Rótulo do botão */}
          <Field label="Texto do botão" htmlFor="banner-button-label">
            <input
              id="banner-button-label"
              type="text"
              name="buttonLabel"
              value={formData.buttonLabel}
              onChange={handleChange}
              placeholder="Ver coleção"
              className="pp-input"
            />
          </Field>
        </div>

        {/* Destino do botão */}
        <Field label="Destino do botão" error={linkError}>
          <div className="max-w-full overflow-x-auto">
            <Segmented<LinkType>
              ariaLabel="Destino do botão"
              options={[
                { value: "none", label: "Catálogo completo" },
                { value: "category", label: "Categoria cadastrada" },
                { value: "query", label: "Busca por texto" },
              ]}
              value={linkType}
              onChange={handleLinkTypeChange}
            />
          </div>

          {linkType === "category" && (
            <select
              aria-label="Categoria de destino"
              value={linkValue}
              onChange={(e) => handleLinkValueChange(e.target.value)}
              className="pp-select mt-2 w-full"
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
                aria-label="Texto da busca"
                type="text"
                value={linkValue}
                onChange={(e) => handleLinkValueChange(e.target.value)}
                placeholder="Ex: Capitão América"
                className="pp-input mt-2"
              />
              {!linkError && (
                <p className="pp-help">
                  O botão abre o catálogo já filtrado por esse texto.
                </p>
              )}
            </>
          )}
        </Field>

        {/* Visibilidade */}
        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-[color:var(--pp-border)] p-3.5 transition-colors hover:bg-[color:var(--pp-surface-2)]">
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-[color:var(--pp-text)]">
              Exibir este banner na página principal
            </span>
            <span className="block text-xs text-[color:var(--pp-text-3)]">
              Desligado, o banner fica salvo mas oculto do carrossel.
            </span>
          </span>
          <span className="relative inline-flex shrink-0 items-center">
            <input
              type="checkbox"
              checked={formData.active}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, active: e.target.checked }))
              }
              className="peer sr-only"
            />
            <span className="h-6 w-11 rounded-full bg-slate-300 transition-colors peer-checked:bg-[color:var(--pp-brand)] peer-focus-visible:ring-2 peer-focus-visible:ring-[color:var(--pp-brand)] peer-focus-visible:ring-offset-2" />
            <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
          </span>
        </label>
      </form>
    </Modal>
  );
};

export default BannerForm;

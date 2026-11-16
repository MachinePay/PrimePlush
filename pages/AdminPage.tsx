// Página: /pages/AdminPage.tsx
// Produtos e estoque do painel administrativo: lista, cria, edita e remove
// produtos, movimenta estoque e mostra o histórico de movimentações.
// Comentários em português explicam cada parte do código.

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Swal from "sweetalert2";
import { getYouTubeId, getYouTubeThumbnail } from "../utils/youtube";
import { getProductMedia } from "../utils/productMedia";
import { type StockMovement } from "../utils/stockMovements";
import type { Product, ProductMedia } from "../types";
import { authenticatedFetch } from "../services/apiService";
import {
  hasTrackedStock,
  isLowStock,
  isOutOfStock,
} from "../utils/adminStatus";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  Segmented,
  Skeleton,
  SkeletonRows,
  SortHeader,
  type SortState,
  StatCard,
  type Tone,
  confirmAction,
  formatCurrency,
  formatDateTime,
  formatInteger,
  notify,
  sortRows,
} from "../components/admin/ui";
import {
  IconAlert,
  IconBox,
  IconCart,
  IconEdit,
  IconFilter,
  IconImage,
  IconMove,
  IconPlus,
  IconReceipt,
  IconRefresh,
  IconSparkles,
  IconTrash,
  IconX,
} from "../components/admin/icons";

const PRODUCTS_PAGE_SIZE = 20;
const MOVEMENTS_PAGE_SIZE = 25;

// ---------- Helpers de exibição (somente visual) ----------

const getStockMeta = (
  product: Product,
): { label: string; tone: Tone } => {
  if (!hasTrackedStock(product)) return { label: "Ilimitado", tone: "info" };
  if (isOutOfStock(product)) return { label: "Esgotado", tone: "danger" };
  if (isLowStock(product)) return { label: "Estoque baixo", tone: "warning" };
  return { label: "Em estoque", tone: "success" };
};

const needsRestock = (product: Product) =>
  isOutOfStock(product) || isLowStock(product);

const formatMoney = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? formatCurrency(n) : "-";
};

const MOVEMENT_TYPE_META: Record<string, { label: string; tone: Tone }> = {
  sale: { label: "Venda", tone: "info" },
  cancel: { label: "Cancelamento", tone: "warning" },
  return: { label: "Devolução", tone: "violet" },
};

const getMovementTypeMeta = (type?: string) =>
  (type && MOVEMENT_TYPE_META[type]) || {
    label: "Ajuste manual",
    tone: "neutral" as Tone,
  };

const ProductThumb: React.FC<{ product: Product; size?: number }> = ({
  product,
  size = 40,
}) => {
  const src = product.images?.[0] || product.imageUrl;
  const [failed, setFailed] = useState(false);
  return (
    <span
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[color:var(--pp-border)] bg-[color:var(--pp-surface-2)] text-[color:var(--pp-text-3)]"
      style={{ width: size, height: size }}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={product.name}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <IconImage className="h-4 w-4" />
      )}
    </span>
  );
};

// Título de grupo dentro dos formulários
const FormSection: React.FC<{
  title: string;
  description?: string;
  children: React.ReactNode;
}> = ({ title, description, children }) => (
  <section className="space-y-4">
    <div>
      <h3 className="text-sm font-semibold text-[color:var(--pp-text)]">
        {title}
      </h3>
      {description && (
        <p className="mt-0.5 text-xs text-[color:var(--pp-text-3)]">
          {description}
        </p>
      )}
    </div>
    {children}
  </section>
);

// Modal de movimentação de estoque para múltiplos produtos
const StockMovementModal: React.FC<{
  products: Product[];
  onClose: () => void;
  onMovement: (
    movements: { productId: string; quantity: number }[],
  ) => void | Promise<void>;
}> = ({ products, onClose, onMovement }) => {
  const [rows, setRows] = useState([
    { productId: products[0]?.id || "", quantity: 1 },
  ]);
  // Estado visual: mostra carregamento no botão enquanto envia
  const [submitting, setSubmitting] = useState(false);

  const handleRowChange = (
    idx: number,
    field: "productId" | "quantity",
    value: string | number,
  ) => {
    setRows((prev) =>
      prev.map((row, i) =>
        i === idx
          ? { ...row, [field]: field === "quantity" ? Number(value) : value }
          : row,
      ),
    );
  };

  const addRow = () =>
    setRows((prev) => [
      ...prev,
      { productId: products[0]?.id || "", quantity: 1 },
    ]);
  const removeRow = (idx: number) =>
    setRows((prev) =>
      prev.length === 1 ? prev : prev.filter((_, i) => i !== idx),
    );

  return (
    <Modal
      open
      onClose={onClose}
      locked={submitting}
      size="md"
      title="Movimentação de estoque"
      description="Adicione unidades ao estoque de um ou mais produtos."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="stock-movement-form"
            variant="success"
            icon={<IconPlus />}
            loading={submitting}
          >
            Adicionar
          </Button>
        </>
      }
    >
      <form
        id="stock-movement-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setSubmitting(true);
          try {
            await onMovement(rows.filter((r) => r.productId && r.quantity > 0));
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <div className="space-y-3">
          {rows.map((row, idx) => {
            const invalidQty = !(row.quantity > 0);
            return (
              <div
                key={idx}
                className="pp-animate-in flex items-start gap-3 rounded-xl border border-[color:var(--pp-border)] bg-[color:var(--pp-surface-2)] p-3"
              >
                <Field
                  label="Produto"
                  htmlFor={`stock-row-product-${idx}`}
                  className="min-w-0 flex-1"
                >
                  <select
                    id={`stock-row-product-${idx}`}
                    className="pp-select"
                    value={row.productId}
                    onChange={(e) =>
                      handleRowChange(idx, "productId", e.target.value)
                    }
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Qtd"
                  htmlFor={`stock-row-qty-${idx}`}
                  className="w-24 shrink-0"
                  error={invalidQty ? "Mín. 1" : undefined}
                >
                  <input
                    id={`stock-row-qty-${idx}`}
                    type="number"
                    className="pp-input pp-num"
                    value={row.quantity}
                    min={1}
                    onChange={(e) =>
                      handleRowChange(idx, "quantity", e.target.value)
                    }
                  />
                </Field>
                <Button
                  variant="ghost"
                  iconOnly
                  className="mt-6 shrink-0"
                  aria-label={`Remover linha ${idx + 1}`}
                  title="Remover linha"
                  onClick={() => removeRow(idx)}
                  disabled={rows.length === 1}
                  icon={<IconX />}
                />
              </div>
            );
          })}
        </div>
        <Button
          variant="soft"
          className="mt-3 w-full justify-center"
          icon={<IconPlus />}
          onClick={addRow}
        >
          Adicionar produto
        </Button>
        {products.length === 0 && (
          <p className="pp-help mt-3">
            Nenhum produto cadastrado ainda.
          </p>
        )}
      </form>
    </Modal>
  );
};

// --- Componente de formulário de produto (Modal) ---
// Props esperadas pelo formulário:
interface ProductFormProps {
  product: Product | null; // produto que será editado (null para novo)
  onSave: (product: Product) => void | Promise<void>; // callback ao salvar
  onCancel: () => void; // callback ao cancelar/fechar
}

const ProductForm: React.FC<ProductFormProps> = ({
  product,
  onSave,
  onCancel,
}) => {
  // Estado local do formulário. Usamos Omit para não incluir 'id' e 'imageUrl'
  // no tipo inicial, mas permitimos opcionalmente 'id' enquanto editamos.
  const [formData, setFormData] = useState<
    Omit<Product, "id"> & { id?: string }
  >({
    name: "",
    price: 0,
    priceRaw: 0,
    category: "Pelúcia",
    imageUrl: "",
    stock: 0,
    minStock: 0,
    quantidadeVenda: 1,
  });
  // Fotos e vídeos na ordem em que aparecem no carrossel do produto
  const [mediaItems, setMediaItems] = useState<ProductMedia[]>([
    { type: "image", url: "" },
  ]);
  // Estado visual: carregamento do botão salvar e erro da lista de mídia
  const [saving, setSaving] = useState(false);
  const [mediaError, setMediaError] = useState("");

  // 🆕 Estado para categorias dinâmicas
  const [categories, setCategories] = useState<Array<{ name: string }>>([]);

  // 🆕 Carrega categorias ao montar componente
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const { getCategories } = await import("../services/categoryService");
        const data = await getCategories();
        if (data.length > 0) {
          setCategories(data);
        } else {
          // Fallback caso não haja categorias
          setCategories([
            { name: "Pelúcia" },
            { name: "Bebida" },
            { name: "Doce" },
          ]);
        }
      } catch (error) {
        console.error("Erro ao carregar categorias:", error);
        // Fallback em caso de erro
        setCategories([
          { name: "Pelúcia" },
          { name: "Bebida" },
          { name: "Doce" },
        ]);
        setCategories([
          { name: "Pelúcia Ursinho" },
          { name: "Pelúcia Coelho" },
          { name: "Pelúcia Unicórnio" },
          { name: "Acessórios" },
          { name: "Colecionáveis" },
        ]);
        setCategories([
          { name: "Pelúcia" },
          { name: "Bebida" },
          { name: "Doce" },
        ]);
      }
    };
    loadCategories();
  }, []);

  // Quando o prop `product` muda (por ex. abrir para editar), preenche o formulário.
  useEffect(() => {
    if (product) {
      const existingMedia = getProductMedia(product);
      setFormData({
        ...product,
        quantidadeVenda: product.quantidadeVenda ?? 1,
      }); // preenche com dados existentes
      setMediaItems(
        existingMedia.length > 0
          ? existingMedia
          : [{ type: "image", url: "" }],
      );
    } else {
      // limpa para novo produto
      setFormData({
        name: "",
        price: 0,
        priceRaw: 0,
        category: categories.length > 0 ? categories[0].name : "Pelúcia",
        imageUrl: "",
        stock: 0,
        minStock: 0,
        quantidadeVenda: 1,
      });
      setMediaItems([{ type: "image", url: "" }]);
    }
  }, [product, categories]);

  // Atualiza campos do formulário. Convertendo price para número quando necessário.
  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value } = e.target;
    // Se for o campo 'price' ou 'stock', converte para número; caso contrário mantém string.
    setFormData((prev) => ({
      ...prev,
      [name]:
        name === "price" || name === "priceRaw"
          ? parseFloat(value)
          : name === "stock" ||
              name === "minStock" ||
              name === "quantidadeVenda"
            ? parseInt(value)
            : value,
    }));
  };

  // Ao submeter, cria um objeto Product final e chama onSave.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedMedia = mediaItems
      .map((item) => ({ ...item, url: item.url.trim() }))
      .filter((item) => item.url.length > 0);
    if (
      normalizedMedia.some(
        (item) => item.type === "video" && !getYouTubeId(item.url),
      )
    ) {
      const message =
        "Há um link de vídeo que não é do YouTube. Corrija ou remova.";
      setMediaError(message);
      notify(message, "error");
      return;
    }
    setMediaError("");

    const normalizedImages = normalizedMedia
      .filter((item) => item.type === "image")
      .map((item) => item.url);
    const normalizedVideos = normalizedMedia
      .filter((item) => item.type === "video")
      .map((item) => item.url);
    const primaryImage =
      normalizedImages[0] ||
      formData.imageUrl ||
      "https://picsum.photos/400/300";

    const finalProduct: Product = {
      ...formData,
      id: formData.id || "",
      imageUrl: primaryImage,
      images: normalizedImages.length > 0 ? normalizedImages : [primaryImage],
      videos: normalizedVideos,
      media: normalizedMedia,
    };
    setSaving(true);
    try {
      await onSave(finalProduct); // informa o componente pai sobre o produto salvo
    } finally {
      setSaving(false);
    }
  };

  const updateMediaAt = (index: number, url: string) => {
    setMediaItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, url } : item)),
    );
  };

  const addMediaField = (type: ProductMedia["type"]) => {
    setMediaItems((prev) => [...prev, { type, url: "" }]);
  };

  const removeMediaField = (index: number) => {
    setMediaItems((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return next.length > 0 ? next : [{ type: "image", url: "" }];
    });
  };

  // Troca o item de posição com o vizinho (direction -1 sobe, +1 desce)
  const moveMediaField = (index: number, direction: -1 | 1) => {
    setMediaItems((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const hasInvalidVideo = mediaItems.some(
    (item) =>
      item.type === "video" &&
      item.url.trim() !== "" &&
      !getYouTubeId(item.url),
  );

  const priceInvalid =
    formData.price !== undefined &&
    formData.price !== null &&
    Number(formData.price) < 0;
  const priceRawInvalid =
    formData.priceRaw !== undefined &&
    formData.priceRaw !== null &&
    Number(formData.priceRaw) < 0;

  return (
    <Modal
      open
      onClose={onCancel}
      locked={saving}
      size="lg"
      title={product ? "Editar produto" : "Adicionar produto"}
      description={
        product
          ? `Atualize as informações de “${product.name}”.`
          : "Cadastre um novo produto no catálogo."
      }
      footer={
        <>
          {/* Botão cancelar fecha o modal sem salvar */}
          <Button variant="secondary" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          {/* Botão salvar submete o formulário */}
          <Button
            type="submit"
            form="product-form"
            variant="primary"
            loading={saving}
          >
            Salvar
          </Button>
        </>
      }
    >
      <form id="product-form" onSubmit={handleSubmit} className="space-y-8">
        <FormSection title="Informações">
          <Field label="Nome" htmlFor="name">
            <input
              type="text"
              name="name"
              id="name"
              value={formData.name}
              onChange={handleChange}
              required
              className="pp-input"
              placeholder="Ex.: Urso de pelúcia 40 cm"
            />
          </Field>
          <Field label="Categoria" htmlFor="category">
            <select
              name="category"
              id="category"
              value={formData.category}
              onChange={handleChange}
              className="pp-select"
            >
              {categories.length > 0 ? (
                categories.map((cat) => (
                  <option key={cat.name} value={cat.name}>
                    {cat.name}
                  </option>
                ))
              ) : (
                <>
                  <option>Pelúcia Ursinho</option>
                  <option>Pelúcia Coelho</option>
                  <option>Pelúcia Unicórnio</option>
                  <option>Acessórios</option>
                  <option>Colecionáveis</option>
                </>
              )}
            </select>
          </Field>
        </FormSection>

        <FormSection title="Preço">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Preço de venda (R$)"
              htmlFor="price"
              error={priceInvalid ? "O preço não pode ser negativo." : undefined}
            >
              <input
                type="number"
                name="price"
                id="price"
                value={formData.price}
                onChange={handleChange}
                required
                step="0.01"
                className="pp-input pp-num"
              />
            </Field>
            <Field
              label="Preço bruto (R$)"
              htmlFor="priceRaw"
              error={
                priceRawInvalid ? "O preço não pode ser negativo." : undefined
              }
            >
              <input
                type="number"
                name="priceRaw"
                id="priceRaw"
                value={formData.priceRaw}
                onChange={handleChange}
                required
                step="0.01"
                className="pp-input pp-num"
              />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Estoque">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field
              label="Estoque"
              htmlFor="stock"
              help="Quantidade disponível em estoque"
            >
              <input
                type="number"
                name="stock"
                id="stock"
                value={formData.stock || 0}
                onChange={handleChange}
                required
                min="0"
                className="pp-input pp-num"
              />
            </Field>
            <Field
              label="Estoque mínimo"
              htmlFor="minStock"
              help="Alerta de estoque baixo quando atingir esse valor"
            >
              <input
                type="number"
                name="minStock"
                id="minStock"
                value={formData.minStock}
                onChange={handleChange}
                required
                min="0"
                className="pp-input pp-num"
              />
            </Field>
            <Field
              label="Quantidade de venda"
              htmlFor="quantidadeVenda"
              help="Exemplo: venda de 30 em 30, 15 em 15, etc. O cliente só pode comprar múltiplos dessa quantidade."
            >
              <input
                type="number"
                name="quantidadeVenda"
                id="quantidadeVenda"
                value={formData.quantidadeVenda || 1}
                onChange={handleChange}
                required
                min="1"
                className="pp-input pp-num"
              />
            </Field>
          </div>
        </FormSection>

        <FormSection
          title="Fotos e vídeos"
          description="Use ▲ ▼ para mudar a ordem em que aparecem no carrossel. A primeira foto da lista é a capa do produto."
        >
          <ol className="space-y-2">
            {mediaItems.map((item, index) => {
              const isVideo = item.type === "video";
              const videoId = isVideo ? getYouTubeId(item.url) : null;
              const isInvalid = isVideo && item.url.trim() !== "" && !videoId;
              const preview = isVideo
                ? videoId
                  ? getYouTubeThumbnail(videoId)
                  : null
                : item.url.trim() || null;
              return (
                <li
                  key={`media-${index}`}
                  className={`rounded-xl border p-3 transition-colors ${
                    isInvalid
                      ? "border-[color:var(--pp-danger)] bg-[color:var(--pp-danger-soft)]"
                      : "border-[color:var(--pp-border)] bg-[color:var(--pp-surface)]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="pp-num w-5 shrink-0 text-center text-sm font-semibold text-[color:var(--pp-text-3)]">
                      {index + 1}
                    </span>
                    <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-[color:var(--pp-surface-2)] text-[color:var(--pp-text-3)]">
                      {preview ? (
                        <img
                          src={preview}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center">
                          <IconImage className="h-4 w-4" />
                        </span>
                      )}
                      <span
                        className={`absolute bottom-0 left-0 rounded-tr-md px-1 text-[10px] font-bold text-white ${
                          isVideo ? "bg-red-600" : "bg-blue-600"
                        }`}
                      >
                        {isVideo ? "▶ Vídeo" : "Foto"}
                      </span>
                    </div>
                    <input
                      type="url"
                      id={`mediaUrl-${index}`}
                      aria-label={
                        isVideo
                          ? `Link do vídeo do YouTube ${index + 1}`
                          : `URL da foto ${index + 1}`
                      }
                      aria-invalid={isInvalid || undefined}
                      value={item.url}
                      onChange={(e) => updateMediaAt(index, e.target.value)}
                      placeholder={
                        isVideo
                          ? "https://www.youtube.com/watch?v=..."
                          : "https://exemplo.com/imagem.jpg"
                      }
                      className="pp-input min-w-0 flex-1"
                      style={
                        isInvalid
                          ? { borderColor: "var(--pp-danger)" }
                          : undefined
                      }
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      {isInvalid && (
                        <p className="pp-error mt-0">
                          Link do YouTube não reconhecido.
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        iconOnly
                        onClick={() => moveMediaField(index, -1)}
                        disabled={index === 0}
                        aria-label="Subir no carrossel"
                        title="Subir"
                      >
                        ▲
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        iconOnly
                        onClick={() => moveMediaField(index, 1)}
                        disabled={index === mediaItems.length - 1}
                        aria-label="Descer no carrossel"
                        title="Descer"
                      >
                        ▼
                      </Button>
                      {(mediaItems.length > 1 || item.url !== "") && (
                        <Button
                          size="sm"
                          variant="danger-soft"
                          onClick={() => removeMediaField(index)}
                          aria-label={`Remover item ${index + 1} do carrossel`}
                        >
                          Remover
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          {mediaError && hasInvalidVideo && (
            <p className="pp-error">{mediaError}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="soft"
              icon={<IconPlus />}
              onClick={() => addMediaField("image")}
            >
              Adicionar foto
            </Button>
            <Button
              size="sm"
              variant="danger-soft"
              icon={<IconPlus />}
              onClick={() => addMediaField("video")}
            >
              Adicionar vídeo do YouTube
            </Button>
          </div>
          <p className="pp-help">
            Vídeo: cole o link do YouTube (inclusive Shorts). No catálogo ele
            toca dentro do site.
          </p>
        </FormSection>
      </form>
    </Modal>
  );
};

// --- Componente principal da página administrativa ---
type StockFilter = "todos" | "baixo" | "esgotado" | "inativos";
type ProductSortKey = "name" | "category" | "price" | "stock";

const stockFilterFromParam = (value: string | null): StockFilter =>
  value === "estoque-baixo"
    ? "baixo"
    : value === "esgotado"
      ? "esgotado"
      : value === "inativos"
        ? "inativos"
        : "todos";

const AdminPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Estado que contém a lista de produtos exibida na tabela
  const [menu, setMenu] = useState<Product[]>([]);
  // Modal de movimentação de estoque
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  // Histórico de movimentações (backend)
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  // Filtro de datas para histórico
  const [filterStart, setFilterStart] = useState("");
  const [filterEnd, setFilterEnd] = useState("");
  const [filterProductId, setFilterProductId] = useState("");

  // --- Estado apenas de visualização (busca, filtros, ordem, páginas) ---
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [movementsLoading, setMovementsLoading] = useState(true);
  const [search, setSearch] = useState(() => searchParams.get("q") || "");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>(() =>
    stockFilterFromParam(searchParams.get("filtro")),
  );
  const [productSort, setProductSort] =
    useState<SortState<ProductSortKey> | null>(null);
  const [productPage, setProductPage] = useState(1);
  const [movementPage, setMovementPage] = useState(1);
  const productListRef = useRef<HTMLDivElement>(null);

  // Busca histórico do backend
  const loadStockMovements = async (
    start?: string,
    end?: string,
    productId?: string,
  ) => {
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
    try {
      let url = `${API_URL}/api/admin/stock-movements`;
      const params = new URLSearchParams();
      if (start) params.set("start", start);
      if (end) params.set("end", end);
      if (productId) params.set("productId", productId);
      if (params.toString()) url += `?${params.toString()}`;
      const res = await authenticatedFetch(url);
      if (res.ok) {
        const data = await res.json();
        // Normaliza para o formato StockMovement esperado pelo template
        setStockMovements(
          data.map(
            (m: {
              id: number;
              productId: string;
              productName: string;
              quantity: number;
              type: string;
              orderId?: string;
              stock_before?: number | null;
              stock_after?: number | null;
              created_at: string;
            }) => ({
              id: String(m.id),
              productId: m.productId,
              productName: m.productName,
              quantity: m.quantity,
              date: m.created_at,
              type: m.type,
              orderId: m.orderId,
              stockBefore: m.stock_before ?? null,
              stockAfter: m.stock_after ?? null,
            }),
          ),
        );
      }
    } catch (e) {
      console.error("Erro ao carregar movimentações de estoque:", e);
    }
  };

  // Mostra o carregamento da tabela de histórico enquanto busca (só visual)
  const loadStockMovementsWithLoading = async (
    start?: string,
    end?: string,
    productId?: string,
  ) => {
    setMovementsLoading(true);
    try {
      await loadStockMovements(start, end, productId);
    } finally {
      setMovementsLoading(false);
      setMovementPage(1);
    }
  };

  // Atualiza histórico ao abrir página ou movimentar
  useEffect(() => {
    loadStockMovementsWithLoading();
  }, [isStockModalOpen]);

  // Lida com movimentação de estoque
  const handleStockMovement = async (
    movements: { productId: string; quantity: number }[],
  ) => {
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

    try {
      for (const move of movements) {
        const product = menu.find((p) => p.id === move.productId);
        if (!product) continue;

        // Envia só a diferença: o backend soma ao estoque atual do banco
        const resp = await authenticatedFetch(
          `${API_URL}/api/products/${move.productId}`,
          {
            method: "PUT",
            body: JSON.stringify({ stockDelta: move.quantity }),
          },
        );
        if (!resp.ok) throw new Error("Falha ao movimentar estoque");
      }
      await loadProducts();
      await loadStockMovements();
      setIsStockModalOpen(false);
      notify("Estoque atualizado");
    } catch (err) {
      notify("Erro ao processar movimentações", "error");
    }
  };
  // Controla se o modal de formulário está aberto
  const [isFormOpen, setIsFormOpen] = useState(false);
  // Produto atual sendo editado (ou null para criar novo)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  // Estados para análise de IA
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [isReleasingReservedStock, setIsReleasingReservedStock] =
    useState(false);
  // Estados para estatísticas
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalOrders: 0,
    lowStock: 0,
    outOfStock: 0,
  });

  // Carrega os dados iniciais do backend

  useEffect(() => {
    loadProducts().finally(() => setProductsLoaded(true));
    loadOrdersCount();
  }, []);

  // Busca o total de pedidos dos últimos 30 dias
  const loadOrdersCount = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
      const res = await fetch(`${API_URL}/api/orders/last30days-count`);
      if (!res.ok) throw new Error("Erro ao buscar total de pedidos");
      const data = await res.json();
      setStats((prev) => ({ ...prev, totalOrders: data.totalOrders || 0 }));
    } catch (err) {
      console.error("Erro ao buscar total de pedidos:", err);
    }
  };

  const loadProducts = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
      const res = await authenticatedFetch(`${API_URL}/api/products`);
      if (!res.ok) {
        throw new Error(`Erro ao carregar produtos: ${res.status}`);
      }
      const data = await res.json();
      setMenu(data);

      // Calcula estatísticas
      // Mantém o total de pedidos já carregado (loadOrdersCount / análise IA)
      setStats((prev) => ({
        ...prev,
        totalProducts: data.length,
        lowStock: data.filter(
          (p: Product) => p.stock !== null && p.stock > 0 && p.stock <= 5,
        ).length,
        outOfStock: data.filter((p: Product) => p.stock === 0).length,
      }));
    } catch (err) {
      console.error("Erro ao carregar cardápio:", err);
    }
  };

  // Gerar análise de IA
  const handleGenerateAnalysis = async () => {
    setIsLoadingAnalysis(true);
    setShowAnalysis(true);
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

    try {
      const response = await fetch(`${API_URL}/api/ai/inventory-analysis`);
      const data = await response.json();

      if (data.success) {
        setAiAnalysis(data.analysis);
        // Atualiza estatísticas com dados do backend
        if (data.summary) {
          setStats((prev) => ({
            ...prev,
            totalOrders: data.summary.totalOrders || 0,
          }));
        }
      } else {
        setAiAnalysis(
          "❌ Erro ao gerar análise: " + (data.error || "Erro desconhecido"),
        );
      }
    } catch (error) {
      console.error("Erro ao gerar análise:", error);
      setAiAnalysis(
        "❌ Erro ao comunicar com o servidor. Verifique se a API está disponível.",
      );
    } finally {
      setIsLoadingAnalysis(false);
    }
  };

  const handleReleaseReservedStock = async () => {
    const confirmed = await confirmAction({
      title: "Liberar todo estoque reservado?",
      text: "Isso zera apenas reservas de carrinho/pagamento pendente. Pedidos ja feitos e estoque real nao serao apagados.",
      confirmText: "Continuar",
      danger: true,
    });

    if (!confirmed) return;

    // Confirmação final digitada (mesma regra do prompt anterior)
    const typed = await Swal.fire({
      title: "Confirmacao final",
      text: 'Digite "LIBERAR" para zerar todas as reservas de estoque.',
      input: "text",
      inputPlaceholder: "LIBERAR",
      showCancelButton: true,
      confirmButtonText: "Liberar reservas",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      reverseButtons: true,
      focusCancel: false,
    });
    const typedConfirmation = typed.isConfirmed ? typed.value : null;

    if (typedConfirmation !== "LIBERAR") {
      notify("Operacao cancelada. Nenhuma reserva foi alterada.", "info");
      return;
    }

    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
    setIsReleasingReservedStock(true);

    try {
      const response = await authenticatedFetch(
        `${API_URL}/api/admin/release-reserved-stock`,
        { method: "POST" },
      );
      const data = await response.json();

      if (!response.ok) {
        notify(data.error || "Erro ao liberar estoque reservado", "error");
        return;
      }

      Swal.fire({
        icon: "success",
        title: "Estoque reservado liberado!",
        html: `Produtos afetados: <b>${Number(data.affectedProducts) || 0}</b><br/>Unidades liberadas: <b>${Number(data.releasedUnits) || 0}</b>`,
        confirmButtonColor: "#2563eb",
      });
      await loadProducts();
      await loadStockMovements();
    } catch (error) {
      console.error("Erro ao liberar estoque reservado:", error);
      notify("Erro ao liberar estoque reservado", "error");
    } finally {
      setIsReleasingReservedStock(false);
    }
  };

  // Trata salvar (tanto criação quanto edição)
  const handleSaveProduct = async (product: Product) => {
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

    try {
      if (editingProduct) {
        // PUT para edição. O estoque vai como diferença do valor de quando o
        // formulário abriu: mandar o número absoluto apagaria as vendas feitas
        // enquanto o formulário estava aberto.
        const { stock, ...rest } = product;
        const before = editingProduct.stock;
        const body: Record<string, unknown> = { ...rest };
        if (stock === null || stock === undefined || before === null || before === undefined) {
          if (stock !== before) body.stock = stock ?? null;
        } else if (Number(stock) !== Number(before)) {
          body.stockDelta = Number(stock) - Number(before);
        }
        const response = await authenticatedFetch(
          `${API_URL}/api/products/${product.id}`,
          {
            method: "PUT",
            body: JSON.stringify(body),
          },
        );

        if (response.ok) {
          console.log("Produto atualizado");
          await loadProducts(); // Recarrega lista
          notify("Produto atualizado");
        } else {
          notify("Erro ao atualizar produto", "error");
          return;
        }
      } else {
        // POST para criação
        const response = await authenticatedFetch(`${API_URL}/api/products`, {
          method: "POST",
          body: JSON.stringify(product),
        });

        if (response.ok) {
          console.log("Produto criado");
          await loadProducts(); // Recarrega lista
          notify("Produto criado");
        } else {
          notify("Erro ao criar produto", "error");
          return;
        }
      }

      // Fecha o modal e reseta o estado de edição
      setIsFormOpen(false);
      setEditingProduct(null);
    } catch (error) {
      console.error("Erro ao salvar produto:", error);
      notify("Erro ao salvar produto", "error");
    }
  };

  // Remove um produto pela id via API
  const handleDeleteProduct = async (productId: string) => {
    const productName = menu.find((p) => p.id === productId)?.name;
    // Confirmação simples antes de remover
    if (
      await confirmAction({
        title: "Tem certeza que deseja remover este produto?",
        text: productName
          ? `“${productName}” será removido do catálogo.`
          : undefined,
        confirmText: "Remover",
        danger: true,
      })
    ) {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

      try {
        const response = await authenticatedFetch(
          `${API_URL}/api/products/${productId}`,
          {
            method: "DELETE",
          },
        );

        if (response.ok) {
          console.log("Produto deletado:", productId);
          await loadProducts(); // Recarrega lista
          notify("Produto removido");
        } else {
          notify("Erro ao deletar produto", "error");
        }
      } catch (error) {
        console.error("Erro ao deletar produto:", error);
        notify("Erro ao deletar produto", "error");
      }
    }
  };

  // Ativa/desativa o produto (mesma chamada que ficava inline na tabela)
  const handleToggleActive = async (product: Product) => {
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
    const resp = await authenticatedFetch(
      `${API_URL}/api/products/${product.id}`,
      {
        method: "PUT",
        body: JSON.stringify({ active: !product.active }),
      },
    );
    if (resp.ok) {
      await loadProducts();
    } else {
      notify("Erro ao atualizar status do produto", "error");
    }
  };

  // Deleta movimentação e reverte estoque (apenas ajustes manuais)
  const handleDeleteMovement = async (movement: StockMovement) => {
    const movType = (movement as StockMovement & { type?: string }).type;
    if (movType === "sale") {
      notify(
        "Não é possível excluir movimentações de venda. Cancele o pedido correspondente.",
        "warning",
      );
      return;
    }
    if (
      !(await confirmAction({
        title: "Deseja remover esta movimentação e reverter o estoque?",
        confirmText: "Desfazer",
        danger: true,
      }))
    )
      return;
    const product = menu.find((p) => p.id === movement.productId);
    if (!product) {
      notify("Produto não encontrado.", "error");
      return;
    }
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
    const response = await authenticatedFetch(
      `${API_URL}/api/products/${movement.productId}`,
      {
        method: "PUT",
        body: JSON.stringify({ stockDelta: -movement.quantity }),
      },
    );
    if (response.ok) {
      await loadProducts();
      await loadStockMovements();
      notify("Movimentação desfeita");
    } else {
      notify("Erro ao atualizar estoque", "error");
    }
  };

  const openNewProduct = () => {
    setEditingProduct(null);
    setIsFormOpen(true);
  };

  const openEditProduct = (product: Product) => {
    setEditingProduct(product);
    setIsFormOpen(true);
  };

  // --- Dados derivados apenas para exibição ---

  // Mantém busca/filtro sincronizados com a URL (?q= e ?filtro=)
  useEffect(() => {
    const q = searchParams.get("q");
    if (q !== null) setSearch(q);
    const filtro = searchParams.get("filtro");
    if (filtro !== null) setStockFilter(stockFilterFromParam(filtro));
  }, [searchParams]);

  useEffect(() => {
    setProductPage(1);
  }, [search, categoryFilter, stockFilter, productSort]);

  const stockCounts = useMemo(
    () => ({
      low: menu.filter(isLowStock).length,
      out: menu.filter(isOutOfStock).length,
      inactive: menu.filter((p) => p.active === false).length,
    }),
    [menu],
  );

  const categoryOptions = useMemo(
    () =>
      Array.from(
        new Set(menu.map((p) => p.category).filter(Boolean) as string[]),
      ).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [menu],
  );

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = menu.filter((p) => {
      if (term && !String(p.name || "").toLowerCase().includes(term))
        return false;
      if (categoryFilter && p.category !== categoryFilter) return false;
      if (stockFilter === "baixo" && !isLowStock(p)) return false;
      if (stockFilter === "esgotado" && !isOutOfStock(p)) return false;
      if (stockFilter === "inativos" && p.active !== false) return false;
      return true;
    });
    return sortRows<Product, ProductSortKey>(list, productSort, (p, key) => {
      switch (key) {
        case "name":
          return p.name;
        case "category":
          return p.category;
        case "price":
          return Number(p.price) || 0;
        case "stock":
          return hasTrackedStock(p) ? Number(p.stock) : null;
      }
    });
  }, [menu, search, categoryFilter, stockFilter, productSort]);

  // Volta para a última página válida quando a lista encolhe
  useEffect(() => {
    const max = Math.max(
      1,
      Math.ceil(filteredProducts.length / PRODUCTS_PAGE_SIZE),
    );
    setProductPage((p) => Math.min(p, max));
  }, [filteredProducts.length]);

  useEffect(() => {
    const max = Math.max(
      1,
      Math.ceil(stockMovements.length / MOVEMENTS_PAGE_SIZE),
    );
    setMovementPage((p) => Math.min(p, max));
  }, [stockMovements.length]);

  const productPageRows = filteredProducts.slice(
    (productPage - 1) * PRODUCTS_PAGE_SIZE,
    productPage * PRODUCTS_PAGE_SIZE,
  );

  const movementPageRows = stockMovements.slice(
    (movementPage - 1) * MOVEMENTS_PAGE_SIZE,
    movementPage * MOVEMENTS_PAGE_SIZE,
  );

  const productsSortedByName = useMemo(
    () => [...menu].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [menu],
  );

  const hasProductFilters =
    search.trim() !== "" || categoryFilter !== "" || stockFilter !== "todos";

  const clearProductFilters = () => {
    setSearch("");
    setCategoryFilter("");
    setStockFilter("todos");
  };

  const focusStockFilter = (filter: StockFilter) => {
    setStockFilter(filter);
    productListRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const restockCount = stockCounts.low + stockCounts.out;

  // Ações de cada produto (mesmas no desktop e no celular)
  const renderProductActions = (product: Product) => (
    <div className="flex items-center justify-end gap-1">
      <Button
        size="sm"
        variant="ghost"
        iconOnly
        icon={<IconEdit />}
        aria-label={`Editar ${product.name}`}
        title="Editar"
        onClick={() => openEditProduct(product)}
      />
      <Button
        size="sm"
        variant={product.active ? "ghost" : "soft"}
        onClick={() => handleToggleActive(product)}
        aria-label={`${product.active ? "Desativar" : "Ativar"} ${product.name}`}
      >
        {product.active ? "Desativar" : "Ativar"}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        iconOnly
        icon={<IconTrash />}
        className="hover:!text-[color:var(--pp-danger)]"
        aria-label={`Remover ${product.name}`}
        title="Remover"
        onClick={() => handleDeleteProduct(product.id)}
      />
    </div>
  );

  const renderStockCell = (product: Product) => {
    const meta = getStockMeta(product);
    return (
      <div className="flex flex-col items-start gap-1">
        <Badge tone={meta.tone} dot>
          {meta.label}
        </Badge>
        {hasTrackedStock(product) && (
          <span className="pp-num text-xs text-[color:var(--pp-text-3)]">
            {formatInteger(Number(product.stock) || 0)} un.
            {Number(product.minStock) > 0 && (
              <> · mín. {formatInteger(Number(product.minStock))}</>
            )}
          </span>
        )}
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title="Produtos e estoque"
        description="Catálogo, níveis de estoque e histórico de movimentações."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<IconCart />}
              onClick={() => navigate("/menu")}
            >
              Nova venda
            </Button>
            <Button
              variant="secondary"
              icon={<IconMove />}
              onClick={() => setIsStockModalOpen(true)}
            >
              Movimentação estoque
            </Button>
            <Button
              variant="secondary"
              icon={<IconRefresh />}
              onClick={handleReleaseReservedStock}
              loading={isReleasingReservedStock}
            >
              {isReleasingReservedStock ? "Liberando..." : "Liberar reservas"}
            </Button>
            <Button
              variant="soft"
              icon={<IconSparkles />}
              onClick={handleGenerateAnalysis}
              loading={isLoadingAnalysis}
            >
              {isLoadingAnalysis ? "Analisando..." : "Análise com IA"}
            </Button>
            <Button variant="primary" icon={<IconPlus />} onClick={openNewProduct}>
              Novo produto
            </Button>
          </>
        }
      />

      {/* Cards de Estatísticas */}
      <div className="pp-stagger mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Total de produtos"
          value={stats.totalProducts}
          icon={<IconBox />}
          tone="brand"
          hint={
            stockCounts.inactive > 0
              ? `${formatInteger(stockCounts.inactive)} inativo(s)`
              : undefined
          }
          loading={!productsLoaded}
        />
        <StatCard
          label="Pedidos (30 dias)"
          value={stats.totalOrders}
          icon={<IconReceipt />}
          tone="success"
        />
        <StatCard
          label="Estoque baixo"
          value={stockCounts.low}
          icon={<IconAlert />}
          tone="warning"
          hint="Ver produtos"
          loading={!productsLoaded}
          onClick={() => focusStockFilter("baixo")}
        />
        <StatCard
          label="Esgotados"
          value={stockCounts.out}
          icon={<IconBox />}
          tone="danger"
          hint="Ver produtos"
          loading={!productsLoaded}
          onClick={() => focusStockFilter("esgotado")}
        />
      </div>

      {/* Área de Análise da IA */}
      {showAnalysis && (
        <Card
          className="pp-animate-in mb-6"
          title={
            <span className="flex items-center gap-2">
              <span className="pp-stat-icon pp-tone-violet !h-7 !w-7">
                <IconSparkles className="h-4 w-4" />
              </span>
              Análise inteligente de estoque
            </span>
          }
          subtitle="Gerada por IA a partir das vendas e do estoque atual."
          actions={
            <>
              <Button
                size="sm"
                variant="ghost"
                icon={<IconRefresh />}
                onClick={handleGenerateAnalysis}
                loading={isLoadingAnalysis}
              >
                Gerar novamente
              </Button>
              <Button
                size="sm"
                variant="ghost"
                iconOnly
                icon={<IconX />}
                aria-label="Fechar análise"
                onClick={() => setShowAnalysis(false)}
              />
            </>
          }
        >
          {isLoadingAnalysis ? (
            <div className="space-y-3" aria-busy="true" aria-live="polite">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-[color:var(--pp-text-2)]">
              {aiAnalysis}
            </pre>
          )}
        </Card>
      )}

      {/* Modal de movimentação de estoque */}
      {isStockModalOpen && (
        <StockMovementModal
          products={menu}
          onClose={() => setIsStockModalOpen(false)}
          onMovement={handleStockMovement}
        />
      )}

      {/* Renderiza o formulário/modal condicionalmente */}
      {isFormOpen && (
        <ProductForm
          product={editingProduct}
          onSave={handleSaveProduct}
          onCancel={() => {
            setIsFormOpen(false);
            setEditingProduct(null);
          }}
        />
      )}

      {/* Seção de Gerenciamento de Produtos */}
      <div ref={productListRef} className="scroll-mt-20">
        <Card
          flush
          className="mb-6"
          title="Produtos"
          subtitle={
            productsLoaded
              ? `${formatInteger(filteredProducts.length)} de ${formatInteger(menu.length)} produto(s)`
              : "Carregando..."
          }
          actions={
            <Button
              size="sm"
              variant="ghost"
              icon={<IconRefresh />}
              onClick={() => loadProducts()}
            >
              <span className="hidden sm:inline">Atualizar</span>
            </Button>
          }
        >
          {/* Barra de filtros */}
          <div className="flex flex-col gap-3 border-b border-[color:var(--pp-border)] px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Buscar produto pelo nome"
                className="w-full sm:w-72"
              />
              <select
                className="pp-select w-full sm:w-52"
                aria-label="Filtrar por categoria"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="">Todas as categorias</option>
                {categoryOptions.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div className="-mx-1 overflow-x-auto px-1">
              <Segmented<StockFilter>
                ariaLabel="Filtrar por estoque"
                value={stockFilter}
                onChange={setStockFilter}
                options={[
                  { value: "todos", label: "Todos" },
                  {
                    value: "baixo",
                    label: `Estoque baixo${stockCounts.low ? ` (${stockCounts.low})` : ""}`,
                  },
                  {
                    value: "esgotado",
                    label: `Esgotado${stockCounts.out ? ` (${stockCounts.out})` : ""}`,
                  },
                  {
                    value: "inativos",
                    label: `Inativos${stockCounts.inactive ? ` (${stockCounts.inactive})` : ""}`,
                  },
                ]}
              />
            </div>
          </div>

          {/* Aviso de reposição */}
          {productsLoaded && restockCount > 0 && stockFilter === "todos" && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--pp-border)] bg-[color:var(--pp-warning-soft)] px-4 py-2.5 text-sm">
              <span className="flex items-center gap-2 text-[color:var(--pp-warning)]">
                <IconAlert className="h-4 w-4 shrink-0" />
                <span>
                  <strong>{formatInteger(restockCount)}</strong> produto(s)
                  precisam de reposição
                </span>
              </span>
              <div className="flex gap-1">
                {stockCounts.low > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setStockFilter("baixo")}
                  >
                    Ver estoque baixo
                  </Button>
                )}
                {stockCounts.out > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setStockFilter("esgotado")}
                  >
                    Ver esgotados
                  </Button>
                )}
              </div>
            </div>
          )}

          {!productsLoaded ? (
            <SkeletonRows rows={6} cols={5} />
          ) : filteredProducts.length === 0 ? (
            <EmptyState
              icon={<IconBox />}
              title={
                menu.length === 0
                  ? "Nenhum produto cadastrado"
                  : "Nenhum produto encontrado"
              }
              description={
                menu.length === 0
                  ? "Cadastre o primeiro produto para começar a vender."
                  : search
                    ? `Nada encontrado para “${search}” com os filtros atuais.`
                    : "Nenhum produto corresponde aos filtros selecionados."
              }
              action={
                menu.length === 0 ? (
                  <Button
                    variant="primary"
                    icon={<IconPlus />}
                    onClick={openNewProduct}
                  >
                    Novo produto
                  </Button>
                ) : hasProductFilters ? (
                  <Button icon={<IconFilter />} onClick={clearProductFilters}>
                    Limpar filtros
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              {/* Tabela (tablet e desktop) */}
              <div className="pp-table-wrap hidden md:block">
                <table className="pp-table">
                  <thead>
                    <tr>
                      <SortHeader
                        label="Produto"
                        sortKey="name"
                        sort={productSort}
                        onSort={setProductSort}
                      />
                      <SortHeader
                        label="Categoria"
                        sortKey="category"
                        sort={productSort}
                        onSort={setProductSort}
                      />
                      <SortHeader
                        label="Preço"
                        sortKey="price"
                        sort={productSort}
                        onSort={setProductSort}
                        align="right"
                      />
                      <SortHeader
                        label="Estoque"
                        sortKey="stock"
                        sort={productSort}
                        onSort={setProductSort}
                      />
                      <th>Status</th>
                      <th style={{ textAlign: "right" }}>
                        <span className="sr-only">Ações</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {productPageRows.map((product) => {
                      const restock = needsRestock(product);
                      return (
                        <tr
                          key={product.id}
                          style={
                            restock
                              ? {
                                  boxShadow: `inset 3px 0 0 var(${
                                    isOutOfStock(product)
                                      ? "--pp-danger"
                                      : "--pp-warning"
                                  })`,
                                }
                              : undefined
                          }
                          className={
                            product.active === false ? "opacity-60" : ""
                          }
                        >
                          <td>
                            <div className="flex items-center gap-3">
                              <ProductThumb product={product} />
                              <div className="min-w-0">
                                <button
                                  type="button"
                                  onClick={() => openEditProduct(product)}
                                  className="block max-w-[260px] truncate text-left font-medium text-[color:var(--pp-text)] hover:text-[color:var(--pp-brand)]"
                                  title={product.name}
                                >
                                  {product.name}
                                </button>
                                {Number(product.quantidadeVenda) > 1 && (
                                  <div className="text-xs text-[color:var(--pp-text-3)]">
                                    Vendido de {product.quantidadeVenda} em{" "}
                                    {product.quantidadeVenda}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="text-sm text-[color:var(--pp-text-2)]">
                            {product.category || "-"}
                          </td>
                          <td className="text-right">
                            <div className="pp-num font-medium">
                              {formatMoney(product.price)}
                            </div>
                            <div className="pp-num text-xs text-[color:var(--pp-text-3)]">
                              Bruto: {formatMoney(product.priceRaw)}
                            </div>
                          </td>
                          <td>{renderStockCell(product)}</td>
                          <td>
                            {product.active === false ? (
                              <Badge tone="neutral">Inativo</Badge>
                            ) : (
                              <Badge tone="success">Ativo</Badge>
                            )}
                          </td>
                          <td>{renderProductActions(product)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Cards (celular) */}
              <ul className="divide-y divide-[color:var(--pp-border)] md:hidden">
                {productPageRows.map((product) => {
                  const restock = needsRestock(product);
                  return (
                    <li
                      key={product.id}
                      className={`px-4 py-3 ${product.active === false ? "opacity-60" : ""}`}
                      style={
                        restock
                          ? {
                              boxShadow: `inset 3px 0 0 var(${
                                isOutOfStock(product)
                                  ? "--pp-danger"
                                  : "--pp-warning"
                              })`,
                            }
                          : undefined
                      }
                    >
                      <div className="flex items-start gap-3">
                        <ProductThumb product={product} size={52} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => openEditProduct(product)}
                              className="min-w-0 truncate text-left font-medium text-[color:var(--pp-text)]"
                            >
                              {product.name}
                            </button>
                            <span className="pp-num shrink-0 font-semibold">
                              {formatMoney(product.price)}
                            </span>
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-[color:var(--pp-text-3)]">
                            <span>{product.category || "-"}</span>
                            <span className="pp-num">
                              Bruto: {formatMoney(product.priceRaw)}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <Badge tone={getStockMeta(product).tone} dot>
                              {getStockMeta(product).label}
                            </Badge>
                            {hasTrackedStock(product) && (
                              <span className="pp-num text-xs text-[color:var(--pp-text-2)]">
                                {formatInteger(Number(product.stock) || 0)} un.
                              </span>
                            )}
                            {product.active === false && (
                              <Badge tone="neutral">Inativo</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2">{renderProductActions(product)}</div>
                    </li>
                  );
                })}
              </ul>

              <Pagination
                page={productPage}
                pageSize={PRODUCTS_PAGE_SIZE}
                total={filteredProducts.length}
                onChange={setProductPage}
              />
            </>
          )}
        </Card>
      </div>

      {/* Histórico de movimentações */}
      <Card
        flush
        title="Histórico de movimentações de estoque"
        subtitle="Entradas, vendas, cancelamentos e ajustes manuais."
      >
        <form
          className="grid grid-cols-1 gap-3 border-b border-[color:var(--pp-border)] px-4 py-4 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            loadStockMovementsWithLoading(
              filterStart || undefined,
              filterEnd || undefined,
              filterProductId || undefined,
            );
          }}
        >
          <Field label="De" htmlFor="movement-filter-start">
            <input
              id="movement-filter-start"
              type="date"
              value={filterStart}
              onChange={(e) => setFilterStart(e.target.value)}
              className="pp-input lg:w-40"
            />
          </Field>
          <Field label="Até" htmlFor="movement-filter-end">
            <input
              id="movement-filter-end"
              type="date"
              value={filterEnd}
              onChange={(e) => setFilterEnd(e.target.value)}
              className="pp-input lg:w-40"
            />
          </Field>
          <Field
            label="Produto"
            htmlFor="movement-filter-product"
            className="sm:col-span-2 lg:min-w-[260px] lg:flex-1"
          >
            <select
              id="movement-filter-product"
              value={filterProductId}
              onChange={(e) => setFilterProductId(e.target.value)}
              className="pp-select"
            >
              <option value="">Todos os produtos</option>
              {productsSortedByName.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} - estoque atual: {product.stock ?? "Ilimitado"}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
            <Button
              type="submit"
              variant="primary"
              icon={<IconFilter />}
              loading={movementsLoading}
            >
              Filtrar
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setFilterStart("");
                setFilterEnd("");
                setFilterProductId("");
                loadStockMovementsWithLoading();
              }}
            >
              Limpar filtro
            </Button>
          </div>
        </form>

        {movementsLoading && stockMovements.length === 0 ? (
          <SkeletonRows rows={6} cols={6} />
        ) : stockMovements.length === 0 ? (
          <EmptyState
            icon={<IconMove />}
            title="Nenhuma movimentação registrada."
            description="As entradas, vendas e ajustes de estoque aparecem aqui."
          />
        ) : (
          <>
            <div
              className={`pp-table-wrap transition-opacity ${movementsLoading ? "opacity-60" : ""}`}
            >
              <table className="pp-table min-w-[860px]">
                <thead>
                  <tr>
                    <th>Data/Hora</th>
                    <th>Produto</th>
                    <th style={{ textAlign: "right" }}>Estoque atual</th>
                    <th>Tipo</th>
                    <th style={{ textAlign: "right" }}>Quantidade</th>
                    <th style={{ textAlign: "right" }}>Estoque antes</th>
                    <th style={{ textAlign: "right" }}>Estoque no momento</th>
                    <th style={{ textAlign: "right" }}>
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {movementPageRows.map((m) => {
                    const qty = Number(m.quantity);
                    const isEntry = qty > 0;
                    const movType = (m as StockMovement & { type?: string })
                      .type;
                    const currentProduct = menu.find(
                      (p) => p.id === m.productId,
                    );
                    const currentStock = currentProduct?.stock ?? null;
                    const stockBefore = m.stockBefore ?? null;
                    const stockAfter = m.stockAfter ?? null;
                    const typeMeta = getMovementTypeMeta(movType);
                    return (
                      <tr key={m.id}>
                        <td className="whitespace-nowrap text-sm text-[color:var(--pp-text-2)]">
                          {formatDateTime(m.date)}
                        </td>
                        <td>
                          <div className="max-w-[240px] truncate font-medium">
                            {m.productName}
                          </div>
                        </td>
                        <td className="pp-num text-right font-medium">
                          {currentStock === null ? "-" : currentStock}
                        </td>
                        <td>
                          <Badge tone={typeMeta.tone}>{typeMeta.label}</Badge>
                        </td>
                        <td
                          className={`pp-num text-right font-semibold ${
                            isEntry
                              ? "text-[color:var(--pp-success)]"
                              : "text-[color:var(--pp-danger)]"
                          }`}
                        >
                          {isEntry ? `+${qty}` : qty}
                        </td>
                        <td className="pp-num text-right text-[color:var(--pp-text-2)]">
                          {stockBefore === null ? "-" : stockBefore}
                        </td>
                        <td className="pp-num text-right font-medium">
                          {stockAfter === null ? "-" : stockAfter}
                        </td>
                        <td className="text-right">
                          {movType === "manual" && (
                            <Button
                              size="sm"
                              variant="danger-soft"
                              onClick={() => handleDeleteMovement(m)}
                              aria-label={`Desfazer movimentação de ${m.productName}`}
                            >
                              Desfazer
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={movementPage}
              pageSize={MOVEMENTS_PAGE_SIZE}
              total={stockMovements.length}
              onChange={setMovementPage}
            />
          </>
        )}
      </Card>
    </div>
  );
};

export default AdminPage;

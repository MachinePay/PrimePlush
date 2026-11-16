// Página de gerenciamento dos banners da home (Admin)
import React, { useState, useEffect } from "react";
import Swal from "sweetalert2";
import {
  getAllBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  reorderBanners,
  type Banner,
  type BannerPayload,
} from "../services/bannerService";
import { getCategories, type Category } from "../services/categoryService";
import BannerForm from "../components/BannerForm";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
  StatCard,
  notify,
} from "../components/admin/ui";
import {
  IconArrowDown,
  IconArrowUp,
  IconCheckCircle,
  IconEdit,
  IconImage,
  IconPlus,
  IconRefresh,
  IconTag,
  IconTrash,
} from "../components/admin/icons";

// Ícones de visibilidade (olho aberto/fechado) no mesmo traço do kit
const IconEye: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const IconEyeOff: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    <path d="M9.9 5.2A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2" />
    <path d="M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7c1.9 0 3.6-.6 5-1.5" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    <path d="m2 2 20 20" />
  </svg>
);

const BannerSkeletonGrid: React.FC = () => (
  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
    {[0, 1, 2, 3].map((key) => (
      <div key={key} className="pp-card overflow-hidden">
        <Skeleton className="aspect-[16/6] w-full rounded-none" />
        <div className="space-y-2 p-4">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="mt-3 h-8 w-full" />
        </div>
      </div>
    ))}
  </div>
);

const AdminBannersPage: React.FC = () => {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isReordering, setIsReordering] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);

  useEffect(() => {
    loadBanners();
    loadCategories();
  }, []);

  const loadBanners = async () => {
    setIsLoading(true);
    try {
      const data = await getAllBanners();
      setBanners(data);
    } catch (error: any) {
      console.error("Erro ao carregar banners:", error);
      Swal.fire(
        "Erro",
        error.message || "Não foi possível carregar os banners",
        "error",
      );
    } finally {
      setIsLoading(false);
    }
  };

  // As categorias alimentam o select do formulário, para o botão do banner
  // apontar para uma aba que realmente existe no catálogo.
  const loadCategories = async () => {
    try {
      setCategories(await getCategories());
    } catch (error) {
      console.error("Erro ao carregar categorias:", error);
    }
  };

  const handleCreateBanner = async (bannerData: BannerPayload) => {
    try {
      await createBanner(bannerData);
      notify("Banner criado com sucesso");
      setShowForm(false);
      loadBanners();
    } catch (error: any) {
      console.error("Erro ao criar banner:", error);
      Swal.fire("Erro", error.message || "Erro ao criar banner", "error");
    }
  };

  const handleUpdateBanner = async (bannerData: BannerPayload) => {
    if (!editingBanner) return;

    try {
      await updateBanner(editingBanner.id, bannerData);
      notify("Banner atualizado com sucesso");
      setShowForm(false);
      setEditingBanner(null);
      loadBanners();
    } catch (error: any) {
      console.error("Erro ao atualizar banner:", error);
      Swal.fire("Erro", error.message || "Erro ao atualizar banner", "error");
    }
  };

  const handleDeleteBanner = async (banner: Banner) => {
    // Mantém a pré-visualização da imagem na confirmação (o confirmAction do
    // kit não aceita imagem), com o mesmo visual de ação destrutiva.
    const result = await Swal.fire({
      title: "Confirmar exclusão?",
      html: `Deseja realmente excluir este banner?<br><br><small>Ele deixará de aparecer no carrossel da página principal.</small>`,
      imageUrl: banner.image,
      imageWidth: 320,
      imageAlt: banner.alt || "Banner",
      showCancelButton: true,
      confirmButtonColor: "#e11d48",
      cancelButtonColor: "#64748b",
      confirmButtonText: "Sim, excluir",
      cancelButtonText: "Cancelar",
      reverseButtons: true,
      focusCancel: true,
    });

    if (!result.isConfirmed) return;

    try {
      await deleteBanner(banner.id);
      notify("Banner removido com sucesso");
      loadBanners();
    } catch (error: any) {
      console.error("Erro ao deletar banner:", error);
      Swal.fire("Erro", error.message || "Erro ao deletar banner", "error");
    }
  };

  // Liga/desliga o banner sem apagá-lo — útil para campanhas sazonais.
  const handleToggleActive = async (banner: Banner) => {
    try {
      const updated = await updateBanner(banner.id, { active: !banner.active });
      setBanners((current) =>
        current.map((item) => (item.id === banner.id ? updated : item)),
      );
    } catch (error: any) {
      console.error("Erro ao alterar visibilidade do banner:", error);
      Swal.fire("Erro", error.message || "Erro ao alterar o banner", "error");
    }
  };

  const handleMove = async (banner: Banner, direction: -1 | 1) => {
    const index = banners.findIndex((item) => item.id === banner.id);
    const targetIndex = index + direction;
    if (index === -1 || targetIndex < 0 || targetIndex >= banners.length) return;

    const reordered = [...banners];
    [reordered[index], reordered[targetIndex]] = [
      reordered[targetIndex],
      reordered[index],
    ];

    // Atualiza a lista na tela primeiro e reverte se o backend recusar.
    const previous = banners;
    setBanners(reordered);
    setIsReordering(true);
    try {
      const saved = await reorderBanners(reordered.map((item) => item.id));
      setBanners(saved);
    } catch (error: any) {
      console.error("Erro ao reordenar banners:", error);
      setBanners(previous);
      Swal.fire("Erro", error.message || "Erro ao reordenar banners", "error");
    } finally {
      setIsReordering(false);
    }
  };

  const handleEditClick = (banner: Banner) => {
    setEditingBanner(banner);
    setShowForm(true);
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingBanner(null);
  };

  const handleNewClick = () => {
    setEditingBanner(null);
    setShowForm(true);
  };

  const activeCount = banners.filter((banner) => banner.active).length;

  return (
    <div>
      <PageHeader
        title="Banners"
        description="Banners do carrossel da página principal"
        actions={
          <>
            <Button
              variant="secondary"
              icon={<IconRefresh />}
              onClick={loadBanners}
              loading={isLoading}
            >
              Atualizar
            </Button>
            <Button variant="primary" icon={<IconPlus />} onClick={handleNewClick}>
              Novo banner
            </Button>
          </>
        }
      />

      {/* Estatísticas */}
      <div className="pp-stagger mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total de banners"
          value={banners.length}
          icon={<IconImage />}
          tone="brand"
          loading={isLoading}
        />
        <StatCard
          label="Exibindo na home"
          value={activeCount}
          icon={<IconCheckCircle />}
          tone="success"
          loading={isLoading}
        />
        <StatCard
          label="Ocultos"
          value={banners.length - activeCount}
          icon={<IconEyeOff />}
          tone="neutral"
          loading={isLoading}
        />
      </div>

      {/* Lista de Banners */}
      {isLoading ? (
        <BannerSkeletonGrid />
      ) : banners.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconImage />}
            title="Nenhum banner cadastrado"
            description="Crie o primeiro banner para destacar suas coleções na home"
            action={
              <Button variant="primary" icon={<IconPlus />} onClick={handleNewClick}>
                Criar primeiro banner
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-[color:var(--pp-text-2)]">
            <span>
              A ordem abaixo é a ordem do carrossel. Use as setas para
              reorganizar.
            </span>
            {isReordering && (
              <span className="flex items-center gap-2 text-xs text-[color:var(--pp-text-3)]">
                <span className="pp-spinner" aria-hidden="true" />
                Salvando ordem...
              </span>
            )}
          </div>
          <div className="pp-stagger grid grid-cols-1 gap-4 lg:grid-cols-2">
            {banners.map((banner, index) => (
              <article
                key={banner.id}
                className={`pp-card pp-card-hover group overflow-hidden transition-opacity ${
                  banner.active ? "" : "opacity-75"
                }`}
              >
                <div className="relative bg-[color:var(--pp-surface-2)]">
                  <img
                    src={banner.image}
                    alt={banner.alt || "Banner"}
                    className={`aspect-[16/6] w-full object-cover ${
                      banner.active ? "" : "grayscale"
                    }`}
                    onError={(event) => {
                      (event.target as HTMLImageElement).style.opacity = "0.25";
                    }}
                  />
                  <span className="pp-num absolute left-3 top-3 rounded-full bg-slate-900/70 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
                    #{index + 1}
                  </span>
                  <span className="absolute right-3 top-3">
                    <Badge
                      tone={banner.active ? "success" : "neutral"}
                      dot
                      className="shadow-sm ring-1 ring-black/5"
                    >
                      {banner.active ? "Ativo" : "Oculto"}
                    </Badge>
                  </span>
                </div>

                <div className="p-4">
                  <h3 className="truncate text-[15px] font-semibold text-[color:var(--pp-text)]">
                    {banner.alt || "(sem descrição)"}
                  </h3>
                  <dl className="mt-2 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                    <div className="min-w-0">
                      <dt className="text-xs text-[color:var(--pp-text-3)]">Botão</dt>
                      <dd className="truncate font-medium text-[color:var(--pp-text)]">
                        {banner.buttonLabel}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs text-[color:var(--pp-text-3)]">Destino</dt>
                      <dd className="flex min-w-0 items-center gap-1.5 text-[color:var(--pp-text-2)]">
                        {banner.category ? (
                          <>
                            <IconTag className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">
                              categoria{" "}
                              <strong className="text-[color:var(--pp-text)]">
                                {banner.category}
                              </strong>
                            </span>
                          </>
                        ) : banner.query ? (
                          <span className="truncate">
                            busca por{" "}
                            <strong className="text-[color:var(--pp-text)]">
                              {banner.query}
                            </strong>
                          </span>
                        ) : (
                          <strong className="truncate text-[color:var(--pp-text)]">
                            catálogo completo
                          </strong>
                        )}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[color:var(--pp-border)] pt-3">
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        iconOnly
                        icon={<IconArrowUp />}
                        onClick={() => handleMove(banner, -1)}
                        disabled={index === 0 || isReordering}
                        title="Mover para cima"
                        aria-label="Mover para cima"
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        iconOnly
                        icon={<IconArrowDown />}
                        onClick={() => handleMove(banner, 1)}
                        disabled={index === banners.length - 1 || isReordering}
                        title="Mover para baixo"
                        aria-label="Mover para baixo"
                      />
                    </div>
                    <div className="ml-auto flex flex-wrap items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={banner.active ? <IconEyeOff /> : <IconEye />}
                        onClick={() => handleToggleActive(banner)}
                      >
                        {banner.active ? "Ocultar" : "Exibir"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<IconEdit />}
                        onClick={() => handleEditClick(banner)}
                      >
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="danger-soft"
                        icon={<IconTrash />}
                        onClick={() => handleDeleteBanner(banner)}
                      >
                        Excluir
                      </Button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {/* Modal de Formulário */}
      {showForm && (
        <BannerForm
          banner={editingBanner}
          categories={categories}
          onSave={editingBanner ? handleUpdateBanner : handleCreateBanner}
          onCancel={handleFormCancel}
        />
      )}
    </div>
  );
};

export default AdminBannersPage;

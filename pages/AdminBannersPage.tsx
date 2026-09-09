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
      await Swal.fire("Sucesso!", "Banner criado com sucesso", "success");
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
      await Swal.fire("Sucesso!", "Banner atualizado com sucesso", "success");
      setShowForm(false);
      setEditingBanner(null);
      loadBanners();
    } catch (error: any) {
      console.error("Erro ao atualizar banner:", error);
      Swal.fire("Erro", error.message || "Erro ao atualizar banner", "error");
    }
  };

  const handleDeleteBanner = async (banner: Banner) => {
    const result = await Swal.fire({
      title: "Confirmar exclusão?",
      html: `Deseja realmente excluir este banner?<br><br><small>Ele deixará de aparecer no carrossel da página principal.</small>`,
      imageUrl: banner.image,
      imageWidth: 320,
      imageAlt: banner.alt || "Banner",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "Sim, excluir",
      cancelButtonText: "Cancelar",
    });

    if (!result.isConfirmed) return;

    try {
      await deleteBanner(banner.id);
      await Swal.fire("Excluído!", "Banner removido com sucesso", "success");
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

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-transparent">
        <div className="text-center">
          <div className="animate-spin text-6xl mb-4">🔄</div>
          <p className="text-xl text-blue-800 font-semibold">
            Carregando banners...
          </p>
        </div>
      </div>
    );
  }

  const activeCount = banners.filter((banner) => banner.active).length;

  return (
    <div className="min-h-screen bg-transparent p-2 sm:p-4 md:p-6">
      <div className="container mx-auto max-w-6xl">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-purple-800">
                🖼️ Gerenciar Banners
              </h1>
              <p className="text-stone-600 text-sm mt-1">
                Banners do carrossel da página principal
              </p>
            </div>
            <button
              onClick={() => {
                setEditingBanner(null);
                setShowForm(true);
              }}
              className="bg-purple-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-purple-700 transition-all shadow-lg hover:scale-105"
            >
              ➕ Novo Banner
            </button>
          </div>
        </div>

        {/* Lista de Banners */}
        {banners.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
            <div className="text-6xl mb-4">🖼️</div>
            <h2 className="text-2xl font-bold text-stone-800 mb-2">
              Nenhum banner cadastrado
            </h2>
            <p className="text-stone-600 mb-6">
              Crie o primeiro banner para destacar suas coleções na home
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="bg-purple-600 text-white px-8 py-3 rounded-xl font-semibold hover:bg-purple-700 transition-colors"
            >
              Criar Primeiro Banner
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {banners.map((banner, index) => (
              <div
                key={banner.id}
                className={`bg-white rounded-xl shadow-lg overflow-hidden border-2 transition-all hover:shadow-xl ${
                  banner.active
                    ? "border-transparent hover:border-purple-300"
                    : "border-stone-200 opacity-70"
                }`}
              >
                <div className="relative bg-stone-100">
                  <img
                    src={banner.image}
                    alt={banner.alt || "Banner"}
                    className="w-full h-44 object-cover"
                    onError={(event) => {
                      (event.target as HTMLImageElement).style.opacity = "0.25";
                    }}
                  />
                  <span className="absolute top-2 left-2 bg-black/60 text-white text-xs font-bold px-2 py-1 rounded-full">
                    #{index + 1}
                  </span>
                  <span
                    className={`absolute top-2 right-2 text-xs font-bold px-2 py-1 rounded-full ${
                      banner.active
                        ? "bg-green-500 text-white"
                        : "bg-stone-500 text-white"
                    }`}
                  >
                    {banner.active ? "Ativo" : "Oculto"}
                  </span>
                </div>

                <div className="p-5">
                  <h3 className="text-lg font-bold text-stone-800 truncate">
                    {banner.alt || "(sem descrição)"}
                  </h3>
                  <p className="text-sm text-stone-500 mt-1">
                    Botão: <strong>{banner.buttonLabel}</strong>
                  </p>
                  <p className="text-sm text-stone-500">
                    Destino:{" "}
                    {banner.category ? (
                      <>
                        categoria <strong>{banner.category}</strong>
                      </>
                    ) : banner.query ? (
                      <>
                        busca por <strong>{banner.query}</strong>
                      </>
                    ) : (
                      <strong>catálogo completo</strong>
                    )}
                  </p>

                  <div className="flex flex-wrap gap-2 mt-4">
                    <button
                      onClick={() => handleMove(banner, -1)}
                      disabled={index === 0 || isReordering}
                      className="bg-stone-200 text-stone-700 px-3 py-2 rounded-lg font-semibold hover:bg-stone-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Mover para cima"
                    >
                      ⬆️
                    </button>
                    <button
                      onClick={() => handleMove(banner, 1)}
                      disabled={index === banners.length - 1 || isReordering}
                      className="bg-stone-200 text-stone-700 px-3 py-2 rounded-lg font-semibold hover:bg-stone-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Mover para baixo"
                    >
                      ⬇️
                    </button>
                    <button
                      onClick={() => handleToggleActive(banner)}
                      className="flex-1 bg-stone-600 text-white py-2 px-3 rounded-lg font-semibold hover:bg-stone-700 transition-colors"
                    >
                      {banner.active ? "🙈 Ocultar" : "👁️ Exibir"}
                    </button>
                    <button
                      onClick={() => handleEditClick(banner)}
                      className="flex-1 bg-blue-500 text-white py-2 px-3 rounded-lg font-semibold hover:bg-blue-600 transition-colors"
                    >
                      ✏️ Editar
                    </button>
                    <button
                      onClick={() => handleDeleteBanner(banner)}
                      className="flex-1 bg-red-500 text-white py-2 px-3 rounded-lg font-semibold hover:bg-red-600 transition-colors"
                    >
                      🗑️ Excluir
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Estatísticas */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mt-6">
          <h2 className="text-xl font-bold text-stone-800 mb-4">
            📊 Estatísticas
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-purple-50 p-4 rounded-lg border-2 border-purple-200">
              <p className="text-purple-600 text-sm font-semibold">
                Total de Banners
              </p>
              <p className="text-3xl font-bold text-purple-800">
                {banners.length}
              </p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg border-2 border-green-200">
              <p className="text-green-600 text-sm font-semibold">
                Exibindo na Home
              </p>
              <p className="text-3xl font-bold text-green-800">{activeCount}</p>
            </div>
          </div>
        </div>
      </div>

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

// Página de gerenciamento de categorias (Admin)
import React, { useState, useEffect, useMemo } from "react";
import Swal from "sweetalert2";
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  type Category,
} from "../services/categoryService";
import CategoryForm from "../components/CategoryForm";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  SearchInput,
  SkeletonRows,
  SortHeader,
  type SortState,
  StatCard,
  confirmAction,
  formatInteger,
  notify,
  sortRows,
} from "../components/admin/ui";
import {
  IconArrowDown,
  IconArrowUp,
  IconEdit,
  IconPlus,
  IconRefresh,
  IconTag,
  IconTrash,
} from "../components/admin/icons";

type SortKey = "name" | "order";

const AdminCategoriesPage: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  // Estado apenas de visualização (busca e ordenação da tabela)
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState<SortKey> | null>(null);

  // Carrega categorias ao montar o componente
  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    setIsLoading(true);
    try {
      const data = await getCategories();
      setCategories(data);
    } catch (error) {
      console.error("Erro ao carregar categorias:", error);
      Swal.fire("Erro", "Não foi possível carregar as categorias", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateCategory = async (categoryData: {
    name: string;
    icon: string;
    order: number;
  }) => {
    try {
      await createCategory(categoryData);
      notify("Categoria criada com sucesso");
      setShowForm(false);
      loadCategories();
    } catch (error: any) {
      console.error("Erro ao criar categoria:", error);
      Swal.fire("Erro", error.message || "Erro ao criar categoria", "error");
    }
  };

  const handleUpdateCategory = async (categoryData: {
    name: string;
    icon: string;
    order: number;
  }) => {
    if (!editingCategory) return;

    try {
      await updateCategory(editingCategory.id, categoryData);
      notify("Categoria atualizada com sucesso");
      setShowForm(false);
      setEditingCategory(null);
      loadCategories();
    } catch (error: any) {
      console.error("Erro ao atualizar categoria:", error);
      Swal.fire(
        "Erro",
        error.message || "Erro ao atualizar categoria",
        "error",
      );
    }
  };

  const handleDeleteCategory = async (category: Category) => {
    const confirmed = await confirmAction({
      title: "Confirmar exclusão?",
      text: `Deseja realmente deletar a categoria "${category.name}"? Não será possível deletar se houver produtos usando esta categoria.`,
      confirmText: "Sim, deletar",
      cancelText: "Cancelar",
      danger: true,
    });

    if (confirmed) {
      try {
        await deleteCategory(category.id);
        notify("Categoria removida com sucesso");
        loadCategories();
      } catch (error: any) {
        console.error("Erro ao deletar categoria:", error);
        Swal.fire(
          "Erro",
          error.message || "Erro ao deletar categoria",
          "error",
        );
      }
    }
  };

  const handleEditClick = (category: Category) => {
    setEditingCategory(category);
    setShowForm(true);
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingCategory(null);
  };

  const handleNewClick = () => {
    setEditingCategory(null);
    setShowForm(true);
  };

  const visibleCategories = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matches = term
      ? categories.filter((category) =>
          String(category.name || "").toLowerCase().includes(term),
        )
      : categories;
    return sortRows<Category, SortKey>(matches, sort, (category, key) =>
      key === "name" ? category.name : category.order,
    );
  }, [categories, search, sort]);

  const hasCategories = categories.length > 0;
  const orderValue = (value: number) => (hasCategories ? formatInteger(value) : "-");

  return (
    <div>
      <PageHeader
        title="Categorias"
        description="Organize os produtos em categorias"
        actions={
          <>
            <Button
              variant="secondary"
              icon={<IconRefresh />}
              onClick={loadCategories}
              loading={isLoading}
            >
              Atualizar
            </Button>
            <Button variant="primary" icon={<IconPlus />} onClick={handleNewClick}>
              Nova categoria
            </Button>
          </>
        }
      />

      {/* Estatísticas */}
      <div className="pp-stagger mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total de categorias"
          value={categories.length}
          icon={<IconTag />}
          tone="brand"
          loading={isLoading}
        />
        <StatCard
          label="Primeira ordem"
          value={hasCategories ? Math.min(...categories.map((c) => c.order)) : 0}
          format={orderValue}
          icon={<IconArrowUp />}
          tone="info"
          loading={isLoading}
        />
        <StatCard
          label="Última ordem"
          value={hasCategories ? Math.max(...categories.map((c) => c.order)) : 0}
          format={orderValue}
          icon={<IconArrowDown />}
          tone="success"
          loading={isLoading}
        />
      </div>

      {/* Lista de Categorias */}
      <Card flush>
        <div className="flex flex-col gap-3 border-b border-[color:var(--pp-border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-semibold text-[color:var(--pp-text)]">
            Todas as categorias
            {!isLoading && (
              <span className="pp-num ml-2 font-normal text-[color:var(--pp-text-3)]">
                {formatInteger(visibleCategories.length)}
              </span>
            )}
          </div>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar categoria"
            className="w-full sm:w-72"
          />
        </div>

        {isLoading ? (
          <SkeletonRows rows={6} cols={4} />
        ) : !hasCategories ? (
          <EmptyState
            icon={<IconTag />}
            title="Nenhuma categoria cadastrada"
            description="Crie a primeira categoria para organizar seus produtos"
            action={
              <Button variant="primary" icon={<IconPlus />} onClick={handleNewClick}>
                Criar primeira categoria
              </Button>
            }
          />
        ) : visibleCategories.length === 0 ? (
          <EmptyState
            icon={<IconTag />}
            title="Nenhum resultado"
            description={`Nada encontrado para “${search}”.`}
          />
        ) : (
          <div className="pp-table-wrap">
            <table className="pp-table">
              <thead>
                <tr>
                  <SortHeader label="Categoria" sortKey="name" sort={sort} onSort={setSort} />
                  <SortHeader label="Ordem" sortKey="order" sort={sort} onSort={setSort} />
                  <th style={{ textAlign: "right" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {visibleCategories.map((category) => (
                  <tr key={category.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[color:var(--pp-border)] bg-[color:var(--pp-surface-2)] text-xl">
                          {category.icon}
                        </span>
                        <span className="max-w-[260px] truncate font-medium">
                          {category.name}
                        </span>
                      </div>
                    </td>
                    <td>
                      <Badge tone="neutral">
                        <span className="pp-num">Ordem: {category.order}</span>
                      </Badge>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<IconEdit />}
                          onClick={() => handleEditClick(category)}
                          aria-label={`Editar ${category.name}`}
                        >
                          <span className="hidden sm:inline">Editar</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="danger-soft"
                          icon={<IconTrash />}
                          onClick={() => handleDeleteCategory(category)}
                          aria-label={`Deletar ${category.name}`}
                        >
                          <span className="hidden sm:inline">Deletar</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal de Formulário */}
      {showForm && (
        <CategoryForm
          category={editingCategory}
          onSave={editingCategory ? handleUpdateCategory : handleCreateCategory}
          onCancel={handleFormCancel}
        />
      )}
    </div>
  );
};
//atualizando
export default AdminCategoriesPage;

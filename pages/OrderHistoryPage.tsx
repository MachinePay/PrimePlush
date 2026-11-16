import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { Order } from "../types";
import Swal from "sweetalert2";
import {
  authenticatedFetch,
  deleteOrderFromHistory,
  getToken,
} from "../services/apiService";
import { useAuth } from "../contexts/AuthContext";
import {
  getDeliveredQuantity,
  getItemProductId,
  getRemainingQuantity,
  isPartiallyDelivered,
} from "../utils/orderDelivery";
import { getPaymentMethodLabel } from "../utils/paymentLabels";
import {
  DELIVERY_STATE_META,
  PAYMENT_STATE_META,
  getDeliveryState,
  getPaymentState,
} from "../utils/adminStatus";
import EditOrderModal from "../components/admin/EditOrderModal";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  SkeletonRows,
  SortHeader,
  type SortState,
  StatCard,
  Tabs,
  confirmAction,
  formatCurrency,
  formatDateTime,
  formatInteger,
  formatRelative,
  notify,
  sortRows,
} from "../components/admin/ui";
import {
  IconCalendar,
  IconCash,
  IconCheck,
  IconCheckCircle,
  IconDots,
  IconEdit,
  IconLogout,
  IconReceipt,
  IconRefresh,
  IconTrash,
  IconTruck,
  IconWallet,
  IconX,
  IconBox,
  IconFile,
} from "../components/admin/icons";
import "../components/admin/admin.css";

// Página de Histórico de Pedidos com filtro por data
// (OrderHistoryPage)

const PAGE_SIZE = 20;

type QuickFilter = "todos" | "a-pagar" | "a-entregar" | "entregues";
type SortKey = "date" | "total" | "customer";
type BusyAction = "paid" | "delivered" | "release";

const QUICK_FILTERS: QuickFilter[] = [
  "todos",
  "a-pagar",
  "a-entregar",
  "entregues",
];

const parseQuickFilter = (value: string | null): QuickFilter =>
  value && (QUICK_FILTERS as string[]).includes(value)
    ? (value as QuickFilter)
    : "todos";

// Mesma regra do filtro original de "não pagos"
const isOrderUnpaid = (order: Order) =>
  !["paid", "authorized"].includes(order.paymentStatus ?? "pending");

const getOrderMethodLabel = (order: Order) => {
  if (order.paymentSplits && order.paymentSplits.length > 0) {
    return order.paymentSplits
      .map((split) => getPaymentMethodLabel(split.method))
      .join(" + ");
  }
  if (order.paymentMethod) return getPaymentMethodLabel(order.paymentMethod);
  return getPaymentMethodLabel(order.paymentType);
};

const getUnits = (order: Order) =>
  order.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

const getDeliveredUnits = (order: Order) =>
  order.items.reduce((sum, item) => sum + getDeliveredQuantity(order, item), 0);

// ---------- Menu de ações (portal, não é cortado pela tabela) ----------

interface MenuAction {
  key: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onSelect: (e: React.MouseEvent) => void;
}

const ActionMenu: React.FC<{ actions: MenuAction[]; label: string }> = ({
  actions,
  label,
}) => {
  const [position, setPosition] = useState<React.CSSProperties | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!position) return;
    const close = () => setPosition(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [position]);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (position) {
      setPosition(null);
      return;
    }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const estimatedHeight = actions.length * 40 + 12;
    const right = Math.max(8, window.innerWidth - rect.right);
    setPosition(
      rect.bottom + estimatedHeight > window.innerHeight - 8
        ? { right, bottom: window.innerHeight - rect.top + 4 }
        : { right, top: rect.bottom + 4 },
    );
  };

  if (actions.length === 0) return null;

  return (
    <>
      <Button
        ref={buttonRef}
        variant="ghost"
        size="sm"
        iconOnly
        icon={<IconDots />}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={!!position}
        title="Mais ações"
        onClick={toggle}
      />
      {position &&
        createPortal(
          <div
            className="pp-admin"
            style={{ minHeight: 0, background: "transparent" }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div
              className="fixed inset-0 z-[80]"
              onClick={() => setPosition(null)}
            />
            <div
              role="menu"
              className="pp-animate-in fixed z-[81] min-w-[200px] rounded-xl border border-[color:var(--pp-border)] bg-white p-1.5 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.25)]"
              style={position}
            >
              {actions.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  role="menuitem"
                  disabled={action.disabled}
                  onClick={(e) => {
                    setPosition(null);
                    action.onSelect(e);
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 [&>svg]:h-4 [&>svg]:w-4 ${
                    action.danger
                      ? "text-[color:var(--pp-danger)] hover:bg-[color:var(--pp-danger-soft)]"
                      : "text-[color:var(--pp-text)] hover:bg-[color:var(--pp-surface-2)]"
                  }`}
                >
                  {action.icon}
                  {action.label}
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};

const OrderHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { logout, currentUser } = useAuth();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [customerFilter, setCustomerFilter] = useState(
    () => searchParams.get("q") || "",
  );
  // Filtros rápidos: "A pagar" = não pagos, "A entregar" = não entregues.
  // `combineFilters` liga os dois juntos (não pagos E não entregues).
  const [quickFilter, setQuickFilter] = useState<QuickFilter>(() =>
    parseQuickFilter(searchParams.get("filtro")),
  );
  const [combineFilters, setCombineFilters] = useState(false);
  const [sort, setSort] = useState<SortState<SortKey> | null>({
    key: "date",
    direction: "desc",
  });
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<Record<string, BusyAction | undefined>>({});
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  // Entrega parcial (apenas admin): pedido aberto no modal e quanto entregar
  // agora de cada produto
  const [deliveryOrder, setDeliveryOrder] = useState<Order | null>(null);
  const [deliveryQty, setDeliveryQty] = useState<Record<string, number>>({});
  const [isSubmittingDelivery, setIsSubmittingDelivery] = useState(false);
  // Edição de pedido finalizado (apenas admin): cliente e pagamento
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
  const isAdmin = currentUser?.role === "admin";

  const showUnpaidOnly =
    quickFilter === "a-pagar" || (quickFilter === "a-entregar" && combineFilters);
  const showUndeliveredOnly =
    quickFilter === "a-entregar" || (quickFilter === "a-pagar" && combineFilters);
  const showDeliveredOnly = quickFilter === "entregues";

  const setOrderBusy = (orderId: string, action: BusyAction | null) =>
    setBusy((prev) => ({ ...prev, [orderId]: action ?? undefined }));

  const openDetails = (order: Order) =>
    navigate("/historico/detalhes", { state: { order } });

  const openPartialDelivery = (order: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeliveryOrder(order);
    setDeliveryQty({});
  };

  const handlePartialDelivery = async () => {
    if (!deliveryOrder) return;
    const items = (Object.entries(deliveryQty) as Array<[string, number]>)
      .filter(([, quantity]) => quantity > 0)
      .map(([id, quantity]) => ({ id, quantity }));
    if (items.length === 0) {
      notify("Informe o quanto está sendo entregue", "warning");
      return;
    }

    setIsSubmittingDelivery(true);
    try {
      const resp = await authenticatedFetch(
        `${BACKEND_URL}/api/orders/${deliveryOrder.id}/mark-delivered`,
        { method: "PUT", body: JSON.stringify({ items }) },
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.message || data.error || "Erro ao registrar entrega");
      }
      setDeliveryOrder(null);
      fetchOrders();
      notify(data.message || "Entrega registrada");
    } catch (error: any) {
      await Swal.fire({
        icon: "error",
        title: "Falha ao registrar entrega",
        text: error?.message || "Tente novamente.",
        confirmButtonText: "OK",
      });
    } finally {
      setIsSubmittingDelivery(false);
    }
  };

  const handleMarkPaid = async (order: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    setOrderBusy(order.id, "paid");
    try {
      // Chama endpoint para marcar como pago
      const resp = await authenticatedFetch(
        `${BACKEND_URL}/api/orders/${order.id}/mark-paid`,
        { method: "PUT" },
      );
      if (resp.ok) {
        fetchOrders();
      } else {
        notify("Erro ao marcar como pago", "error");
      }
    } finally {
      setOrderBusy(order.id, null);
    }
  };

  const handleMarkDelivered = async (order: Order, e: React.MouseEvent) => {
    e.stopPropagation();
    if (order.entregueCliente) return;
    setOrderBusy(order.id, "delivered");
    try {
      const resp = await authenticatedFetch(
        `${BACKEND_URL}/api/orders/${order.id}/mark-delivered`,
        { method: "PUT" },
      );
      if (resp.ok) {
        fetchOrders();
      } else {
        notify("Erro ao marcar como entregue", "error");
      }
    } finally {
      setOrderBusy(order.id, null);
    }
  };

  const handleReleaseReservation = async (order: Order, e: React.MouseEvent) => {
    e.stopPropagation();

    const confirmed = await confirmAction({
      title: "Liberar reserva do pedido?",
      text: "O que falta entregar deixa de ficar reservado e volta a aparecer disponível na loja. O estoque continua sendo descontado na entrega.",
      confirmText: "Sim, liberar",
      cancelText: "Cancelar",
    });
    if (!confirmed) return;

    setOrderBusy(order.id, "release");
    try {
      const resp = await authenticatedFetch(
        `${BACKEND_URL}/api/admin/orders/${order.id}/release-reservation`,
        { method: "POST" },
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.message || data.error || "Erro ao liberar reserva");
      }
      fetchOrders();
      const total = (data.released || []).reduce(
        (sum: number, item: { quantity: number }) => sum + item.quantity,
        0,
      );
      notify(`Reserva liberada: ${total} unidade(s)`);
    } catch (error: any) {
      await Swal.fire({
        icon: "error",
        title: "Falha ao liberar reserva",
        text: error?.message || "Tente novamente.",
        confirmButtonText: "OK",
      });
    } finally {
      setOrderBusy(order.id, null);
    }
  };

  const getErrorMessageByStatus = (status?: number) => {
    if (status === 401 || status === 403) {
      return "Permissão negada ou sessão expirada. Faça login novamente.";
    }
    if (status === 404) {
      return "Este pedido já não existe no histórico.";
    }
    if (status === 500) {
      return "Erro interno do servidor. Tente novamente em instantes.";
    }
    return "Não foi possível excluir o pedido agora. Tente novamente.";
  };

  const handleDeleteFromHistory = async (order: Order, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!isAdmin || deletingOrderId === order.id) return;

    const confirmed = await confirmAction({
      title: "Excluir pedido do histórico?",
      text: "Esta ação é irreversível na interface e o pedido deixará de aparecer no histórico.",
      confirmText: "Sim, excluir",
      cancelText: "Cancelar",
      danger: true,
    });

    if (!confirmed) return;

    setDeletingOrderId(order.id);

    try {
      const token = getToken() || "";
      const result = await deleteOrderFromHistory(order.id, token);

      if (result.ok) {
        setOrders((prev) => prev.filter((item) => item.id !== order.id));
        notify(result.message || "Pedido excluído do histórico");
      }
    } catch (error: any) {
      const status = error?.status as number | undefined;
      await Swal.fire({
        icon: "error",
        title: "Falha ao excluir pedido",
        text: getErrorMessageByStatus(status),
        confirmButtonText: "Tentar novamente",
      });
    } finally {
      setDeletingOrderId(null);
    }
  };

  const handleLogout = async () => {
    if (await confirmAction({ title: "Deseja realmente sair?", confirmText: "Sair" })) {
      await logout();
      navigate("/admin/login");
    }
  };

  const fetchOrders = async () => {
    try {
      setLoading(true);
      setLoadError(false);
      let url = `${BACKEND_URL}/api/orders/history`;
      const params: string[] = [];
      if (startDate) params.push(`start=${startDate}`);
      if (endDate) params.push(`end=${endDate}`);
      if (params.length > 0) url += `?${params.join("&")}`;
      const resp = await authenticatedFetch(url);
      if (!resp.ok) throw new Error("Erro ao buscar histórico de pedidos");
      const data: Order[] = await resp.json();
      setOrders(data);
    } catch (err) {
      setOrders([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    // eslint-disable-next-line
  }, [startDate, endDate]);

  // Busca/filtro vindos da URL (?q=...&filtro=a-pagar|a-entregar)
  useEffect(() => {
    const q = searchParams.get("q");
    if (q !== null) setCustomerFilter(q);
    const filtro = searchParams.get("filtro");
    if (filtro !== null) {
      setQuickFilter(parseQuickFilter(filtro));
      setCombineFilters(false);
    }
  }, [searchParams]);

  useEffect(() => {
    setPage(1);
  }, [customerFilter, quickFilter, combineFilters, sort, startDate, endDate]);

  // Pedidos que passam na busca (antes do filtro rápido): base das contagens
  const searchedOrders = useMemo(() => {
    const normalizedCustomerFilter = customerFilter.trim().toLowerCase();
    if (!normalizedCustomerFilter) return orders;
    const orderTerm = normalizedCustomerFilter.replace(/^#/, "");
    return orders.filter((order) => {
      const customerName = (order.userName || "").toLowerCase();
      const customerId = (order.userId || "").toLowerCase();
      const orderId = String(order.id || "").toLowerCase();
      return (
        customerName.includes(normalizedCustomerFilter) ||
        customerId.includes(normalizedCustomerFilter) ||
        (!!orderTerm && orderId.includes(orderTerm))
      );
    });
  }, [orders, customerFilter]);

  const filteredOrders = useMemo(
    () =>
      searchedOrders.filter((order) => {
        const isUndelivered = !order.entregueCliente;
        const isUnpaid = isOrderUnpaid(order);

        if (showUndeliveredOnly && !isUndelivered) {
          return false;
        }

        if (showUnpaidOnly && !isUnpaid) {
          return false;
        }

        if (showDeliveredOnly && isUndelivered) {
          return false;
        }

        return true;
      }),
    [searchedOrders, showUndeliveredOnly, showUnpaidOnly, showDeliveredOnly],
  );

  const sortedOrders = useMemo(
    () =>
      sortRows<Order, SortKey>(filteredOrders, sort, (order, key) => {
        switch (key) {
          case "date": {
            const time = new Date(order.timestamp).getTime();
            return Number.isNaN(time) ? null : time;
          }
          case "total":
            return Number(order.total) || 0;
          case "customer":
            return (order.userName || "").toLowerCase() || null;
        }
      }),
    [filteredOrders, sort],
  );

  const pageOrders = sortedOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const counts = useMemo(
    () => ({
      todos: searchedOrders.length,
      aPagar: searchedOrders.filter(isOrderUnpaid).length,
      aEntregar: searchedOrders.filter((order) => !order.entregueCliente).length,
      entregues: searchedOrders.filter((order) => order.entregueCliente).length,
    }),
    [searchedOrders],
  );

  const summary = useMemo(() => {
    const valid = filteredOrders.filter(
      (order) => getPaymentState(order) !== "canceled",
    );
    const pending = valid.filter((order) => getPaymentState(order) === "pending");
    return {
      count: filteredOrders.length,
      revenue: valid.reduce((sum, order) => sum + (Number(order.total) || 0), 0),
      toReceive: pending.reduce((sum, order) => sum + (Number(order.total) || 0), 0),
      toReceiveCount: pending.length,
      undelivered: filteredOrders.filter((order) => !order.entregueCliente).length,
      partial: filteredOrders.filter((order) => isPartiallyDelivered(order)).length,
    };
  }, [filteredOrders]);

  const hasActiveFilters =
    !!startDate ||
    !!endDate ||
    !!customerFilter.trim() ||
    quickFilter !== "todos" ||
    combineFilters;

  const clearFilters = () => {
    setStartDate("");
    setEndDate("");
    setCustomerFilter("");
    setQuickFilter("todos");
    setCombineFilters(false);
  };

  const initialLoading = loading && orders.length === 0;

  // ---------- Ações de cada pedido ----------

  const canReleaseReservation = (order: Order) =>
    isAdmin &&
    !order.entregueCliente &&
    order.items.some(
      (item) =>
        item.reserved !== false && getRemainingQuantity(order, item) > 0,
    );

  const getMenuActions = (order: Order): MenuAction[] => {
    const actions: MenuAction[] = [
      {
        key: "details",
        label: "Ver detalhes",
        icon: <IconFile />,
        onSelect: () => openDetails(order),
      },
    ];
    if (isAdmin && !order.entregueCliente) {
      actions.push({
        key: "partial",
        label: "Entregar parte",
        icon: <IconBox />,
        onSelect: (e) => openPartialDelivery(order, e),
      });
    }
    if (canReleaseReservation(order)) {
      actions.push({
        key: "release",
        label:
          busy[order.id] === "release" ? "Liberando reserva..." : "Liberar reserva",
        icon: <IconRefresh />,
        disabled: !!busy[order.id],
        onSelect: (e) => handleReleaseReservation(order, e),
      });
    }
    if (isAdmin) {
      actions.push({
        key: "edit",
        label: "Editar cliente/pagamento",
        icon: <IconEdit />,
        onSelect: (e) => {
          e.stopPropagation();
          setEditingOrder(order);
        },
      });
      actions.push({
        key: "delete",
        label: deletingOrderId === order.id ? "Excluindo..." : "Excluir",
        icon: <IconTrash />,
        danger: true,
        disabled: deletingOrderId === order.id,
        onSelect: (e) => handleDeleteFromHistory(order, e),
      });
    }
    return actions;
  };

  const renderPrimaryActions = (order: Order, full = false) => {
    const orderBusy = busy[order.id];
    return (
      <>
        {/* Exibe status do pagamento: presencial pendente pode ser marcado como pago */}
        {order.paymentType === "presencial" &&
          order.paymentStatus === "pending" && (
            <Button
              size="sm"
              variant="success"
              icon={<IconCash />}
              loading={orderBusy === "paid"}
              disabled={!!orderBusy && orderBusy !== "paid"}
              onClick={(e) => handleMarkPaid(order, e)}
              title="Marcar como pago"
            >
              {full ? "Marcar como pago" : "Pago"}
            </Button>
          )}
        {/* Botão entregar ao cliente */}
        {!order.entregueCliente && (
          <Button
            size="sm"
            variant="soft"
            icon={<IconTruck />}
            loading={orderBusy === "delivered"}
            disabled={!!orderBusy && orderBusy !== "delivered"}
            onClick={(e) => handleMarkDelivered(order, e)}
            title="Marcar como entregue"
          >
            {isPartiallyDelivered(order)
              ? full
                ? "Entregar restante"
                : "Restante"
              : full
                ? "Entregar ao cliente"
                : "Entregar"}
          </Button>
        )}
      </>
    );
  };

  const renderItemsSummary = (order: Order, limit?: number) => {
    const items = limit ? order.items.slice(0, limit) : order.items;
    const hidden = order.items.length - items.length;
    return (
      <ul className="space-y-0.5 text-sm">
        {items.map((item, idx) => {
          const delivered = getDeliveredQuantity(order, item);
          const remaining = getRemainingQuantity(order, item);
          return (
            <li key={idx} className="flex flex-wrap items-baseline gap-x-2">
              <span className="min-w-0 truncate text-[color:var(--pp-text)]">
                <span className="pp-num font-semibold">{item.quantity}x</span>{" "}
                {item.name}
              </span>
              {!order.entregueCliente && (
                <span
                  className={`text-xs font-medium ${remaining > 0 ? "text-amber-700" : "text-emerald-700"}`}
                >
                  entregue {delivered} · falta {remaining}
                </span>
              )}
            </li>
          );
        })}
        {hidden > 0 && (
          <li className="text-xs text-[color:var(--pp-text-3)]">
            + {hidden} {hidden === 1 ? "produto" : "produtos"}
          </li>
        )}
      </ul>
    );
  };

  const renderStatusBadges = (order: Order) => {
    const payment = PAYMENT_STATE_META[getPaymentState(order)];
    const deliveryState = getDeliveryState(order);
    const delivery = DELIVERY_STATE_META[deliveryState];
    return { payment, delivery, deliveryState };
  };

  // ---------- Render ----------

  const content = (
    <div className="pp-animate-in">
      <PageHeader
        eyebrow={isAdmin ? "Vendas" : undefined}
        title="Pedidos"
        description="Acompanhe pagamentos, entregas e o histórico de cada pedido."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<IconRefresh />}
              onClick={fetchOrders}
              loading={loading}
            >
              Atualizar
            </Button>
            {!isAdmin && (
              <Button variant="primary" icon={<IconLogout />} onClick={handleLogout}>
                Sair
              </Button>
            )}
          </>
        }
      />

      <div className="pp-stagger mb-6 grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <StatCard
          label="Pedidos no filtro"
          value={summary.count}
          icon={<IconReceipt />}
          tone="brand"
          loading={initialLoading}
          hint={
            summary.partial > 0
              ? `${formatInteger(summary.partial)} com entrega parcial`
              : undefined
          }
        />
        <StatCard
          label="A receber"
          value={summary.toReceive}
          format={formatCurrency}
          icon={<IconWallet />}
          tone="warning"
          loading={initialLoading}
          hint={`${formatInteger(summary.toReceiveCount)} ${summary.toReceiveCount === 1 ? "pedido" : "pedidos"} a pagar`}
          onClick={() => {
            setQuickFilter("a-pagar");
            setCombineFilters(false);
          }}
        />
        <StatCard
          label="Entregas pendentes"
          value={summary.undelivered}
          icon={<IconTruck />}
          tone="info"
          loading={initialLoading}
          hint="pedidos não entregues"
          onClick={() => {
            setQuickFilter("a-entregar");
            setCombineFilters(false);
          }}
        />
        <StatCard
          label="Faturamento do filtro"
          value={summary.revenue}
          format={formatCurrency}
          icon={<IconCheckCircle />}
          tone="success"
          loading={initialLoading}
          hint="sem pedidos cancelados"
        />
      </div>

      <Card flush>
        {/* Filtros */}
        <div className="border-b border-[color:var(--pp-border)] px-4 pt-3">
          <Tabs
            tabs={[
              { value: "todos", label: "Todos", count: counts.todos },
              { value: "a-pagar", label: "A pagar", count: counts.aPagar },
              { value: "a-entregar", label: "A entregar", count: counts.aEntregar },
              { value: "entregues", label: "Entregues", count: counts.entregues },
            ]}
            value={quickFilter}
            onChange={(value: QuickFilter) => {
              setQuickFilter(value);
              setCombineFilters(false);
            }}
            className="border-b-0"
          />
        </div>
        <div className="flex flex-col gap-3 border-b border-[color:var(--pp-border)] p-4 lg:flex-row lg:flex-wrap lg:items-end">
          <SearchInput
            value={customerFilter}
            onChange={setCustomerFilter}
            placeholder="Buscar cliente, ID do cliente ou nº do pedido"
            className="w-full lg:min-w-[280px] lg:flex-1"
          />
          <div className="grid grid-cols-2 gap-3 lg:flex lg:items-end">
            <div>
              <label htmlFor="orders-start" className="pp-label">
                <span className="inline-flex items-center gap-1">
                  <IconCalendar className="h-3.5 w-3.5" /> Data inicial
                </span>
              </label>
              <input
                id="orders-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="pp-input lg:w-[170px]"
              />
            </div>
            <div>
              <label htmlFor="orders-end" className="pp-label">
                <span className="inline-flex items-center gap-1">
                  <IconCalendar className="h-3.5 w-3.5" /> Data final
                </span>
              </label>
              <input
                id="orders-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="pp-input lg:w-[170px]"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {(quickFilter === "a-pagar" || quickFilter === "a-entregar") && (
              <label className="inline-flex h-10 items-center gap-2 text-sm font-medium text-[color:var(--pp-text-2)]">
                <input
                  type="checkbox"
                  className="pp-checkbox"
                  checked={combineFilters}
                  onChange={(e) => setCombineFilters(e.target.checked)}
                />
                {quickFilter === "a-pagar"
                  ? "Somente não entregues"
                  : "Somente não pagos"}
              </label>
            )}
            {hasActiveFilters && (
              <Button variant="ghost" icon={<IconX />} onClick={clearFilters}>
                Limpar filtros
              </Button>
            )}
          </div>
        </div>

        {loadError && !loading ? (
          <EmptyState
            icon={<IconReceipt />}
            title="Não foi possível carregar os pedidos"
            description="Verifique a conexão e tente novamente."
            action={<Button onClick={fetchOrders}>Tentar novamente</Button>}
          />
        ) : initialLoading ? (
          <SkeletonRows rows={8} cols={6} />
        ) : sortedOrders.length === 0 ? (
          <EmptyState
            icon={<IconReceipt />}
            title="Nenhum pedido encontrado"
            description="Não há pedidos para os filtros selecionados."
            action={
              hasActiveFilters ? (
                <Button onClick={clearFilters} icon={<IconX />}>
                  Limpar filtros
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div
            className={`transition-opacity ${loading ? "pointer-events-none opacity-60" : ""}`}
          >
            {/* Desktop / tablet: tabela */}
            <div className="pp-table-wrap hidden md:block">
              <table className="pp-table">
                <thead>
                  <tr>
                    <SortHeader label="Pedido" sortKey="date" sort={sort} onSort={setSort} />
                    <SortHeader label="Cliente" sortKey="customer" sort={sort} onSort={setSort} />
                    <th className="hidden lg:table-cell">Itens</th>
                    <th>Pagamento</th>
                    <th>Entrega</th>
                    <SortHeader
                      label="Total"
                      sortKey="total"
                      sort={sort}
                      onSort={setSort}
                      align="right"
                    />
                    <th style={{ textAlign: "right" }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pageOrders.map((order) => {
                    const { payment, delivery, deliveryState } = renderStatusBadges(order);
                    const units = getUnits(order);
                    return (
                      <tr
                        key={order.id}
                        data-clickable="true"
                        onClick={() => openDetails(order)}
                      >
                        <td className="whitespace-nowrap align-top">
                          <div className="pp-num font-semibold">
                            #{order.id.slice(-4)}
                          </div>
                          <div
                            className="text-xs text-[color:var(--pp-text-3)]"
                            title={formatDateTime(order.timestamp)}
                          >
                            {formatRelative(order.timestamp)}
                          </div>
                        </td>
                        <td className="align-top">
                          <div className="flex items-center gap-3">
                            <Avatar name={order.userName || "?"} />
                            <div className="min-w-0">
                              <div className="max-w-[200px] truncate font-medium">
                                {order.userName || "-"}
                              </div>
                              <div className="text-xs text-[color:var(--pp-text-3)]">
                                {formatInteger(units)} {units === 1 ? "unidade" : "unidades"}
                                {order.observation && (
                                  <span
                                    className="ml-1.5 font-medium text-amber-700"
                                    title={order.observation}
                                  >
                                    · Obs.
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="hidden max-w-[320px] align-top lg:table-cell">
                          {renderItemsSummary(order, 3)}
                        </td>
                        <td className="align-top">
                          <Badge tone={payment.tone} dot>
                            {payment.label}
                          </Badge>
                          <div className="mt-1 max-w-[160px] truncate text-xs text-[color:var(--pp-text-3)]">
                            {getOrderMethodLabel(order)}
                          </div>
                        </td>
                        <td className="align-top">
                          <Badge tone={delivery.tone} dot>
                            {delivery.label}
                          </Badge>
                          {deliveryState === "partial" && (
                            <div className="pp-num mt-1 text-xs text-[color:var(--pp-text-3)]">
                              {formatInteger(getDeliveredUnits(order))} de{" "}
                              {formatInteger(units)} un.
                            </div>
                          )}
                        </td>
                        <td className="pp-num whitespace-nowrap text-right align-top font-semibold">
                          {formatCurrency(Number(order.total) || 0)}
                        </td>
                        <td className="align-top" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {renderPrimaryActions(order)}
                            <ActionMenu
                              actions={getMenuActions(order)}
                              label={`Mais ações do pedido #${order.id.slice(-4)}`}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Celular: cartões empilhados */}
            <ul className="divide-y divide-[color:var(--pp-border)] md:hidden">
              {pageOrders.map((order) => {
                const { payment, delivery, deliveryState } = renderStatusBadges(order);
                const units = getUnits(order);
                return (
                  <li
                    key={order.id}
                    className="cursor-pointer p-4 transition-colors active:bg-[color:var(--pp-surface-2)]"
                    onClick={() => openDetails(order)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={order.userName || "?"} size={36} />
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {order.userName || "-"}
                          </div>
                          <div className="text-xs text-[color:var(--pp-text-3)]">
                            <span className="pp-num font-semibold text-[color:var(--pp-text-2)]">
                              #{order.id.slice(-4)}
                            </span>{" "}
                            · {formatDateTime(order.timestamp)}
                          </div>
                        </div>
                      </div>
                      <div className="pp-num shrink-0 text-right font-semibold">
                        {formatCurrency(Number(order.total) || 0)}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <Badge tone={payment.tone} dot>
                        {payment.label}
                      </Badge>
                      <Badge tone={delivery.tone} dot>
                        {delivery.label}
                        {deliveryState === "partial" &&
                          ` · ${getDeliveredUnits(order)}/${units}`}
                      </Badge>
                      <span className="text-xs text-[color:var(--pp-text-3)]">
                        {getOrderMethodLabel(order)}
                      </span>
                    </div>

                    <div className="mt-3 rounded-xl bg-[color:var(--pp-surface-2)] px-3 py-2">
                      {renderItemsSummary(order)}
                    </div>

                    {order.observation && (
                      <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                        <span className="font-semibold">Observação:</span>{" "}
                        {order.observation}
                      </div>
                    )}

                    <div
                      className="mt-3 flex flex-wrap items-center justify-end gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {renderPrimaryActions(order, true)}
                      <ActionMenu
                        actions={getMenuActions(order)}
                        label={`Mais ações do pedido #${order.id.slice(-4)}`}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>

            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={sortedOrders.length}
              onChange={setPage}
            />
          </div>
        )}
      </Card>

      {editingOrder && (
        <EditOrderModal
          order={editingOrder}
          backendUrl={BACKEND_URL}
          onClose={() => setEditingOrder(null)}
          onSaved={() => {
            setEditingOrder(null);
            fetchOrders();
          }}
        />
      )}

      {/* Modal de entrega parcial (apenas admin) */}
      <Modal
        open={!!deliveryOrder}
        onClose={() => setDeliveryOrder(null)}
        locked={isSubmittingDelivery}
        title={
          deliveryOrder
            ? `Entregar parte do pedido #${deliveryOrder.id.slice(-4)}`
            : undefined
        }
        description="Informe quanto de cada produto está sendo entregue agora. Só essa quantidade é descontada do estoque."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setDeliveryOrder(null)}
              disabled={isSubmittingDelivery}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              icon={<IconCheck />}
              onClick={handlePartialDelivery}
              loading={isSubmittingDelivery}
            >
              {isSubmittingDelivery ? "Registrando..." : "Confirmar entrega"}
            </Button>
          </>
        }
      >
        {deliveryOrder && (
          <ul className="max-h-[50vh] divide-y divide-[color:var(--pp-border)] overflow-y-auto">
            {deliveryOrder.items.map((item, idx) => {
              const productId = getItemProductId(item);
              const delivered = getDeliveredQuantity(deliveryOrder, item);
              const remaining = getRemainingQuantity(deliveryOrder, item);
              const value = deliveryQty[productId] ?? 0;
              const percent =
                item.quantity > 0
                  ? Math.min(100, Math.round((delivered / item.quantity) * 100))
                  : 0;
              return (
                <li
                  key={idx}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[color:var(--pp-text)]">
                      {item.name}
                    </p>
                    <p className="pp-num text-xs text-[color:var(--pp-text-3)]">
                      Pedido {item.quantity} · entregue {delivered} · falta{" "}
                      {remaining}
                    </p>
                    <div className="pp-progress mt-1.5 max-w-[180px]">
                      <span style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                  {remaining > 0 ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={remaining}
                        value={value}
                        aria-label={`Quantidade de ${item.name} entregue agora`}
                        onChange={(e) => {
                          const q = parseInt(e.target.value, 10);
                          setDeliveryQty((prev) => ({
                            ...prev,
                            [productId]: Number.isNaN(q)
                              ? 0
                              : Math.min(remaining, Math.max(0, q)),
                          }));
                        }}
                        className="pp-input pp-num w-20 text-center font-semibold"
                      />
                      <Button
                        size="sm"
                        variant="soft"
                        onClick={() =>
                          setDeliveryQty((prev) => ({
                            ...prev,
                            [productId]: remaining,
                          }))
                        }
                      >
                        Tudo
                      </Button>
                    </div>
                  ) : (
                    <Badge tone="success" dot className="shrink-0">
                      Entregue
                    </Badge>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Modal>
    </div>
  );

  if (!isAdmin) {
    return (
      <div className="pp-admin">
        <div className="pp-content">{content}</div>
      </div>
    );
  }
  return content;
};

export default OrderHistoryPage;

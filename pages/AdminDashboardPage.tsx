import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Order, Product, User } from "../types";
import { authenticatedFetch, getUsers } from "../services/apiService";
import { useAuth } from "../contexts/AuthContext";
import { getPaymentMethodLabel } from "../utils/paymentLabels";
import {
  DELIVERY_STATE_META,
  PAYMENT_STATE_META,
  getDeliveryState,
  getOrderPaymentParts,
  getPaymentState,
  getUserCreatedAt,
  isLowStock,
  isOutOfStock,
} from "../utils/adminStatus";
import {
  Avatar,
  Badge,
  Button,
  CHART_COLORS,
  Card,
  EmptyState,
  PageHeader,
  Segmented,
  Skeleton,
  SkeletonRows,
  StatCard,
  chartAxisProps,
  chartGridProps,
  chartTooltipProps,
  formatCurrency,
  formatInteger,
  formatRelative,
} from "../components/admin/ui";
import {
  IconAlert,
  IconArrowRight,
  IconBox,
  IconCalendar,
  IconCart,
  IconCash,
  IconCheckCircle,
  IconClock,
  IconReceipt,
  IconRefresh,
  IconTrend,
  IconTruck,
  IconUserPlus,
  IconWallet,
} from "../components/admin/icons";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const DAY = 24 * 60 * 60 * 1000;

type Period = "today" | "7d" | "30d" | "month" | "custom";

const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "month", label: "Este mês" },
  { value: "custom", label: "Período" },
];

const PERIOD_COMPARE_LABEL: Record<Period, string> = {
  today: "vs. ontem",
  "7d": "vs. 7 dias anteriores",
  "30d": "vs. 30 dias anteriores",
  month: "vs. mês anterior",
  custom: "vs. período anterior",
};

interface Range {
  start: Date;
  end: Date;
}

const startOfDay = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const toInputDate = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

// Intervalo [start, end) do período escolhido
const getRange = (period: Period, customStart: string, customEnd: string): Range => {
  const now = new Date();
  const today = startOfDay(now);
  const tomorrow = new Date(today.getTime() + DAY);
  switch (period) {
    case "today":
      return { start: today, end: tomorrow };
    case "7d":
      return { start: new Date(tomorrow.getTime() - 7 * DAY), end: tomorrow };
    case "30d":
      return { start: new Date(tomorrow.getTime() - 30 * DAY), end: tomorrow };
    case "month":
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: tomorrow };
    case "custom": {
      const start = customStart ? new Date(`${customStart}T00:00:00`) : today;
      const endDay = customEnd ? new Date(`${customEnd}T00:00:00`) : today;
      return { start, end: new Date(endDay.getTime() + DAY) };
    }
  }
};

// Mesmo tamanho imediatamente antes (no mês: o mês anterior até o mesmo dia)
const getPreviousRange = (period: Period, range: Range): Range => {
  if (period === "month") {
    const start = new Date(range.start.getFullYear(), range.start.getMonth() - 1, 1);
    const length = range.end.getTime() - range.start.getTime();
    return { start, end: new Date(Math.min(start.getTime() + length, range.start.getTime())) };
  }
  const length = range.end.getTime() - range.start.getTime();
  return { start: new Date(range.start.getTime() - length), end: range.start };
};

const inRange = (value: string | Date, range: Range) => {
  const time = new Date(value).getTime();
  return time >= range.start.getTime() && time < range.end.getTime();
};

const percentChange = (current: number, previous: number): number | null => {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
};

interface PeriodMetrics {
  revenue: number;
  orders: number;
  averageTicket: number;
  toReceive: number;
  toReceiveCount: number;
  itemsSold: number;
}

const computeMetrics = (orders: Order[]): PeriodMetrics => {
  const valid = orders.filter((order) => getPaymentState(order) !== "canceled");
  const revenue = valid.reduce((sum, order) => sum + (Number(order.total) || 0), 0);
  const pending = valid.filter((order) => getPaymentState(order) === "pending");
  return {
    revenue,
    orders: valid.length,
    averageTicket: valid.length ? revenue / valid.length : 0,
    toReceive: pending.reduce((sum, order) => sum + (Number(order.total) || 0), 0),
    toReceiveCount: pending.length,
    itemsSold: valid.reduce(
      (sum, order) =>
        sum +
        (Array.isArray(order.items)
          ? order.items.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0)
          : 0),
      0,
    ),
  };
};

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
};

const STATUS_SLICES = [
  { key: "paid-delivered", label: "Pago e entregue", color: "#10b981" },
  { key: "paid-open", label: "Pago, a entregar", color: "#2563eb" },
  { key: "pending", label: "A pagar", color: "#f59e0b" },
  { key: "canceled", label: "Cancelado", color: "#ef4444" },
] as const;

const AdminDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [period, setPeriod] = useState<Period>("30d");
  const [customStart, setCustomStart] = useState(() =>
    toInputDate(new Date(Date.now() - 6 * DAY)),
  );
  const [customEnd, setCustomEnd] = useState(() => toInputDate(new Date()));
  const [chartMetric, setChartMetric] = useState<"revenue" | "orders">("revenue");

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const [ordersRes, productsRes, usersData] = await Promise.all([
        authenticatedFetch(`${API_URL}/api/orders/history`),
        authenticatedFetch(`${API_URL}/api/products`),
        getUsers().catch(() => []),
      ]);
      if (!ordersRes.ok) throw new Error("Não foi possível carregar os pedidos.");
      const ordersData = await ordersRes.json();
      const productsData = productsRes.ok ? await productsRes.json() : [];
      setOrders(Array.isArray(ordersData) ? ordersData : []);
      setProducts(Array.isArray(productsData) ? productsData : []);
      setUsers(Array.isArray(usersData) ? usersData : []);
      setLastUpdated(new Date());
    } catch (err: any) {
      setError(err?.message || "Erro ao carregar o dashboard.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const range = useMemo(
    () => getRange(period, customStart, customEnd),
    [period, customStart, customEnd],
  );
  const previousRange = useMemo(() => getPreviousRange(period, range), [period, range]);

  const periodOrders = useMemo(
    () => orders.filter((order) => inRange(order.timestamp, range)),
    [orders, range],
  );
  const previousOrders = useMemo(
    () => orders.filter((order) => inRange(order.timestamp, previousRange)),
    [orders, previousRange],
  );

  const current = useMemo(() => computeMetrics(periodOrders), [periodOrders]);
  const previous = useMemo(() => computeMetrics(previousOrders), [previousOrders]);

  // Indicadores fixos (independentes do filtro)
  const fixed = useMemo(() => {
    const today = getRange("today", "", "");
    const month = getRange("month", "", "");
    const valid = orders.filter((order) => getPaymentState(order) !== "canceled");
    const sum = (list: Order[]) =>
      list.reduce((acc, order) => acc + (Number(order.total) || 0), 0);
    const pendingDelivery = valid.filter(
      (order) => getDeliveryState(order) !== "delivered",
    );
    return {
      todayRevenue: sum(valid.filter((order) => inRange(order.timestamp, today))),
      todayOrders: valid.filter((order) => inRange(order.timestamp, today)).length,
      monthRevenue: sum(valid.filter((order) => inRange(order.timestamp, month))),
      monthOrders: valid.filter((order) => inRange(order.timestamp, month)).length,
      pendingDelivery: pendingDelivery.length,
      partialDelivery: pendingDelivery.filter(
        (order) => getDeliveryState(order) === "partial",
      ).length,
      unpaid: valid.filter((order) => getPaymentState(order) === "pending"),
    };
  }, [orders]);

  const stock = useMemo(
    () => ({
      low: products.filter(isLowStock),
      out: products.filter(isOutOfStock),
    }),
    [products],
  );

  const customers = useMemo(
    () =>
      users.filter((user) => {
        const role = user.role || "customer";
        return role === "customer" || role === "admincustomer";
      }),
    [users],
  );

  const newCustomers = useMemo(() => {
    const withDate = customers
      .map((user) => ({ user, createdAt: getUserCreatedAt(user) }))
      .filter((entry): entry is { user: User; createdAt: Date } => !!entry.createdAt);
    return {
      current: withDate.filter((entry) => inRange(entry.createdAt, range)).length,
      previous: withDate.filter((entry) => inRange(entry.createdAt, previousRange)).length,
      latest: [...withDate]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 5),
    };
  }, [customers, range, previousRange]);

  // Série do gráfico: por hora (1 dia), por dia (até ~2 meses) ou por mês
  const series = useMemo(() => {
    const length = range.end.getTime() - range.start.getTime();
    const mode: "hour" | "day" | "month" =
      length <= DAY ? "hour" : length <= 62 * DAY ? "day" : "month";
    const buckets = new Map<string, { label: string; revenue: number; orders: number }>();

    const keyOf = (date: Date) =>
      mode === "hour"
        ? `${date.getHours()}`
        : mode === "day"
          ? toInputDate(date)
          : `${date.getFullYear()}-${date.getMonth()}`;

    const cursor = new Date(range.start);
    while (cursor < range.end && buckets.size < 400) {
      const label =
        mode === "hour"
          ? `${String(cursor.getHours()).padStart(2, "0")}h`
          : mode === "day"
            ? cursor.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
            : cursor.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
      buckets.set(keyOf(cursor), { label, revenue: 0, orders: 0 });
      if (mode === "hour") cursor.setHours(cursor.getHours() + 1);
      else if (mode === "day") cursor.setDate(cursor.getDate() + 1);
      else cursor.setMonth(cursor.getMonth() + 1, 1);
    }

    periodOrders
      .filter((order) => getPaymentState(order) !== "canceled")
      .forEach((order) => {
        const bucket = buckets.get(keyOf(new Date(order.timestamp)));
        if (!bucket) return;
        bucket.revenue += Number(order.total) || 0;
        bucket.orders += 1;
      });

    return Array.from(buckets.values());
  }, [periodOrders, range]);

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {
      "paid-delivered": 0,
      "paid-open": 0,
      pending: 0,
      canceled: 0,
    };
    periodOrders.forEach((order) => {
      const payment = getPaymentState(order);
      if (payment === "canceled") counts.canceled += 1;
      else if (payment === "pending") counts.pending += 1;
      else if (getDeliveryState(order) === "delivered") counts["paid-delivered"] += 1;
      else counts["paid-open"] += 1;
    });
    return STATUS_SLICES.map((slice) => ({ ...slice, value: counts[slice.key] }));
  }, [periodOrders]);

  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; quantity: number; revenue: number }>();
    periodOrders
      .filter((order) => getPaymentState(order) !== "canceled")
      .forEach((order) =>
        (Array.isArray(order.items) ? order.items : []).forEach((item) => {
          const key = item.id || item.productId || item.name;
          const entry = map.get(key) || { name: item.name, quantity: 0, revenue: 0 };
          const quantity = Number(item.quantity) || 0;
          entry.quantity += quantity;
          entry.revenue += quantity * (Number(item.price) || 0);
          map.set(key, entry);
        }),
      );
    return Array.from(map.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 6);
  }, [periodOrders]);

  const paymentData = useMemo(() => {
    const map = new Map<string, number>();
    periodOrders
      .filter((order) => getPaymentState(order) !== "canceled")
      .forEach((order) =>
        getOrderPaymentParts(order).forEach((part) => {
          const label = getPaymentMethodLabel(part.method);
          map.set(label, (map.get(label) || 0) + part.amount);
        }),
      );
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [periodOrders]);

  const recentOrders = useMemo(
    () =>
      [...orders]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 8),
    [orders],
  );

  const unpaidTotal = fixed.unpaid.reduce((sum, order) => sum + (Number(order.total) || 0), 0);
  const attention = [
    {
      key: "unpaid",
      show: fixed.unpaid.length > 0,
      icon: <IconCash />,
      tone: "warning" as const,
      title: `${formatInteger(fixed.unpaid.length)} pedido(s) a pagar`,
      text: `${formatCurrency(unpaidTotal)} a receber`,
      to: "/historico?filtro=a-pagar",
    },
    {
      key: "delivery",
      show: fixed.pendingDelivery > 0,
      icon: <IconTruck />,
      tone: "info" as const,
      title: `${formatInteger(fixed.pendingDelivery)} entrega(s) pendente(s)`,
      text:
        fixed.partialDelivery > 0
          ? `${formatInteger(fixed.partialDelivery)} com entrega parcial`
          : "Aguardando entrega ao cliente",
      to: "/historico?filtro=a-entregar",
    },
    {
      key: "out",
      show: stock.out.length > 0,
      icon: <IconAlert />,
      tone: "danger" as const,
      title: `${formatInteger(stock.out.length)} produto(s) esgotado(s)`,
      text: stock.out
        .slice(0, 3)
        .map((product) => product.name)
        .join(", "),
      to: "/admin/produtos?filtro=esgotado",
    },
    {
      key: "low",
      show: stock.low.length > 0,
      icon: <IconBox />,
      tone: "warning" as const,
      title: `${formatInteger(stock.low.length)} com estoque baixo`,
      text: stock.low
        .slice(0, 3)
        .map((product) => `${product.name} (${product.stock})`)
        .join(", "),
      to: "/admin/produtos?filtro=estoque-baixo",
    },
  ].filter((item) => item.show);

  const compareLabel = PERIOD_COMPARE_LABEL[period];
  const totalStatus = statusData.reduce((sum, slice) => sum + slice.value, 0);
  const totalPayments = paymentData.reduce((sum, entry) => sum + entry.value, 0);
  const maxTopQuantity = topProducts[0]?.quantity || 1;

  const openOrder = (order: Order) =>
    navigate("/historico/detalhes", { state: { order } });

  return (
    <div>
      <PageHeader
        eyebrow={new Date().toLocaleDateString("pt-BR", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
        title={`${greeting()}${currentUser?.name ? `, ${currentUser.name.split(" ")[0]}` : ""}`}
        description="Resumo das vendas, pedidos e estoque da Prime Plush."
        actions={
          <>
            {lastUpdated && (
              <span className="hidden text-xs text-[color:var(--pp-text-3)] sm:inline">
                Atualizado {formatRelative(lastUpdated)}
              </span>
            )}
            <Button
              variant="secondary"
              icon={<IconRefresh />}
              loading={refreshing}
              onClick={() => load(true)}
            >
              Atualizar
            </Button>
            <Button variant="primary" icon={<IconCart />} onClick={() => navigate("/menu")}>
              Nova venda
            </Button>
          </>
        }
      />

      {/* Filtro de período */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented
          options={PERIOD_OPTIONS}
          value={period}
          onChange={setPeriod}
          ariaLabel="Período"
        />
        {period === "custom" && (
          <div className="flex flex-wrap items-center gap-2 pp-animate-in">
            <input
              type="date"
              className="pp-input"
              style={{ width: 160, height: 36 }}
              value={customStart}
              max={customEnd}
              onChange={(e) => setCustomStart(e.target.value)}
              aria-label="Data inicial"
            />
            <span className="text-sm text-[color:var(--pp-text-3)]">até</span>
            <input
              type="date"
              className="pp-input"
              style={{ width: 160, height: 36 }}
              value={customEnd}
              min={customStart}
              onChange={(e) => setCustomEnd(e.target.value)}
              aria-label="Data final"
            />
          </div>
        )}
      </div>

      {error && (
        <Card className="mb-5 border-[color:var(--pp-danger)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[color:var(--pp-danger)]">{error}</p>
            <Button size="sm" onClick={() => load()}>
              Tentar novamente
            </Button>
          </div>
        </Card>
      )}

      {/* Indicadores do período */}
      <div className="pp-stagger grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Faturamento"
          value={current.revenue}
          format={formatCurrency}
          icon={<IconWallet />}
          tone="brand"
          delta={percentChange(current.revenue, previous.revenue)}
          deltaLabel={compareLabel}
          loading={loading}
        />
        <StatCard
          label="Pedidos"
          value={current.orders}
          icon={<IconReceipt />}
          tone="violet"
          delta={percentChange(current.orders, previous.orders)}
          deltaLabel={compareLabel}
          hint={`${formatInteger(current.itemsSold)} itens`}
          loading={loading}
          onClick={() => navigate("/historico")}
        />
        <StatCard
          label="Ticket médio"
          value={current.averageTicket}
          format={formatCurrency}
          icon={<IconTrend />}
          tone="success"
          delta={percentChange(current.averageTicket, previous.averageTicket)}
          deltaLabel={compareLabel}
          loading={loading}
        />
        <StatCard
          label="A receber no período"
          value={current.toReceive}
          format={formatCurrency}
          icon={<IconClock />}
          tone="warning"
          hint={`${formatInteger(current.toReceiveCount)} pedido(s) a pagar`}
          loading={loading}
          onClick={() => navigate("/historico?filtro=a-pagar")}
        />
      </div>

      {/* Indicadores fixos */}
      <div className="pp-stagger mt-4 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard
          label="Faturamento hoje"
          value={fixed.todayRevenue}
          format={formatCurrency}
          icon={<IconCalendar />}
          tone="brand"
          hint={`${formatInteger(fixed.todayOrders)} pedido(s)`}
          loading={loading}
        />
        <StatCard
          label="Faturamento do mês"
          value={fixed.monthRevenue}
          format={formatCurrency}
          icon={<IconWallet />}
          tone="violet"
          hint={`${formatInteger(fixed.monthOrders)} pedido(s)`}
          loading={loading}
        />
        <StatCard
          label="Entregas pendentes"
          value={fixed.pendingDelivery}
          icon={<IconTruck />}
          tone="info"
          hint={fixed.partialDelivery ? `${fixed.partialDelivery} parcial(is)` : undefined}
          loading={loading}
          onClick={() => navigate("/historico?filtro=a-entregar")}
        />
        <StatCard
          label="Novos clientes"
          value={newCustomers.current}
          icon={<IconUserPlus />}
          tone="success"
          delta={percentChange(newCustomers.current, newCustomers.previous)}
          hint={`${formatInteger(customers.length)} no total`}
          loading={loading}
          onClick={() => navigate("/admin/clientes")}
        />
        <StatCard
          label="Estoque baixo"
          value={stock.low.length + stock.out.length}
          icon={<IconAlert />}
          tone={stock.out.length ? "danger" : "warning"}
          hint={`${formatInteger(stock.out.length)} esgotado(s)`}
          loading={loading}
          onClick={() => navigate("/admin/produtos?filtro=estoque-baixo")}
        />
      </div>

      {/* Gráficos principais */}
      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card
          className="xl:col-span-2 pp-animate-in"
          title="Evolução das vendas"
          subtitle={
            chartMetric === "revenue"
              ? `${formatCurrency(current.revenue)} no período`
              : `${formatInteger(current.orders)} pedidos no período`
          }
          actions={
            <Segmented
              options={[
                { value: "revenue", label: "Faturamento" },
                { value: "orders", label: "Pedidos" },
              ]}
              value={chartMetric}
              onChange={setChartMetric}
              ariaLabel="Métrica do gráfico"
            />
          }
        >
          {loading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ppRevenueFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563eb" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...chartGridProps} />
                  <XAxis dataKey="label" {...chartAxisProps} minTickGap={16} />
                  <YAxis
                    {...chartAxisProps}
                    width={chartMetric === "revenue" ? 72 : 36}
                    allowDecimals={chartMetric === "revenue"}
                    tickFormatter={(value: number) =>
                      chartMetric === "revenue"
                        ? value >= 1000
                          ? `R$ ${(value / 1000).toFixed(1)}k`
                          : `R$ ${value}`
                        : String(value)
                    }
                  />
                  <Tooltip
                    {...chartTooltipProps}
                    formatter={(value: number) =>
                      chartMetric === "revenue"
                        ? [formatCurrency(value), "Faturamento"]
                        : [formatInteger(value), "Pedidos"]
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey={chartMetric}
                    stroke="#2563eb"
                    strokeWidth={2}
                    fill="url(#ppRevenueFill)"
                    activeDot={{ r: 4, strokeWidth: 0 }}
                    animationDuration={700}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card
          className="pp-animate-in"
          title="Pedidos por status"
          subtitle={`${formatInteger(totalStatus)} pedidos no período`}
        >
          {loading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : totalStatus === 0 ? (
            <EmptyState
              icon={<IconReceipt />}
              title="Sem pedidos no período"
              description="Escolha outro período para ver a distribuição."
            />
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="relative h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData.filter((slice) => slice.value > 0)}
                      dataKey="value"
                      nameKey="label"
                      innerRadius={58}
                      outerRadius={82}
                      paddingAngle={2}
                      stroke="none"
                      animationDuration={700}
                    >
                      {statusData
                        .filter((slice) => slice.value > 0)
                        .map((slice) => (
                          <Cell key={slice.key} fill={slice.color} />
                        ))}
                    </Pie>
                    <Tooltip
                      {...chartTooltipProps}
                      formatter={(value: number, name: string) => [formatInteger(value), name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="pp-num text-2xl font-semibold">{formatInteger(totalStatus)}</span>
                  <span className="text-xs text-[color:var(--pp-text-3)]">pedidos</span>
                </div>
              </div>
              <ul className="w-full space-y-2">
                {statusData.map((slice) => (
                  <li key={slice.key} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-[color:var(--pp-text-2)]">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: slice.color }}
                      />
                      {slice.label}
                    </span>
                    <span className="pp-num font-medium">
                      {formatInteger(slice.value)}
                      <span className="ml-2 text-xs text-[color:var(--pp-text-3)]">
                        {totalStatus ? Math.round((slice.value / totalStatus) * 100) : 0}%
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Precisa de atenção */}
        <Card
          className="pp-animate-in"
          title="Precisa de atenção"
          subtitle="O que pede ação agora"
        >
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : attention.length === 0 ? (
            <EmptyState
              icon={<IconCheckCircle />}
              title="Tudo em dia"
              description="Nenhum pedido a pagar, entrega pendente ou produto com estoque baixo."
            />
          ) : (
            <ul className="space-y-2">
              {attention.map((item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => navigate(item.to)}
                    className="group flex w-full items-center gap-3 rounded-xl border border-[color:var(--pp-border)] p-3 text-left transition-colors hover:border-[color:var(--pp-border-strong)] hover:bg-[color:var(--pp-surface-2)]"
                  >
                    <span className={`pp-stat-icon pp-tone-${item.tone}`}>{item.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{item.title}</span>
                      <span className="block truncate text-xs text-[color:var(--pp-text-3)]">
                        {item.text}
                      </span>
                    </span>
                    <IconArrowRight className="h-4 w-4 text-[color:var(--pp-text-3)] transition-transform group-hover:translate-x-0.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Mais vendidos */}
        <Card
          className="pp-animate-in"
          title="Mais vendidos"
          subtitle="Por quantidade no período"
          actions={
            <Button size="sm" variant="ghost" onClick={() => navigate("/admin/management-report")}>
              Ver relatório
            </Button>
          }
        >
          {loading ? (
            <div className="space-y-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : topProducts.length === 0 ? (
            <EmptyState icon={<IconBox />} title="Nenhuma venda no período" />
          ) : (
            <ul className="space-y-3.5">
              {topProducts.map((product, index) => (
                <li key={`${product.name}-${index}`}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="pp-num w-4 shrink-0 text-xs font-semibold text-[color:var(--pp-text-3)]">
                        {index + 1}
                      </span>
                      <span className="truncate font-medium">{product.name}</span>
                    </span>
                    <span className="pp-num shrink-0 text-[color:var(--pp-text-2)]">
                      {formatInteger(product.quantity)} un.
                    </span>
                  </div>
                  <div className="pp-progress">
                    <span
                      style={{
                        width: `${Math.max(4, (product.quantity / maxTopQuantity) * 100)}%`,
                        background: CHART_COLORS[index % CHART_COLORS.length],
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Formas de pagamento */}
        <Card
          className="pp-animate-in"
          title="Formas de pagamento"
          subtitle="Valor recebido por forma no período"
        >
          {loading ? (
            <Skeleton className="h-[220px] w-full" />
          ) : paymentData.length === 0 ? (
            <EmptyState icon={<IconWallet />} title="Sem pagamentos no período" />
          ) : (
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={paymentData}
                  layout="vertical"
                  margin={{ top: 0, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid {...chartGridProps} horizontal={false} vertical />
                  <XAxis
                    type="number"
                    {...chartAxisProps}
                    tickFormatter={(value: number) =>
                      value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value)
                    }
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    {...chartAxisProps}
                    width={110}
                  />
                  <Tooltip
                    {...chartTooltipProps}
                    formatter={(value: number) => [
                      `${formatCurrency(value)} (${totalPayments ? Math.round((value / totalPayments) * 100) : 0}%)`,
                      "Valor",
                    ]}
                  />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={16} animationDuration={700}>
                    {paymentData.map((entry, index) => (
                      <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Atividade recente */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card
          className="xl:col-span-2 pp-animate-in"
          title="Últimos pedidos"
          flush
          actions={
            <Button
              size="sm"
              variant="ghost"
              icon={<IconArrowRight />}
              onClick={() => navigate("/historico")}
            >
              Ver todos
            </Button>
          }
        >
          {loading ? (
            <SkeletonRows rows={6} cols={5} />
          ) : recentOrders.length === 0 ? (
            <EmptyState icon={<IconReceipt />} title="Nenhum pedido ainda" />
          ) : (
            <div className="pp-table-wrap">
              <table className="pp-table">
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Cliente</th>
                    <th>Pagamento</th>
                    <th className="hidden md:table-cell">Entrega</th>
                    <th style={{ textAlign: "right" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => {
                    const payment = PAYMENT_STATE_META[getPaymentState(order)];
                    const delivery = DELIVERY_STATE_META[getDeliveryState(order)];
                    return (
                      <tr
                        key={order.id}
                        data-clickable="true"
                        onClick={() => openOrder(order)}
                      >
                        <td>
                          <div className="font-medium">#{order.id.slice(-4)}</div>
                          <div className="text-xs text-[color:var(--pp-text-3)]">
                            {formatRelative(order.timestamp)}
                          </div>
                        </td>
                        <td>
                          <div className="flex items-center gap-2.5">
                            <Avatar name={order.userName} size={28} />
                            <span className="max-w-[180px] truncate">{order.userName || "-"}</span>
                          </div>
                        </td>
                        <td>
                          <Badge tone={payment.tone} dot>
                            {payment.label}
                          </Badge>
                        </td>
                        <td className="hidden md:table-cell">
                          <Badge tone={delivery.tone} dot>
                            {delivery.label}
                          </Badge>
                        </td>
                        <td className="pp-num text-right font-medium">
                          {formatCurrency(Number(order.total) || 0)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          className="pp-animate-in"
          title="Novos clientes"
          actions={
            <Button size="sm" variant="ghost" onClick={() => navigate("/admin/clientes")}>
              Ver todos
            </Button>
          }
        >
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : newCustomers.latest.length === 0 ? (
            <EmptyState icon={<IconUserPlus />} title="Nenhum cadastro recente" />
          ) : (
            <ul className="space-y-3">
              {newCustomers.latest.map(({ user, createdAt }) => (
                <li key={user.id} className="flex items-center gap-3">
                  <Avatar name={user.name} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{user.name}</div>
                    <div className="truncate text-xs text-[color:var(--pp-text-3)]">
                      {user.email || user.cpf || "-"}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-[color:var(--pp-text-3)]">
                    {formatRelative(createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboardPage;

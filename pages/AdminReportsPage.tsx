import React, { useState, useEffect, useMemo } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Order } from "../types";
import { authenticatedFetch } from "../services/apiService";
import {
  Badge,
  Button,
  Card,
  CHART_COLORS,
  EmptyState,
  PageHeader,
  Skeleton,
  StatCard,
  chartAxisProps,
  chartGridProps,
  chartTooltipProps,
  formatCurrency,
  formatInteger,
} from "../components/admin/ui";
import {
  IconAlert,
  IconCalendar,
  IconChart,
  IconClock,
  IconReceipt,
  IconSparkles,
  IconTag,
  IconTrend,
  IconWallet,
} from "../components/admin/icons";

interface AIRecommendation {
  topProducts: { name: string; quantity: number; revenue: number }[];
  peakDays: { day: string; orders: number }[];
  peakHours: { hour: string; orders: number }[];
  monthlyRevenue: number;
  insights: string;
}

// Cores para os gráficos (paleta do painel)
const COLORS = CHART_COLORS;

const compactCurrency = (value: number) =>
  value >= 1000 ? `R$ ${(value / 1000).toFixed(1)}k` : `R$ ${Math.round(value)}`;

// Lista ranqueada com barra proporcional (dias e horários de pico)
const RankList: React.FC<{
  items: { label: string; value: number }[];
  color: string;
  emptyText: string;
}> = ({ items, color, emptyText }) => {
  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-[color:var(--pp-text-3)]">
        {emptyText}
      </p>
    );
  }
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <ul className="space-y-4">
      {items.map((item, index) => (
        <li key={item.label}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="pp-num flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[color:var(--pp-surface-2)] text-xs font-semibold text-[color:var(--pp-text-2)]">
                {index + 1}
              </span>
              <span className="truncate font-medium text-[color:var(--pp-text)]">
                {item.label}
              </span>
            </span>
            <span className="pp-num shrink-0 font-semibold text-[color:var(--pp-text)]">
              {formatInteger(item.value)}
              <span className="ml-1 text-xs font-normal text-[color:var(--pp-text-3)]">
                pedidos
              </span>
            </span>
          </div>
          <div className="pp-progress">
            <span
              style={{
                width: `${(item.value / max) * 100}%`,
                background: color,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
};

// Esqueleto exibido enquanto a primeira análise é gerada
const ReportSkeleton: React.FC = () => (
  <div className="space-y-4">
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {[0, 1, 2].map((key) => (
        <div key={key} className="pp-card p-5">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-4 h-7 w-36" />
          <Skeleton className="mt-2 h-3 w-24" />
        </div>
      ))}
    </div>
    <div className="pp-card p-5">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="mt-5 h-[300px] w-full" />
    </div>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Skeleton className="h-[320px] w-full" />
      <Skeleton className="h-[320px] w-full" />
    </div>
  </div>
);

const AdminReportsPage: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [recommendation, setRecommendation] = useState<AIRecommendation | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  // Só controla o esqueleto da tela enquanto os pedidos chegam
  const [ordersLoading, setOrdersLoading] = useState(true);

  // Buscar todos os pedidos
  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:3001"}/api/user-orders`,
      );
      if (!res.ok) throw new Error("Erro ao buscar pedidos");
      const data = await res.json();
      setOrders(data);
    } catch (err) {
      console.error("Erro ao buscar pedidos:", err);
    } finally {
      setOrdersLoading(false);
    }
  };

  // Gerar relatório com IA
  const generateAIReport = async () => {
    setIsLoading(true);
    setError("");

    try {
      // Processar dados localmente primeiro
      const analysis = analyzeOrders(orders);

      // Gerar insights com IA
      const prompt = `Você é um consultor de negócios para um restaurante de sushi. Analize os seguintes dados e forneça recomendações estratégicas:

📊 DADOS DO MÊS:
- Faturamento Total: R$ ${analysis.monthlyRevenue.toFixed(2)}
- Total de Pedidos: ${orders.length}

🏆 PRODUTOS MAIS VENDIDOS:
${analysis.topProducts
  .map(
    (p, i) =>
      `${i + 1}. ${p.name}: ${p.quantity} unidades (R$ ${p.revenue.toFixed(2)})`,
  )
  .join("\n")}

📅 DIAS COM MAIS PEDIDOS:
${analysis.peakDays
  .map((d, i) => `${i + 1}. ${d.day}: ${d.orders} pedidos`)
  .join("\n")}

⏰ HORÁRIOS DE PICO:
${analysis.peakHours
  .map((h, i) => `${i + 1}. ${h.hour}: ${h.orders} pedidos`)
  .join("\n")}

Forneça 3-5 recomendações práticas e objetivas para:
1. Otimizar estoque dos produtos mais vendidos
2. Melhorar operação nos horários de pico
3. Aumentar vendas nos períodos mais fracos
4. Sugestões de promoções ou novos produtos

Seja direto e focado em ações práticas. Use emojis para deixar mais visual.`;

      const res = await authenticatedFetch(
        `${
          import.meta.env.VITE_API_URL || "http://localhost:3001"
        }/api/ai/suggestion`,
        {
          method: "POST",
          body: JSON.stringify({ prompt }),
        },
      );

      if (!res.ok) throw new Error("Erro na API de IA");

      const data = await res.json();

      setRecommendation({
        ...analysis,
        insights: data.text,
      });
    } catch (err) {
      console.error("Erro ao gerar relatório:", err);
      setError("Erro ao gerar recomendações. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  // Análise de dados dos pedidos
  const analyzeOrders = (
    orders: Order[],
  ): Omit<AIRecommendation, "insights"> => {
    // Filtrar pedidos do mês atual
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthOrders = orders.filter((order) => {
      const orderDate = new Date(order.timestamp);
      return (
        orderDate.getMonth() === currentMonth &&
        orderDate.getFullYear() === currentYear
      );
    });

    // Calcular faturamento mensal
    const monthlyRevenue = monthOrders.reduce(
      (sum, order) => sum + order.total,
      0,
    );

    // Produtos mais vendidos
    const productMap = new Map<string, { quantity: number; revenue: number }>();
    monthOrders.forEach((order) => {
      order.items.forEach((item) => {
        const existing = productMap.get(item.name) || {
          quantity: 0,
          revenue: 0,
        };
        productMap.set(item.name, {
          quantity: existing.quantity + item.quantity,
          revenue: existing.revenue + item.price * item.quantity,
        });
      });
    });

    const topProducts = Array.from(productMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    // Dias da semana com mais pedidos
    const dayMap = new Map<string, number>();
    const dayNames = [
      "Domingo",
      "Segunda",
      "Terça",
      "Quarta",
      "Quinta",
      "Sexta",
      "Sábado",
    ];
    monthOrders.forEach((order) => {
      const day = dayNames[new Date(order.timestamp).getDay()];
      dayMap.set(day, (dayMap.get(day) || 0) + 1);
    });

    const peakDays = Array.from(dayMap.entries())
      .map(([day, orders]) => ({ day, orders }))
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 3);

    // Horários de pico
    const hourMap = new Map<string, number>();
    monthOrders.forEach((order) => {
      const hour = new Date(order.timestamp).getHours();
      const hourRange = `${hour}:00 - ${hour + 1}:00`;
      hourMap.set(hourRange, (hourMap.get(hourRange) || 0) + 1);
    });

    const peakHours = Array.from(hourMap.entries())
      .map(([hour, orders]) => ({ hour, orders }))
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 5);

    return { topProducts, peakDays, peakHours, monthlyRevenue };
  };

  // Gerar dados de evolução de vendas (últimos 30 dias)
  const salesEvolutionData = useMemo(() => {
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (29 - i));
      return date;
    });

    return last30Days.map((date) => {
      const dayOrders = orders.filter((order) => {
        const orderDate = new Date(order.timestamp);
        return orderDate.toDateString() === date.toDateString();
      });

      const revenue = dayOrders.reduce((sum, order) => sum + order.total, 0);

      return {
        date: `${date.getDate()}/${date.getMonth() + 1}`,
        pedidos: dayOrders.length,
        faturamento: revenue,
      };
    });
  }, [orders]);

  // Gerar dados para gráfico de pizza (categorias)
  const categoriesData = useMemo(() => {
    const categoryMap = new Map<string, number>();

    orders.forEach((order) => {
      order.items.forEach((item) => {
        const category = item.category || "Outros";
        categoryMap.set(
          category,
          (categoryMap.get(category) || 0) + item.quantity,
        );
      });
    });

    return Array.from(categoryMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [orders]);


  const categoriesTotal = categoriesData.reduce(
    (sum, category) => sum + category.value,
    0,
  );

  return (
    <div>
      <PageHeader
        title="Relatórios"
        description="Análise inteligente de vendas e recomendações estratégicas"
        actions={
          <Button
            variant="primary"
            icon={<IconSparkles />}
            onClick={generateAIReport}
            disabled={isLoading || orders.length === 0}
            loading={isLoading}
          >
            {isLoading
              ? "Gerando análise..."
              : recommendation
                ? "Gerar novamente"
                : "Gerar relatório com IA"}
          </Button>
        }
      />

      {error && (
        <div
          role="alert"
          className="pp-animate-in mb-4 flex items-center gap-3 rounded-xl border border-rose-200 bg-[color:var(--pp-danger-soft)] px-4 py-3 text-sm text-[color:var(--pp-danger)]"
        >
          <IconAlert className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      {/* Antes do primeiro relatório */}
      {!recommendation &&
        (isLoading ? (
          <ReportSkeleton />
        ) : (
          <Card className="pp-animate-in">
            {ordersLoading ? (
              <div className="flex flex-col items-center gap-3 py-12">
                <Skeleton className="h-12 w-12 rounded-2xl" />
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-3 w-72" />
              </div>
            ) : (
              <EmptyState
                icon={<IconSparkles />}
                title={
                  orders.length === 0
                    ? "Nenhum pedido encontrado para análise"
                    : "Gere seu relatório com IA"
                }
                description={
                  orders.length === 0
                    ? "Assim que houver pedidos, o relatório fica disponível aqui."
                    : `${formatInteger(orders.length)} pedidos prontos para análise: faturamento do mês, produtos campeões, dias e horários de pico e recomendações estratégicas.`
                }
                action={
                  orders.length > 0 ? (
                    <Button
                      variant="primary"
                      icon={<IconSparkles />}
                      onClick={generateAIReport}
                      disabled={isLoading || orders.length === 0}
                      loading={isLoading}
                    >
                      Gerar relatório com IA
                    </Button>
                  ) : undefined
                }
              />
            )}
          </Card>
        ))}

      {/* Relatório */}
      {recommendation && (
        <div className="space-y-4">
          {/* Métricas principais */}
          <div className="pp-stagger grid grid-cols-1 gap-4 md:grid-cols-3">
            <StatCard
              label="Faturamento do mês"
              value={recommendation.monthlyRevenue}
              format={formatCurrency}
              icon={<IconWallet />}
              tone="success"
              hint={`Média: ${formatCurrency(
                recommendation.monthlyRevenue / orders.length || 0,
              )} por pedido`}
            />
            <StatCard
              label="Total de pedidos"
              value={orders.length}
              icon={<IconReceipt />}
              tone="brand"
              hint="Últimos 30 dias"
            />
            <div className="pp-card pp-stat w-full text-left">
              <div className="flex items-start justify-between gap-3">
                <span className="pp-stat-label">Produto top</span>
                <span className="pp-stat-icon pp-tone-warning">
                  <IconTag />
                </span>
              </div>
              <div
                className="mt-3 truncate text-xl font-semibold text-[color:var(--pp-text)]"
                title={recommendation.topProducts[0]?.name || "N/A"}
              >
                {recommendation.topProducts[0]?.name || "N/A"}
              </div>
              <div className="mt-1.5 text-xs text-[color:var(--pp-text-3)]">
                <span className="pp-num">
                  {formatInteger(recommendation.topProducts[0]?.quantity || 0)}
                </span>{" "}
                unidades
              </div>
            </div>
          </div>

          {/* Evolução de vendas - 30 dias */}
          <Card
            className="pp-animate-in"
            title="Evolução de vendas"
            subtitle="Últimos 30 dias"
            actions={
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[color:var(--pp-text-2)]">
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: COLORS[1] }}
                  />
                  Faturamento (R$)
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: COLORS[0] }}
                  />
                  Pedidos
                </span>
              </div>
            }
          >
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={salesEvolutionData}
                  margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="ppReportRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS[1]} stopOpacity={0.24} />
                      <stop offset="100%" stopColor={COLORS[1]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...chartGridProps} />
                  <XAxis dataKey="date" {...chartAxisProps} minTickGap={16} />
                  <YAxis
                    yAxisId="revenue"
                    {...chartAxisProps}
                    width={72}
                    tickFormatter={compactCurrency}
                  />
                  <YAxis
                    yAxisId="orders"
                    orientation="right"
                    {...chartAxisProps}
                    width={32}
                    allowDecimals={false}
                  />
                  <Tooltip
                    {...chartTooltipProps}
                    formatter={(value: number, name: string) => [
                      name === "faturamento"
                        ? formatCurrency(value)
                        : formatInteger(value),
                      name === "faturamento" ? "Faturamento" : "Pedidos",
                    ]}
                  />
                  <Area
                    yAxisId="revenue"
                    type="monotone"
                    dataKey="faturamento"
                    stroke={COLORS[1]}
                    strokeWidth={2}
                    fill="url(#ppReportRevenue)"
                    activeDot={{ r: 4, strokeWidth: 0 }}
                    animationDuration={700}
                  />
                  <Line
                    yAxisId="orders"
                    type="monotone"
                    dataKey="pedidos"
                    stroke={COLORS[0]}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                    animationDuration={700}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Categorias mais vendidas (donut) */}
            <Card
              className="pp-animate-in"
              title="Categorias mais vendidas"
              subtitle="Unidades vendidas por categoria"
            >
              {categoriesData.length === 0 ? (
                <EmptyState icon={<IconChart />} title="Sem vendas por categoria" />
              ) : (
                <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
                  <div className="relative h-[200px] w-full sm:w-[200px] sm:shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoriesData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={62}
                          outerRadius={90}
                          paddingAngle={2}
                          stroke="none"
                          animationDuration={700}
                        >
                          {categoriesData.map((entry, index) => (
                            <Cell
                              key={`cell-${entry.name}`}
                              fill={COLORS[index % COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          {...chartTooltipProps}
                          formatter={(value: number, name: string) => [
                            `${formatInteger(value)} unidades`,
                            name,
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="pp-num text-2xl font-semibold">
                        {formatInteger(categoriesTotal)}
                      </span>
                      <span className="text-xs text-[color:var(--pp-text-3)]">
                        unidades
                      </span>
                    </div>
                  </div>
                  <ul className="w-full min-w-0 space-y-2.5">
                    {categoriesData.map((cat, index) => (
                      <li
                        key={cat.name}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="flex min-w-0 items-center gap-2 text-[color:var(--pp-text-2)]">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{
                              backgroundColor: COLORS[index % COLORS.length],
                            }}
                          />
                          <span className="truncate">{cat.name}</span>
                        </span>
                        <span className="pp-num shrink-0 font-medium">
                          {formatInteger(cat.value)} un.
                          <span className="ml-2 inline-block w-9 text-right text-xs text-[color:var(--pp-text-3)]">
                            {categoriesTotal
                              ? Math.round((cat.value / categoriesTotal) * 100)
                              : 0}
                            %
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>

            {/* Top 5 produtos (barras) */}
            <Card
              className="pp-animate-in"
              title="Top 5 produtos"
              subtitle="Quantidade vendida no mês"
            >
              {recommendation.topProducts.length === 0 ? (
                <EmptyState icon={<IconTag />} title="Sem vendas no mês" />
              ) : (
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={recommendation.topProducts}
                      layout="vertical"
                      margin={{ top: 0, right: 12, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid {...chartGridProps} horizontal={false} vertical />
                      <XAxis
                        type="number"
                        {...chartAxisProps}
                        allowDecimals={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        {...chartAxisProps}
                        width={120}
                        tickFormatter={(value: string) =>
                          value.length > 16 ? `${value.slice(0, 15)}…` : value
                        }
                      />
                      <Tooltip
                        {...chartTooltipProps}
                        formatter={(value: number, name: string) => [
                          name === "revenue"
                            ? formatCurrency(value)
                            : formatInteger(value),
                          name === "revenue" ? "Faturamento" : "Quantidade",
                        ]}
                      />
                      <Bar
                        dataKey="quantity"
                        radius={[0, 6, 6, 0]}
                        barSize={18}
                        animationDuration={700}
                      >
                        {recommendation.topProducts.map((product, index) => (
                          <Cell
                            key={product.name}
                            fill={COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          {/* Detalhamento de produtos */}
          <Card
            className="pp-animate-in"
            title="Detalhamento de produtos"
            subtitle="Produtos mais vendidos no mês"
            flush
          >
            {recommendation.topProducts.length === 0 ? (
              <EmptyState icon={<IconTag />} title="Sem vendas no mês" />
            ) : (
              <div className="pp-table-wrap">
                <table className="pp-table">
                  <thead>
                    <tr>
                      <th style={{ width: 56 }}>#</th>
                      <th>Produto</th>
                      <th style={{ textAlign: "right" }}>Unidades</th>
                      <th style={{ textAlign: "right" }}>Faturamento</th>
                      <th className="hidden sm:table-cell" style={{ textAlign: "right" }}>
                        Preço médio
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recommendation.topProducts.map((product, index) => (
                      <tr key={product.name}>
                        <td>
                          <Badge tone={index === 0 ? "warning" : "neutral"}>
                            #{index + 1}
                          </Badge>
                        </td>
                        <td>
                          <div className="max-w-[260px] truncate font-medium">
                            {product.name}
                          </div>
                          <div className="text-xs text-[color:var(--pp-text-3)] sm:hidden">
                            Média: {formatCurrency(product.revenue / product.quantity)}
                          </div>
                        </td>
                        <td className="pp-num text-right">
                          {formatInteger(product.quantity)}
                        </td>
                        <td className="pp-num text-right font-semibold text-[color:var(--pp-success)]">
                          {formatCurrency(product.revenue)}
                        </td>
                        <td className="pp-num hidden text-right text-[color:var(--pp-text-2)] sm:table-cell">
                          {formatCurrency(product.revenue / product.quantity)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Dias e horários */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card
              className="pp-animate-in"
              title={
                <span className="flex items-center gap-2">
                  <IconCalendar className="h-4 w-4 text-[color:var(--pp-brand)]" />
                  Dias com mais pedidos
                </span>
              }
            >
              <RankList
                items={recommendation.peakDays.map((day) => ({
                  label: day.day,
                  value: day.orders,
                }))}
                color={COLORS[0]}
                emptyText="Sem pedidos no mês"
              />
            </Card>

            <Card
              className="pp-animate-in"
              title={
                <span className="flex items-center gap-2">
                  <IconClock className="h-4 w-4 text-[color:var(--pp-danger)]" />
                  Horários de pico
                </span>
              }
            >
              <RankList
                items={recommendation.peakHours.map((hour) => ({
                  label: hour.hour,
                  value: hour.orders,
                }))}
                color={COLORS[4]}
                emptyText="Sem pedidos no mês"
              />
            </Card>
          </div>

          {/* Insights da IA */}
          <section className="pp-card pp-animate-in relative overflow-hidden">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-600 via-violet-500 to-fuchsia-500"
            />
            <header className="pp-card-header">
              <div className="flex min-w-0 items-center gap-3">
                <span className="pp-stat-icon pp-tone-violet">
                  <IconSparkles />
                </span>
                <div className="min-w-0">
                  <h2 className="pp-card-title">
                    Recomendações estratégicas da IA
                  </h2>
                  <p className="pp-card-subtitle">
                    Baseadas nos dados de vendas do mês
                  </p>
                </div>
              </div>
              <Badge tone="violet" dot>
                <IconTrend className="mr-0.5 h-3 w-3" /> IA
              </Badge>
            </header>
            <div className="pp-card-body">
              {isLoading ? (
                <div className="space-y-3" aria-busy="true">
                  <Skeleton className="h-4 w-11/12" />
                  <Skeleton className="h-4 w-10/12" />
                  <Skeleton className="h-4 w-9/12" />
                  <Skeleton className="h-4 w-11/12" />
                  <Skeleton className="h-4 w-7/12" />
                </div>
              ) : (
                <div className="max-w-none whitespace-pre-wrap text-[15px] leading-relaxed text-[color:var(--pp-text-2)]">
                  {recommendation.insights}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default AdminReportsPage;

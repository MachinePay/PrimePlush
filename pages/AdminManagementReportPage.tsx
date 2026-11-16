import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { authenticatedFetch } from "../services/apiService";
import {
  Badge,
  Button,
  CHART_COLORS,
  Card,
  EmptyState,
  Field,
  PageHeader,
  Segmented,
  Skeleton,
  SkeletonRows,
  SortHeader,
  StatCard,
  chartAxisProps,
  chartGridProps,
  chartTooltipProps,
  formatDateTime,
  sortRows,
} from "../components/admin/ui";
import type { SortState, Tone } from "../components/admin/ui";
import {
  IconAlert,
  IconBox,
  IconCalendar,
  IconCash,
  IconChart,
  IconCheckCircle,
  IconClock,
  IconFile,
  IconFilter,
  IconReceipt,
  IconRefresh,
  IconShield,
  IconTag,
  IconTrend,
  IconTruck,
  IconWallet,
} from "../components/admin/icons";

interface ManagementReportSummary {
  totalOrders: number;
  totalOrderAttempts: number;
  successfulOrders: number;
  canceledOrders: number;
  pendingOrders: number;
  totalItemsSold: number;
  totalRevenue: number;
  averageTicket: number;
  successRate: number;
  cancellationRate: number;
  pendingRate: number;
  totalToPayGiraKids: number;
  totalPaidToGiraKids: number;
  totalGiraKidsAccrued: number;
}

interface ProductManagementReport {
  productId: string;
  name: string;
  category?: string;
  stock?: number | null;
  minStock?: number;
  quantitySold: number;
  revenue: number;
  giraKidsValue: number;
}

interface ProductVolumeAnalyticsItem {
  productId: string;
  name: string;
  category: string;
  quantitySold: number;
  quantityIncoming: number;
  totalIncoming: number;
  totalOutgoing: number;
  revenue: number;
}

interface AbcAnalyticsItem {
  productId: string;
  name: string;
  category: string;
  quantitySold: number;
  quantityIncoming: number;
  revenue: number;
  revenueShare: number;
  cumulativeShare: number;
  classification: "A" | "B" | "C";
  totalIncoming?: number;
  totalOutgoing?: number;
}

interface CategoryPerformanceItem {
  category: string;
  quantitySold: number;
  revenue: number;
  revenueShare: number;
}

interface StockAlertItem {
  productId: string;
  name: string;
  category: string;
  stock: number;
  minStock: number;
  safetyStock: number;
  quantitySold: number;
  revenue: number;
  averageDailySales: number;
  daysToStockout: number | null;
  suggestedPurchase: number;
  severity: "critical" | "warning";
}

interface StockIncomingProductItem {
  productId: string;
  name: string;
  category: string;
  quantityIncoming: number;
  quantityOutgoing: number;
  stock: number | null;
}

interface ManagementReportResponse {
  success: boolean;
  summary: ManagementReportSummary;
  products: ProductManagementReport[];
  charts: {
    revenueEvolution: {
      daily: Array<{ label: string; revenue: number; orders: number }>;
      weekly: Array<{ label: string; revenue: number; orders: number }>;
      monthly: Array<{ label: string; revenue: number; orders: number }>;
    };
    paymentDistribution: Array<{
      method: string;
      name: string;
      value: number;
      orders: number;
      revenue: number;
    }>;
  };
  analytics: {
    periodDays: number;
    topProductsByVolume: ProductVolumeAnalyticsItem[];
    abcCurve: AbcAnalyticsItem[];
    categoryPerformance: CategoryPerformanceItem[];
    stockIncomingByProduct: StockIncomingProductItem[];
    stockAlerts: StockAlertItem[];
  };
  filters?: {
    startAt: string | null;
    endAt: string | null;
  };
  generatedAt: string;
}

type FilterMode = "general" | "custom";
type FilterPreset = "today" | "last7days" | "currentMonth";
type RevenueGranularity = "daily" | "weekly" | "monthly";

interface AppliedFilter {
  mode: FilterMode;
  startDate: string;
  endDate: string;
  label: string;
}

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const integerFormatter = new Intl.NumberFormat("pt-BR");
const percentFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const ABC_CLASS_COLORS = {
  A: "#ef4444",
  B: "#f59e0b",
  C: "#2563eb",
};
const ABC_CLASS_TONES: Record<"A" | "B" | "C", Tone> = {
  A: "danger",
  B: "warning",
  C: "info",
};

const formatCurrency = (value: number) =>
  currencyFormatter.format(Number.isFinite(value) ? value : 0);

const formatInteger = (value: number) =>
  integerFormatter.format(Number.isFinite(value) ? value : 0);

const formatPercent = (value: number) => `${percentFormatter.format(value)}%`;

const formatAxisCurrency = (value: number) => {
  if (!Number.isFinite(value)) return "R$ 0";
  if (Math.abs(value) >= 1000) {
    return `R$ ${(value / 1000).toFixed(1)}k`;
  }
  return `R$ ${Math.round(value)}`;
};

const truncateLabel = (value: string, maxLength = 24) => {
  if (!value) return "-";
  return value.length > maxLength
    ? `${value.slice(0, maxLength - 3)}...`
    : value;
};

const createGeneralFilter = (): AppliedFilter => ({
  mode: "general",
  startDate: "",
  endDate: "",
  label: "Data geral",
});

const formatDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toIsoBoundary = (date: string, type: "start" | "end") => {
  const time = type === "start" ? "T00:00:00.000" : "T23:59:59.999";
  return new Date(`${date}${time}`).toISOString();
};

const formatFilterDate = (date: string) => {
  if (!date) return "";
  return new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR");
};

const buildCustomFilterLabel = (startDate: string, endDate: string) =>
  `${formatFilterDate(startDate)} ate ${formatFilterDate(endDate)}`;

const createPresetFilter = (preset: FilterPreset): AppliedFilter => {
  const today = new Date();
  const endDate = formatDateInput(today);

  if (preset === "today") {
    return {
      mode: "custom",
      startDate: endDate,
      endDate,
      label: "Hoje",
    };
  }

  if (preset === "last7days") {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);

    return {
      mode: "custom",
      startDate: formatDateInput(start),
      endDate,
      label: "Ultimos 7 dias",
    };
  }

  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  return {
    mode: "custom",
    startDate: formatDateInput(firstDayOfMonth),
    endDate,
    label: "Mes atual",
  };
};

// ---------- Visualização (somente apresentação) ----------

type PeriodOption = "general" | FilterPreset | "custom";

const PERIOD_OPTIONS: Array<{ value: PeriodOption; label: string }> = [
  { value: "general", label: "Data geral" },
  { value: "today", label: "Hoje" },
  { value: "last7days", label: "Últimos 7 dias" },
  { value: "currentMonth", label: "Mês atual" },
  { value: "custom", label: "Personalizado" },
];

const GRANULARITY_OPTIONS: Array<{ value: RevenueGranularity; label: string }> =
  [
    { value: "daily", label: "Diário" },
    { value: "weekly", label: "Semanal" },
    { value: "monthly", label: "Mensal" },
  ];

// Inteiros arredondados durante a animação do número (valor final idêntico)
const formatIntegerAnimated = (value: number) =>
  formatInteger(Math.round(Number.isFinite(value) ? value : 0));

const MUTED = "text-[color:var(--pp-text-3)]";
const SECONDARY = "text-[color:var(--pp-text-2)]";

type AbcSortKey =
  | "rank"
  | "name"
  | "category"
  | "quantitySold"
  | "quantityIncoming"
  | "totalIncoming"
  | "totalOutgoing"
  | "revenue"
  | "revenueShare"
  | "cumulativeShare"
  | "classification";

type ProductSortKey =
  | "rank"
  | "name"
  | "quantitySold"
  | "revenue"
  | "giraKidsValue";

type IncomingSortKey =
  | "rank"
  | "name"
  | "category"
  | "quantityIncoming"
  | "quantityOutgoing"
  | "difference"
  | "stock";

type AlertSortKey =
  | "name"
  | "category"
  | "stock"
  | "minStock"
  | "safetyStock"
  | "averageDailySales"
  | "daysToStockout"
  | "suggestedPurchase"
  | "severity";

const readSortValue = (
  row: object,
  key: string,
): string | number | null | undefined => {
  const value = (row as Record<string, unknown>)[key];
  if (typeof value === "number" || typeof value === "string") return value;
  if (value === null) return null;
  return undefined;
};

const SectionHeading: React.FC<{
  icon: React.ReactNode;
  title: string;
  description?: string;
  aside?: React.ReactNode;
}> = ({ icon, title, description, aside }) => (
  <div className="mb-3 mt-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--pp-brand-soft)] text-[color:var(--pp-brand)] [&>svg]:h-4 [&>svg]:w-4">
        {icon}
      </span>
      <div>
        <h2 className="text-base font-semibold tracking-tight text-[color:var(--pp-text)]">
          {title}
        </h2>
        {description && <p className={`text-xs ${MUTED}`}>{description}</p>}
      </div>
    </div>
    {aside && <div className="flex flex-wrap items-center gap-2">{aside}</div>}
  </div>
);

const ChartEmpty: React.FC<{
  icon: React.ReactNode;
  title: string;
  height?: number;
}> = ({ icon, title, height = 320 }) => (
  <div
    className="flex items-center justify-center rounded-xl bg-[color:var(--pp-surface-2)]"
    style={{ minHeight: height }}
  >
    <EmptyState icon={icon} title={title} />
  </div>
);

const LegendDot: React.FC<{ color: string }> = ({ color }) => (
  <span
    className="h-2.5 w-2.5 shrink-0 rounded-full"
    style={{ backgroundColor: color }}
  />
);

const ReportSkeleton: React.FC = () => (
  <div className="space-y-4">
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {Array.from({ length: 5 }, (_, i) => (
        <StatCard key={i} label="Carregando..." value={0} loading />
      ))}
    </div>
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <StatCard key={i} label="Carregando..." value={0} loading />
      ))}
    </div>
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2" title="Evolução do faturamento">
        <Skeleton className="h-[320px] w-full" />
      </Card>
      <Card title="Distribuição de pagamentos">
        <Skeleton className="h-[320px] w-full" />
      </Card>
    </div>
    <Card title="Carregando relatório..." flush>
      <SkeletonRows rows={6} cols={5} />
    </Card>
  </div>
);

const AdminManagementReportPage: React.FC = () => {
  const [report, setReport] = useState<ManagementReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("general");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [revenueGranularity, setRevenueGranularity] =
    useState<RevenueGranularity>("daily");
  const [appliedFilter, setAppliedFilter] =
    useState<AppliedFilter>(createGeneralFilter);

  // Estado puramente visual (seleção do controle de período e ordenação)
  const [periodOption, setPeriodOption] = useState<PeriodOption>("general");
  const [abcSort, setAbcSort] = useState<SortState<AbcSortKey> | null>(null);
  const [productSort, setProductSort] =
    useState<SortState<ProductSortKey> | null>(null);
  const [incomingSort, setIncomingSort] =
    useState<SortState<IncomingSortKey> | null>(null);
  const [alertSort, setAlertSort] = useState<SortState<AlertSortKey> | null>(
    null,
  );

  // Proteção por senha extra
  const [senhaExtra, setSenhaExtra] = useState("");
  const [senhaCorreta, setSenhaCorreta] = useState(false);
  const [senhaErro, setSenhaErro] = useState("");

  // Troque pela senha real depois
  const SENHA_ESPECIAL = "135";

  const fetchReport = useCallback(async (filter: AppliedFilter) => {
    setLoading(true);
    setError("");

    try {
      if (filter.mode === "custom") {
        if (!filter.startDate || !filter.endDate) {
          setError("Selecione a data inicial e final para filtrar.");
          setLoading(false);
          return;
        }

        if (filter.startDate > filter.endDate) {
          setError("A data inicial nao pode ser maior que a data final.");
          setLoading(false);
          return;
        }
      }

      const url = new URL(
        `${import.meta.env.VITE_API_URL || "http://localhost:3001"}/api/admin/management-report`,
      );

      if (filter.mode === "custom") {
        url.searchParams.set(
          "startAt",
          toIsoBoundary(filter.startDate, "start"),
        );
        url.searchParams.set("endAt", toIsoBoundary(filter.endDate, "end"));
      }

      const response = await authenticatedFetch(url.toString());

      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || "Erro ao carregar relatorio de gestao");
      }

      const data: ManagementReportResponse = await response.json();
      setReport(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro inesperado";
      setError(message);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport(appliedFilter);
  }, [appliedFilter, fetchReport]);

  const products = useMemo(() => report?.products || [], [report]);
  const revenueData = useMemo(
    () => report?.charts.revenueEvolution[revenueGranularity] || [],
    [report, revenueGranularity],
  );
  const paymentDistributionData = useMemo(
    () => report?.charts.paymentDistribution || [],
    [report],
  );
  const topProductsByVolumeData = useMemo(
    () => report?.analytics.topProductsByVolume || [],
    [report],
  );
  const abcCurveData = useMemo(
    () => report?.analytics.abcCurve || [],
    [report],
  );
  const totalIncomingStock = useMemo(
    () =>
      abcCurveData.reduce(
        (sum, item) => sum + (Number(item.quantityIncoming) || 0),
        0,
      ),
    [abcCurveData],
  );
  const categoryPerformanceData = useMemo(
    () => report?.analytics.categoryPerformance || [],
    [report],
  );
  const stockIncomingByProductData = useMemo(
    () => report?.analytics.stockIncomingByProduct || [],
    [report],
  );
  const stockAlertsData = useMemo(
    () => report?.analytics.stockAlerts || [],
    [report],
  );
  const activeFilterLabel = useMemo(() => {
    return appliedFilter.label;
  }, [appliedFilter]);

  // ---- Derivações somente para exibição (não alteram valores financeiros) ----
  const totalIncomingByProduct = useMemo(
    () =>
      stockIncomingByProductData.reduce(
        (sum, product) => sum + (Number(product.quantityIncoming) || 0),
        0,
      ),
    [stockIncomingByProductData],
  );
  const paymentOrdersTotal = useMemo(
    () =>
      paymentDistributionData.reduce(
        (sum, item) => sum + (Number(item.value) || 0),
        0,
      ),
    [paymentDistributionData],
  );
  const abcClassCounts = useMemo(
    () =>
      abcCurveData.reduce(
        (acc, item) => {
          acc[item.classification] += 1;
          return acc;
        },
        { A: 0, B: 0, C: 0 } as Record<"A" | "B" | "C", number>,
      ),
    [abcCurveData],
  );
  const stockAlertCounts = useMemo(
    () => ({
      critical: stockAlertsData.filter((item) => item.severity === "critical")
        .length,
      warning: stockAlertsData.filter((item) => item.severity !== "critical")
        .length,
      suggested: stockAlertsData.reduce(
        (sum, item) => sum + (Number(item.suggestedPurchase) || 0),
        0,
      ),
    }),
    [stockAlertsData],
  );

  const abcRows = useMemo(
    () =>
      sortRows(
        abcCurveData.map((item, index) => ({
          ...item,
          rank: index + 1,
          // Mesma regra de exibição da tabela (ausente = 0) para ordenar
          totalIncoming: item.totalIncoming || 0,
          totalOutgoing: item.totalOutgoing || 0,
        })),
        abcSort,
        readSortValue,
      ),
    [abcCurveData, abcSort],
  );
  const productRows = useMemo(
    () =>
      sortRows(
        products.map((product, index) => ({ ...product, rank: index + 1 })),
        productSort,
        readSortValue,
      ),
    [products, productSort],
  );
  const incomingRows = useMemo(
    () =>
      sortRows(
        stockIncomingByProductData.map((product, index) => ({
          ...product,
          rank: index + 1,
          difference: product.quantityIncoming - product.quantityOutgoing,
        })),
        incomingSort,
        readSortValue,
      ),
    [stockIncomingByProductData, incomingSort],
  );
  const alertRows = useMemo(
    () => sortRows(stockAlertsData, alertSort, readSortValue),
    [stockAlertsData, alertSort],
  );

  const handleApplyFilter = () => {
    if (filterMode === "general") {
      setAppliedFilter(createGeneralFilter());
      return;
    }

    setAppliedFilter({
      mode: "custom",
      startDate,
      endDate,
      label: buildCustomFilterLabel(startDate, endDate),
    });
  };

  const handleSetGeneralFilter = () => {
    setFilterMode("general");
    setStartDate("");
    setEndDate("");
    setAppliedFilter(createGeneralFilter());
  };

  const handleApplyPreset = (preset: FilterPreset) => {
    const presetFilter = createPresetFilter(preset);
    setFilterMode("custom");
    setStartDate(presetFilter.startDate);
    setEndDate(presetFilter.endDate);
    setAppliedFilter(presetFilter);
  };

  const handleRefresh = () => {
    fetchReport(appliedFilter);
  };

  // Liga o controle segmentado às mesmas ações dos botões originais
  const handlePeriodChange = (option: PeriodOption) => {
    setPeriodOption(option);
    if (option === "general") {
      handleSetGeneralFilter();
      return;
    }
    if (option === "custom") {
      setFilterMode("custom");
      return;
    }
    handleApplyPreset(option);
  };

  const handlePrintStock = () => {
    // Gera um PDF/tabela estilizada para impressão
    const produtos = report?.products || [];
    const html = `
                  <html>
                  <head>
                    <title>Estoque e Sugestão de Compra</title>
                    <style>
                      body { font-family: 'Segoe UI', Arial, sans-serif; background: #f8fafc; margin: 0; padding: 24px; }
                      h2 { color: #10b981; margin-bottom: 24px; }
                      table { border-collapse: collapse; width: 100%; background: #fff; box-shadow: 0 2px 8px #0001; border-radius: 12px; overflow: hidden; }
                      th, td { padding: 12px 16px; text-align: left; }
                      th { background: #10b981; color: #fff; font-size: 16px; }
                      tr:nth-child(even) { background: #f0fdf4; }
                      tr:nth-child(odd) { background: #fff; }
                      td { font-size: 15px; color: #334155; }
                      .estoque-baixo { color: #ef4444; font-weight: bold; }
                      .sugestao { color: #2563eb; font-weight: bold; }
                    </style>
                  </head>
                  <body>
                    <h2>Estoque e Sugestão de Compra</h2>
                    <table>
                      <thead>
                        <tr>
                          <th>Produto</th>
                          <th>Estoque</th>
                          <th>Sugerido</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${produtos
                          .map(
                            (p) => `
                          <tr>
                            <td>${p.name}</td>
                            <td class="${p.stock !== undefined && p.stock !== null && p.stock <= (p.minStock ?? 0) ? "estoque-baixo" : ""}">${p.stock ?? "N/A"}</td>
                            <td class="sugestao">${p.minStock ?? "N/A"}</td>
                          </tr>
                        `,
                          )
                          .join("")}
                      </tbody>
                    </table>
                  </body>
                  </html>
                `;
    const printWindow = window.open("", "_blank");
    printWindow?.document.write(html);
    printWindow?.document.close();
    printWindow?.print();
  };

  const submitSenha = () => {
    if (senhaExtra === SENHA_ESPECIAL) {
      setSenhaCorreta(true);
      setSenhaErro("");
    } else {
      setSenhaErro("Senha incorreta");
    }
  };

  // Formulário de senha extra
  if (!senhaCorreta) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4 py-10">
        <div className="pp-card pp-animate-in w-full max-w-md p-8">
          <div className="flex flex-col items-center text-center">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[color:var(--pp-brand-soft)] text-[color:var(--pp-brand)] [&>svg]:h-6 [&>svg]:w-6">
              <IconShield />
            </span>
            <h2 className="text-xl font-semibold tracking-tight text-[color:var(--pp-text)]">
              Acesso Restrito
            </h2>
            <p className={`mt-1.5 text-sm ${SECONDARY}`}>
              Digite a senha especial para acessar o Relatório de Gestão.
            </p>
          </div>
          <form
            className="mt-6 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              submitSenha();
            }}
          >
            <Field
              label="Senha especial"
              htmlFor="pp-senha-especial"
              error={senhaErro || undefined}
            >
              <input
                id="pp-senha-especial"
                type="password"
                className={`pp-input${senhaErro ? " pp-invalid" : ""}`}
                placeholder="Senha especial"
                value={senhaExtra}
                autoFocus
                onChange={(e) => setSenhaExtra(e.target.value)}
              />
            </Field>
            <Button type="submit" variant="primary" className="w-full">
              Entrar
            </Button>
          </form>
        </div>
      </div>
    );
  }

  const summary = report?.summary;
  const pendingGiraKids = summary ? summary.totalToPayGiraKids : 0;

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        eyebrow="Financeiro"
        title="Gestão e financeiro"
        description="Visão financeira para admin com base na lógica de repasse GiraKids"
        actions={
          <>
            {report && (
              <span className={`hidden text-xs sm:inline ${MUTED}`}>
                Atualizado em {formatDateTime(report.generatedAt)}
              </span>
            )}
            <Button
              variant="secondary"
              icon={<IconFile />}
              onClick={handlePrintStock}
            >
              Imprimir Estoque/Sugestão
            </Button>
            <Button
              variant="primary"
              icon={<IconRefresh />}
              loading={loading}
              onClick={handleRefresh}
            >
              {loading ? "Atualizando..." : "Atualizar dados"}
            </Button>
          </>
        }
      />

      {/* Filtro de período */}
      <Card className="pp-animate-in" bodyClassName="pp-card-body space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <span
              className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider ${MUTED}`}
            >
              <IconCalendar className="h-3.5 w-3.5" />
              Período
            </span>
            <div className="max-w-full overflow-x-auto">
              <Segmented
                options={PERIOD_OPTIONS}
                value={periodOption}
                onChange={handlePeriodChange}
                ariaLabel="Período do relatório"
              />
            </div>
          </div>
          <div className={`flex items-center gap-2 text-sm ${SECONDARY}`}>
            <span>Período ativo:</span>
            <Badge tone="brand" dot>
              {activeFilterLabel}
            </Badge>
          </div>
        </div>

        {filterMode === "custom" && (
          <div className="pp-animate-in grid grid-cols-1 items-end gap-3 border-t border-[color:var(--pp-border)] pt-4 sm:grid-cols-[1fr_1fr_auto] md:max-w-2xl">
            <Field label="De" htmlFor="pp-report-start">
              <input
                id="pp-report-start"
                type="date"
                className="pp-input"
                value={startDate}
                onChange={(event) => {
                  setStartDate(event.target.value);
                  setPeriodOption("custom");
                }}
                max={endDate || undefined}
              />
            </Field>
            <Field label="Até" htmlFor="pp-report-end">
              <input
                id="pp-report-end"
                type="date"
                className="pp-input"
                value={endDate}
                onChange={(event) => {
                  setEndDate(event.target.value);
                  setPeriodOption("custom");
                }}
                min={startDate || undefined}
              />
            </Field>
            <Button
              variant="primary"
              icon={<IconFilter />}
              onClick={handleApplyFilter}
              disabled={loading || !startDate || !endDate}
            >
              Aplicar filtro
            </Button>
          </div>
        )}
      </Card>

      {error && (
        <Card className="pp-animate-in mt-4 border-[color:var(--pp-danger)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm text-[color:var(--pp-danger)]">
              <IconAlert className="h-4 w-4 shrink-0" />
              {error}
            </p>
            <Button size="sm" icon={<IconRefresh />} onClick={handleRefresh}>
              Tentar novamente
            </Button>
          </div>
        </Card>
      )}

      {loading && !report && (
        <div className="mt-6">
          <ReportSkeleton />
        </div>
      )}

      {report && summary && (
        <div
          className={`transition-opacity duration-200 ${
            loading ? "opacity-60" : "opacity-100"
          }`}
          aria-busy={loading || undefined}
        >
          {/* ---------- Financeiro ---------- */}
          <SectionHeading
            icon={<IconWallet />}
            title="Financeiro"
            description="Faturamento e repasse GiraKids no período"
          />
          <div className="pp-stagger grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard
              label="Faturamento bruto"
              value={summary.totalRevenue}
              format={formatCurrency}
              icon={<IconWallet />}
              tone="brand"
              hint="Total vendido no período"
            />
            <StatCard
              label="Ticket médio"
              value={summary.averageTicket}
              format={formatCurrency}
              icon={<IconTrend />}
              tone="info"
              hint="Média por pedido pago"
            />
            <StatCard
              label="Falta pagar GiraKids"
              value={summary.totalToPayGiraKids}
              format={formatCurrency}
              icon={<IconClock />}
              tone={pendingGiraKids > 0 ? "warning" : "success"}
              hint={
                pendingGiraKids > 0 ? (
                  <span className="font-medium text-[color:var(--pp-warning)]">
                    Pendência atual
                  </span>
                ) : (
                  "Pendência atual"
                )
              }
            />
            <StatCard
              label="Já pago para GiraKids"
              value={summary.totalPaidToGiraKids}
              format={formatCurrency}
              icon={<IconCheckCircle />}
              tone="success"
              hint="Histórico acumulado"
            />
            <StatCard
              label="Total geral GiraKids"
              value={summary.totalGiraKidsAccrued}
              format={formatCurrency}
              icon={<IconCash />}
              tone="violet"
              hint="Valor acumulado de repasse"
            />
          </div>

          {/* ---------- Operação ---------- */}
          <SectionHeading
            icon={<IconReceipt />}
            title="Operação"
            description="Pedidos, conversão de pagamentos e volume vendido"
          />
          <div className="pp-stagger grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Quantidade de vendas"
              value={summary.totalOrders}
              format={formatIntegerAnimated}
              icon={<IconReceipt />}
              tone="violet"
              hint="Pedidos pagos"
            />
            <StatCard
              label="Itens vendidos"
              value={summary.totalItemsSold}
              format={formatIntegerAnimated}
              icon={<IconBox />}
              tone="info"
              hint="Soma de unidades de produtos"
            />
            <StatCard
              label="Sucesso de pagamentos"
              value={summary.successRate}
              format={formatPercent}
              icon={<IconCheckCircle />}
              tone="success"
              hint={`${formatInteger(summary.successfulOrders)} de ${formatInteger(
                summary.totalOrderAttempts,
              )} pedidos`}
              footer={
                <div className="pp-progress">
                  <span
                    style={{
                      width: `${Math.min(100, Math.max(0, summary.successRate))}%`,
                      background: "var(--pp-success)",
                    }}
                  />
                </div>
              }
            />
            <StatCard
              label="Cancelados e pendentes"
              value={summary.cancellationRate + summary.pendingRate}
              format={formatPercent}
              icon={<IconAlert />}
              tone={
                summary.cancellationRate + summary.pendingRate > 0
                  ? "danger"
                  : "neutral"
              }
              hint={`Cancelados: ${formatPercent(
                summary.cancellationRate,
              )} | Pendentes: ${formatPercent(summary.pendingRate)}`}
              footer={
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="danger" dot>
                    {formatInteger(summary.canceledOrders)} cancelado(s)
                  </Badge>
                  <Badge tone="warning" dot>
                    {formatInteger(summary.pendingOrders)} pendente(s)
                  </Badge>
                </div>
              }
            />
          </div>

          {/* ---------- Vendas e pagamentos ---------- */}
          <SectionHeading
            icon={<IconChart />}
            title="Vendas e pagamentos"
            description="Evolução do faturamento e formas de pagamento"
          />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card
              className="pp-animate-in xl:col-span-2"
              title="Evolução do Faturamento"
              subtitle="Acompanhe os picos de venda no período selecionado"
              actions={
                <Segmented
                  options={GRANULARITY_OPTIONS}
                  value={revenueGranularity}
                  onChange={setRevenueGranularity}
                  ariaLabel="Granularidade do faturamento"
                />
              }
            >
              {revenueData.length === 0 ? (
                <ChartEmpty
                  icon={<IconChart />}
                  title="Não há faturamento no período para exibir no gráfico."
                />
              ) : (
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={revenueData}
                      margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id="ppMgmtRevenueFill"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="#2563eb"
                            stopOpacity={0.24}
                          />
                          <stop
                            offset="100%"
                            stopColor="#2563eb"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid {...chartGridProps} />
                      <XAxis
                        dataKey="label"
                        {...chartAxisProps}
                        minTickGap={16}
                      />
                      <YAxis
                        {...chartAxisProps}
                        width={72}
                        tickFormatter={(value) =>
                          formatAxisCurrency(Number(value))
                        }
                      />
                      <Tooltip
                        {...chartTooltipProps}
                        cursor={{ stroke: "#cbd5e1", strokeDasharray: "4 4" }}
                        formatter={(value: number, name: string, item: any) => {
                          if (name === "revenue") {
                            return [formatCurrency(value), "Faturamento"];
                          }

                          return [value, item?.payload?.orders || 0];
                        }}
                        labelFormatter={(label) => `Período: ${label}`}
                      />
                      <Legend
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: 12, color: "#475569" }}
                        formatter={() => "Faturamento"}
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="#2563eb"
                        strokeWidth={2.5}
                        fill="url(#ppMgmtRevenueFill)"
                        dot={
                          revenueData.length <= 31
                            ? { r: 2.5, fill: "#2563eb", strokeWidth: 0 }
                            : false
                        }
                        activeDot={{ r: 5, strokeWidth: 0 }}
                        animationDuration={700}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card
              className="pp-animate-in"
              title="Distribuição de Pagamentos"
              subtitle="Métodos com maior conversão no período"
            >
              {paymentDistributionData.length === 0 ? (
                <ChartEmpty
                  icon={<IconCash />}
                  title="Nenhum pagamento aprovado para distribuir."
                />
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="relative h-[220px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={paymentDistributionData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={66}
                          outerRadius={96}
                          paddingAngle={2}
                          stroke="none"
                          animationDuration={700}
                        >
                          {paymentDistributionData.map((entry, index) => (
                            <Cell
                              key={`${entry.method}-${index}`}
                              fill={CHART_COLORS[index % CHART_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          {...chartTooltipProps}
                          formatter={(
                            value: number,
                            _name: string,
                            item: any,
                          ) => [
                            `${formatInteger(value)} pedidos`,
                            `${item?.payload?.name} · ${formatCurrency(
                              item?.payload?.revenue || 0,
                            )}`,
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="pp-num text-2xl font-semibold text-[color:var(--pp-text)]">
                        {formatInteger(paymentOrdersTotal)}
                      </span>
                      <span className={`text-xs ${MUTED}`}>pedidos</span>
                    </div>
                  </div>

                  <ul className="space-y-2.5">
                    {paymentDistributionData.map((item, index) => (
                      <li
                        key={item.method}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <LegendDot
                            color={CHART_COLORS[index % CHART_COLORS.length]}
                          />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-[color:var(--pp-text)]">
                              {item.name}
                            </p>
                            <p className={`text-xs ${MUTED}`}>
                              {formatInteger(item.orders)} pedidos
                              {paymentOrdersTotal > 0 && (
                                <>
                                  {" · "}
                                  {formatPercent(
                                    ((Number(item.value) || 0) /
                                      paymentOrdersTotal) *
                                      100,
                                  )}
                                </>
                              )}
                            </p>
                          </div>
                        </div>

                        <p className="pp-num whitespace-nowrap font-semibold text-[color:var(--pp-text)]">
                          {formatCurrency(item.revenue)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </div>

          {/* ---------- Produtos e categorias ---------- */}
          <SectionHeading
            icon={<IconTag />}
            title="Produtos e categorias"
            description="Ranking de volume, receita por categoria e curva ABC"
          />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card
              className="pp-animate-in xl:col-span-2"
              title="Top Produtos Mais Vendidos"
              subtitle="Ranking dos itens com maior volume de saída no período"
            >
              {topProductsByVolumeData.length === 0 ? (
                <ChartEmpty
                  icon={<IconBox />}
                  title="Sem vendas suficientes para montar o ranking."
                />
              ) : (
                <ResponsiveContainer
                  width="100%"
                  height={Math.max(300, topProductsByVolumeData.length * 38)}
                >
                  <BarChart
                    data={topProductsByVolumeData}
                    layout="vertical"
                    margin={{ top: 4, right: 24, left: 4, bottom: 4 }}
                    barCategoryGap={8}
                  >
                    <CartesianGrid
                      {...chartGridProps}
                      vertical
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      {...chartAxisProps}
                      allowDecimals={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={170}
                      {...chartAxisProps}
                      tick={{ fill: "#475569", fontSize: 12 }}
                      tickFormatter={(value) =>
                        truncateLabel(String(value), 24)
                      }
                    />
                    <Tooltip
                      {...chartTooltipProps}
                      formatter={(
                        value: number,
                        _name: string,
                        payload: any,
                      ) => [
                        `${formatInteger(value)} unidades`,
                        `${payload?.payload?.name} · ${formatCurrency(
                          payload?.payload?.revenue || 0,
                        )}`,
                      ]}
                    />
                    <Bar
                      dataKey="quantitySold"
                      radius={[0, 6, 6, 0]}
                      maxBarSize={22}
                      animationDuration={700}
                    >
                      {topProductsByVolumeData.map((entry, index) => (
                        <Cell
                          key={`${entry.productId}-${index}`}
                          fill="#2563eb"
                          fillOpacity={Math.max(0.35, 1 - index * 0.06)}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card
              className="pp-animate-in"
              title="Desempenho por Categoria"
              subtitle="Categorias que mais geram receita"
            >
              {categoryPerformanceData.length === 0 ? (
                <ChartEmpty
                  icon={<IconTag />}
                  title="Nenhuma categoria com faturamento no período."
                />
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="relative h-[220px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryPerformanceData}
                          dataKey="revenue"
                          nameKey="category"
                          cx="50%"
                          cy="50%"
                          innerRadius={66}
                          outerRadius={96}
                          paddingAngle={2}
                          stroke="none"
                          animationDuration={700}
                        >
                          {categoryPerformanceData.map((entry, index) => (
                            <Cell
                              key={`${entry.category}-${index}`}
                              fill={CHART_COLORS[index % CHART_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          {...chartTooltipProps}
                          formatter={(
                            value: number,
                            _name: string,
                            item: any,
                          ) => [
                            formatCurrency(value),
                            `${item?.payload?.category} · ${formatPercent(
                              item?.payload?.revenueShare || 0,
                            )}`,
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="pp-num text-2xl font-semibold text-[color:var(--pp-text)]">
                        {formatInteger(categoryPerformanceData.length)}
                      </span>
                      <span className={`text-xs ${MUTED}`}>categorias</span>
                    </div>
                  </div>

                  <ul className="space-y-3">
                    {categoryPerformanceData.map((category, index) => (
                      <li key={category.category}>
                        <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <LegendDot
                              color={CHART_COLORS[index % CHART_COLORS.length]}
                            />
                            <span className="truncate font-medium text-[color:var(--pp-text)]">
                              {category.category}
                            </span>
                          </div>
                          <span className="pp-num whitespace-nowrap font-semibold text-[color:var(--pp-text)]">
                            {formatCurrency(category.revenue)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="pp-progress flex-1">
                            <span
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.max(2, category.revenueShare),
                                )}%`,
                                background:
                                  CHART_COLORS[index % CHART_COLORS.length],
                              }}
                            />
                          </div>
                          <span
                            className={`pp-num w-24 shrink-0 text-right text-xs ${MUTED}`}
                          >
                            {formatPercent(category.revenueShare)} do
                            faturamento
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </div>

          <Card
            className="pp-animate-in mt-4"
            title="Curva ABC de Produtos (Pareto)"
            subtitle="Classe A concentra até 80% da receita, B até 95% e C os demais"
            actions={
              <div className="hidden flex-wrap items-center gap-1.5 md:flex">
                <Badge tone="danger">A · {formatInteger(abcClassCounts.A)}</Badge>
                <Badge tone="warning">
                  B · {formatInteger(abcClassCounts.B)}
                </Badge>
                <Badge tone="info">C · {formatInteger(abcClassCounts.C)}</Badge>
              </div>
            }
            flush
          >
            <div className="flex flex-wrap gap-2 px-5 pt-4">
              <Badge>Produtos analisados: {formatInteger(abcCurveData.length)}</Badge>
              <Badge tone="success">
                Entradas no período: {formatInteger(totalIncomingStock)}
              </Badge>
            </div>

            {abcCurveData.length === 0 ? (
              <div className="p-5">
                <ChartEmpty
                  icon={<IconChart />}
                  title="Nenhum dado de faturamento para Curva ABC."
                />
              </div>
            ) : (
              <>
                <div className="px-3 pb-2 pt-4 md:px-5">
                  <ResponsiveContainer width="100%" height={340}>
                    <ComposedChart
                      data={abcCurveData}
                      margin={{ top: 8, right: 8, left: 0, bottom: 72 }}
                    >
                      <CartesianGrid {...chartGridProps} />
                      <XAxis
                        dataKey="name"
                        {...chartAxisProps}
                        angle={-24}
                        textAnchor="end"
                        height={82}
                        interval={0}
                        tickFormatter={(value) =>
                          truncateLabel(String(value), 14)
                        }
                      />
                      <YAxis
                        yAxisId="left"
                        {...chartAxisProps}
                        width={72}
                        tickFormatter={(value) =>
                          formatAxisCurrency(Number(value))
                        }
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        domain={[0, 100]}
                        {...chartAxisProps}
                        width={44}
                        tickFormatter={(value) => `${value}%`}
                      />
                      <Tooltip
                        {...chartTooltipProps}
                        formatter={(value: number, name: string) => {
                          if (name === "revenue") {
                            return [formatCurrency(value), "Faturamento"];
                          }
                          return [formatPercent(value), "Acumulado"];
                        }}
                      />
                      <Legend
                        verticalAlign="top"
                        align="right"
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{
                          fontSize: 12,
                          color: "#475569",
                          paddingBottom: 8,
                        }}
                        formatter={(value) =>
                          value === "revenue" ? "Faturamento" : "% Acumulado"
                        }
                      />
                      <Bar
                        yAxisId="left"
                        dataKey="revenue"
                        fill="#2563eb"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={40}
                        animationDuration={700}
                      >
                        {abcCurveData.map((entry, index) => (
                          <Cell
                            key={`${entry.productId}-${index}`}
                            fill={ABC_CLASS_COLORS[entry.classification]}
                            fillOpacity={0.85}
                          />
                        ))}
                      </Bar>
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="cumulativeShare"
                        stroke="#0f172a"
                        strokeWidth={2}
                        dot={{ r: 2.5, strokeWidth: 0, fill: "#0f172a" }}
                        activeDot={{ r: 4, strokeWidth: 0 }}
                        animationDuration={700}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                <div className="pp-table-wrap border-t border-[color:var(--pp-border)]">
                  <table className="pp-table min-w-[1120px]">
                    <thead>
                      <tr>
                        <SortHeader label="#" sortKey="rank" sort={abcSort} onSort={setAbcSort} />
                        <SortHeader label="Produto" sortKey="name" sort={abcSort} onSort={setAbcSort} />
                        <SortHeader label="Categoria" sortKey="category" sort={abcSort} onSort={setAbcSort} />
                        <SortHeader label="Qtd." sortKey="quantitySold" sort={abcSort} onSort={setAbcSort} align="right" />
                        <SortHeader label="Entradas" sortKey="quantityIncoming" sort={abcSort} onSort={setAbcSort} align="right" />
                        <SortHeader label="Entrada total" sortKey="totalIncoming" sort={abcSort} onSort={setAbcSort} align="right" />
                        <SortHeader label="Saída período" sortKey="totalOutgoing" sort={abcSort} onSort={setAbcSort} align="right" />
                        <SortHeader label="Faturamento" sortKey="revenue" sort={abcSort} onSort={setAbcSort} align="right" />
                        <SortHeader label="% Receita" sortKey="revenueShare" sort={abcSort} onSort={setAbcSort} align="right" />
                        <SortHeader label="% Acumulado" sortKey="cumulativeShare" sort={abcSort} onSort={setAbcSort} align="right" />
                        <SortHeader label="Classe" sortKey="classification" sort={abcSort} onSort={setAbcSort} align="center" />
                      </tr>
                    </thead>
                    <tbody>
                      {abcRows.map((item) => (
                        <tr key={item.productId}>
                          <td className={`pp-num ${MUTED}`}>{item.rank}</td>
                          <td className="font-medium">{item.name}</td>
                          <td className={SECONDARY}>{item.category}</td>
                          <td className="pp-num text-right">
                            {formatInteger(item.quantitySold)}
                          </td>
                          <td className="pp-num text-right font-medium text-[color:var(--pp-success)]">
                            {formatInteger(item.quantityIncoming || 0)}
                          </td>
                          <td className="pp-num text-right font-medium text-[color:var(--pp-success)]">
                            {formatInteger(item.totalIncoming || 0)}
                          </td>
                          <td className="pp-num text-right font-medium text-[color:var(--pp-danger)]">
                            {formatInteger(item.totalOutgoing || 0)}
                          </td>
                          <td className="pp-num text-right font-semibold">
                            {formatCurrency(item.revenue)}
                          </td>
                          <td className="pp-num text-right">
                            {formatPercent(item.revenueShare)}
                          </td>
                          <td className="pp-num text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="pp-progress hidden w-14 lg:block">
                                <span
                                  style={{
                                    width: `${Math.min(
                                      100,
                                      Math.max(0, item.cumulativeShare),
                                    )}%`,
                                    background:
                                      ABC_CLASS_COLORS[item.classification],
                                  }}
                                />
                              </div>
                              {formatPercent(item.cumulativeShare)}
                            </div>
                          </td>
                          <td className="text-center">
                            <Badge tone={ABC_CLASS_TONES[item.classification]}>
                              {item.classification}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>

          {/* ---------- Estoque ---------- */}
          <SectionHeading
            icon={<IconAlert />}
            title="Estoque e reposição"
            description="Alertas de ruptura, sugestão de compra e movimentação por produto"
            aside={
              <Button
                size="sm"
                variant="soft"
                icon={<IconFile />}
                onClick={handlePrintStock}
              >
                Imprimir Estoque/Sugestão
              </Button>
            }
          />
          <div className="pp-stagger mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Produtos em nível crítico"
              value={stockAlertCounts.critical}
              format={formatIntegerAnimated}
              icon={<IconAlert />}
              tone={stockAlertCounts.critical > 0 ? "danger" : "success"}
              hint="Risco imediato de ruptura"
            />
            <StatCard
              label="Produtos em atenção"
              value={stockAlertCounts.warning}
              format={formatIntegerAnimated}
              icon={<IconClock />}
              tone={stockAlertCounts.warning > 0 ? "warning" : "success"}
              hint="Abaixo do estoque de segurança"
            />
            <StatCard
              label="Unidades sugeridas para compra"
              value={stockAlertCounts.suggested}
              format={formatIntegerAnimated}
              icon={<IconTruck />}
              tone="brand"
              hint="Soma das sugestões de reposição"
            />
          </div>

          <Card
            className="pp-animate-in"
            title="Painel de Alerta de Estoque"
            subtitle="Produtos em risco considerando estoque mínimo e velocidade média de saída"
            actions={
              <Badge tone="neutral">
                <IconCalendar className="h-3 w-3" />
                Base de cálculo: {formatInteger(report.analytics.periodDays)}{" "}
                dias
              </Badge>
            }
            flush
          >
            {stockAlertsData.length === 0 ? (
              <EmptyState
                icon={<IconCheckCircle />}
                title="Nenhum produto em risco de ruptura no período selecionado."
                description="O estoque está acima do mínimo e da margem de segurança."
              />
            ) : (
              <div className="pp-table-wrap">
                <table className="pp-table min-w-[980px]">
                  <thead>
                    <tr>
                      <SortHeader label="Produto" sortKey="name" sort={alertSort} onSort={setAlertSort} />
                      <SortHeader label="Categoria" sortKey="category" sort={alertSort} onSort={setAlertSort} />
                      <SortHeader label="Estoque" sortKey="stock" sort={alertSort} onSort={setAlertSort} align="right" />
                      <SortHeader label="Mínimo" sortKey="minStock" sort={alertSort} onSort={setAlertSort} align="right" />
                      <SortHeader label="Segurança" sortKey="safetyStock" sort={alertSort} onSort={setAlertSort} align="right" />
                      <SortHeader label="Venda média/dia" sortKey="averageDailySales" sort={alertSort} onSort={setAlertSort} align="right" />
                      <SortHeader label="Dias p/ ruptura" sortKey="daysToStockout" sort={alertSort} onSort={setAlertSort} align="right" />
                      <SortHeader label="Sugestão compra" sortKey="suggestedPurchase" sort={alertSort} onSort={setAlertSort} align="right" />
                      <SortHeader label="Status" sortKey="severity" sort={alertSort} onSort={setAlertSort} align="center" />
                    </tr>
                  </thead>
                  <tbody>
                    {alertRows.map((item) => {
                      const critical = item.severity === "critical";
                      return (
                        <tr
                          key={item.productId}
                          className={
                            critical
                              ? "bg-rose-50/60"
                              : undefined
                          }
                        >
                          <td>
                            <div className="flex items-center gap-2.5">
                              <span
                                className="h-8 w-1 shrink-0 rounded-full"
                                style={{
                                  background: critical
                                    ? "var(--pp-danger)"
                                    : "var(--pp-warning)",
                                }}
                              />
                              <span className="font-medium">{item.name}</span>
                            </div>
                          </td>
                          <td className={SECONDARY}>{item.category}</td>
                          <td
                            className={`pp-num text-right font-semibold ${
                              critical
                                ? "text-[color:var(--pp-danger)]"
                                : "text-[color:var(--pp-warning)]"
                            }`}
                          >
                            {formatInteger(item.stock)}
                          </td>
                          <td className={`pp-num text-right ${SECONDARY}`}>
                            {formatInteger(item.minStock)}
                          </td>
                          <td className={`pp-num text-right ${SECONDARY}`}>
                            {formatInteger(item.safetyStock)}
                          </td>
                          <td className={`pp-num text-right ${SECONDARY}`}>
                            {item.averageDailySales.toFixed(2)}
                          </td>
                          <td className="pp-num text-right">
                            {item.daysToStockout === null ? (
                              <span className={MUTED}>Sem ruptura</span>
                            ) : (
                              <span
                                className={
                                  critical
                                    ? "font-semibold text-[color:var(--pp-danger)]"
                                    : "font-medium"
                                }
                              >
                                {`${item.daysToStockout.toFixed(1)} dias`}
                              </span>
                            )}
                          </td>
                          <td className="text-right">
                            {item.suggestedPurchase > 0 ? (
                              <Badge tone="brand" className="pp-num">
                                <IconTruck className="h-3 w-3" />
                                {formatInteger(item.suggestedPurchase)}
                              </Badge>
                            ) : (
                              <span className={`pp-num ${MUTED}`}>
                                {formatInteger(item.suggestedPurchase)}
                              </span>
                            )}
                          </td>
                          <td className="text-center">
                            <Badge tone={critical ? "danger" : "warning"} dot>
                              {critical ? "Crítico" : "Atenção"}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="mt-4 grid grid-cols-1 gap-4 2xl:grid-cols-2">
            <Card
              className="pp-animate-in"
              title="Quanto saiu de cada produto"
              subtitle="Saídas, faturamento e valor de repasse por produto"
              actions={
                <div className="text-right text-xs">
                  <span className={MUTED}>Total geral GiraKids</span>
                  <div className="pp-num text-sm font-semibold text-[color:var(--pp-text)]">
                    {formatCurrency(report.summary.totalGiraKidsAccrued)}
                  </div>
                </div>
              }
              flush
            >
              {products.length === 0 ? (
                <EmptyState
                  icon={<IconBox />}
                  title="Nenhum produto vendido até o momento."
                />
              ) : (
                <div className="pp-table-wrap">
                  <table className="pp-table min-w-[620px]">
                    <thead>
                      <tr>
                        <SortHeader label="#" sortKey="rank" sort={productSort} onSort={setProductSort} />
                        <SortHeader label="Produto" sortKey="name" sort={productSort} onSort={setProductSort} />
                        <SortHeader label="Qtd. vendida" sortKey="quantitySold" sort={productSort} onSort={setProductSort} align="right" />
                        <SortHeader label="Faturamento" sortKey="revenue" sort={productSort} onSort={setProductSort} align="right" />
                        <SortHeader label="Valor GiraKids" sortKey="giraKidsValue" sort={productSort} onSort={setProductSort} align="right" />
                      </tr>
                    </thead>
                    <tbody>
                      {productRows.map((product) => (
                        <tr key={`${product.productId}-${product.rank - 1}`}>
                          <td className={`pp-num ${MUTED}`}>{product.rank}</td>
                          <td className="font-medium">{product.name}</td>
                          <td className="pp-num text-right">
                            {formatInteger(product.quantitySold)}
                          </td>
                          <td className="pp-num text-right font-semibold">
                            {formatCurrency(product.revenue)}
                          </td>
                          <td className="pp-num text-right font-semibold text-[color:var(--pp-warning)]">
                            {formatCurrency(product.giraKidsValue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card
              className="pp-animate-in"
              title="Quanto entrou de cada produto"
              subtitle="Entradas de estoque comparadas às saídas"
              actions={
                <div className="text-right text-xs">
                  <span className={MUTED}>Entradas no período</span>
                  <div className="pp-num text-sm font-semibold text-[color:var(--pp-success)]">
                    {formatInteger(totalIncomingByProduct)}
                  </div>
                </div>
              }
              flush
            >
              {stockIncomingByProductData.length === 0 ? (
                <EmptyState
                  icon={<IconTruck />}
                  title="Nenhuma entrada de estoque registrada até o momento."
                />
              ) : (
                <div className="pp-table-wrap">
                  <table className="pp-table min-w-[760px]">
                    <thead>
                      <tr>
                        <SortHeader label="#" sortKey="rank" sort={incomingSort} onSort={setIncomingSort} />
                        <SortHeader label="Produto" sortKey="name" sort={incomingSort} onSort={setIncomingSort} />
                        <SortHeader label="Categoria" sortKey="category" sort={incomingSort} onSort={setIncomingSort} />
                        <SortHeader label="Qtd. entrada" sortKey="quantityIncoming" sort={incomingSort} onSort={setIncomingSort} align="right" />
                        <SortHeader label="Qtd. vendida" sortKey="quantityOutgoing" sort={incomingSort} onSort={setIncomingSort} align="right" />
                        <SortHeader label="Diferença" sortKey="difference" sort={incomingSort} onSort={setIncomingSort} align="right" />
                        <SortHeader label="Estoque atual" sortKey="stock" sort={incomingSort} onSort={setIncomingSort} align="right" />
                      </tr>
                    </thead>
                    <tbody>
                      {incomingRows.map((product) => (
                        <tr
                          key={`${product.productId}-incoming-${product.rank - 1}`}
                        >
                          <td className={`pp-num ${MUTED}`}>{product.rank}</td>
                          <td className="font-medium">{product.name}</td>
                          <td className={SECONDARY}>{product.category}</td>
                          <td className="pp-num text-right font-medium text-[color:var(--pp-success)]">
                            {formatInteger(product.quantityIncoming)}
                          </td>
                          <td className="pp-num text-right font-medium text-[color:var(--pp-danger)]">
                            {formatInteger(product.quantityOutgoing)}
                          </td>
                          <td className="text-right">
                            <Badge
                              tone={product.difference < 0 ? "danger" : "success"}
                              className="pp-num"
                            >
                              {formatInteger(product.difference)}
                            </Badge>
                          </td>
                          <td className="pp-num text-right">
                            {product.stock === null ? (
                              <Badge tone="info">Ilimitado</Badge>
                            ) : (
                              formatInteger(product.stock)
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          <p className={`mt-6 text-right text-xs ${MUTED}`}>
            Atualizado em {new Date(report.generatedAt).toLocaleString("pt-BR")}
          </p>
        </div>
      )}
    </div>
  );
};

export default AdminManagementReportPage;

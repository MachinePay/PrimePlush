import React, { useCallback, useEffect, useMemo, useState } from "react";
import { authenticatedFetch } from "../services/apiService";

interface ManagementReportSummary {
  totalOrders: number;
  totalItemsSold: number;
  totalRevenue: number;
  totalToPayGiraKids: number;
  totalPaidToGiraKids: number;
  totalGiraKidsAccrued: number;
}

interface ProductManagementReport {
  productId: string;
  name: string;
  quantitySold: number;
  revenue: number;
  giraKidsValue: number;
}

interface ManagementReportResponse {
  success: boolean;
  summary: ManagementReportSummary;
  products: ProductManagementReport[];
  filters?: {
    startAt: string | null;
    endAt: string | null;
  };
  generatedAt: string;
}

type FilterMode = "general" | "custom";

interface AppliedFilter {
  mode: FilterMode;
  startDate: string;
  endDate: string;
}

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const integerFormatter = new Intl.NumberFormat("pt-BR");

const formatCurrency = (value: number) =>
  currencyFormatter.format(Number.isFinite(value) ? value : 0);

const formatInteger = (value: number) =>
  integerFormatter.format(Number.isFinite(value) ? value : 0);

const createGeneralFilter = (): AppliedFilter => ({
  mode: "general",
  startDate: "",
  endDate: "",
});

const toIsoBoundary = (date: string, type: "start" | "end") => {
  const time = type === "start" ? "T00:00:00.000" : "T23:59:59.999";
  return new Date(`${date}${time}`).toISOString();
};

const formatFilterDate = (date: string) => {
  if (!date) return "";
  return new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR");
};

const AdminManagementReportPage: React.FC = () => {
  const [report, setReport] = useState<ManagementReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("general");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [appliedFilter, setAppliedFilter] =
    useState<AppliedFilter>(createGeneralFilter);

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
  const activeFilterLabel = useMemo(() => {
    if (appliedFilter.mode === "general") {
      return "Data geral";
    }

    return `${formatFilterDate(appliedFilter.startDate)} ate ${formatFilterDate(
      appliedFilter.endDate,
    )}`;
  }, [appliedFilter]);

  const handleApplyFilter = () => {
    if (filterMode === "general") {
      setAppliedFilter(createGeneralFilter());
      return;
    }

    setAppliedFilter({
      mode: "custom",
      startDate,
      endDate,
    });
  };

  const handleSetGeneralFilter = () => {
    setFilterMode("general");
    setStartDate("");
    setEndDate("");
    setAppliedFilter(createGeneralFilter());
  };

  const handleRefresh = () => {
    fetchReport(appliedFilter);
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900">
            Relatorio de Gestao
          </h1>
          <p className="text-slate-600 mt-2">
            Visao financeira para admin com base na logica de repasse GiraKids
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading}
          className="bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-blue-800 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? "Atualizando..." : "Atualizar dados"}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow p-4 md:p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Periodo</p>
            <div className="inline-flex rounded-lg bg-slate-100 p-1 gap-1">
              <button
                type="button"
                onClick={handleSetGeneralFilter}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  filterMode === "general"
                    ? "bg-blue-700 text-white"
                    : "text-slate-600 hover:text-slate-800"
                }`}
              >
                Data geral
              </button>
              <button
                type="button"
                onClick={() => setFilterMode("custom")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  filterMode === "custom"
                    ? "bg-blue-700 text-white"
                    : "text-slate-600 hover:text-slate-800"
                }`}
              >
                Filtrar
              </button>
            </div>
          </div>

          <div className="text-sm text-slate-500">
            Periodo ativo:{" "}
            <span className="font-semibold text-slate-800">
              {activeFilterLabel}
            </span>
          </div>
        </div>

        {filterMode === "custom" && (
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                De
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                max={endDate || undefined}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Ate
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                min={startDate || undefined}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-600"
              />
            </div>

            <button
              type="button"
              onClick={handleApplyFilter}
              disabled={loading || !startDate || !endDate}
              className="bg-emerald-600 text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Aplicar filtro
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      {loading && !report && (
        <div className="bg-white rounded-xl shadow p-8 text-center text-slate-600">
          Carregando relatorio...
        </div>
      )}

      {report && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
            <div className="bg-white rounded-xl shadow border-l-4 border-blue-600 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Quantidade de vendas
              </p>
              <p className="text-2xl font-bold text-slate-900 mt-2">
                {formatInteger(report.summary.totalOrders)}
              </p>
              <p className="text-sm text-slate-500 mt-1">Pedidos pagos</p>
            </div>

            <div className="bg-white rounded-xl shadow border-l-4 border-indigo-500 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Itens vendidos
              </p>
              <p className="text-2xl font-bold text-slate-900 mt-2">
                {formatInteger(report.summary.totalItemsSold)}
              </p>
              <p className="text-sm text-slate-500 mt-1">
                Soma de unidades de produtos
              </p>
            </div>

            <div className="bg-white rounded-xl shadow border-l-4 border-emerald-600 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Dinheiro que entrou
              </p>
              <p className="text-2xl font-bold text-emerald-700 mt-2">
                {formatCurrency(report.summary.totalRevenue)}
              </p>
              <p className="text-sm text-slate-500 mt-1">Total faturado</p>
            </div>

            <div className="bg-white rounded-xl shadow border-l-4 border-amber-500 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Falta pagar GiraKids
              </p>
              <p className="text-2xl font-bold text-amber-700 mt-2">
                {formatCurrency(report.summary.totalToPayGiraKids)}
              </p>
              <p className="text-sm text-slate-500 mt-1">Pendencia atual</p>
            </div>

            <div className="bg-white rounded-xl shadow border-l-4 border-green-600 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Ja pago para GiraKids
              </p>
              <p className="text-2xl font-bold text-green-700 mt-2">
                {formatCurrency(report.summary.totalPaidToGiraKids)}
              </p>
              <p className="text-sm text-slate-500 mt-1">Historico acumulado</p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow p-4 md:p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
              <h2 className="text-xl md:text-2xl font-bold text-slate-900">
                Quanto saiu de cada produto
              </h2>
              <div className="text-sm text-slate-500">
                Total geral GiraKids:{" "}
                <span className="font-semibold text-slate-700">
                  {formatCurrency(report.summary.totalGiraKidsAccrued)}
                </span>
              </div>
            </div>

            {products.length === 0 ? (
              <p className="text-slate-500">
                Nenhum produto vendido ate o momento.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700">
                      <th className="text-left p-3 font-semibold">#</th>
                      <th className="text-left p-3 font-semibold">Produto</th>
                      <th className="text-right p-3 font-semibold">
                        Qtd. vendida
                      </th>
                      <th className="text-right p-3 font-semibold">
                        Faturamento
                      </th>
                      <th className="text-right p-3 font-semibold">
                        Valor GiraKids
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product, index) => (
                      <tr
                        key={`${product.productId}-${index}`}
                        className="border-b border-slate-100 hover:bg-slate-50"
                      >
                        <td className="p-3 text-slate-500">{index + 1}</td>
                        <td className="p-3 font-medium text-slate-800">
                          {product.name}
                        </td>
                        <td className="p-3 text-right text-slate-700">
                          {formatInteger(product.quantitySold)}
                        </td>
                        <td className="p-3 text-right font-semibold text-slate-800">
                          {formatCurrency(product.revenue)}
                        </td>
                        <td className="p-3 text-right font-semibold text-amber-700">
                          {formatCurrency(product.giraKidsValue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="text-xs text-slate-500 text-right">
            Atualizado em {new Date(report.generatedAt).toLocaleString("pt-BR")}
          </p>
        </>
      )}
    </div>
  );
};

export default AdminManagementReportPage;

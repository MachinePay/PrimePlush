import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { Order, User } from "../types";
import { authenticatedFetch, getUsers } from "../services/apiService";
import {
  PAYMENT_STATE_META,
  DELIVERY_STATE_META,
  getDeliveryState,
  getPaymentState,
  getUserCreatedAt,
} from "../utils/adminStatus";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Drawer,
  EmptyState,
  PageHeader,
  Pagination,
  SearchInput,
  SkeletonRows,
  SortHeader,
  type SortState,
  StatCard,
  Tabs,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatInteger,
  formatRelative,
  sortRows,
} from "../components/admin/ui";
import {
  IconReceipt,
  IconRefresh,
  IconUserPlus,
  IconUsers,
  IconWallet,
} from "../components/admin/icons";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const PAGE_SIZE = 20;

// Campos que o cadastro grava além do tipo User do front
type UserRecord = User & {
  phone?: string;
  address?: string;
  cep?: string;
};

interface CustomerRow {
  user: UserRecord;
  createdAt: Date | null;
  orders: Order[];
  ordersCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
}

type SortKey = "name" | "createdAt" | "orders" | "spent" | "lastOrder";
type Audience = "customers" | "team";

const ROLE_LABELS: Record<string, string> = {
  customer: "Cliente",
  admincustomer: "Cliente (admin)",
  admin: "Administrador",
  kitchen: "Cozinha",
  superadmin: "SuperAdmin",
};

const isCustomerRole = (role?: string) =>
  !role || role === "customer" || role === "admincustomer";

const formatDocument = (doc?: string) => {
  const digits = String(doc || "").replace(/\D/g, "");
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return doc || "-";
};

const AdminCustomersPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState(() => searchParams.get("q") || "");
  const [audience, setAudience] = useState<Audience>("customers");
  const [sort, setSort] = useState<SortState<SortKey> | null>({
    key: "createdAt",
    direction: "desc",
  });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<CustomerRow | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [usersData, ordersRes] = await Promise.all([
        getUsers(),
        authenticatedFetch(`${API_URL}/api/orders/history`),
      ]);
      if (!Array.isArray(usersData)) {
        throw new Error("Não foi possível carregar os clientes.");
      }
      const ordersData = ordersRes.ok ? await ordersRes.json() : [];
      setUsers(usersData);
      setOrders(Array.isArray(ordersData) ? ordersData : []);
    } catch (err: any) {
      setError(err?.message || "Erro ao carregar clientes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const q = searchParams.get("q");
    if (q !== null) setSearch(q);
  }, [searchParams]);

  useEffect(() => {
    setPage(1);
  }, [search, audience, sort]);

  const ordersByUser = useMemo(() => {
    const map = new Map<string, Order[]>();
    orders.forEach((order) => {
      const list = map.get(order.userId) || [];
      list.push(order);
      map.set(order.userId, list);
    });
    return map;
  }, [orders]);

  const rows = useMemo<CustomerRow[]>(
    () =>
      users.map((user) => {
        const userOrders = (ordersByUser.get(user.id) || []).sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );
        const valid = userOrders.filter((order) => getPaymentState(order) !== "canceled");
        return {
          user,
          createdAt: getUserCreatedAt(user),
          orders: userOrders,
          ordersCount: valid.length,
          totalSpent: valid.reduce((sum, order) => sum + (Number(order.total) || 0), 0),
          lastOrderAt: userOrders[0]?.timestamp || null,
        };
      }),
    [users, ordersByUser],
  );

  const customerRows = useMemo(() => rows.filter((row) => isCustomerRole(row.user.role)), [rows]);
  const teamRows = useMemo(() => rows.filter((row) => !isCustomerRole(row.user.role)), [rows]);

  const filtered = useMemo(() => {
    const base = audience === "customers" ? customerRows : teamRows;
    const term = search.trim().toLowerCase();
    const digits = term.replace(/\D/g, "");
    const matches = term
      ? base.filter(({ user }) => {
          const phone = String(user.phone || user.telefone || "");
          return (
            String(user.name || "").toLowerCase().includes(term) ||
            String(user.email || "").toLowerCase().includes(term) ||
            (!!digits &&
              (String(user.cpf || "").includes(digits) ||
                phone.replace(/\D/g, "").includes(digits)))
          );
        })
      : base;
    return sortRows<CustomerRow, SortKey>(matches, sort, (row, key) => {
      switch (key) {
        case "name":
          return row.user.name;
        case "createdAt":
          return row.createdAt?.getTime() ?? null;
        case "orders":
          return row.ordersCount;
        case "spent":
          return row.totalSpent;
        case "lastOrder":
          return row.lastOrderAt ? new Date(row.lastOrderAt).getTime() : null;
      }
    });
  }, [audience, customerRows, teamRows, search, sort]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const summary = useMemo(() => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const buyers = customerRows.filter((row) => row.ordersCount > 0);
    const totalSpent = buyers.reduce((sum, row) => sum + row.totalSpent, 0);
    return {
      total: customerRows.length,
      newThisMonth: customerRows.filter(
        (row) => row.createdAt && row.createdAt >= monthStart,
      ).length,
      buyers: buyers.length,
      averagePerBuyer: buyers.length ? totalSpent / buyers.length : 0,
    };
  }, [customerRows]);

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Cadastros da loja com o histórico de compras de cada cliente."
        actions={
          <>
            <Button variant="secondary" icon={<IconRefresh />} onClick={load} loading={loading}>
              Atualizar
            </Button>
            <Button variant="primary" icon={<IconUserPlus />} onClick={() => navigate("/menu")}>
              Venda para cliente
            </Button>
          </>
        }
      />

      <div className="pp-stagger mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Clientes" value={summary.total} icon={<IconUsers />} tone="brand" loading={loading} />
        <StatCard
          label="Novos este mês"
          value={summary.newThisMonth}
          icon={<IconUserPlus />}
          tone="success"
          loading={loading}
        />
        <StatCard
          label="Já compraram"
          value={summary.buyers}
          icon={<IconReceipt />}
          tone="violet"
          hint={
            summary.total
              ? `${Math.round((summary.buyers / summary.total) * 100)}% dos clientes`
              : undefined
          }
          loading={loading}
        />
        <StatCard
          label="Gasto médio por cliente"
          value={summary.averagePerBuyer}
          format={formatCurrency}
          icon={<IconWallet />}
          tone="warning"
          loading={loading}
        />
      </div>

      <Card flush>
        <div className="flex flex-col gap-3 border-b border-[color:var(--pp-border)] px-4 pt-3 md:flex-row md:items-center md:justify-between">
          <Tabs
            tabs={[
              { value: "customers", label: "Clientes", count: customerRows.length },
              { value: "team", label: "Equipe", count: teamRows.length },
            ]}
            value={audience}
            onChange={setAudience}
            className="border-b-0"
          />
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Nome, email, CPF/CNPJ ou telefone"
            className="mb-3 w-full md:w-80"
          />
        </div>

        {error ? (
          <EmptyState
            icon={<IconUsers />}
            title="Não foi possível carregar"
            description={error}
            action={<Button onClick={load}>Tentar novamente</Button>}
          />
        ) : loading ? (
          <SkeletonRows rows={8} cols={5} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<IconUsers />}
            title={search ? "Nenhum resultado" : "Nenhum cadastro"}
            description={search ? `Nada encontrado para “${search}”.` : undefined}
          />
        ) : (
          <>
            <div className="pp-table-wrap">
              <table className="pp-table">
                <thead>
                  <tr>
                    <SortHeader label="Cliente" sortKey="name" sort={sort} onSort={setSort} />
                    <th className="hidden lg:table-cell">Contato</th>
                    <SortHeader label="Cadastro" sortKey="createdAt" sort={sort} onSort={setSort} />
                    <SortHeader label="Pedidos" sortKey="orders" sort={sort} onSort={setSort} align="right" />
                    <SortHeader label="Total gasto" sortKey="spent" sort={sort} onSort={setSort} align="right" />
                    <SortHeader label="Última compra" sortKey="lastOrder" sort={sort} onSort={setSort} />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.user.id} data-clickable="true" onClick={() => setSelected(row)}>
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar name={row.user.name} />
                          <div className="min-w-0">
                            <div className="max-w-[220px] truncate font-medium">{row.user.name}</div>
                            <div className="text-xs text-[color:var(--pp-text-3)]">
                              {audience === "team"
                                ? ROLE_LABELS[row.user.role || "customer"] || row.user.role
                                : formatDocument(row.user.cpf)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="hidden lg:table-cell">
                        <div className="max-w-[220px] truncate text-sm">{row.user.email || "-"}</div>
                        <div className="text-xs text-[color:var(--pp-text-3)]">
                          {row.user.phone || row.user.telefone || ""}
                        </div>
                      </td>
                      <td className="text-sm text-[color:var(--pp-text-2)]">
                        {row.createdAt ? formatDate(row.createdAt) : "-"}
                      </td>
                      <td className="pp-num text-right">{formatInteger(row.ordersCount)}</td>
                      <td className="pp-num text-right font-medium">{formatCurrency(row.totalSpent)}</td>
                      <td className="text-sm text-[color:var(--pp-text-2)]">
                        {row.lastOrderAt ? formatRelative(row.lastOrderAt) : (
                          <Badge>Sem compras</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />
          </>
        )}
      </Card>

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.user.name}
        description={
          selected
            ? ROLE_LABELS[selected.user.role || "customer"] || selected.user.role
            : undefined
        }
      >
        {selected && (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-3">
              <div className="pp-card p-3">
                <div className="text-xs text-[color:var(--pp-text-3)]">Pedidos</div>
                <div className="pp-num mt-1 text-lg font-semibold">
                  {formatInteger(selected.ordersCount)}
                </div>
              </div>
              <div className="pp-card p-3">
                <div className="text-xs text-[color:var(--pp-text-3)]">Total gasto</div>
                <div className="pp-num mt-1 text-lg font-semibold">
                  {formatCurrency(selected.totalSpent)}
                </div>
              </div>
              <div className="pp-card p-3">
                <div className="text-xs text-[color:var(--pp-text-3)]">Ticket médio</div>
                <div className="pp-num mt-1 text-lg font-semibold">
                  {formatCurrency(
                    selected.ordersCount ? selected.totalSpent / selected.ordersCount : 0,
                  )}
                </div>
              </div>
            </div>

            <section>
              <h3 className="mb-3 text-sm font-semibold">Dados de cadastro</h3>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                {[
                  ["CPF/CNPJ", formatDocument(selected.user.cpf)],
                  ["Email", selected.user.email || "-"],
                  ["Telefone", selected.user.phone || selected.user.telefone || "-"],
                  ["CEP", selected.user.cep || "-"],
                  ["Endereço", selected.user.address || "-"],
                  ["Cadastro", selected.createdAt ? formatDate(selected.createdAt) : "-"],
                  ["Pontos", formatInteger(Number(selected.user.pontos) || 0)],
                ].map(([label, value]) => (
                  <div key={label} className={label === "Endereço" ? "sm:col-span-2" : ""}>
                    <dt className="text-xs text-[color:var(--pp-text-3)]">{label}</dt>
                    <dd className="mt-0.5 break-words">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section>
              <h3 className="mb-3 text-sm font-semibold">
                Histórico de compras
                <span className="ml-2 font-normal text-[color:var(--pp-text-3)]">
                  {selected.orders.length}
                </span>
              </h3>
              {selected.orders.length === 0 ? (
                <EmptyState icon={<IconReceipt />} title="Nenhuma compra ainda" />
              ) : (
                <ul className="space-y-2">
                  {selected.orders.map((order) => {
                    const payment = PAYMENT_STATE_META[getPaymentState(order)];
                    const delivery = DELIVERY_STATE_META[getDeliveryState(order)];
                    return (
                      <li key={order.id}>
                        <button
                          type="button"
                          onClick={() => navigate("/historico/detalhes", { state: { order } })}
                          className="flex w-full items-center gap-3 rounded-xl border border-[color:var(--pp-border)] p-3 text-left transition-colors hover:bg-[color:var(--pp-surface-2)]"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-sm font-medium">
                              Pedido #{order.id.slice(-4)}
                              <span className="text-xs font-normal text-[color:var(--pp-text-3)]">
                                {formatDateTime(order.timestamp)}
                              </span>
                            </div>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              <Badge tone={payment.tone} dot>{payment.label}</Badge>
                              <Badge tone={delivery.tone} dot>{delivery.label}</Badge>
                            </div>
                          </div>
                          <span className="pp-num shrink-0 font-semibold">
                            {formatCurrency(Number(order.total) || 0)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default AdminCustomersPage;

import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Order } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { getPaymentMethodLabel } from "../utils/paymentLabels";
import {
  getDeliveredQuantity,
  getRemainingQuantity,
} from "../utils/orderDelivery";
import {
  DELIVERY_STATE_META,
  PAYMENT_STATE_META,
  getDeliveryState,
  getPaymentState,
} from "../utils/adminStatus";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  formatCurrency,
  formatDateTime,
  formatInteger,
  formatRelative,
} from "../components/admin/ui";
import {
  IconChevronLeft,
  IconDownload,
  IconReceipt,
  IconSearch,
} from "../components/admin/icons";
import "../components/admin/admin.css";

const money = (value: unknown) => formatCurrency(Number(value) || 0);

// Rótulo da forma de pagamento (mesma regra de antes)
const getPaymentDescription = (order: Order) => {
  if (!order.paymentType) return "-";
  if (order.paymentType === "presencial") {
    return order.paymentMethod
      ? `${getPaymentMethodLabel(order.paymentMethod)} (Loja Girakids)`
      : "Presencial";
  }
  if (order.paymentType === "online") {
    if (order.paymentMethod === "credit")
      return "Cartão de Crédito (Mercado Pago)";
    if (order.paymentMethod === "debit")
      return "Cartão de Débito (Mercado Pago)";
    if (order.paymentMethod === "pix") return "Pix (Mercado Pago)";
    return "Online (Mercado Pago)";
  }
  return order.paymentType;
};

const InfoRow: React.FC<{
  label: React.ReactNode;
  children: React.ReactNode;
  strong?: boolean;
}> = ({ label, children, strong }) => (
  <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
    <dt className="text-[color:var(--pp-text-2)]">{label}</dt>
    <dd
      className={`pp-num text-right ${strong ? "text-base font-semibold text-[color:var(--pp-text)]" : "text-[color:var(--pp-text)]"}`}
    >
      {children}
    </dd>
  </div>
);

const OrderDetailPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin";
  // Recebe o pedido via state da navegação
  const order: Order | undefined = location.state?.order;

  // Fora do layout admin (cozinha) a página precisa do próprio tema
  const wrap = (node: React.ReactNode) =>
    isAdmin ? (
      <>{node}</>
    ) : (
      <div className="pp-admin">
        <div className="pp-content">{node}</div>
      </div>
    );

  if (!order) {
    return wrap(
      <Card>
        <EmptyState
          icon={<IconReceipt />}
          title="Pedido não encontrado"
          description="Abra o pedido novamente a partir da lista de pedidos."
          action={
            <Button
              variant="primary"
              icon={<IconChevronLeft />}
              onClick={() => navigate(-1)}
            >
              Voltar
            </Button>
          }
        />
      </Card>,
    );
  }

  const paymentState = getPaymentState(order);
  const payment = PAYMENT_STATE_META[paymentState];
  const deliveryState = getDeliveryState(order);
  const delivery = DELIVERY_STATE_META[deliveryState];

  const totalUnits = order.items.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0),
    0,
  );
  const deliveredUnits = order.items.reduce(
    (sum, item) => sum + getDeliveredQuantity(order, item),
    0,
  );
  const itemsSubtotal = order.items.reduce(
    (sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0),
    0,
  );
  const total = Number(order.total) || 0;
  const fee = Number(order.fee) || 0;
  const adjustment = Number((total - itemsSubtotal - fee).toFixed(2));

  const hasSplits = !!order.paymentSplits && order.paymentSplits.length > 0;
  const hasCash =
    order.paymentMethod === "cash" &&
    order.cashReceived !== null &&
    order.cashReceived !== undefined;

  const openPdf = () => {
    const backendUrl = import.meta.env.VITE_API_URL || "http://localhost:3001";
    window.open(`${backendUrl}/api/orders/${order.id}/receipt-pdf`, "_blank");
  };

  // Linha do tempo: só com os campos que o pedido realmente tem
  const timeline: Array<{
    key: string;
    title: string;
    detail: React.ReactNode;
    done: boolean;
    current: boolean;
  }> = [
    {
      key: "created",
      title: "Pedido criado",
      detail: (
        <>
          {formatDateTime(order.timestamp)}
          <span className="text-[color:var(--pp-text-3)]">
            {" "}
            · {formatRelative(order.timestamp)}
          </span>
        </>
      ),
      done: true,
      current: false,
    },
    {
      key: "payment",
      title:
        paymentState === "paid"
          ? "Pagamento confirmado"
          : paymentState === "canceled"
            ? "Pagamento cancelado"
            : "Aguardando pagamento",
      detail: getPaymentDescription(order),
      done: paymentState === "paid",
      current: paymentState === "pending",
    },
    {
      key: "delivery",
      title:
        deliveryState === "delivered"
          ? "Entregue ao cliente"
          : deliveryState === "partial"
            ? "Entrega parcial"
            : "Entrega pendente",
      detail:
        deliveryState === "delivered"
          ? `${formatInteger(totalUnits)} de ${formatInteger(totalUnits)} unidades entregues`
          : `${formatInteger(deliveredUnits)} de ${formatInteger(totalUnits)} unidades entregues`,
      done: deliveryState === "delivered",
      current:
        deliveryState === "partial" ||
        (deliveryState === "pending" && paymentState !== "pending"),
    },
  ];

  return wrap(
    <div className="pp-animate-in">
      <PageHeader
        eyebrow="Pedidos"
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="pp-num">Pedido #{order.id.slice(-4)}</span>
            <span className="flex flex-wrap items-center gap-1.5">
              <Badge tone={payment.tone} dot>
                {payment.label}
              </Badge>
              <Badge tone={delivery.tone} dot>
                {delivery.label}
              </Badge>
            </span>
          </span>
        }
        description={
          <>
            {formatDateTime(order.timestamp)} · {formatInteger(totalUnits)}{" "}
            {totalUnits === 1 ? "unidade" : "unidades"} ·{" "}
            <span className="pp-num font-medium text-[color:var(--pp-text)]">
              {money(order.total)}
            </span>
          </>
        }
        actions={
          <>
            <Button
              variant="secondary"
              icon={<IconChevronLeft />}
              onClick={() => navigate(-1)}
            >
              Voltar
            </Button>
            <Button variant="primary" icon={<IconDownload />} onClick={openPdf}>
              Gerar PDF do pedido
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
        {/* Coluna principal */}
        <div className="space-y-4 lg:col-span-2 lg:space-y-6">
          <Card
            title="Itens"
            subtitle={`${formatInteger(order.items.length)} ${order.items.length === 1 ? "produto" : "produtos"} · ${formatInteger(deliveredUnits)} de ${formatInteger(totalUnits)} unidades entregues`}
            flush
          >
            {/* Tabela (tablet/desktop) */}
            <div className="pp-table-wrap hidden sm:block">
              <table className="pp-table">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th style={{ textAlign: "right" }}>Qtd.</th>
                    <th style={{ textAlign: "right" }}>Unitário</th>
                    <th style={{ textAlign: "right" }}>Subtotal</th>
                    <th>Entrega</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item, idx) => {
                    const delivered = getDeliveredQuantity(order, item);
                    const remaining = getRemainingQuantity(order, item);
                    const percent =
                      item.quantity > 0
                        ? Math.min(100, Math.round((delivered / item.quantity) * 100))
                        : 0;
                    return (
                      <tr key={idx}>
                        <td className="font-medium">{item.name}</td>
                        <td className="pp-num text-right">{item.quantity}</td>
                        <td className="pp-num whitespace-nowrap text-right">
                          {money(item.price)}
                        </td>
                        <td className="pp-num whitespace-nowrap text-right font-medium">
                          {money((Number(item.price) || 0) * (Number(item.quantity) || 0))}
                        </td>
                        <td className="min-w-[150px]">
                          <div
                            className={`pp-num text-xs font-medium ${remaining > 0 ? "text-amber-700" : "text-emerald-700"}`}
                          >
                            entregue {delivered} · falta {remaining}
                          </div>
                          <div className="pp-progress mt-1.5">
                            <span
                              style={{
                                width: `${percent}%`,
                                background:
                                  remaining > 0 ? undefined : "var(--pp-success)",
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Lista (celular) */}
            <ul className="divide-y divide-[color:var(--pp-border)] sm:hidden">
              {order.items.map((item, idx) => {
                const delivered = getDeliveredQuantity(order, item);
                const remaining = getRemainingQuantity(order, item);
                const percent =
                  item.quantity > 0
                    ? Math.min(100, Math.round((delivered / item.quantity) * 100))
                    : 0;
                return (
                  <li key={idx} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium">{item.name}</div>
                        <div className="pp-num text-xs text-[color:var(--pp-text-3)]">
                          {item.quantity}x {money(item.price)}/un
                        </div>
                      </div>
                      <div className="pp-num shrink-0 font-medium">
                        {money((Number(item.price) || 0) * (Number(item.quantity) || 0))}
                      </div>
                    </div>
                    <div
                      className={`pp-num mt-2 text-xs font-medium ${remaining > 0 ? "text-amber-700" : "text-emerald-700"}`}
                    >
                      entregue {delivered} · falta {remaining}
                    </div>
                    <div className="pp-progress mt-1">
                      <span
                        style={{
                          width: `${percent}%`,
                          background: remaining > 0 ? undefined : "var(--pp-success)",
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Totais */}
            <dl className="border-t border-[color:var(--pp-border)] px-4 py-3 sm:px-5">
              <InfoRow label="Subtotal dos itens">{money(itemsSubtotal)}</InfoRow>
              {fee > 0 && <InfoRow label="Taxa">{money(fee)}</InfoRow>}
              {Math.abs(adjustment) > 0.009 && (
                <InfoRow label="Ajustes">
                  {adjustment > 0 ? "+ " : "− "}
                  {money(Math.abs(adjustment))}
                </InfoRow>
              )}
              <div className="mt-1 border-t border-dashed border-[color:var(--pp-border)] pt-1">
                <InfoRow label="Total" strong>
                  {money(order.total)}
                </InfoRow>
              </div>
            </dl>
          </Card>

          {order.observation && (
            <Card title="Observação">
              <p className="whitespace-pre-wrap rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {order.observation}
              </p>
            </Card>
          )}
        </div>

        {/* Coluna lateral */}
        <div className="space-y-4 lg:space-y-6">
          <Card title="Status">
            <ol className="pp-timeline">
              {timeline.map((step) => (
                <li key={step.key}>
                  <span
                    className="pp-timeline-dot"
                    data-done={step.done ? "true" : undefined}
                    data-current={step.current ? "true" : undefined}
                  />
                  <div className="text-sm font-medium text-[color:var(--pp-text)]">
                    {step.title}
                  </div>
                  <div className="mt-0.5 text-xs text-[color:var(--pp-text-2)]">
                    {step.detail}
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          <Card title="Cliente">
            <div className="flex items-center gap-3">
              <Avatar name={order.userName || "?"} size={40} />
              <div className="min-w-0">
                <div className="truncate font-medium">{order.userName || "-"}</div>
                {order.userId && (
                  <div className="truncate text-xs text-[color:var(--pp-text-3)]">
                    ID {order.userId}
                  </div>
                )}
              </div>
            </div>
            {order.userName && (
              <Button
                variant="ghost"
                size="sm"
                icon={<IconSearch />}
                className="mt-3"
                onClick={() =>
                  navigate(`/historico?q=${encodeURIComponent(order.userName || "")}`)
                }
              >
                Ver pedidos deste cliente
              </Button>
            )}
          </Card>

          <Card
            title="Pagamento"
            actions={
              <Badge tone={payment.tone} dot>
                {payment.label}
              </Badge>
            }
          >
            <dl>
              <InfoRow label="Forma">{getPaymentDescription(order)}</InfoRow>
              {!hasSplits &&
                order.paymentMethod === "credit" &&
                (order.installments || 1) > 1 && (
                  <InfoRow label="Parcelas">{order.installments}x</InfoRow>
                )}
              {hasCash && (
                <>
                  <InfoRow label="Valor recebido">{money(order.cashReceived)}</InfoRow>
                  <InfoRow label="Troco">{money(order.cashChange || 0)}</InfoRow>
                </>
              )}
              <InfoRow label="Status">{order.paymentStatus || "-"}</InfoRow>
            </dl>

            {hasSplits && (
              <div className="mt-3 border-t border-[color:var(--pp-border)] pt-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[color:var(--pp-text-3)]">
                  Pagamento mesclado
                </div>
                <ul className="space-y-2">
                  {order.paymentSplits!.map((split, idx) => (
                    <li
                      key={idx}
                      className="rounded-xl bg-[color:var(--pp-surface-2)] px-3 py-2 text-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">
                          {getPaymentMethodLabel(split.method)}
                          {split.method === "credit" &&
                            (split.installments || 1) > 1 && (
                              <span className="ml-1 font-normal text-[color:var(--pp-text-3)]">
                                ({split.installments}x)
                              </span>
                            )}
                        </span>
                        <span className="pp-num font-semibold">{money(split.amount)}</span>
                      </div>
                      {split.cashReceived !== undefined &&
                        split.cashReceived !== null && (
                          <div className="pp-num mt-0.5 text-xs text-[color:var(--pp-text-2)]">
                            recebido {money(split.cashReceived)} · troco{" "}
                            {money(split.cashChange || 0)}
                          </div>
                        )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>,
  );
};

export default OrderDetailPage;

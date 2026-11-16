import type { Order, Product } from "../types";
import { getDeliveredQuantity } from "./orderDelivery";

// Regras de exibição de status usadas no painel admin. Só interpretam os
// campos que o backend já grava; não mudam nada no pedido.

export type PaymentState = "paid" | "pending" | "canceled";
export type DeliveryState = "delivered" | "partial" | "pending";

export const getPaymentState = (order: Order): PaymentState => {
  const status = String(order.paymentStatus || "pending").toLowerCase();
  if (["paid", "authorized", "approved"].includes(status)) return "paid";
  if (["canceled", "cancelled", "rejected"].includes(status)) return "canceled";
  return "pending";
};

export const getDeliveryState = (order: Order): DeliveryState => {
  if (order.entregueCliente) return "delivered";
  const items = Array.isArray(order.items) ? order.items : [];
  return items.some((item) => getDeliveredQuantity(order, item) > 0)
    ? "partial"
    : "pending";
};

export const PAYMENT_STATE_META: Record<
  PaymentState,
  { label: string; tone: "success" | "warning" | "danger" }
> = {
  paid: { label: "Pago", tone: "success" },
  pending: { label: "A pagar", tone: "warning" },
  canceled: { label: "Cancelado", tone: "danger" },
};

export const DELIVERY_STATE_META: Record<
  DeliveryState,
  { label: string; tone: "success" | "info" | "neutral" }
> = {
  delivered: { label: "Entregue", tone: "success" },
  partial: { label: "Entrega parcial", tone: "info" },
  pending: { label: "A entregar", tone: "neutral" },
};

// Valor por forma de pagamento (pagamento mesclado entra dividido)
export const getOrderPaymentParts = (
  order: Order,
): Array<{ method: string; amount: number }> => {
  if (Array.isArray(order.paymentSplits) && order.paymentSplits.length > 0) {
    return order.paymentSplits.map((split) => ({
      method: split.method,
      amount: Number(split.amount) || 0,
    }));
  }
  return [
    {
      method: String(order.paymentMethod || order.paymentType || "outros"),
      amount: Number(order.total) || 0,
    },
  ];
};

// ---------- Estoque ----------

/** Estoque controlado (null/undefined = ilimitado) */
export const hasTrackedStock = (product: Product) =>
  product.stock !== null && product.stock !== undefined;

export const isOutOfStock = (product: Product) =>
  hasTrackedStock(product) && Number(product.stock) <= 0;

/**
 * Estoque baixo: acabando (até 5 un.) ou abaixo do mínimo cadastrado no
 * produto — as duas regras que o painel já usava.
 */
export const isLowStock = (product: Product) => {
  if (!hasTrackedStock(product)) return false;
  const stock = Number(product.stock);
  if (stock <= 0) return false;
  const min = Number(product.minStock) || 0;
  return stock <= 5 || (min > 0 && stock < min);
};

// ---------- Clientes ----------

/**
 * Data de cadastro do cliente. A tabela de usuários não tem coluna de data;
 * o id gerado no cadastro é `user_<timestamp>`, então a data vem dele.
 */
export const getUserCreatedAt = (user: { id?: string }): Date | null => {
  const match = /^user_(\d{12,14})$/.exec(String(user.id || ""));
  if (!match) return null;
  const date = new Date(Number(match[1]));
  return Number.isNaN(date.getTime()) ? null : date;
};

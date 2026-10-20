import type { Order, OrderItem } from "../types";

// Quanto do item já foi entregue. Pedidos antigos não têm deliveredQuantity:
// nesses, entregueCliente indica tudo ou nada.
export const getDeliveredQuantity = (order: Order, item: OrderItem): number => {
  if (item.deliveredQuantity !== undefined && item.deliveredQuantity !== null) {
    return Number(item.deliveredQuantity) || 0;
  }
  return order.entregueCliente ? item.quantity : 0;
};

export const getRemainingQuantity = (order: Order, item: OrderItem): number =>
  Math.max(0, item.quantity - getDeliveredQuantity(order, item));

// Já houve alguma entrega, mas ainda falta item
export const isPartiallyDelivered = (order: Order): boolean =>
  !order.entregueCliente &&
  order.items.some((item) => getDeliveredQuantity(order, item) > 0);

// Id do produto como o backend espera na entrega
export const getItemProductId = (item: OrderItem): string =>
  item.id || item.productId;

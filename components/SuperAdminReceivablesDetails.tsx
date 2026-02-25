import React from "react";

interface ItemDetail {
  name: string;
  price: number;
  precoBruto: number;
  quantity: number;
  valueToReceive: number;
}

interface OrderDetail {
  id: string;
  timestamp: string;
  userName?: string;
  total: number;
  orderValueToReceive: number;
  items: ItemDetail[];
}

interface SuperAdminReceivablesDetailsProps {
  orders: OrderDetail[];
  totalToReceive: number;
  totalReceived: number;
  alreadyReceived: number;
  receivedOrderIds?: string[];
  selectedOrderIds?: string[];
  onToggleOrder?: (orderId: string) => void;
}

const SuperAdminReceivablesDetails: React.FC<
  SuperAdminReceivablesDetailsProps
> = ({
  orders,
  totalToReceive,
  totalReceived,
  alreadyReceived,
  receivedOrderIds = [],
  selectedOrderIds = [],
  onToggleOrder = () => {},
}) => {
  const safeOrders = Array.isArray(orders) ? orders : [];
  return (
    <div className="bg-white shadow-xl rounded-2xl p-6 border-2 border-purple-200 mt-8">
      <h2 className="text-2xl font-bold text-purple-800 mb-4">
        Pedidos detalhados para cálculo do valor a receber
      </h2>
      <div className="mb-4 flex items-center gap-4">
        <span className="font-semibold">Total já recebido:</span> R$
        {Number(alreadyReceived).toFixed(2)}
        <br />
        <span className="font-semibold">Total recebido (histórico):</span> R$
        {Number(totalReceived).toFixed(2)}
        {safeOrders.length > 0 && (
          <button
            className="ml-4 px-3 py-2 bg-purple-600 text-white rounded font-bold text-xs hover:bg-purple-700 transition"
            onClick={() => {
              if (selectedOrderIds.length === safeOrders.length) {
                onToggleOrder &&
                  safeOrders.forEach((order) => {
                    if (selectedOrderIds.includes(order.id))
                      onToggleOrder(order.id);
                  });
              } else {
                onToggleOrder &&
                  safeOrders.forEach((order) => {
                    if (
                      !selectedOrderIds.includes(order.id) &&
                      !receivedOrderIds.includes(order.id)
                    )
                      onToggleOrder(order.id);
                  });
              }
            }}
            type="button"
          >
            {selectedOrderIds.length === safeOrders.length
              ? "Desmarcar todos"
              : "Selecionar todos"}
          </button>
        )}
      </div>
      {safeOrders.length === 0 && <div>Nenhum pedido encontrado.</div>}
      {safeOrders.map((order) => (
        <div
          key={order.id}
          className={`order-card border rounded-lg p-4 mb-6 ${receivedOrderIds.includes(order.id) ? "bg-green-100 border-green-400" : "bg-purple-50"}`}
        >
          <div className="mb-2 flex items-center gap-2">
            <input
              type="checkbox"
              checked={selectedOrderIds?.includes(order.id) || false}
              onChange={() => onToggleOrder && onToggleOrder(order.id)}
              disabled={receivedOrderIds.includes(order.id)}
              className="accent-purple-600 w-5 h-5"
            />
            <b>Pedido #{order.id}</b> | Cliente: {order.userName || "-"} | Data:{" "}
            {new Date(order.timestamp).toLocaleString()}
            {order.paymentMethod && (
              <>
                {" | "}
                <span className="font-semibold">Tipo de Pagamento:</span>{" "}
                {order.paymentMethod}
              </>
            )}
            <button
              className="ml-2 px-2 py-1 bg-blue-600 text-white rounded text-xs font-bold hover:bg-blue-700 transition"
              onClick={() => {
                const backendUrl =
                  import.meta.env.VITE_API_URL || "http://localhost:3001";
                window.open(
                  `${backendUrl}/api/orders/${order.id}/receipt-pdf`,
                  "_blank",
                );
              }}
            >
              Gerar PDF
            </button>
          </div>
          <div className="mb-2">
            Total do pedido: R$ {(Number(order.total) || 0).toFixed(2)} | Valor
            a receber deste pedido:{" "}
            <b>R$ {Number(order.orderValueToReceive).toFixed(2)}</b>
          </div>
          <table className="w-full text-xs mb-2">
            <thead>
              <tr className="bg-purple-100">
                <th className="py-1 px-2 text-left">Produto</th>
                <th className="py-1 px-2 text-left">Preço Venda</th>
                <th className="py-1 px-2 text-left">Preço Bruto</th>
                <th className="py-1 px-2 text-left">Qtd</th>
                <th className="py-1 px-2 text-left">Valor a Receber</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item, idx) => (
                <tr key={idx} className="border-b">
                  <td className="py-1 px-2">{item.name}</td>
                  <td className="py-1 px-2">
                    R$ {Number(item.price).toFixed(2)}
                  </td>
                  <td className="py-1 px-2">
                    R$ {Number(item.precoBruto).toFixed(2)}
                  </td>
                  <td className="py-1 px-2">{item.quantity}</td>
                  <td className="py-1 px-2">
                    R$ {Number(item.valueToReceive).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <div className="text-xs text-gray-500">
        <span>
          O valor a receber é calculado como: <br />
          <span className="font-mono">
            (Preço de venda - Preço bruto) x quantidade para cada item, somando
            todos os pedidos.
          </span>
        </span>
      </div>
    </div>
  );
};

export default SuperAdminReceivablesDetails;

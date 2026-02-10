
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
}

const SuperAdminReceivablesDetails: React.FC<SuperAdminReceivablesDetailsProps> = ({ orders, totalToReceive, totalReceived, alreadyReceived, receivedOrderIds = [] }) => {
  const safeOrders = Array.isArray(orders) ? orders : [];
  return (
    <div className="bg-white shadow-xl rounded-2xl p-6 border-2 border-purple-200 mt-8">
      <h2 className="text-2xl font-bold text-purple-800 mb-4">Pedidos detalhados para cálculo do valor a receber</h2>
      <div className="mb-4">
        <span className="font-semibold">Total já recebido:</span> R${alreadyReceived.toFixed(2)}<br />
        <span className="font-semibold">Total recebido (histórico):</span> R${totalReceived.toFixed(2)}
      </div>
      {safeOrders.length === 0 && <div>Nenhum pedido encontrado.</div>}
      {safeOrders.map((order) => (
        <div
          key={order.id}
          className={`order-card border rounded-lg p-4 mb-6 ${receivedOrderIds.includes(order.id) ? "bg-green-100 border-green-400" : "bg-purple-50"}`}
        >
          <div className="mb-2">
            <b>Pedido #{order.id}</b> | Cliente: {order.userName || '-'} | Data: {new Date(order.timestamp).toLocaleString()}
          </div>
          <div className="mb-2">
            Total do pedido: R$ {order.total?.toFixed(2) ?? "0.00"} | Valor a receber deste pedido: <b>R$ {order.orderValueToReceive?.toFixed(2) ?? "0.00"}</b>
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
                  <td className="py-1 px-2">R$ {item.price?.toFixed(2) ?? "0.00"}</td>
                  <td className="py-1 px-2">R$ {item.precoBruto?.toFixed(2) ?? "0.00"}</td>
                  <td className="py-1 px-2">{item.quantity}</td>
                  <td className="py-1 px-2">R$ {item.valueToReceive?.toFixed(2) ?? "0.00"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <div className="text-xs text-gray-500">
        <span>O valor a receber é calculado como: <br />
        <span className="font-mono">(Preço de venda - Preço bruto) x quantidade para cada item, somando todos os pedidos.</span></span>
      </div>
    </div>
  );
};

export default SuperAdminReceivablesDetails;

import React from "react";
import type { Order } from "../types";

interface SuperAdminReceivablesDetailsProps {
  orders: Order[];
  totalToReceive: number;
  totalReceived: number;
  alreadyReceived: number;
}

const SuperAdminReceivablesDetails: React.FC<SuperAdminReceivablesDetailsProps> = ({ orders, totalToReceive, totalReceived, alreadyReceived }) => {
  // Exemplo de cálculo: totalToReceive = soma dos pedidos confirmados - taxas - já recebido
  const totalPedidos = orders.reduce((sum, o) => sum + o.total, 0);
  const taxas = orders.reduce((sum, o) => sum + (o.fee || 0), 0);
  const valorReceber = totalPedidos - taxas - alreadyReceived;

  return (
    <div className="bg-white shadow-xl rounded-2xl p-6 border-2 border-purple-200 mt-8">
      <h2 className="text-2xl font-bold text-purple-800 mb-4">Pedidos detalhados para cálculo do valor a receber</h2>
      <table className="w-full mb-6 text-sm">
        <thead>
          <tr className="bg-purple-100">
            <th className="py-2 px-3 text-left">ID</th>
            <th className="py-2 px-3 text-left">Cliente</th>
            <th className="py-2 px-3 text-left">Data</th>
            <th className="py-2 px-3 text-left">Total</th>
            <th className="py-2 px-3 text-left">Taxa</th>
            <th className="py-2 px-3 text-left">Forma de Pagamento</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-b">
              <td className="py-2 px-3">{order.id.slice(-4)}</td>
              <td className="py-2 px-3">{order.userName || '-'}</td>
              <td className="py-2 px-3">{new Date(order.timestamp).toLocaleString()}</td>
              <td className="py-2 px-3">R${order.total.toFixed(2)}</td>
              <td className="py-2 px-3">R${order.fee?.toFixed(2) ?? '0.00'}</td>
              <td className="py-2 px-3">{(() => {
                if (!order.paymentType) return "-";
                if (order.paymentType === "presencial") return "Presencial";
                if (order.paymentType === "online") {
                  if (order.paymentMethod === "credit") return "Cartão de Crédito (Mercado Pago)";
                  if (order.paymentMethod === "debit") return "Cartão de Débito (Mercado Pago)";
                  if (order.paymentMethod === "pix") return "Pix (Mercado Pago)";
                  return "Online (Mercado Pago)";
                }
                return order.paymentType;
              })()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mb-4">
        <span className="font-semibold">Total dos pedidos:</span> R${totalPedidos.toFixed(2)}<br />
        <span className="font-semibold">Total de taxas:</span> R${taxas.toFixed(2)}<br />
        <span className="font-semibold">Já recebido:</span> R${alreadyReceived.toFixed(2)}<br />
        <span className="font-semibold text-purple-700">Valor a receber:</span> R${valorReceber.toFixed(2)}
      </div>
      <div className="text-xs text-gray-500">
        <span>O valor a receber é calculado como: <br />
        <span className="font-mono">Total dos pedidos - taxas - já recebido</span></span>
      </div>
    </div>
  );
};

export default SuperAdminReceivablesDetails;

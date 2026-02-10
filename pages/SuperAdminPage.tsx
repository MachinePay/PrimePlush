


import React, { useState, useEffect } from "react";
import SuperAdminReceivablesDetails from "../components/SuperAdminReceivablesDetails";

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
  status?: string;
  paymentType?: string;
  paymentStatus?: string;
}

interface StatsData {
  stats: {
    totalToReceive: number;
    totalReceived: number;
    alreadyReceived: number;
  };
  history: Array<{
    id: number;
    amount: number;
    date: string;
  }>;
  orders: OrderDetail[];
}

const SuperAdminPage: React.FC = () => {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:3001"}/api/super-admin/receivables`);
      if (!response.ok) throw new Error("Erro ao buscar dados");
      const result = await response.json();
      setData(result);
    } catch (e: any) {
      setError(e.message || "Erro ao buscar dados");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-purple-600 mb-6">Dashboard Super Admin</h1>
        {loading && <div className="text-center">Carregando...</div>}
        {error && <div className="text-red-600 text-center mb-4">{error}</div>}
        {data && (
          <SuperAdminReceivablesDetails
            orders={data.orders}
            totalToReceive={data.stats.totalToReceive}
            totalReceived={data.stats.totalReceived}
            alreadyReceived={data.stats.alreadyReceived}
          />
        )}
      </div>
    </div>
  );
};

export default SuperAdminPage;
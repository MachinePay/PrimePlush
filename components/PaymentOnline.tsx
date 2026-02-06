import React, { useState, useEffect } from "react";

/**
 * Componente de Pagamento Online com MercadoPago
 *
 * Este componente oferece 3 formas de pagamento:
 * 1. Checkout Pro - Redireciona para página do MercadoPago
 * 2. PIX - Exibe QR Code na tela
 * 3. Cartão - Formulário integrado com tokenização
 */

interface PaymentOnlineProps {
  orderId: string | null;
  total: number;
  items: Array<{
    name: string;
    price: number;
    quantity: number;
  }>;
  userEmail?: string;
  userName?: string;
  onSuccess?: (paymentId: string) => void;
  onError?: (error: string) => void;
}

type PaymentMethod = "checkout-pro" | "pix" | "card";

export default function PaymentOnline(props: PaymentOnlineProps) {
  // Chave pública do Mercado Pago fornecida pelo usuário
  const MP_PUBLIC_KEY = "APP_USR-3cf663c4-9d4b-4045-9744-173080ab84e5";
  // Estado para status de pagamento cartão
  const [cardStatus, setCardStatus] = useState<string>("");
  // Estado para resposta do backend
  const [cardResult, setCardResult] = useState<any>(null);
  // Estado para dados do cartão (token, etc)
  const [cardTokenData, setCardTokenData] = useState<any>(null);
  // Estado para dados extras do cartão
  const [cardExtra, setCardExtra] = useState<any>({});
  // Importação dinâmica do MercadoPagoCardForm e Installments
  const MercadoPagoCardForm = React.lazy(() => import("./MercadoPagoCardForm"));

  // ...existing code...
  const MercadoPagoInstallments = React.lazy(() => import("./MercadoPagoInstallments"));
  const {
    orderId,
    total,
    items,
    userEmail = "cliente@primeplush.com",
    userName = "Cliente",
    onSuccess,
    onError,
  } = props;
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [cardStep, setCardStep] = useState<'form' | 'confirm'>("form");
  const [cardData, setCardData] = useState<any>(null);
  const [installmentsOptions, setInstallmentsOptions] = useState<any[]>([]);
  const [selectedInstallments, setSelectedInstallments] = useState<number>(1);
  const [cardLoading, setCardLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pixData, setPixData] = useState<{
    qrCode: string;
    qrCodeBase64: string;
    paymentId: string;
  } | null>(null);
  const [error, setError] = useState("");

  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

  // Polling para verificar status do PIX
  useEffect(() => {
    if (!pixData) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(
          `${API_URL}/api/payment-online/status/${pixData.paymentId}`,
        );
        const data = await response.json();

        if (data.approved) {
          clearInterval(interval);
          onSuccess?.(pixData.paymentId);
        } else if (data.status === "rejected") {
          clearInterval(interval);
          setError("Pagamento PIX rejeitado");
          onError?.("PIX rejeitado");
        }
      } catch (err) {
        console.error("Erro ao verificar status:", err);
      }
    }, 3000); // Verifica a cada 3 segundos

    return () => clearInterval(interval);
  }, [pixData, onSuccess, onError, API_URL]);

  const handleCheckoutPro = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/api/payment-online/create-preference`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items,
            orderId: orderId || "temp",
            payerEmail: userEmail,
            payerName: userName,
          }),
        },
      );

      if (!response.ok) throw new Error("Erro ao criar preferência");

      const data = await response.json();

      // Redireciona para página do MercadoPago
      window.location.href = data.initPoint;
    } catch (err: any) {
      setError(err.message);
      onError?.(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePIX = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/api/payment-online/create-pix-direct`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: total,
            description: orderId ? `Pedido ${orderId}` : "Pedido PrimePlush",
            orderId: orderId || "temp",
            payerEmail: userEmail,
          }),
        },
      );

      if (!response.ok) throw new Error("Erro ao gerar PIX");

      const data = await response.json();

      setPixData({
        qrCode: data.qrCode,
        qrCodeBase64: data.qrCodeBase64,
        paymentId: data.paymentId,
      });
    } catch (err: any) {
      setError(err.message);
      onError?.(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyPixCode = () => {
    if (pixData?.qrCode) {
      navigator.clipboard.writeText(pixData.qrCode);
      alert("Código PIX copiado!");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Processando pagamento...</p>
        </div>
      </div>
    );
  }

  if (pixData) {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md mx-auto">
        <h2 className="text-2xl font-bold text-center mb-6 text-purple-600">
          💚 Pague com PIX
        </h2>

        <div className="bg-gray-50 rounded-xl p-6 mb-6">
          <img
            src={`data:image/png;base64,${pixData.qrCodeBase64}`}
            alt="QR Code PIX"
            className="w-full max-w-xs mx-auto mb-4"
          />

          <p className="text-center text-sm text-gray-600 mb-4">
            Escaneie o QR Code com seu app de banco
          </p>

          <div className="bg-white rounded-lg p-4 mb-4">
            <p className="text-xs text-gray-500 mb-2">
              Código PIX Copia e Cola:
            </p>
            <p className="text-xs break-all font-mono bg-gray-100 p-2 rounded">
              {pixData.qrCode}
            </p>
          </div>

          <button
            onClick={copyPixCode}
            className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded-lg transition-all"
          >
            📋 Copiar Código PIX
          </button>
        </div>

        <div className="text-center">
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500 mb-4">
            <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
            <span>Aguardando pagamento...</span>
          </div>
          <button
            onClick={() => {
              setPixData(null);
              setSelectedMethod(null);
            }}
            className="text-gray-500 hover:text-gray-700 text-sm underline"
          >
            Cancelar e voltar
          </button>
        </div>
      </div>
    );
  }

  if (!selectedMethod) {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md mx-auto">
        <h2 className="text-2xl font-bold text-center mb-6 text-purple-600">
          💳 Escolha a forma de pagamento
        </h2>
        <div className="space-y-4">
          <button
            onClick={handleCheckoutPro}
            className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg hover:shadow-xl flex items-center justify-between"
          >
            <span>💳 Cartão de Crédito / Débito (Mercado Pago)</span>
            <span className="text-sm">Parcelado</span>
          </button>
          <button
            onClick={() => setSelectedMethod("pix")}
            className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-4 px-6 rounded-xl transition-all shadow-lg hover:shadow-xl flex items-center justify-between"
          >
            <span>💚 PIX</span>
            <span className="text-sm opacity-90">Pagamento instantâneo</span>
          </button>
        </div>
        {error && (
          <div className="mt-4 bg-blue-50 border-2 border-blue-200 text-blue-600 p-4 rounded-lg text-center text-sm">
            {error}
          </div>
        )}
        <div className="mt-6 text-center">
          <p className="text-2xl font-bold text-purple-600">
            Total: R$ {total.toFixed(2)}
          </p>
          {orderId && (
            <p className="text-sm text-gray-500 mt-2">
              Pedido #{orderId.substring(0, 12)}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Chama handlePIX automaticamente ao selecionar PIX
  useEffect(() => {
    if (selectedMethod === "pix" && !pixData && !loading) {
      handlePIX();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMethod]);

  // Removeu o fluxo customizado de cartão de crédito. Agora só usa Checkout Pro.
}

import React, { useState, useEffect, useCallback } from "react";
import { checkPaymentStatus } from '../services/paymentService';

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
  const MP_PUBLIC_KEY = "APP_USR-3cf663c4-9d4b-4045-173080ab84e5";
  // Estado para status de pagamento cartão
  const [cardStatus, setCardStatus] = useState<string>("");
  // Estado para resposta do backend
  const [cardResult, setCardResult] = useState<any>(null);
  // Estado para dados do cartão (token, etc)
  const [cardTokenData, setCardTokenData] = useState<any>(null);
  // Estado para dados extras do cartão
  const [cardExtra, setCardExtra] = useState<any>({});

  // Estado para mensagem de status do pedido
  const [paymentStatusMsg, setPaymentStatusMsg] = useState<string>("");
  // Estado para controle de exibição da mensagem
  const [showPaymentStatus, setShowPaymentStatus] = useState<boolean>(false);

  // ...existing code...
  // Removido React.lazy pois não está mais em uso
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
  const [error, setError] = useState("");

  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";


  // Função para polling de status de pagamento
  const startPaymentStatusPolling = useCallback((paymentId: string) => {
    let intervalId: any = null;
    intervalId = setInterval(async () => {
      const statusResp = await checkPaymentStatus(paymentId);
      if (statusResp.status === 'approved') {
        setPaymentStatusMsg('pedido pago e enviado!');
        setShowPaymentStatus(true);
        clearInterval(intervalId);
        localStorage.removeItem('pendingPaymentId');
      } else if (statusResp.status === 'pending') {
        setPaymentStatusMsg('pedido em andamento: realize o pagamento');
        setShowPaymentStatus(true);
      }
    }, 3000);
  }, []);

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

      // Abre a página do MercadoPago em uma nova aba
      window.open(data.initPoint, '_blank', 'noopener,noreferrer');

      // Exibe mensagem de pedido em andamento
      setPaymentStatusMsg("pedido em andamento: realize o pagamento");
      setShowPaymentStatus(true);

      // Inicia polling para verificar status de pagamento
      if (data.paymentId) {
        localStorage.setItem('pendingPaymentId', data.paymentId);
        startPaymentStatusPolling(data.paymentId);
      }
      // Ao montar, verifica se há paymentId pendente e inicia polling automático
      useEffect(() => {
        const pendingId = localStorage.getItem('pendingPaymentId');
        if (pendingId) {
          setShowPaymentStatus(true);
          setPaymentStatusMsg('pedido em andamento: realize o pagamento');
          startPaymentStatusPolling(pendingId);
        }
      }, [startPaymentStatusPolling]);
    } catch (err: any) {
      setError(err.message);
      onError?.(err.message);
    } finally {
      setLoading(false);
    }
  };



  // Removeu verificação por query string, agora polling é feito após iniciar pagamento

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
            <span>💳 Crédito, Débito ou Pix (Mercado Pago)</span>
            <span className="text-sm">Parcelado</span>
          </button>
        </div>
        {showPaymentStatus && paymentStatusMsg && (
          <div className="mt-6 flex flex-col items-center">
            <div className="bg-orange-500 text-white font-bold px-6 py-4 rounded-xl shadow-lg text-center text-lg animate-pulse mb-4" style={{boxShadow:'0 4px 16px rgba(255,140,0,0.3)'}}>
              {paymentStatusMsg}
            </div>
            <button
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-6 rounded-xl shadow-md transition-all"
              onClick={() => window.location.href = '/'}
            >
              Voltar para página inicial
            </button>
          </div>
        )}
        {error && (
          <div className="mt-4 bg-red-50 border-2 border-red-200 text-red-600 p-4 rounded-lg text-center text-sm">
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



  // Removeu o fluxo customizado de cartão de crédito. Agora só usa Checkout Pro.
}

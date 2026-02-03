import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { useQuery } from "@tanstack/react-query";
import { useCart } from "../contexts/CartContext";
import { useAuth } from "../contexts/AuthContext";
import { clearPaymentQueue } from "../services/pointService"; // Verifique se esse caminho está correto no seu projeto
import {
  createPixPayment,
  createCardPayment,
  checkPaymentStatus,
  cancelPayment,
} from "../services/paymentService";
import type { Order, CartItem } from "../types";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

// Helper para requisições padrão (single-tenant)
const fetchStandard = async (url: string, options: RequestInit = {}) => {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  return fetch(url, { ...options, headers });
};

// Tipo para controlar o pagamento ativo
type ActivePaymentState = {
  id: string;
  type: "pix" | "card";
  orderId: string;
} | null;

const PaymentPage: React.FC = () => {
  const { cartItems, cartTotal, clearCart, observation } = useCart();
  const { currentUser, addOrderToHistory, logout } = useAuth();
  const navigate = useNavigate();

  // Estados de UI
  const [paymentType, setPaymentType] = useState<
    "online" | "presencial" | null
  >(null);

  // --- CORREÇÃO: ADICIONADO O ESTADO QUE FALTAVA ---
  const [presencialStep, setPresencialStep] = useState<
    "select-method" | "select-installments" | "finalize" | null
  >(null);

  const [paymentMethod, setPaymentMethod] = useState<
    "credit" | "debit" | "pix" | null
  >(null);

  const [status, setStatus] = useState<
    "idle" | "processing" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [paymentStatusMessage, setPaymentStatusMessage] = useState("");

  // Estados para taxa e parcelas (usados em ambos os fluxos)
  const [selectedInstallments, setSelectedInstallments] = useState<number>(1);
  const [taxaSelecionada, setTaxaSelecionada] = useState<number>(0); // Corrigido valor inicial para 0 se não tiver taxa padrão

  // Estados para PIX
  const [qrCodeBase64, setQrCodeBase64] = useState<string | null>(null);

  // Estado que ATIVA o React Query (substitui o loop while)
  const [activePayment, setActivePayment] = useState<ActivePaymentState>(null);

  // Ref para limpeza (cleanup) ao desmontar a página
  const paymentIdRef = useRef<string | null>(null);

  // --- REACT QUERY: POLLING INTELIGENTE ---
  const { data: paymentStatusData } = useQuery({
    queryKey: ["paymentStatus", activePayment?.id, activePayment?.type],
    queryFn: async () => {
      if (!activePayment) return null;
      const result = await checkPaymentStatus(activePayment.id);
      if (!result.success)
        throw new Error(result.error || "Erro ao verificar status");
      return result;
    },
    enabled: !!activePayment && status === "processing",
    refetchInterval: (query) => {
      const data = query.state.data;
      if (
        data?.status === "approved" ||
        data?.status === "FINISHED" ||
        data?.status === "canceled" ||
        data?.status === "rejected"
      )
        return false;
      return 3000;
    },
    refetchOnWindowFocus: false,
  });

  // --- EFEITO: Monitora o status vindo do React Query ---
  useEffect(() => {
    if (paymentStatusData?.status === "approved" && activePayment) {
      console.log(
        "✅ Pagamento detectado pelo React Query:",
        paymentStatusData,
      );
      finalizeOrder(
        activePayment.orderId,
        activePayment.id,
        activePayment.type,
      );
    }

    if (
      (paymentStatusData?.status === "canceled" ||
        paymentStatusData?.status === "rejected") &&
      activePayment
    ) {
      console.log("❌ Pagamento cancelado/rejeitado:", paymentStatusData);
      handlePaymentFailure(paymentStatusData);
    }
  }, [paymentStatusData, activePayment]);

  // --- EFEITO: Cleanup de Segurança ---
  useEffect(() => {
    paymentIdRef.current = activePayment?.id || null;
  }, [activePayment]);

  useEffect(() => {
    return () => {
      if (paymentIdRef.current) {
        console.log(
          `🧹 Cleanup: Cancelando pagamento ${paymentIdRef.current} no backend...`,
        );
        fetchStandard(
          `${BACKEND_URL}/api/payment/cancel/${paymentIdRef.current}`,
          {
            method: "DELETE",
            keepalive: true,
          },
        ).catch((err) => console.error("Erro no cleanup:", err));
      }
    };
  }, []);

  const handlePaymentFailure = (data: any) => {
    setActivePayment(null);
    setStatus("error");

    const reasonMessages: Record<string, string> = {
      canceled_by_user: "Pagamento cancelado na maquininha pelo usuário",
      payment_error: "Erro ao processar pagamento na maquininha",
      canceled_by_system: "Pagamento cancelado pelo sistema",
      rejected_by_terminal: "Pagamento rejeitado pela maquininha",
    };

    const errorMsg =
      data.message ||
      (data.reason ? reasonMessages[data.reason] : null) ||
      "Pagamento não aprovado. Tente novamente.";

    setErrorMessage(errorMsg);
    setQrCodeBase64(null);
  };

  const finalizeOrder = async (
    orderId: string,
    paymentId: string,
    type: "pix" | "card",
  ) => {
    try {
      let safePaymentId: string | null = paymentId;
      if (safePaymentId !== undefined && safePaymentId !== null) {
        if (typeof safePaymentId !== "string") {
          safePaymentId = String(safePaymentId);
        }
        if (
          typeof safePaymentId !== "string" ||
          safePaymentId === "[object Object]" ||
          Array.isArray(safePaymentId)
        ) {
          safePaymentId = null;
        }
      }
      await fetchStandard(`${BACKEND_URL}/api/orders/${orderId}`, {
        method: "PUT",
        body: JSON.stringify({
          paymentId: safePaymentId,
          paymentStatus: "paid",
        }),
      });

      if (type === "card") {
        setPaymentStatusMessage("Liberando maquininha...");
        await clearPaymentQueue();
      }

      const orderData: Order = {
        id: orderId,
        userId: currentUser!.id,
        userName: currentUser!.name,
        items: cartItems.map((i) => ({
          productId: i.id,
          name: i.name,
          price: i.price,
          quantity: i.quantity,
        })),
        total: cartTotal,
        timestamp: new Date().toISOString(),
        observation: observation,
        status: "active",
      };

      addOrderToHistory(orderData);

      setActivePayment(null);
      setStatus("success");
      clearCart();
      setQrCodeBase64(null);

      setTimeout(async () => {
        await logout();
        navigate("/", { replace: true });
      }, 5000);
    } catch (error) {
      console.error("Erro ao finalizar:", error);
      setErrorMessage(
        "Pagamento aprovado, mas erro ao salvar. Contate o caixa.",
      );
      setStatus("error");
    }
  };

  const createOrder = async () => {
    const orderResp = await fetchStandard(`${BACKEND_URL}/api/orders`, {
      method: "POST",
      body: JSON.stringify({
        userId: currentUser!.id,
        userName: currentUser!.name,
        items: cartItems.map((i) => ({
          id: i.id,
          name: i.name,
          quantity: i.quantity,
          price: i.price,
        })),
        total:
          paymentType === "presencial" &&
          paymentMethod === "credit" &&
          taxaSelecionada
            ? Number(
                (cartTotal * (1 + (taxaSelecionada || 0) / 100)).toFixed(2),
              )
            : cartTotal,
        paymentId: null,
        observation: observation,
        paymentType: paymentType,
        paymentMethod: paymentMethod,
        installments: paymentMethod === "credit" ? selectedInstallments : 1,
        fee: paymentMethod === "credit" ? taxaSelecionada : 0,
      }),
    });
    if (!orderResp.ok) throw new Error("Erro ao criar pedido");
    const data = await orderResp.json();
    return data.id;
  };

  const handlePixPayment = async () => {
    setStatus("processing");
    setPaymentStatusMessage("Gerando QR Code...");

    try {
      const orderId = await createOrder();

      const result = await createPixPayment({
        amount: cartTotal,
        description: `Pedido de ${currentUser!.name}`,
        orderId: orderId,
        email: currentUser?.email,
        payerName: currentUser?.name,
      });

      if (!result.success || !result.paymentId || !result.qrCode) {
        throw new Error(result.error || "Erro ao gerar PIX");
      }

      setQrCodeBase64(result.qrCode);
      setPaymentStatusMessage("Escaneie o QR Code...");
      setActivePayment({ id: result.paymentId, type: "pix", orderId });
    } catch (err: any) {
      console.error(err);
      setStatus("error");
      setErrorMessage(err.message || "Erro no PIX.");
    }
  };

  // Função usada para integração com maquininha (se for usar o fluxo automático)
  const handleCardPayment = async () => {
    setStatus("processing");
    setPaymentStatusMessage("Conectando à maquininha...");

    try {
      const orderId = await createOrder();

      const valorFinal =
        paymentMethod === "credit"
          ? Number((cartTotal * (1 + (taxaSelecionada || 0) / 100)).toFixed(2))
          : cartTotal;

      console.log("[Pagamento] Parcelas selecionadas:", selectedInstallments);

      const result = await createCardPayment({
        amount: valorFinal,
        description: `Pedido ${currentUser!.name}`,
        orderId: orderId,
        paymentMethod: paymentMethod as "credit" | "debit",
        installments: paymentMethod === "credit" ? selectedInstallments : 1,
      });

      console.log("[API] Resposta completa do pagamento presencial:", result);

      if (!result.success || !result.paymentId) {
        throw new Error(result.error || "Erro na maquininha");
      }

      setPaymentStatusMessage("Aguardando pagamento na maquininha...");
      setActivePayment({ id: result.paymentId, type: "card", orderId });
    } catch (err: any) {
      console.error(err);
      setStatus("error");
      setErrorMessage(err.message || "Erro ao conectar maquininha.");
    }
  };

  if (status === "success") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-green-50 p-4 animate-fade-in-down">
        <div className="bg-white p-10 rounded-3xl shadow-2xl text-center max-w-md w-full">
          <img
            src="/selfMachine.jpg"
            alt="Self Machine"
            className="w-32 h-auto mx-auto mb-4 rounded-lg"
          />
          <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl">✅</span>
          </div>
          <h2 className="text-3xl font-bold text-green-800 mb-2">
            Pagamento Aprovado!
          </h2>
          <p className="text-stone-600 text-lg mb-6">
            Pedido enviado para a cozinha.
          </p>
          <p className="text-sm text-stone-400">Redirecionando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-3xl font-bold text-amber-800 mb-8 flex items-center gap-2">
        <button
          onClick={() => navigate("/menu")}
          className="text-amber-600 hover:bg-amber-100 p-2 rounded-full"
          disabled={status === "processing"}
        >
          ←
        </button>
        Finalizar Pagamento
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* COLUNA ESQUERDA - RESUMO */}
        <div className="bg-white p-6 rounded-2xl shadow-lg h-fit">
          <h2 className="text-xl font-bold text-stone-800 mb-4 border-b pb-2">
            Resumo do Pedido
          </h2>
          <ul className="space-y-3 max-h-64 overflow-y-auto mb-4">
            {cartItems.map((item) => (
              <li key={item.id} className="flex justify-between text-stone-600">
                <span>
                  {item.quantity}x {item.name}
                </span>
                <span className="font-semibold">
                  R$ {(item.price * item.quantity).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
          <div className="border-t pt-4 flex justify-between items-center">
            <span className="text-lg text-stone-500">Total a pagar:</span>
            <span className="text-3xl font-bold text-amber-600">
              {(paymentType === "presencial" || paymentType === "online") &&
              paymentMethod === "credit" &&
              taxaSelecionada
                ? `R$ ${(cartTotal * (1 + taxaSelecionada / 100)).toFixed(2)}`
                : `R$ ${cartTotal.toFixed(2)}`}
            </span>
          </div>
        </div>

        {/* COLUNA DIREITA - AÇÕES */}
        <div className="flex flex-col gap-4">
          {!paymentType && (
            <>
              <h2 className="text-xl font-bold text-stone-800 mb-2">
                Como você quer pagar?
              </h2>
              <button
                className="p-4 rounded-xl border-2 border-green-500 bg-green-50 text-green-900 font-bold text-lg hover:bg-green-100 transition-all"
                onClick={() => setPaymentType("online")}
              >
                💻 Pagamento Online (Mercado Pago)
              </button>
              <button
                className="p-4 rounded-xl border-2 border-amber-500 bg-amber-50 text-amber-900 font-bold text-lg hover:bg-amber-100 transition-all"
                onClick={() => setPaymentType("presencial")}
              >
                🏪 Pagar na Loja Girakids
              </button>
            </>
          )}

          {/* Pagamento Online */}
          {paymentType === "online" && (
            <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded text-center text-blue-800 font-semibold">
              <span className="block text-2xl mb-2">💻 Pagamento Online</span>
              <div className="flex flex-col gap-4 items-center justify-center">
                <div className="flex gap-4 mb-4">
                  <button
                    className={`px-6 py-3 rounded font-bold text-lg transition-all ${
                      paymentMethod === "credit"
                        ? "bg-blue-600 text-white"
                        : "bg-white text-blue-700 border border-blue-600"
                    }`}
                    onClick={() => setPaymentMethod("credit")}
                  >
                    Cartão de Crédito
                  </button>
                  <button
                    className={`px-6 py-3 rounded font-bold text-lg transition-all ${
                      paymentMethod === "debit"
                        ? "bg-green-600 text-white"
                        : "bg-white text-green-700 border border-green-600"
                    }`}
                    onClick={() => setPaymentMethod("debit")}
                  >
                    Cartão de Débito
                  </button>
                  <button
                    className={`px-6 py-3 rounded font-bold text-lg transition-all ${
                      paymentMethod === "pix"
                        ? "bg-purple-600 text-white"
                        : "bg-white text-purple-700 border border-purple-600"
                    }`}
                    onClick={() => setPaymentMethod("pix")}
                  >
                    PIX
                  </button>
                </div>

                {/* PIX Online */}
                {paymentMethod === "pix" && (
                  <button
                    className="px-6 py-3 rounded bg-purple-600 text-white font-bold text-lg hover:bg-purple-700 transition-all mb-2"
                    onClick={async () => {
                      setStatus("processing");
                      setErrorMessage("");
                      try {
                        const orderResp = await fetchStandard(
                          `${BACKEND_URL}/api/orders`,
                          {
                            method: "POST",
                            body: JSON.stringify({
                              userId: currentUser!.id,
                              userName: currentUser!.name,
                              items: cartItems.map((i) => ({
                                id: i.id,
                                name: i.name,
                                quantity: i.quantity,
                                price: i.price,
                              })),
                              total: cartTotal,
                              paymentId: null,
                              observation: observation,
                            }),
                          },
                        );
                        if (!orderResp.ok)
                          throw new Error("Erro ao criar pedido");
                        const orderData = await orderResp.json();
                        const pixResp = await fetchStandard(
                          `${BACKEND_URL}/api/payment/online-pix`,
                          {
                            method: "POST",
                            body: JSON.stringify({
                              amount: cartTotal,
                              description: `Pedido de ${currentUser!.name}`,
                              orderId: orderData.id,
                              email: currentUser?.email,
                              payerName: currentUser?.name,
                            }),
                          },
                        );
                        const pixData = await pixResp.json();
                        if (
                          !pixResp.ok ||
                          !pixData.paymentId ||
                          !pixData.qrCodeBase64
                        ) {
                          throw new Error(
                            pixData.error || "Erro ao gerar PIX online",
                          );
                        }
                        setQrCodeBase64(pixData.qrCodeBase64);
                        setPaymentStatusMessage(
                          "Escaneie o QR Code para pagar!",
                        );
                        setActivePayment({
                          id: pixData.paymentId,
                          type: "pix",
                          orderId: orderData.id,
                        });
                      } catch (err: any) {
                        setStatus("error");
                        setErrorMessage(
                          err.message || "Erro no pagamento online PIX.",
                        );
                      }
                    }}
                  >
                    Gerar QR Code PIX
                  </button>
                )}

                {/* Cartão Online (Crédito ou Débito) */}
                {(paymentMethod === "credit" || paymentMethod === "debit") && (
                  <>
                    {paymentMethod === "credit" && (
                      <div className="mb-2">
                        <span className="font-semibold text-blue-700">
                          Parcelamento disponível:
                        </span>
                        <ul className="text-sm text-blue-800 mt-1 flex flex-wrap gap-2">
                          {[
                            { parcelas: 1, taxa: 0 },
                            { parcelas: 2, taxa: 2.53 },
                            { parcelas: 3, taxa: 2.83 },
                            { parcelas: 4, taxa: 4.73 },
                            { parcelas: 5, taxa: 4.83 },
                            { parcelas: 6, taxa: 4.93 },
                            { parcelas: 7, taxa: 6.23 },
                            { parcelas: 8, taxa: 6.42 },
                            { parcelas: 9, taxa: 7.11 },
                            { parcelas: 10, taxa: 7.79 },
                            { parcelas: 11, taxa: 9.01 },
                            { parcelas: 12, taxa: 9.12 },
                          ].map((opt) => (
                            <li key={opt.parcelas}>
                              <button
                                className={`px-2 py-1 rounded ${
                                  selectedInstallments === opt.parcelas
                                    ? "bg-blue-600 text-white"
                                    : "bg-white text-blue-700 border border-blue-600"
                                }`}
                                onClick={() => {
                                  setSelectedInstallments(opt.parcelas);
                                  setTaxaSelecionada(opt.taxa);
                                }}
                              >
                                {opt.parcelas}x - Taxa: {opt.taxa.toFixed(2)}%
                              </button>
                            </li>
                          ))}
                        </ul>
                        <div className="mt-2 text-blue-900 font-bold">
                          Total com taxa: R${" "}
                          {(
                            cartTotal *
                            (1 + (taxaSelecionada || 0) / 100)
                          ).toFixed(2)}
                        </div>
                      </div>
                    )}
                    <button
                      className={`px-6 py-3 rounded ${
                        paymentMethod === "credit"
                          ? "bg-blue-600"
                          : "bg-green-600"
                      } text-white font-bold text-lg hover:opacity-90 transition-all mb-2`}
                      onClick={async () => {
                        setStatus("processing");
                        setErrorMessage("");
                        try {
                          const orderResp = await fetchStandard(
                            `${BACKEND_URL}/api/orders`,
                            {
                              method: "POST",
                              body: JSON.stringify({
                                userId: currentUser!.id,
                                userName: currentUser!.name,
                                items: cartItems.map((i) => ({
                                  id: i.id,
                                  name: i.name,
                                  quantity: i.quantity,
                                  price: i.price,
                                })),
                                total: cartTotal,
                                paymentId: null,
                                observation: observation,
                              }),
                            },
                          );
                          if (!orderResp.ok)
                            throw new Error("Erro ao criar pedido");
                          const orderData = await orderResp.json();

                          // ATENÇÃO: Usando prompt como fallback simples
                          const cardToken = prompt(
                            "Cole o cardToken gerado pelo MercadoPago.js:",
                          );
                          if (!cardToken)
                            throw new Error("Token do cartão não informado.");

                          const installments =
                            paymentMethod === "credit"
                              ? parseInt(
                                  prompt("Número de parcelas (1-12):", "1") ||
                                    "1",
                                  10,
                                )
                              : 1;

                          const cardResp = await fetchStandard(
                            `${BACKEND_URL}/api/payment/online-card`,
                            {
                              method: "POST",
                              body: JSON.stringify({
                                amount: cartTotal,
                                description: `Pedido de ${currentUser!.name}`,
                                orderId: orderData.id,
                                cardToken,
                                email: currentUser?.email,
                                payerName: currentUser?.name,
                                installments,
                              }),
                            },
                          );
                          const cardData = await cardResp.json();
                          if (!cardResp.ok || !cardData.paymentId) {
                            throw new Error(
                              cardData.error ||
                                "Erro ao pagar com cartão online",
                            );
                          }
                          setPaymentStatusMessage(
                            "Pagamento com cartão enviado! Aguarde aprovação...",
                          );
                          setActivePayment({
                            id: cardData.paymentId,
                            type: "card",
                            orderId: orderData.id,
                          });
                        } catch (err: any) {
                          setStatus("error");
                          setErrorMessage(
                            err.message || "Erro no pagamento online cartão.",
                          );
                        }
                      }}
                    >
                      {paymentMethod === "credit"
                        ? "Pagar com Crédito Online"
                        : "Pagar com Débito Online"}
                    </button>
                  </>
                )}

                <button
                  className="mt-4 px-4 py-2 rounded bg-stone-200 text-stone-700 hover:bg-stone-300"
                  onClick={() => setPaymentType(null)}
                >
                  Voltar
                </button>

                {status === "processing" && qrCodeBase64 && (
                  <div className="bg-white p-6 rounded-2xl shadow-xl border-2 border-purple-300 text-center mt-4">
                    <h3 className="text-purple-900 font-bold text-xl mb-4">
                      Pague com PIX
                    </h3>
                    <img
                      src={`data:image/png;base64,${qrCodeBase64}`}
                      alt="QR Code"
                      className="w-64 h-64 mx-auto mb-4"
                    />
                    <p className="text-purple-600 text-sm">
                      Escaneie com o app do seu banco
                    </p>
                  </div>
                )}
                {status === "error" && (
                  <div className="bg-red-100 text-red-700 p-3 rounded-lg text-center font-semibold mt-4">
                    {errorMessage}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Pagamento Presencial (Modo Manual/A Pagar) */}
          {paymentType === "presencial" && (
            <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded text-center text-amber-800 font-semibold">
              <span className="block text-2xl mb-2">
                🏪 Pagamento na Loja Girakids
              </span>

              {/* Step 1: Seleção do método */}
              {presencialStep === null || presencialStep === "select-method" ? (
                <div className="flex flex-col gap-4 items-center justify-center">
                  <span className="mb-2">Escolha a forma de pagamento:</span>
                  <button
                    className={`px-6 py-3 rounded font-bold text-lg transition-all ${
                      paymentMethod === "credit"
                        ? "bg-blue-600 text-white"
                        : "bg-white text-blue-700 border border-blue-600"
                    }`}
                    onClick={() => {
                      setPaymentMethod("credit");
                      setPresencialStep("select-installments");
                    }}
                  >
                    Crédito
                  </button>
                  <button
                    className={`px-6 py-3 rounded font-bold text-lg transition-all ${
                      paymentMethod === "debit"
                        ? "bg-green-600 text-white"
                        : "bg-white text-green-700 border border-green-600"
                    }`}
                    onClick={() => {
                      setPaymentMethod("debit");
                      setPresencialStep("finalize");
                    }}
                  >
                    Débito
                  </button>
                  <button
                    className={`px-6 py-3 rounded font-bold text-lg transition-all ${
                      paymentMethod === "pix"
                        ? "bg-purple-600 text-white"
                        : "bg-white text-purple-700 border border-purple-600"
                    }`}
                    onClick={() => {
                      setPaymentMethod("pix");
                      setPresencialStep("finalize");
                    }}
                  >
                    PIX
                  </button>
                </div>
              ) : null}

              {/* Step 2: Seleção de parcelas para crédito */}
              {presencialStep === "select-installments" &&
                paymentMethod === "credit" && (
                  <div className="mb-2">
                    <span className="font-semibold text-blue-700">
                      Parcelamento disponível:
                    </span>
                    <ul className="text-sm text-blue-800 mt-1 flex flex-wrap gap-2">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(
                        (parcelas) => (
                          <li key={parcelas}>
                            <button
                              className={`px-2 py-1 rounded ${
                                selectedInstallments === parcelas
                                  ? "bg-blue-600 text-white"
                                  : "bg-white text-blue-700 border border-blue-600"
                              }`}
                              onClick={() => {
                                setSelectedInstallments(parcelas);
                                setPresencialStep("finalize");
                              }}
                            >
                              {parcelas}x
                            </button>
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                )}

              {/* Step 3: Finalizar pedido */}
              {presencialStep === "finalize" && (
                <button
                  className="mt-4 px-6 py-3 rounded bg-amber-600 text-white font-bold text-lg hover:bg-amber-700 transition-all"
                  onClick={async () => {
                    setStatus("processing");
                    setErrorMessage("");
                    try {
                      const orderResp = await fetchStandard(
                        `${BACKEND_URL}/api/orders`,
                        {
                          method: "POST",
                          body: JSON.stringify({
                            userId: currentUser!.id,
                            userName: currentUser!.name,
                            items: cartItems.map((i) => ({
                              id: i.id,
                              name: i.name,
                              quantity: i.quantity,
                              price: i.price,
                            })),
                            total: cartTotal,
                            paymentType: "presencial",
                            paymentMethod,
                            installments:
                              paymentMethod === "credit"
                                ? selectedInstallments
                                : 1,
                            paymentStatus: "pending",
                            observation,
                          }),
                        },
                      );
                      if (!orderResp.ok)
                        throw new Error("Erro ao criar pedido");
                      setStatus("success");
                      clearCart();
                      setPresencialStep(null);
                      setPaymentType(null);
                    } catch (err: any) {
                      setStatus("error");
                      setErrorMessage(
                        err.message || "Erro ao salvar pedido presencial.",
                      );
                    }
                  }}
                >
                  Finalizar Pedido
                </button>
              )}

              <button
                className="mt-4 px-4 py-2 rounded bg-stone-200 text-stone-700 hover:bg-stone-300"
                onClick={() => {
                  setPaymentType(null);
                  setPresencialStep(null);
                  setPaymentMethod(null);
                }}
              >
                Voltar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentPage;

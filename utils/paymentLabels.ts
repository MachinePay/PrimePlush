// Rótulos amigáveis para as formas de pagamento salvas nos pedidos
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  credit: "Cartão de Crédito",
  debit: "Cartão de Débito",
  pix: "Pix",
  cash: "Dinheiro",
  cheque: "Cheque",
  boleto: "Boleto",
  presencial: "Presencial",
  online: "Online",
};

export const getPaymentMethodLabel = (method?: string | null): string => {
  if (!method) return "-";
  return PAYMENT_METHOD_LABELS[method.toLowerCase()] || method;
};

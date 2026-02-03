import React, { useEffect, useRef } from "react";

interface Props {
  publicKey: string;
  amount: number;
  onToken: (cardToken: string) => void;
}

const MercadoPagoCardForm: React.FC<Props> = ({
  publicKey,
  amount,
  onToken,
}) => {
  const formRef = useRef<HTMLFormElement>(null);
  const mpInstance = useRef<any>(null);

  useEffect(() => {
    if (!window.MercadoPago) return;
    mpInstance.current = new window.MercadoPago(publicKey, { locale: "pt-BR" });
    mpInstance.current.cardForm({
      amount,
      autoMount: true,
      form: {
        id: "form-checkout",
        cardholderName: {
          id: "form-checkout__cardholderName",
          placeholder: "Nome no cartão",
        },
        cardNumber: {
          id: "form-checkout__cardNumber",
          placeholder: "Número do cartão",
        },
        expirationDate: {
          id: "form-checkout__expirationDate",
          placeholder: "MM/AA",
        },
        securityCode: { id: "form-checkout__securityCode", placeholder: "CVV" },
        installments: {
          id: "form-checkout__installments",
          placeholder: "Parcelas",
        },
        identificationType: {
          id: "form-checkout__identificationType",
          placeholder: "Tipo",
        },
        identificationNumber: {
          id: "form-checkout__identificationNumber",
          placeholder: "CPF",
        },
        issuer: { id: "form-checkout__issuer", placeholder: "Banco emissor" },
      },
      callbacks: {
        onFormMounted: (error) => {
          if (error) console.error("Erro ao montar o formulário:", error);
        },
        onSubmit: (event) => {
          event.preventDefault();
          const cardFormData = mpInstance.current.cardForm.getCardFormData();
          if (cardFormData.token) {
            onToken(cardFormData.token);
          } else {
            alert("Erro ao gerar token do cartão. Verifique os dados.");
          }
        },
      },
    });
  }, [publicKey, amount]);

  return (
    <form
      id="form-checkout"
      ref={formRef}
      className="space-y-4 p-4 bg-white rounded shadow"
    >
      <input
        id="form-checkout__cardholderName"
        type="text"
        className="w-full p-2 border rounded"
        placeholder="Nome no cartão"
      />
      <input
        id="form-checkout__cardNumber"
        type="text"
        className="w-full p-2 border rounded"
        placeholder="Número do cartão"
      />
      <input
        id="form-checkout__expirationDate"
        type="text"
        className="w-full p-2 border rounded"
        placeholder="MM/AA"
      />
      <input
        id="form-checkout__securityCode"
        type="text"
        className="w-full p-2 border rounded"
        placeholder="CVV"
      />
      <select
        id="form-checkout__installments"
        className="w-full p-2 border rounded"
      />
      <select
        id="form-checkout__identificationType"
        className="w-full p-2 border rounded"
      />
      <input
        id="form-checkout__identificationNumber"
        type="text"
        className="w-full p-2 border rounded"
        placeholder="CPF"
      />
      <select
        id="form-checkout__issuer"
        className="w-full p-2 border rounded"
      />
      <button
        type="submit"
        className="w-full py-2 px-4 bg-blue-600 text-white rounded font-bold mt-2"
      >
        Pagar com Cartão
      </button>
    </form>
  );
};

export default MercadoPagoCardForm;

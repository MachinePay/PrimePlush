import React, { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import type { Order, PaymentSplit, User } from "../../types";
import { authenticatedFetch, getUsers } from "../../services/apiService";
import { getPaymentMethodLabel } from "../../utils/paymentLabels";

type SplitMethod = PaymentSplit["method"];

const METHODS: SplitMethod[] = [
  "credit",
  "debit",
  "pix",
  "cash",
  "cheque",
  "boleto",
];

// Linha do formulário: valores como texto para aceitar vírgula
interface SplitRow {
  method: SplitMethod;
  amount: string;
  installments: number;
  cashReceived: string;
}

// Aceita "1.234,56", "1234,56" e "1234.56"
const parseMoney = (value: string): number | null => {
  if (!value.trim()) return null;
  const normalized = value.includes(",")
    ? value.replace(/\./g, "").replace(",", ".")
    : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const toMoneyInput = (value: number) => value.toFixed(2).replace(".", ",");

const isSplitMethod = (method?: string): method is SplitMethod =>
  !!method && (METHODS as string[]).includes(method);

// Monta as linhas iniciais a partir do pagamento atual do pedido
const getInitialRows = (order: Order): SplitRow[] => {
  if (order.paymentSplits && order.paymentSplits.length > 0) {
    return order.paymentSplits.map((split) => ({
      method: split.method,
      amount: toMoneyInput(Number(split.amount) || 0),
      installments: split.installments || 1,
      cashReceived:
        split.cashReceived !== undefined && split.cashReceived !== null
          ? toMoneyInput(Number(split.cashReceived))
          : "",
    }));
  }
  return [
    {
      method: isSplitMethod(order.paymentMethod) ? order.paymentMethod : "pix",
      amount: toMoneyInput(Number(order.total) || 0),
      installments: order.installments || 1,
      cashReceived:
        order.cashReceived !== undefined && order.cashReceived !== null
          ? toMoneyInput(Number(order.cashReceived))
          : "",
    },
  ];
};

interface EditOrderModalProps {
  order: Order;
  backendUrl: string;
  onClose: () => void;
  onSaved: () => void;
}

// Edição de pedido finalizado (apenas admin): cliente e forma de pagamento,
// inclusive mesclando mais de uma forma.
const EditOrderModal: React.FC<EditOrderModalProps> = ({
  order,
  backendUrl,
  onClose,
  onSaved,
}) => {
  const total = Number(order.total) || 0;
  const [users, setUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState(order.userId);
  const [changePayment, setChangePayment] = useState(false);
  const [rows, setRows] = useState<SplitRow[]>(() => getInitialRows(order));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    getUsers()
      .then((data) => setUsers(Array.isArray(data) ? data : []))
      .catch(() => setUsers([]))
      .finally(() => setIsLoadingUsers(false));
  }, []);

  const customerUsers = useMemo(() => {
    const search = customerSearch.trim().toLowerCase();
    const digits = search.replace(/\D/g, "");
    return users
      .filter((user) => {
        const role = user.role || "customer";
        if (role !== "customer" && role !== "admincustomer") return false;
        if (!search) return true;
        return (
          user.name.toLowerCase().includes(search) ||
          (!!digits && (user.cpf || "").includes(digits))
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users, customerSearch]);

  const isMixed = rows.length > 1;
  const rowsTotal = rows.reduce(
    (sum, row) => sum + (parseMoney(row.amount) || 0),
    0,
  );
  const difference = Number((total - rowsTotal).toFixed(2));

  const updateRow = (index: number, changes: Partial<SplitRow>) =>
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...changes } : row)),
    );

  const addRow = () =>
    setRows((prev) => [
      ...prev,
      {
        method: "pix",
        amount: difference > 0 ? toMoneyInput(difference) : "",
        installments: 1,
        cashReceived: "",
      },
    ]);

  const removeRow = (index: number) =>
    setRows((prev) => {
      const next = prev.filter((_, i) => i !== index);
      // Voltou a ter uma forma só: ela paga o total
      if (next.length === 1) next[0] = { ...next[0], amount: toMoneyInput(total) };
      return next;
    });

  const handleSave = async () => {
    const body: Record<string, unknown> = {};
    if (selectedUserId && selectedUserId !== order.userId) {
      body.userId = selectedUserId;
    }

    if (changePayment) {
      const splits = [];
      for (const row of rows) {
        const amount = isMixed ? parseMoney(row.amount) : total;
        if (amount === null || amount <= 0) {
          await Swal.fire({
            icon: "warning",
            title: "Informe o valor de cada forma de pagamento",
          });
          return;
        }
        const cashReceived =
          row.method === "cash" ? parseMoney(row.cashReceived) : null;
        if (cashReceived !== null && cashReceived < amount) {
          await Swal.fire({
            icon: "warning",
            title: "Valor recebido em dinheiro menor que o valor em dinheiro",
          });
          return;
        }
        splits.push({
          method: row.method,
          amount,
          installments: row.method === "credit" ? row.installments : undefined,
          cashReceived: cashReceived ?? undefined,
        });
      }
      if (isMixed && Math.abs(difference) > 0.009) {
        await Swal.fire({
          icon: "warning",
          title: "A soma não fecha com o total",
          text: `Total do pedido: R$ ${total.toFixed(2)} · Soma: R$ ${rowsTotal.toFixed(2)}`,
        });
        return;
      }
      if (isMixed) {
        body.paymentSplits = splits;
      } else {
        body.paymentMethod = splits[0].method;
        body.installments = splits[0].installments;
        body.cashReceived = splits[0].cashReceived ?? null;
      }
    }

    if (Object.keys(body).length === 0) {
      onClose();
      return;
    }

    setIsSaving(true);
    try {
      const resp = await authenticatedFetch(
        `${backendUrl}/api/admin/orders/${order.id}`,
        { method: "PUT", body: JSON.stringify(body) },
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || "Erro ao editar pedido");
      onSaved();
      await Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: "Pedido atualizado",
        showConfirmButton: false,
        timer: 2200,
        timerProgressBar: true,
      });
    } catch (error: any) {
      await Swal.fire({
        icon: "error",
        title: "Falha ao editar pedido",
        text: error?.message || "Tente novamente.",
        confirmButtonText: "OK",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => !isSaving && onClose()}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-xl font-bold text-stone-800">
          Editar pedido #{order.id.slice(-4)}
        </h2>
        <p className="mb-4 text-sm text-stone-500">
          Total do pedido: R$ {total.toFixed(2)}
        </p>

        {/* Cliente */}
        <div className="mb-5">
          <label className="mb-1 block text-sm font-semibold text-stone-700">
            Cliente
          </label>
          <input
            type="search"
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
            placeholder="Buscar por nome ou CPF/CNPJ"
            className="mb-2 w-full rounded border px-2 py-1"
          />
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            disabled={isLoadingUsers}
            className="w-full rounded border px-2 py-1"
          >
            {/* Mantém o cliente atual visível mesmo fora do filtro */}
            {!customerUsers.some((user) => user.id === selectedUserId) && (
              <option value={selectedUserId}>
                {selectedUserId === order.userId
                  ? `${order.userName || "Cliente atual"} (atual)`
                  : users.find((user) => user.id === selectedUserId)?.name ||
                    selectedUserId}
              </option>
            )}
            {customerUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
                {user.cpf ? ` - ${user.cpf}` : ""}
                {user.id === order.userId ? " (atual)" : ""}
              </option>
            ))}
          </select>
          {isLoadingUsers && (
            <p className="mt-1 text-xs text-stone-500">Carregando clientes...</p>
          )}
        </div>

        {/* Pagamento */}
        <div className="mb-5">
          <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-stone-700">
            <input
              type="checkbox"
              checked={changePayment}
              onChange={(e) => setChangePayment(e.target.checked)}
              className="h-4 w-4 rounded border-stone-300 text-blue-600"
            />
            Alterar forma de pagamento
            <span className="font-normal text-stone-500">
              (atual: {getPaymentMethodLabel(order.paymentMethod)})
            </span>
          </label>

          {changePayment && (
            <div className="space-y-3">
              {rows.map((row, index) => (
                <div
                  key={index}
                  className="rounded-lg border border-stone-200 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={row.method}
                      onChange={(e) =>
                        updateRow(index, {
                          method: e.target.value as SplitMethod,
                        })
                      }
                      className="flex-1 rounded border px-2 py-1"
                    >
                      {METHODS.map((method) => (
                        <option key={method} value={method}>
                          {getPaymentMethodLabel(method)}
                        </option>
                      ))}
                    </select>
                    {isMixed && (
                      <>
                        <span className="text-sm text-stone-600">R$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.amount}
                          onChange={(e) =>
                            updateRow(index, { amount: e.target.value })
                          }
                          placeholder="0,00"
                          aria-label="Valor desta forma de pagamento"
                          className="w-28 rounded border px-2 py-1 text-right"
                        />
                        <button
                          type="button"
                          onClick={() => removeRow(index)}
                          className="rounded bg-red-100 px-2 py-1 text-xs font-bold text-red-700 hover:bg-red-200"
                          title="Remover forma de pagamento"
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                  {row.method === "credit" && (
                    <div className="mt-2 flex items-center gap-2 text-sm text-stone-600">
                      Parcelas
                      <select
                        value={row.installments}
                        onChange={(e) =>
                          updateRow(index, {
                            installments: Number(e.target.value),
                          })
                        }
                        className="rounded border px-2 py-1"
                      >
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(
                          (n) => (
                            <option key={n} value={n}>
                              {n}x
                            </option>
                          ),
                        )}
                      </select>
                    </div>
                  )}
                  {row.method === "cash" && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-stone-600">
                      Valor recebido (opcional) R$
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.cashReceived}
                        onChange={(e) =>
                          updateRow(index, { cashReceived: e.target.value })
                        }
                        placeholder="0,00"
                        className="w-28 rounded border px-2 py-1 text-right"
                      />
                      {(() => {
                        const received = parseMoney(row.cashReceived);
                        const amount = isMixed
                          ? parseMoney(row.amount) || 0
                          : total;
                        if (received === null || received < amount) return null;
                        return (
                          <span className="font-semibold text-green-700">
                            Troco: R$ {(received - amount).toFixed(2)}
                          </span>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={addRow}
                className="rounded bg-blue-100 px-3 py-1 text-sm font-bold text-blue-700 hover:bg-blue-200"
              >
                + Mesclar outra forma
              </button>

              {isMixed && (
                <p
                  className={`text-sm font-semibold ${Math.abs(difference) > 0.009 ? "text-red-600" : "text-green-700"}`}
                >
                  Soma: R$ {rowsTotal.toFixed(2)} de R$ {total.toFixed(2)}
                  {difference > 0.009 &&
                    ` · faltam R$ ${difference.toFixed(2)}`}
                  {difference < -0.009 &&
                    ` · excede R$ ${Math.abs(difference).toFixed(2)}`}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-lg bg-stone-200 px-4 py-2 font-bold text-stone-700 hover:bg-stone-300 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-lg bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditOrderModal;

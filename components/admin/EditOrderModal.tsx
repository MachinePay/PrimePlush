import React, { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import type { Order, PaymentSplit, User } from "../../types";
import { authenticatedFetch, getUsers } from "../../services/apiService";
import { getPaymentMethodLabel } from "../../utils/paymentLabels";
import {
  Badge,
  Button,
  Modal,
  SearchInput,
  formatCurrency,
  notify,
} from "./ui";
import { IconPlus, IconTrash } from "./icons";

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
      if (!resp.ok) {
        // Sem JSON de erro: a rota não existe no servidor (backend desatualizado)
        throw new Error(
          data.error ||
            (resp.status === 404
              ? "O servidor ainda não tem a edição de pedidos. Atualize o backend."
              : `Erro ao editar pedido (HTTP ${resp.status})`),
        );
      }
      onSaved();
      notify("Pedido atualizado");
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

  const currentPaymentLabel =
    order.paymentSplits && order.paymentSplits.length > 0
      ? order.paymentSplits
          .map((split) => getPaymentMethodLabel(split.method))
          .join(" + ")
      : getPaymentMethodLabel(order.paymentMethod);
  const sumMatches = Math.abs(difference) <= 0.009;
  const selectedUserName =
    users.find((user) => user.id === selectedUserId)?.name || selectedUserId;

  return (
    <Modal
      open
      onClose={onClose}
      locked={isSaving}
      size="md"
      title={`Editar pedido #${order.id.slice(-4)}`}
      description={
        <>
          Total do pedido:{" "}
          <span className="pp-num font-semibold text-[color:var(--pp-text)]">
            {formatCurrency(total)}
          </span>
        </>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSave} loading={isSaving}>
            {isSaving ? "Salvando..." : "Salvar"}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {/* Cliente */}
        <section>
          <label htmlFor="edit-order-customer" className="pp-label">
            Cliente
          </label>
          <SearchInput
            value={customerSearch}
            onChange={setCustomerSearch}
            placeholder="Buscar por nome ou CPF/CNPJ"
            className="mb-2"
          />
          <select
            id="edit-order-customer"
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            disabled={isLoadingUsers}
            className="pp-select"
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
          {isLoadingUsers ? (
            <p className="pp-help inline-flex items-center gap-2">
              <span className="pp-spinner" aria-hidden="true" />
              Carregando clientes...
            </p>
          ) : (
            selectedUserId !== order.userId && (
              <p className="pp-help">
                O pedido passará de{" "}
                <strong>{order.userName || "cliente atual"}</strong> para{" "}
                <strong>{selectedUserName}</strong>.
              </p>
            )
          )}
        </section>

        {/* Pagamento */}
        <section>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[color:var(--pp-border)] p-3 transition-colors hover:bg-[color:var(--pp-surface-2)]">
            <input
              type="checkbox"
              checked={changePayment}
              onChange={(e) => setChangePayment(e.target.checked)}
              className="pp-checkbox mt-0.5"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-[color:var(--pp-text)]">
                Alterar forma de pagamento
              </span>
              <span className="block text-xs text-[color:var(--pp-text-3)]">
                Atual: {currentPaymentLabel}
              </span>
            </span>
          </label>

          {changePayment && (
            <div className="pp-animate-in mt-3 space-y-3">
              {rows.map((row, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-[color:var(--pp-border)] bg-[color:var(--pp-surface-2)] p-3"
                >
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[160px] flex-1">
                      {isMixed && (
                        <span className="pp-label">Forma {index + 1}</span>
                      )}
                      <select
                        value={row.method}
                        onChange={(e) =>
                          updateRow(index, {
                            method: e.target.value as SplitMethod,
                          })
                        }
                        aria-label="Forma de pagamento"
                        className="pp-select"
                      >
                        {METHODS.map((method) => (
                          <option key={method} value={method}>
                            {getPaymentMethodLabel(method)}
                          </option>
                        ))}
                      </select>
                    </div>
                    {isMixed && (
                      <>
                        <div className="w-32">
                          <span className="pp-label">Valor (R$)</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={row.amount}
                            onChange={(e) =>
                              updateRow(index, { amount: e.target.value })
                            }
                            placeholder="0,00"
                            aria-label="Valor desta forma de pagamento"
                            className="pp-input pp-num text-right"
                          />
                        </div>
                        <Button
                          variant="danger-soft"
                          iconOnly
                          icon={<IconTrash />}
                          onClick={() => removeRow(index)}
                          title="Remover forma de pagamento"
                          aria-label="Remover forma de pagamento"
                        />
                      </>
                    )}
                  </div>
                  {row.method === "credit" && (
                    <div className="mt-3 flex items-center gap-2 text-sm text-[color:var(--pp-text-2)]">
                      Parcelas
                      <select
                        value={row.installments}
                        onChange={(e) =>
                          updateRow(index, {
                            installments: Number(e.target.value),
                          })
                        }
                        className="pp-select w-24"
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
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[color:var(--pp-text-2)]">
                      Valor recebido (opcional) R$
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.cashReceived}
                        onChange={(e) =>
                          updateRow(index, { cashReceived: e.target.value })
                        }
                        placeholder="0,00"
                        aria-label="Valor recebido em dinheiro"
                        className="pp-input pp-num w-32 text-right"
                      />
                      {(() => {
                        const received = parseMoney(row.cashReceived);
                        const amount = isMixed
                          ? parseMoney(row.amount) || 0
                          : total;
                        if (received === null || received < amount) return null;
                        return (
                          <Badge tone="success">
                            Troco: R$ {(received - amount).toFixed(2)}
                          </Badge>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ))}

              <Button variant="soft" size="sm" icon={<IconPlus />} onClick={addRow}>
                Mesclar outra forma
              </Button>

              {isMixed && (
                <div
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-medium ${sumMatches ? "bg-[color:var(--pp-success-soft)] text-[color:var(--pp-success)]" : "bg-[color:var(--pp-danger-soft)] text-[color:var(--pp-danger)]"}`}
                >
                  <span className="pp-num">
                    Soma: R$ {rowsTotal.toFixed(2)} de R$ {total.toFixed(2)}
                  </span>
                  <span className="pp-num">
                    {difference > 0.009 && `faltam R$ ${difference.toFixed(2)}`}
                    {difference < -0.009 &&
                      `excede R$ ${Math.abs(difference).toFixed(2)}`}
                    {sumMatches && "valores conferem"}
                  </span>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
};

export default EditOrderModal;

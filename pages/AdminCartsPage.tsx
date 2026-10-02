// Página de carrinhos de estoque (Admin)
// Cada carrinho é levado por um responsável. A partir da última atualização
// (abastecimento ou devolução) mostra, por produto, quanto foi carregado,
// quanto foi usado nas movimentações e quanto deve ser devolvido.
// Na devolução, só gera discrepância se voltar MENOS do que o devido.
import React, { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import type { Product } from "../types";
import { authenticatedFetch } from "../services/apiService";
import {
  createStockCart,
  deleteStockCart,
  getStockCartReturns,
  getStockCarts,
  loadStockCart,
  registerStockCartUsage,
  returnStockCart,
  undoStockCartUsage,
  updateStockCart,
  type QuantityRow,
  type StockCart,
  type StockCartItem,
  type StockCartReturn,
} from "../services/cartStockService";

const formatDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("pt-BR") : "-";

// --- Modal base ---
const Modal: React.FC<{
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}> = ({ title, onClose, wide, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 p-4">
    <div
      className={`max-h-[90vh] w-full overflow-y-auto rounded-xl bg-white p-6 shadow-xl ${wide ? "max-w-3xl" : "max-w-md"}`}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <h2 className="text-xl font-bold text-blue-800">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-xl font-bold text-stone-400 hover:text-stone-600"
          aria-label="Fechar"
        >
          ✕
        </button>
      </div>
      {children}
    </div>
  </div>
);

// --- Cadastro / edição do carrinho ---
const CartFormModal: React.FC<{
  cart: StockCart | null;
  onClose: () => void;
  onSave: (name: string, responsible: string) => Promise<void>;
}> = ({ cart, onClose, onSave }) => {
  const [name, setName] = useState(cart?.name || "");
  const [responsible, setResponsible] = useState(cart?.responsible || "");
  const [saving, setSaving] = useState(false);

  return (
    <Modal title={cart ? "Editar carrinho" : "Novo carrinho"} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          try {
            await onSave(name, responsible);
          } finally {
            setSaving(false);
          }
        }}
        className="space-y-4"
      >
        <div>
          <label className="mb-1 block text-sm font-medium">Nome do carrinho</label>
          <input
            className="w-full rounded-lg border px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Carrinho 1"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Responsável</label>
          <input
            className="w-full rounded-lg border px-3 py-2"
            value={responsible}
            onChange={(e) => setResponsible(e.target.value)}
            placeholder="Quem leva o carrinho"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded-lg bg-stone-200 px-4 py-2" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300"
          >
            Salvar
          </button>
        </div>
      </form>
    </Modal>
  );
};

// --- Abastecer / registrar uso (linhas produto + quantidade) ---
const QuantityModal: React.FC<{
  mode: "load" | "usage";
  cart: StockCart;
  products: Product[];
  onClose: () => void;
  onSubmit: (rows: QuantityRow[]) => Promise<void>;
}> = ({ mode, cart, products, onClose, onSubmit }) => {
  const isUsage = mode === "usage";
  const cartRows = new Map<string, StockCartItem>(
    cart.items.map((i) => [i.productId, i]),
  );
  // No uso só aparecem produtos que ainda estão no carrinho
  const options = isUsage
    ? cart.items
        .filter((i) => i.expected > 0)
        .map((i) => ({ id: i.productId, name: i.productName }))
    : [...products]
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
        .map((p) => ({ id: p.id, name: p.name }));

  const [rows, setRows] = useState<QuantityRow[]>([
    { productId: options[0]?.id || "", quantity: 1 },
  ]);
  const [saving, setSaving] = useState(false);

  const updateRow = (idx: number, patch: Partial<QuantityRow>) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  return (
    <Modal
      title={`${isUsage ? "Registrar uso" : "Abastecer"} — ${cart.name}`}
      onClose={onClose}
      wide
    >
      <p className="mb-4 text-sm text-stone-600">
        {isUsage
          ? "A quantidade usada sai do estoque e passa a contar como usada por este carrinho."
          : "O que ainda está no carrinho é mantido e somado ao que for adicionado. A contagem de uso recomeça a partir desta atualização."}
      </p>
      {options.length === 0 ? (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          {isUsage
            ? "Não há produtos no carrinho. Abasteça o carrinho primeiro."
            : "Nenhum produto cadastrado."}
        </p>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            try {
              await onSubmit(rows.filter((r) => r.productId && r.quantity > 0));
            } finally {
              setSaving(false);
            }
          }}
        >
          <div className="mb-4 space-y-3">
            {rows.map((row, idx) => {
              const inCart = cartRows.get(row.productId);
              return (
                <div key={idx} className="flex flex-wrap items-end gap-2 border-b pb-3">
                  <div className="min-w-[200px] flex-1">
                    <label className="mb-1 block text-sm font-medium">Produto</label>
                    <select
                      className="w-full rounded-lg border px-3 py-2"
                      value={row.productId}
                      onChange={(e) => updateRow(idx, { productId: e.target.value })}
                    >
                      {options.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                    <div className="mt-1 text-xs text-stone-500">
                      {inCart
                        ? `Carregado: ${inCart.loaded} · Usado: ${inCart.used} · Deve devolver: ${inCart.expected}`
                        : "Ainda não está neste carrinho"}
                    </div>
                  </div>
                  <div className="w-24">
                    <label className="mb-1 block text-sm font-medium">Qtd</label>
                    <input
                      type="number"
                      min={1}
                      max={isUsage ? inCart?.expected : undefined}
                      className="w-full rounded-lg border px-3 py-2"
                      value={row.quantity}
                      onChange={(e) => updateRow(idx, { quantity: Number(e.target.value) })}
                    />
                  </div>
                  <button
                    type="button"
                    className="rounded bg-red-100 px-3 py-2 font-bold text-red-600"
                    onClick={() =>
                      setRows((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)))
                    }
                    disabled={rows.length === 1}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            className="mb-4 w-full rounded-lg bg-blue-50 py-2 font-bold text-blue-600"
            onClick={() =>
              setRows((prev) => [...prev, { productId: options[0]?.id || "", quantity: 1 }])
            }
          >
            + Adicionar Produto
          </button>
          <div className="flex justify-end gap-2">
            <button type="button" className="rounded-lg bg-stone-200 px-4 py-2" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 disabled:bg-emerald-300"
            >
              {isUsage ? "Registrar uso" : "Abastecer"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};

// --- Devolução: mostra o uso por produto e calcula a discrepância ---
const ReturnModal: React.FC<{
  cart: StockCart;
  onClose: () => void;
  onSubmit: (items: { productId: string; returned: number }[], notes: string) => Promise<void>;
}> = ({ cart, onClose, onSubmit }) => {
  const [returned, setReturned] = useState<Record<string, number>>(() =>
    Object.fromEntries(cart.items.map((i) => [i.productId, i.expected])),
  );
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const rows = cart.items.map((item) => {
    const back = Math.max(0, Number(returned[item.productId]) || 0);
    return {
      ...item,
      back,
      missing: Math.max(0, item.expected - back),
      surplus: Math.max(0, back - item.expected),
    };
  });
  const missingTotal = rows.reduce((sum, r) => sum + r.missing, 0);

  return (
    <Modal title={`Devolução — ${cart.name}`} onClose={onClose} wide>
      <p className="mb-4 text-sm text-stone-600">
        Uso contado desde a última atualização do carrinho ({formatDate(cart.cycleStartedAt)}).
        Devolver a menos gera discrepância; devolver a mais não.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          try {
            await onSubmit(
              rows.map((r) => ({ productId: r.productId, returned: r.back })),
              notes,
            );
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="mb-4 overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="bg-stone-100 text-xs">
                <th className="p-2 text-left">Produto</th>
                <th className="p-2 text-right">Carregado</th>
                <th className="p-2 text-right">Usado nas movimentações</th>
                <th className="p-2 text-right">Deve devolver</th>
                <th className="p-2 text-right">Devolvido</th>
                <th className="p-2 text-left">Situação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.productId} className={`border-b ${r.missing > 0 ? "bg-red-50" : ""}`}>
                  <td className="p-2">{r.productName}</td>
                  <td className="p-2 text-right">{r.loaded}</td>
                  <td className="p-2 text-right font-semibold text-amber-700">{r.used}</td>
                  <td className="p-2 text-right font-bold">{r.expected}</td>
                  <td className="p-2 text-right">
                    <input
                      type="number"
                      min={0}
                      className="w-20 rounded border px-2 py-1 text-right"
                      value={returned[r.productId] ?? 0}
                      onChange={(e) =>
                        setReturned((prev) => ({ ...prev, [r.productId]: Number(e.target.value) }))
                      }
                    />
                  </td>
                  <td className="p-2 text-xs font-semibold">
                    {r.missing > 0 ? (
                      <span className="text-red-600">Faltam {r.missing}</span>
                    ) : r.surplus > 0 ? (
                      <span className="text-blue-600">Sobra {r.surplus} (ok)</span>
                    ) : (
                      <span className="text-emerald-600">OK</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div
          className={`mb-4 rounded-lg p-3 text-sm font-semibold ${missingTotal > 0 ? "bg-red-100 text-red-700" : "bg-emerald-50 text-emerald-700"}`}
        >
          {missingTotal > 0
            ? `Vai gerar discrepância: faltam ${missingTotal} unidade(s).`
            : "Sem discrepância."}
        </div>
        <label className="mb-1 block text-sm font-medium">Observações</label>
        <textarea
          className="mb-4 w-full rounded-lg border px-3 py-2"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded-lg bg-stone-200 px-4 py-2" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 disabled:bg-emerald-300"
          >
            Confirmar devolução
          </button>
        </div>
      </form>
    </Modal>
  );
};

// --- Histórico de devoluções ---
const ReturnsHistoryModal: React.FC<{ cart: StockCart; onClose: () => void }> = ({
  cart,
  onClose,
}) => {
  const [returns, setReturns] = useState<StockCartReturn[] | null>(null);

  useEffect(() => {
    getStockCartReturns(cart.id)
      .then(setReturns)
      .catch((e) => {
        Swal.fire("Erro", e.message, "error");
        setReturns([]);
      });
  }, [cart.id]);

  return (
    <Modal title={`Devoluções — ${cart.name}`} onClose={onClose} wide>
      {returns === null ? (
        <p className="text-stone-500">Carregando...</p>
      ) : returns.length === 0 ? (
        <p className="text-stone-500">Nenhuma devolução registrada.</p>
      ) : (
        <div className="space-y-4">
          {returns.map((r) => (
            <div
              key={r.id}
              className={`rounded-lg border p-3 ${r.hasDiscrepancy ? "border-red-300" : "border-stone-200"}`}
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <strong>{formatDate(r.created_at)}</strong>
                  <span className="text-stone-500"> · uso desde {formatDate(r.cycleStartedAt)}</span>
                </span>
                {r.hasDiscrepancy ? (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
                    Discrepância: faltaram {r.missingTotal}
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                    Sem discrepância
                  </span>
                )}
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-stone-50">
                    <th className="p-1 text-left">Produto</th>
                    <th className="p-1 text-right">Carregado</th>
                    <th className="p-1 text-right">Usado</th>
                    <th className="p-1 text-right">Devia devolver</th>
                    <th className="p-1 text-right">Devolveu</th>
                    <th className="p-1 text-right">Faltou</th>
                  </tr>
                </thead>
                <tbody>
                  {r.items.map((i) => (
                    <tr key={i.productId} className={i.missing > 0 ? "text-red-700" : ""}>
                      <td className="p-1">{i.productName}</td>
                      <td className="p-1 text-right">{i.loaded}</td>
                      <td className="p-1 text-right">{i.used}</td>
                      <td className="p-1 text-right">{i.expected}</td>
                      <td className="p-1 text-right">{i.returned}</td>
                      <td className="p-1 text-right font-bold">{i.missing || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {r.notes && <p className="mt-2 text-xs text-stone-600">Obs.: {r.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
};

// --- Card de um carrinho ---
const CartCard: React.FC<{
  cart: StockCart;
  onAction: (action: "edit" | "load" | "usage" | "return" | "history" | "delete") => void;
  onUndoUsage: (movementId: number) => void;
}> = ({ cart, onAction, onUndoUsage }) => {
  const [showMovements, setShowMovements] = useState(false);

  return (
    <div className="rounded-2xl bg-white p-5 shadow-lg">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-stone-800">{cart.name}</h2>
          <div className="text-sm text-stone-500">
            Responsável: <strong>{cart.responsible || "-"}</strong>
          </div>
          <div className="text-xs text-stone-500">
            Última atualização: {formatDate(cart.cycleStartedAt)}
          </div>
        </div>
        {cart.lastReturn &&
          (cart.lastReturn.hasDiscrepancy ? (
            <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
              Última devolução: faltaram {cart.lastReturn.missingTotal}
            </span>
          ) : (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
              Última devolução sem discrepância
            </span>
          ))}
      </div>

      {cart.items.length === 0 ? (
        <p className="mb-4 rounded-lg bg-stone-50 p-3 text-sm text-stone-500">
          Carrinho vazio. Use "Abastecer" para registrar o que saiu nele.
        </p>
      ) : (
        <div className="mb-4 overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="bg-stone-100 text-xs">
                <th className="p-2 text-left">Produto</th>
                <th className="p-2 text-right">Carregado</th>
                <th className="p-2 text-right">Usado nas movimentações</th>
                <th className="p-2 text-right">Deve devolver</th>
              </tr>
            </thead>
            <tbody>
              {cart.items.map((i) => (
                <tr key={i.productId} className="border-b">
                  <td className="p-2">{i.productName}</td>
                  <td className="p-2 text-right">{i.loaded}</td>
                  <td className="p-2 text-right font-semibold text-amber-700">{i.used}</td>
                  <td className="p-2 text-right font-bold text-blue-800">{i.expected}</td>
                </tr>
              ))}
              <tr className="font-bold">
                <td className="p-2">Total</td>
                <td className="p-2 text-right">{cart.totals.loaded}</td>
                <td className="p-2 text-right text-amber-700">{cart.totals.used}</td>
                <td className="p-2 text-right text-blue-800">{cart.totals.expected}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {cart.movements.length > 0 && (
        <div className="mb-4">
          <button
            type="button"
            className="text-sm font-semibold text-blue-600 hover:underline"
            onClick={() => setShowMovements((v) => !v)}
          >
            {showMovements ? "Ocultar" : "Ver"} movimentações de uso ({cart.movements.length})
          </button>
          {showMovements && (
            <ul className="mt-2 divide-y rounded-lg border text-xs">
              {cart.movements.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 p-2">
                  <span>
                    {formatDate(m.created_at)} · {m.productName}
                  </span>
                  <span className="flex items-center gap-3">
                    <strong className="text-red-600">-{m.quantity}</strong>
                    <button
                      type="button"
                      className="text-red-500 hover:underline"
                      onClick={() => onUndoUsage(m.id)}
                    >
                      Desfazer
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700"
          onClick={() => onAction("load")}
        >
          Abastecer
        </button>
        <button
          className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-bold text-white hover:bg-amber-600 disabled:bg-amber-200"
          onClick={() => onAction("usage")}
          disabled={cart.totals.expected === 0}
        >
          Registrar uso
        </button>
        <button
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:bg-blue-300"
          onClick={() => onAction("return")}
          disabled={cart.items.length === 0}
        >
          Devolver
        </button>
        <button
          className="rounded-lg bg-stone-200 px-3 py-2 text-sm font-bold text-stone-700 hover:bg-stone-300"
          onClick={() => onAction("history")}
        >
          Devoluções
        </button>
        <button
          className="rounded-lg px-3 py-2 text-sm font-bold text-stone-600 hover:bg-stone-100"
          onClick={() => onAction("edit")}
        >
          Editar
        </button>
        <button
          className="rounded-lg px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50"
          onClick={() => onAction("delete")}
        >
          Remover
        </button>
      </div>
    </div>
  );
};

type ModalState =
  | { kind: "form"; cart: StockCart | null }
  | { kind: "load" | "usage" | "return" | "history"; cart: StockCart }
  | null;

const AdminCartsPage: React.FC = () => {
  const [carts, setCarts] = useState<StockCart[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modal, setModal] = useState<ModalState>(null);

  const loadCarts = async () => {
    try {
      setCarts(await getStockCarts());
    } catch (e: any) {
      Swal.fire("Erro", e.message || "Erro ao carregar carrinhos", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCarts();
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
    authenticatedFetch(`${API_URL}/api/products`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setProducts)
      .catch((e) => console.error("Erro ao carregar produtos:", e));
  }, []);

  const totals = useMemo(
    () =>
      carts.reduce(
        (acc, c) => ({ used: acc.used + c.totals.used, expected: acc.expected + c.totals.expected }),
        { used: 0, expected: 0 },
      ),
    [carts],
  );

  // Executa a ação, recarrega a lista e fecha o modal; erros aparecem no alerta
  const run = async (action: () => Promise<unknown>, success?: string) => {
    try {
      await action();
      setModal(null);
      await loadCarts();
      if (success) Swal.fire("Pronto!", success, "success");
    } catch (e: any) {
      Swal.fire("Erro", e.message || "Erro na operação", "error");
    }
  };

  const handleAction = async (
    cart: StockCart,
    action: "edit" | "load" | "usage" | "return" | "history" | "delete",
  ) => {
    if (action === "edit") return setModal({ kind: "form", cart });
    if (action !== "delete") return setModal({ kind: action, cart });

    const confirm = await Swal.fire({
      title: `Remover ${cart.name}?`,
      text: "O histórico de devoluções é mantido.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Remover",
      cancelButtonText: "Cancelar",
    });
    if (confirm.isConfirmed) await run(() => deleteStockCart(cart.id));
  };

  const handleUndoUsage = async (movementId: number) => {
    const confirm = await Swal.fire({
      title: "Desfazer movimentação de uso?",
      text: "A quantidade volta para o estoque e para o carrinho.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Desfazer",
      cancelButtonText: "Cancelar",
    });
    if (confirm.isConfirmed) await run(() => undoStockCartUsage(movementId));
  };

  return (
    <div className="container mx-auto p-2 sm:p-4 md:p-6">
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-4xl font-bold text-blue-800">Carrinhos</h1>
          <p className="text-sm text-stone-500">
            Uso e devolução de cada carrinho desde a sua última atualização.
          </p>
        </div>
        <button
          onClick={() => setModal({ kind: "form", cart: null })}
          className="rounded-lg bg-blue-600 px-6 py-2 font-bold text-white shadow-md hover:bg-blue-700"
        >
          + Novo carrinho
        </button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border-l-4 border-blue-500 bg-white p-5 shadow-lg">
          <div className="text-sm text-stone-500">Carrinhos</div>
          <div className="text-3xl font-bold text-blue-600">{carts.length}</div>
        </div>
        <div className="rounded-xl border-l-4 border-amber-500 bg-white p-5 shadow-lg">
          <div className="text-sm text-stone-500">Usado nas movimentações</div>
          <div className="text-3xl font-bold text-amber-600">{totals.used}</div>
        </div>
        <div className="rounded-xl border-l-4 border-emerald-500 bg-white p-5 shadow-lg">
          <div className="text-sm text-stone-500">A devolver</div>
          <div className="text-3xl font-bold text-emerald-600">{totals.expected}</div>
        </div>
      </div>

      {isLoading ? (
        <p className="text-stone-500">Carregando...</p>
      ) : carts.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center text-stone-500 shadow-lg">
          Nenhum carrinho cadastrado.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {carts.map((cart) => (
            <CartCard
              key={cart.id}
              cart={cart}
              onAction={(action) => handleAction(cart, action)}
              onUndoUsage={handleUndoUsage}
            />
          ))}
        </div>
      )}

      {modal?.kind === "form" && (
        <CartFormModal
          cart={modal.cart}
          onClose={() => setModal(null)}
          onSave={(name, responsible) =>
            run(() =>
              modal.cart
                ? updateStockCart(modal.cart.id, name, responsible)
                : createStockCart(name, responsible),
            )
          }
        />
      )}
      {(modal?.kind === "load" || modal?.kind === "usage") && (
        <QuantityModal
          mode={modal.kind}
          cart={modal.cart}
          products={products}
          onClose={() => setModal(null)}
          onSubmit={(rows) =>
            run(() =>
              modal.kind === "load"
                ? loadStockCart(modal.cart.id, rows)
                : registerStockCartUsage(modal.cart.id, rows),
            )
          }
        />
      )}
      {modal?.kind === "return" && (
        <ReturnModal
          cart={modal.cart}
          onClose={() => setModal(null)}
          onSubmit={async (items, notes) => {
            try {
              const result = await returnStockCart(modal.cart.id, items, notes);
              setModal(null);
              await loadCarts();
              Swal.fire(
                result.hasDiscrepancy ? "Devolução com discrepância" : "Devolução registrada",
                result.hasDiscrepancy
                  ? `Faltaram ${result.missingTotal} unidade(s) em relação ao que deveria ser devolvido.`
                  : "Sem discrepância.",
                result.hasDiscrepancy ? "warning" : "success",
              );
            } catch (e: any) {
              Swal.fire("Erro", e.message || "Erro ao registrar devolução", "error");
            }
          }}
        />
      )}
      {modal?.kind === "history" && (
        <ReturnsHistoryModal cart={modal.cart} onClose={() => setModal(null)} />
      )}
    </div>
  );
};

export default AdminCartsPage;

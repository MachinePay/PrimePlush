// Serviço de API dos carrinhos de estoque (produtos levados por cada responsável)
import { authenticatedFetch } from "./apiService";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const API_URL = `${BASE_URL}/api/admin/carts`;

// Por produto, no ciclo atual (desde a última atualização do carrinho)
export interface StockCartItem {
  productId: string;
  productName: string;
  loaded: number; // carregado na última atualização
  used: number; // usado nas movimentações desde então
  expected: number; // deve devolver = carregado - usado
}

export interface StockCartMovement {
  id: number;
  productId: string;
  productName: string;
  quantity: number;
  created_at: string;
}

export interface StockCart {
  id: number;
  name: string;
  responsible: string | null;
  cycle: number;
  cycleStartedAt: string;
  items: StockCartItem[];
  totals: { loaded: number; used: number; expected: number };
  movements: StockCartMovement[];
  lastReturn: {
    id: number;
    created_at: string;
    hasDiscrepancy: boolean;
    missingTotal: number;
  } | null;
}

export interface StockCartReturnItem extends StockCartItem {
  returned: number;
  missing: number; // devolveu a menos (discrepância)
  surplus: number; // devolveu a mais (não é discrepância)
}

export interface StockCartReturn {
  id: number;
  cycle: number;
  cycleStartedAt: string;
  created_at: string;
  hasDiscrepancy: boolean;
  missingTotal: number;
  notes: string | null;
  items: StockCartReturnItem[];
}

export interface QuantityRow {
  productId: string;
  quantity: number;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Erro ${response.status}`);
  }
  return data as T;
}

export const getStockCarts = () => request<StockCart[]>(API_URL);

export const createStockCart = (name: string, responsible: string) =>
  request<StockCart>(API_URL, {
    method: "POST",
    body: JSON.stringify({ name, responsible }),
  });

export const updateStockCart = (id: number, name: string, responsible: string) =>
  request<StockCart>(`${API_URL}/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name, responsible }),
  });

export const deleteStockCart = (id: number) =>
  request<{ ok: boolean }>(`${API_URL}/${id}`, { method: "DELETE" });

export const loadStockCart = (id: number, items: QuantityRow[]) =>
  request<StockCart>(`${API_URL}/${id}/load`, {
    method: "POST",
    body: JSON.stringify({ items }),
  });

export const registerStockCartUsage = (id: number, items: QuantityRow[]) =>
  request<StockCart>(`${API_URL}/${id}/usage`, {
    method: "POST",
    body: JSON.stringify({ items }),
  });

export const undoStockCartUsage = (movementId: number | string) =>
  request<{ ok: boolean }>(`${API_URL}/usage/${movementId}`, {
    method: "DELETE",
  });

export const returnStockCart = (
  id: number,
  items: { productId: string; returned: number }[],
  notes: string,
) =>
  request<{
    hasDiscrepancy: boolean;
    missingTotal: number;
    items: StockCartReturnItem[];
    cart: StockCart;
  }>(`${API_URL}/${id}/return`, {
    method: "POST",
    body: JSON.stringify({ items, notes }),
  });

export const getStockCartReturns = (id: number) =>
  request<StockCartReturn[]>(`${API_URL}/${id}/returns`);

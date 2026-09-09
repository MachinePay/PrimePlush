// Serviço de API para os banners promocionais da home
import { authenticatedFetch, publicFetch } from "./apiService";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const API_URL = `${BASE_URL}/api`;

export interface Banner {
  id: string;
  image: string;
  alt: string;
  buttonLabel: string;
  category?: string | null;
  query?: string | null;
  order: number;
  active: boolean;
  created_at?: string;
}

export interface BannerPayload {
  image: string;
  alt?: string;
  buttonLabel?: string;
  category?: string | null;
  query?: string | null;
  order?: number;
  active?: boolean;
}

async function extractError(response: Response, fallback: string) {
  try {
    const data = await response.json();
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Busca os banners ativos (público — carrossel da home).
 * Nunca lança: se o backend falhar, a home simplesmente não mostra banners.
 */
export async function getBanners(): Promise<Banner[]> {
  try {
    const response = await publicFetch(`${API_URL}/banners`);

    if (!response.ok) {
      console.error(`❌ Erro ao buscar banners (${response.status})`);
      return [];
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      console.error("❌ Backend retornou banners inválidos:", data);
      return [];
    }

    return data;
  } catch (error) {
    console.error("❌ Erro ao buscar banners:", error);
    return [];
  }
}

/**
 * Busca todos os banners, inclusive os desativados (autenticado - admin).
 */
export async function getAllBanners(): Promise<Banner[]> {
  const response = await authenticatedFetch(`${API_URL}/admin/banners`);

  if (!response.ok) {
    throw new Error(await extractError(response, "Erro ao buscar banners"));
  }

  return response.json();
}

/**
 * Cria um novo banner (autenticado - admin).
 */
export async function createBanner(banner: BannerPayload): Promise<Banner> {
  const response = await authenticatedFetch(`${API_URL}/banners`, {
    method: "POST",
    body: JSON.stringify(banner),
  });

  if (!response.ok) {
    throw new Error(await extractError(response, "Erro ao criar banner"));
  }

  return response.json();
}

/**
 * Atualiza um banner existente (autenticado - admin).
 */
export async function updateBanner(
  bannerId: string,
  banner: Partial<BannerPayload>,
): Promise<Banner> {
  const response = await authenticatedFetch(`${API_URL}/banners/${bannerId}`, {
    method: "PUT",
    body: JSON.stringify(banner),
  });

  if (!response.ok) {
    throw new Error(await extractError(response, "Erro ao atualizar banner"));
  }

  return response.json();
}

/**
 * Deleta um banner (autenticado - admin).
 */
export async function deleteBanner(bannerId: string): Promise<void> {
  const response = await authenticatedFetch(`${API_URL}/banners/${bannerId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(await extractError(response, "Erro ao deletar banner"));
  }
}

/**
 * Reordena os banners a partir da lista de ids na ordem desejada
 * (autenticado - admin).
 */
export async function reorderBanners(ids: string[]): Promise<Banner[]> {
  const response = await authenticatedFetch(`${API_URL}/banners/reorder/all`, {
    method: "PUT",
    body: JSON.stringify({ ids }),
  });

  if (!response.ok) {
    throw new Error(await extractError(response, "Erro ao reordenar banners"));
  }

  return response.json();
}

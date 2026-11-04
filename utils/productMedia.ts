import type { Product, ProductMedia } from "../types";
import { getYouTubeId } from "./youtube";

// Fotos e vídeos do produto na ordem do carrossel. Produtos salvos antes da
// ordenação não têm `media`: nesse caso vêm as fotos e depois os vídeos.
export const getProductMedia = (product: Product): ProductMedia[] => {
  if (Array.isArray(product.media) && product.media.length > 0) {
    return product.media.filter(
      (item) => item && typeof item.url === "string" && item.url,
    );
  }
  const images =
    Array.isArray(product.images) && product.images.length > 0
      ? product.images
      : product.imageUrl
        ? [product.imageUrl]
        : [];
  const videos =
    Array.isArray(product.videos) && product.videos.length > 0
      ? product.videos
      : product.videoUrl
        ? [product.videoUrl]
        : [];
  return [
    ...images
      .filter((url) => typeof url === "string" && url)
      .map((url) => ({ type: "image" as const, url })),
    ...videos
      .filter((url) => typeof url === "string" && url)
      .map((url) => ({ type: "video" as const, url })),
  ];
};

// Item do carrossel pronto para exibir: foto (src) ou vídeo (id do YouTube).
// Vídeos com link inválido ficam de fora.
export type ViewerMedia =
  | { type: "image"; src: string }
  | { type: "video"; id: string };

export const getViewerMedia = (product: Product): ViewerMedia[] =>
  getProductMedia(product).flatMap((item): ViewerMedia[] => {
    if (item.type === "video") {
      const id = getYouTubeId(item.url);
      return id ? [{ type: "video", id }] : [];
    }
    return [{ type: "image", src: item.url }];
  });

// Links do YouTube aceitos: watch?v=, youtu.be/, shorts/, embed/, live/
// (inclusive m.youtube.com e music.youtube.com).
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

export const getYouTubeId = (url?: string | null): string | null => {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null = null;

  if (host === "youtu.be") {
    id = parsed.pathname.split("/")[1] || null;
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (parsed.pathname === "/watch") {
      id = parsed.searchParams.get("v");
    } else {
      const [, kind, value] = parsed.pathname.split("/");
      if (["shorts", "embed", "live", "v"].includes(kind)) id = value || null;
    }
  }

  return id && YOUTUBE_ID.test(id) ? id : null;
};

// Player embutido: o vídeo toca no próprio site, sem abrir o YouTube.
export const getYouTubeEmbedUrl = (id: string, autoplay = true): string =>
  `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1${autoplay ? "&autoplay=1" : ""}`;

export const getYouTubeThumbnail = (id: string): string =>
  `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

// Ids dos vídeos válidos do produto (ignora links que não são do YouTube)
export const getProductVideoIds = (product: {
  videos?: string[];
  videoUrl?: string;
}): string[] => {
  const links =
    Array.isArray(product.videos) && product.videos.length > 0
      ? product.videos
      : product.videoUrl
        ? [product.videoUrl]
        : [];
  return links
    .map((url) => getYouTubeId(url))
    .filter((id): id is string => !!id);
};

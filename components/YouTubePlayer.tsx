import React from "react";
import { getYouTubeEmbedUrl } from "../utils/youtube";

// Vídeo do YouTube tocando dentro do site (iframe youtube-nocookie)
const YouTubePlayer: React.FC<{ videoId: string; title: string }> = ({
  videoId,
  title,
}) => (
  <div className="w-full max-w-4xl aspect-video overflow-hidden rounded-xl bg-black shadow-2xl">
    <iframe
      src={getYouTubeEmbedUrl(videoId)}
      title={title}
      className="h-full w-full"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
    />
  </div>
);

export default YouTubePlayer;

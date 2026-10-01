import React, { useRef, useState } from "react";
import { useFavorites } from "../contexts/FavoritesContext";
import { verifyStockOverridePin } from "../services/apiService";
import type { Product } from "../types";

const getAvailableStock = (product: Product): number | null => {
  if (product.stock_available !== undefined) return product.stock_available;
  if (product.stock !== undefined) return product.stock;
  return null;
};

const LONG_PRESS_MS = 3000;

interface ProductCardProps {
  product: Product;
  onAddToCart: (
    product: Product,
    override?: { forceOverride: boolean; overrideToken: string },
  ) => void;
  quantityInCart?: number;
  onOpenImage: (product: Product) => void;
}

const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onAddToCart,
  quantityInCart = 0,
  onOpenImage,
}) => {
  const { isFavorite, toggleFavorite } = useFavorites();
  const isOutOfStock = getAvailableStock(product) === 0;
  const primaryImage = product.images?.[0] || product.imageUrl;
  const favorited = isFavorite(product.id);

  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [verifying, setVerifying] = useState(false);

  const startLongPress = () => {
    if (!isOutOfStock) return;
    pressTimerRef.current = setTimeout(() => {
      setPinError("");
      setPin("");
      setShowPinModal(true);
    }, LONG_PRESS_MS);
  };

  const cancelLongPress = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const closePinModal = () => {
    setShowPinModal(false);
    setPin("");
    setPinError("");
  };

  const handleConfirmPin = async () => {
    setVerifying(true);
    setPinError("");
    const result = await verifyStockOverridePin(pin);
    setVerifying(false);
    if (result.success && result.token) {
      onAddToCart(product, {
        forceOverride: true,
        overrideToken: result.token,
      });
      closePinModal();
    } else {
      setPinError(result.message || "PIN inválido");
    }
  };

  return (
    <div
      className={`monster-product-card bg-white w-60 rounded-2xl shadow-md overflow-hidden flex flex-col relative h-full transition-transform hover:shadow-xl ${
        isOutOfStock ? "opacity-60 grayscale" : ""
      }`}
      onPointerDown={startLongPress}
      onPointerUp={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onPointerCancel={cancelLongPress}
    >
      {/* Badges - Apenas ESGOTADO agora */}
      {isOutOfStock && (
        <div className="absolute top-3 left-3 z-10 bg-blue-600 text-white font-bold px-3 py-1 rounded-full text-sm shadow-sm">
          ESGOTADO
        </div>
      )}

      <button
        type="button"
        onClick={() => toggleFavorite(product.id)}
        className="product-favorite-btn"
        aria-label={
          favorited ? "Remover dos favoritos" : "Adicionar aos favoritos"
        }
        title={favorited ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill={favorited ? "#ef4444" : "none"}
          stroke={favorited ? "#ef4444" : "currentColor"}
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 20.727c-.39 0-.78-.146-1.076-.438L4.318 13.72C2.83 12.25 2.83 9.868 4.318 8.4c1.487-1.47 3.898-1.47 5.385 0L12 10.667l2.297-2.267c1.487-1.47 3.898-1.47 5.385 0 1.487 1.469 1.487 3.85 0 5.319l-6.606 6.57c-.296.292-.686.438-1.076.438z"
          />
        </svg>
      </button>

      {/* Mídia (Imagem ou Vídeo) */}
      <div className="monster-product-media relative h-40 md:h-52 bg-gray-100">
        {primaryImage ? (
          <img
            src={primaryImage}
            alt={product.name}
            className="w-full h-full object-cover hover:scale-105 transition-transform cursor-zoom-in"
            loading="lazy"
            onClick={() => onOpenImage(product)}
          />
        ) : null}
      </div>

      {/* Conteúdo */}
      <div className="monster-product-body p-4 flex flex-col flex-grow justify-between">
        <div>
          <h3 className="monster-product-title font-bold text-lg md:text-xl text-gray-800 leading-tight mb-2">
            {product.name}
          </h3>
          <p className="monster-product-description hidden md:block text-sm text-stone-600 line-clamp-2 mb-3">
            {product.description}
          </p>
        </div>

        <div className="mt-2">
          <div className="flex flex-col gap-3">
            <span className="monster-product-price text-xl md:text-2xl font-bold text-stone-800">
              R$ {product.price.toFixed(2)}
            </span>
            {product.quantidadeVenda && product.quantidadeVenda > 1 && (
              <span
                className="text-xs text-stone-500 mt-1 block"
                style={{ fontSize: "12px" }}
              >
                Mínimo: {product.quantidadeVenda} por compra
              </span>
            )}
            <button
              onClick={() => onAddToCart(product)}
              disabled={isOutOfStock}
              className={`monster-buy-button w-full font-bold py-3 px-4 rounded-xl text-base md:text-lg transition-colors shadow-sm ${
                isOutOfStock
                  ? "bg-stone-300 text-stone-500 cursor-not-allowed"
                  : "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800"
              }`}
            >
              {quantityInCart > 0
                ? `Adicionado (${quantityInCart})`
                : "Adicionar"}
            </button>
          </div>
        </div>
      </div>

      {showPinModal && (
        <div
          className="fixed inset-0 z-[300] bg-black/60 flex items-center justify-center p-4"
          onClick={closePinModal}
        >
          <div
            className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-lg text-stone-800 mb-1">
              Liberar sem estoque
            </h3>
            <p className="text-sm text-stone-500 mb-4">
              Digite o PIN para adicionar "{product.name}" mesmo esgotado.
            </p>
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !verifying) handleConfirmPin();
              }}
              placeholder="PIN"
              className="w-full p-3 border border-stone-300 rounded-lg text-center text-lg tracking-widest mb-2 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-300/30"
            />
            {pinError && (
              <p className="text-sm text-red-600 font-semibold mb-2">
                {pinError}
              </p>
            )}
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={closePinModal}
                className="flex-1 py-2 rounded-lg font-bold text-stone-600 bg-stone-100 hover:bg-stone-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmPin}
                disabled={verifying || !pin}
                className="flex-1 py-2 rounded-lg font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-stone-300"
              >
                {verifying ? "..." : "Liberar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductCard;

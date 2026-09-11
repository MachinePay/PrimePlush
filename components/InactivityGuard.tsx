import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useCart } from "../contexts/CartContext";

// Sessão geral: desloga após 20s sem interação (15s de espera + 5s de contagem).
const GENERAL_INACTIVITY_MS = 15_000;
const GENERAL_COUNTDOWN_SECONDS = 5;

// Pós-compra (handback do kiosk): janela maior, 1 minuto + 30s de contagem.
const PURCHASE_INACTIVITY_MS = 60_000;
const PURCHASE_COUNTDOWN_SECONDS = 30;

const InactivityGuard: React.FC = () => {
  const { currentUser, logout, purchaseJustCompleted } = useAuth();
  const { clearCart } = useCart();
  const navigate = useNavigate();
  const location = useLocation();

  // Após uma compra aprovada usamos a janela maior (dá tempo do cliente
  // sair do balcão); nos demais casos, com usuário logado, vale a janela
  // geral de 20s pedida para encerrar sessões esquecidas.
  const inactivityMs = purchaseJustCompleted
    ? PURCHASE_INACTIVITY_MS
    : GENERAL_INACTIVITY_MS;
  const countdownSeconds = purchaseJustCompleted
    ? PURCHASE_COUNTDOWN_SECONDS
    : GENERAL_COUNTDOWN_SECONDS;

  const [showPrompt, setShowPrompt] = useState(false);
  const [countdown, setCountdown] = useState(countdownSeconds);

  const inactivityTimerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);

  // Lógica atualizada para detectar onde estamos
  const isScreensaver = location.pathname === "/";
  const isKitchen = location.pathname.startsWith("/cozinha");
  const isAdmin = location.pathname.startsWith("/admin");

  // Ativo sempre que houver alguém logado, fora da tela de espera, cozinha
  // e admin (onde funcionários podem ficar parados por mais tempo).
  const guardEnabled = useMemo(
    () => !!currentUser && !isScreensaver && !isKitchen && !isAdmin,
    [currentUser, isScreensaver, isKitchen, isAdmin]
  );

  const clearInactivityTimer = () => {
    if (inactivityTimerRef.current) {
      window.clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  };

  const clearCountdownTimer = () => {
    if (countdownTimerRef.current) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  };

  const startInactivityTimer = useCallback(() => {
    clearInactivityTimer();
    inactivityTimerRef.current = window.setTimeout(() => {
      // Show prompt after inactivity
      setShowPrompt(true);
      setCountdown(countdownSeconds);
      // Start countdown
      clearCountdownTimer();
      countdownTimerRef.current = window.setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            // time's up -> logout and go to screensaver
            clearCountdownTimer();
            setShowPrompt(false);
            // Logout and cleanup (async)
            (async () => {
              // Se tiver usuário logado, faz logout
              if (currentUser) {
                await logout();
              }
              try {
                clearCart();
                // Limpa nome de convidado também
                localStorage.removeItem("guestUserName");
              } catch {
                /* ignore */
              }
              navigate("/", { replace: true });
            })();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, inactivityMs);
  }, [logout, clearCart, navigate, currentUser, inactivityMs, countdownSeconds]);

  const resetActivity = useCallback(() => {
    if (!guardEnabled) return;
    // If prompt visible, close it and stop countdown
    if (showPrompt) {
      setShowPrompt(false);
      clearCountdownTimer();
      setCountdown(countdownSeconds);
    }
    // Restart inactivity timer
    startInactivityTimer();
  }, [guardEnabled, showPrompt, startInactivityTimer, countdownSeconds]);

  useEffect(() => {
    if (!guardEnabled) {
      // disable guard: cleanup timers and prompt
      clearInactivityTimer();
      clearCountdownTimer();
      setShowPrompt(false);
      setCountdown(countdownSeconds);
      return;
    }

    // Start first timer when guard enabled
    startInactivityTimer();

    const events: (keyof WindowEventMap)[] = [
      "click",
      "keydown",
      "mousemove",
      "touchstart",
      "wheel",
      "scroll",
    ];
    const handler = () => resetActivity();
    events.forEach((evt) =>
      window.addEventListener(evt, handler, {
        passive: true,
        capture: true,
      } as any)
    );

    return () => {
      events.forEach((evt) =>
        window.removeEventListener(evt, handler as any, {
          capture: true,
        } as any)
      );
      clearInactivityTimer();
      clearCountdownTimer();
    };
  }, [guardEnabled, startInactivityTimer, resetActivity]);

  if (!guardEnabled) return null;

  return (
    <>
      {showPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-[90vw] max-w-sm text-center">
            <div className="text-2xl font-semibold mb-2">Ainda está aí?</div>
            <div className="text-stone-600 mb-4">
              Por segurança, sua conta será desconectada em {countdown}s por
              inatividade.
            </div>
            <button
              onClick={resetActivity}
              className="px-4 py-2 rounded-md bg-stone-900 text-white hover:bg-stone-800"
            >
              Sim, continuar
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default InactivityGuard;

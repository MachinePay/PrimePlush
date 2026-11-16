import React, { useCallback, useEffect, useState } from "react";
import { Button, Field, Modal, formatCurrency } from "./ui";
import { IconEye, IconEyeOff, IconUnlock } from "./icons";

// Bloqueio dos valores financeiros do painel (pedidos, dashboard, gestão).
// Usa a mesma senha especial do Relatório de Gestão e Financeiro.
// O desbloqueio vale para a sessão do navegador (fecha a aba = bloqueia de novo).
export const FINANCE_PASSWORD = "135";

const STORAGE_KEY = "pp-finance-unlocked";
const EVENT = "pp-finance-lock-change";
export const MASKED_CURRENCY = "R$ •••••";

export const isFinanceUnlocked = () => {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

export const setFinanceUnlocked = (value: boolean) => {
  try {
    if (value) sessionStorage.setItem(STORAGE_KEY, "1");
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* sem storage: vale só enquanto a página estiver aberta */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: value }));
};

export function useFinanceLock() {
  const [unlocked, setUnlocked] = useState(isFinanceUnlocked);

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<boolean>).detail;
      setUnlocked(typeof detail === "boolean" ? detail : isFinanceUnlocked());
    };
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);

  const unlock = useCallback((password: string) => {
    if (password !== FINANCE_PASSWORD) return false;
    setFinanceUnlocked(true);
    return true;
  }, []);

  const lock = useCallback(() => setFinanceUnlocked(false), []);

  const money = useCallback(
    (value: number) => (unlocked ? formatCurrency(value) : MASKED_CURRENCY),
    [unlocked],
  );

  return { unlocked, unlock, lock, money };
}

/** Olhinho que mostra (pedindo a senha) ou oculta os valores. */
export const FinanceLockButton: React.FC<{
  unlocked: boolean;
  unlock: (password: string) => boolean;
  lock: () => void;
}> = ({ unlocked, unlock, lock }) => {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const close = () => {
    setOpen(false);
    setPassword("");
    setError("");
  };

  const submit = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (unlock(password)) close();
    else setError("Senha incorreta");
  };

  if (unlocked) {
    return (
      <Button
        variant="secondary"
        iconOnly
        icon={<IconEye />}
        onClick={lock}
        title="Ocultar valores"
        aria-label="Ocultar valores"
        aria-pressed={true}
      />
    );
  }

  return (
    <>
      <Button
        variant="secondary"
        iconOnly
        icon={<IconEyeOff />}
        onClick={() => setOpen(true)}
        title="Mostrar valores (pede senha)"
        aria-label="Mostrar valores"
        aria-pressed={false}
      />
      <Modal
        open={open}
        onClose={close}
        size="sm"
        title="Valores bloqueados"
        description="Digite a senha de Gestão e Financeiro para ver os valores."
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              Cancelar
            </Button>
            <Button variant="primary" icon={<IconUnlock />} onClick={() => submit()}>
              Desbloquear
            </Button>
          </>
        }
      >
        <form onSubmit={submit}>
          <Field label="Senha especial" htmlFor="pp-finance-password" error={error || undefined}>
            <input
              id="pp-finance-password"
              type="password"
              className={`pp-input${error ? " pp-invalid" : ""}`}
              placeholder="Senha especial"
              autoFocus
              autoComplete="off"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
            />
          </Field>
        </form>
      </Modal>
    </>
  );
};

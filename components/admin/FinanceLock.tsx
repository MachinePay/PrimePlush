import React, { useCallback, useEffect, useState } from "react";
import { Button, Field, Modal, formatCurrency } from "./ui";
import { IconEye, IconEyeOff, IconUnlock } from "./icons";
import { useAuth } from "../../contexts/AuthContext";
import { hasAdminPermission } from "../../utils/adminPermissions";

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

// Funcionário sem a permissão "valores" nunca vê os valores (nem com a senha).
const useCanViewValues = () => {
  const { currentUser } = useAuth();
  return currentUser?.role !== "admin" || hasAdminPermission(currentUser, "valores");
};

export function useFinanceLock() {
  const canView = useCanViewValues();
  const [storedUnlocked, setUnlocked] = useState(isFinanceUnlocked);
  const unlocked = canView && storedUnlocked;

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<boolean>).detail;
      setUnlocked(typeof detail === "boolean" ? detail : isFinanceUnlocked());
    };
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);

  const unlock = useCallback((password: string) => {
    if (!canView || password !== FINANCE_PASSWORD) return false;
    setFinanceUnlocked(true);
    return true;
  }, [canView]);

  const lock = useCallback(() => setFinanceUnlocked(false), []);

  const money = useCallback(
    (value: number) => (unlocked ? formatCurrency(value) : MASKED_CURRENCY),
    [unlocked],
  );

  return { unlocked, unlock, lock, money, canView };
}

/** Olhinho que mostra (pedindo a senha) ou oculta os valores. */
export const FinanceLockButton: React.FC<{
  unlocked: boolean;
  unlock: (password: string) => boolean;
  lock: () => void;
}> = ({ unlocked, unlock, lock }) => {
  const canView = useCanViewValues();
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

  if (!canView) return null;

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

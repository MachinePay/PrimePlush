import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Swal from "sweetalert2";
import {
  IconArrowDown,
  IconArrowUp,
  IconChevronLeft,
  IconChevronRight,
  IconSearch,
  IconX,
} from "./icons";

// Kit de componentes do painel administrativo. Usa as classes de admin.css.

export type Tone =
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "violet"
  | "neutral";

const cx = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

// ---------- Formatação ----------

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const integerFormatter = new Intl.NumberFormat("pt-BR");
const percentFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
});

export const formatCurrency = (value: number) =>
  currencyFormatter.format(Number.isFinite(value) ? value : 0);
export const formatInteger = (value: number) =>
  integerFormatter.format(Number.isFinite(value) ? Math.round(value) : 0);
export const formatPercent = (value: number) =>
  `${percentFormatter.format(Number.isFinite(value) ? value : 0)}%`;
export const formatDateTime = (value?: string | number | Date | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};
export const formatDate = (value?: string | number | Date | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR");
};

// "há 5 min", "há 2 h", "ontem"...
export const formatRelative = (value?: string | number | Date | null) => {
  if (!value) return "-";
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (Number.isNaN(diff)) return "-";
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days} dias`;
  return formatDate(date);
};

export const getInitials = (name?: string | null) => {
  const parts = String(name || "?")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
};

// ---------- Feedback (toasts e confirmação) ----------

export const notify = (
  title: string,
  icon: "success" | "error" | "warning" | "info" = "success",
) =>
  Swal.fire({
    toast: true,
    position: "top-end",
    icon,
    title,
    showConfirmButton: false,
    timer: 2400,
    timerProgressBar: true,
    customClass: { popup: "pp-admin-toast" },
  });

export const confirmAction = async ({
  title,
  text,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  danger = false,
}: {
  title: string;
  text?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}) => {
  const result = await Swal.fire({
    title,
    text,
    icon: danger ? "warning" : "question",
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    confirmButtonColor: danger ? "#e11d48" : "#2563eb",
    cancelButtonColor: "#64748b",
    reverseButtons: true,
    focusCancel: danger,
  });
  return result.isConfirmed;
};

// ---------- Layout de página ----------

export const PageHeader: React.FC<{
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}> = ({ title, description, actions, eyebrow }) => (
  <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
    <div className="min-w-0">
      {eyebrow && (
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-[color:var(--pp-brand)]">
          {eyebrow}
        </div>
      )}
      <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--pp-text)] md:text-[28px]">
        {title}
      </h1>
      {description && (
        <p className="mt-1 text-sm text-[color:var(--pp-text-2)]">
          {description}
        </p>
      )}
    </div>
    {actions && (
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    )}
  </div>
);

export const Card: React.FC<{
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Sem padding no corpo (tabelas encostadas na borda) */
  flush?: boolean;
  hover?: boolean;
}> = ({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
  flush,
  hover,
}) => (
  <section className={cx("pp-card", hover && "pp-card-hover", className)}>
    {(title || actions) && (
      <header className="pp-card-header">
        <div className="min-w-0">
          {title && <h2 className="pp-card-title">{title}</h2>}
          {subtitle && <p className="pp-card-subtitle">{subtitle}</p>}
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </header>
    )}
    <div className={cx(!flush && "pp-card-body", bodyClassName)}>
      {children}
    </div>
  </section>
);

// ---------- Botões ----------

type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "danger-soft"
  | "success"
  | "soft";

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: "sm" | "md" | "lg";
    icon?: React.ReactNode;
    iconOnly?: boolean;
    loading?: boolean;
  }
>(
  (
    {
      variant = "secondary",
      size = "md",
      icon,
      iconOnly,
      loading,
      className,
      children,
      disabled,
      type = "button",
      ...rest
    },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "pp-btn",
        `pp-btn-${variant}`,
        size === "sm" && "pp-btn-sm",
        size === "lg" && "pp-btn-lg",
        iconOnly && "pp-btn-icon",
        className,
      )}
      {...rest}
    >
      {loading ? <span className="pp-spinner" aria-hidden="true" /> : icon}
      {children}
    </button>
  ),
);
Button.displayName = "Button";

// ---------- Badges e avatar ----------

export const Badge: React.FC<{
  tone?: Tone;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
  title?: string;
}> = ({ tone = "neutral", dot, children, className, title }) => (
  <span
    title={title}
    className={cx(
      "pp-badge",
      tone !== "neutral" && `pp-badge-${tone}`,
      dot && "pp-badge-dot",
      className,
    )}
  >
    {children}
  </span>
);

const AVATAR_TONES: Tone[] = ["brand", "violet", "success", "info", "warning"];

export const Avatar: React.FC<{ name?: string | null; size?: number }> = ({
  name,
  size = 32,
}) => {
  const text = String(name || "?");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash + text.charCodeAt(i)) % 997;
  const tone = AVATAR_TONES[hash % AVATAR_TONES.length];
  return (
    <span
      className={cx("pp-avatar", `pp-tone-${tone}`)}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38) }}
      aria-hidden="true"
    >
      {getInitials(text)}
    </span>
  );
};

// ---------- Indicadores ----------

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Número que conta até o valor final (respeita prefers-reduced-motion) */
export const AnimatedNumber: React.FC<{
  value: number;
  format?: (value: number) => string;
  duration?: number;
}> = ({ value, format = formatInteger, duration = 700 }) => {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(0);

  useEffect(() => {
    if (prefersReducedMotion() || !Number.isFinite(value)) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (value - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return <span className="pp-num">{format(display)}</span>;
};

export const Delta: React.FC<{
  /** Variação percentual; null quando não há base de comparação */
  value: number | null | undefined;
  /** true quando subir é ruim (ex.: cancelamentos) */
  invert?: boolean;
  suffix?: string;
}> = ({ value, invert, suffix }) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  const up = value >= 0;
  const good = invert ? !up : up;
  return (
    <span className={cx("pp-delta", good ? "pp-delta-up" : "pp-delta-down")}>
      {up ? (
        <IconArrowUp className="h-3 w-3" />
      ) : (
        <IconArrowDown className="h-3 w-3" />
      )}
      {formatPercent(Math.abs(value))}
      {suffix && (
        <span className="ml-1 font-normal text-[color:var(--pp-text-3)]">
          {suffix}
        </span>
      )}
    </span>
  );
};

export const StatCard: React.FC<{
  label: React.ReactNode;
  value: number;
  format?: (value: number) => string;
  icon?: React.ReactNode;
  tone?: Tone;
  delta?: number | null;
  deltaInvert?: boolean;
  deltaLabel?: string;
  hint?: React.ReactNode;
  loading?: boolean;
  onClick?: () => void;
  footer?: React.ReactNode;
}> = ({
  label,
  value,
  format,
  icon,
  tone = "brand",
  delta,
  deltaInvert,
  deltaLabel,
  hint,
  loading,
  onClick,
  footer,
}) => {
  const Comp: React.ElementType = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cx(
        "pp-card pp-stat w-full text-left",
        onClick && "pp-card-hover cursor-pointer",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="pp-stat-label">{label}</span>
        {icon && <span className={cx("pp-stat-icon", `pp-tone-${tone}`)}>{icon}</span>}
      </div>
      {loading ? (
        <>
          <Skeleton className="mt-4 h-7 w-32" />
          <Skeleton className="mt-2 h-3 w-24" />
        </>
      ) : (
        <>
          <div className="pp-stat-value">
            <AnimatedNumber value={value} format={format} />
          </div>
          {(delta !== undefined || hint) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-[color:var(--pp-text-3)]">
              <Delta value={delta} invert={deltaInvert} suffix={deltaLabel} />
              {hint && <span>{hint}</span>}
            </div>
          )}
          {footer && <div className="mt-3">{footer}</div>}
        </>
      )}
    </Comp>
  );
};

// ---------- Estados ----------

export const Skeleton: React.FC<{
  className?: string;
  style?: React.CSSProperties;
}> = ({ className, style }) => (
  <div className={cx("pp-skeleton", className)} style={style} />
);

export const SkeletonRows: React.FC<{ rows?: number; cols?: number }> = ({
  rows = 5,
  cols = 4,
}) => (
  <div className="divide-y divide-[color:var(--pp-border)]">
    {Array.from({ length: rows }, (_, r) => (
      <div key={r} className="flex items-center gap-4 px-4 py-3.5">
        {Array.from({ length: cols }, (_, c) => (
          <Skeleton
            key={c}
            className="h-4"
            style={{ width: `${c === 0 ? 28 : 100 / cols}%` }}
          />
        ))}
      </div>
    ))}
  </div>
);

export const EmptyState: React.FC<{
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}> = ({ icon, title, description, action }) => (
  <div className="pp-empty">
    {icon && <div className="pp-empty-icon">{icon}</div>}
    <p className="text-sm font-semibold text-[color:var(--pp-text)]">{title}</p>
    {description && (
      <p className="max-w-sm text-sm text-[color:var(--pp-text-3)]">
        {description}
      </p>
    )}
    {action && <div className="mt-3">{action}</div>}
  </div>
);

// ---------- Campos ----------

export const Field: React.FC<{
  label?: React.ReactNode;
  htmlFor?: string;
  help?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ label, htmlFor, help, error, children, className }) => (
  <div className={className}>
    {label && (
      <label htmlFor={htmlFor} className="pp-label">
        {label}
      </label>
    )}
    {children}
    {error ? (
      <p className="pp-error">{error}</p>
    ) : (
      help && <p className="pp-help">{help}</p>
    )}
  </div>
);

export const SearchInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  "aria-label"?: string;
}> = ({ value, onChange, placeholder = "Buscar...", className, autoFocus, ...rest }) => (
  <div className={cx("pp-input-icon", className)}>
    <IconSearch />
    <input
      type="search"
      className="pp-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      aria-label={rest["aria-label"] || placeholder}
    />
  </div>
);

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  options: Array<{ value: T; label: React.ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div className={cx("pp-segmented", className)} role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: Array<{ value: T; label: React.ReactNode; count?: number }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cx("pp-tabs", className)} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={tab.value === value}
          className="pp-tab"
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className="ml-1.5 rounded-full bg-[color:var(--pp-surface-2)] px-1.5 py-0.5 text-[11px] font-semibold text-[color:var(--pp-text-2)]">
              {formatInteger(tab.count)}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ---------- Tabelas ----------

export type SortDirection = "asc" | "desc";
export interface SortState<K extends string> {
  key: K;
  direction: SortDirection;
}

/** Ordena uma lista pelo valor que `getValue` devolve para a coluna */
export function sortRows<T, K extends string>(
  rows: T[],
  sort: SortState<K> | null,
  getValue: (row: T, key: K) => string | number | null | undefined,
): T[] {
  if (!sort) return rows;
  const factor = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = getValue(a, sort.key);
    const vb = getValue(b, sort.key);
    if (va === vb) return 0;
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    if (typeof va === "number" && typeof vb === "number") {
      return (va - vb) * factor;
    }
    return String(va).localeCompare(String(vb), "pt-BR") * factor;
  });
}

export function SortHeader<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
}: {
  label: React.ReactNode;
  sortKey: K;
  sort: SortState<K> | null;
  onSort: (sort: SortState<K>) => void;
  align?: "left" | "right" | "center";
}) {
  const active = sort?.key === sortKey;
  return (
    <th
      data-sortable="true"
      style={{ textAlign: align }}
      aria-sort={
        active ? (sort!.direction === "asc" ? "ascending" : "descending") : "none"
      }
      onClick={() =>
        onSort({
          key: sortKey,
          direction: active && sort!.direction === "desc" ? "asc" : "desc",
        })
      }
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={active ? "text-[color:var(--pp-brand)]" : "opacity-30"}>
          {active && sort!.direction === "asc" ? (
            <IconArrowUp className="h-3 w-3" />
          ) : (
            <IconArrowDown className="h-3 w-3" />
          )}
        </span>
      </span>
    </th>
  );
}

export const Pagination: React.FC<{
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}> = ({ page, pageSize, total, onChange }) => {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--pp-border)] px-4 py-3 text-sm text-[color:var(--pp-text-2)]">
      <span className="pp-num">
        {formatInteger(from)}–{formatInteger(to)} de {formatInteger(total)}
      </span>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          aria-label="Página anterior"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          icon={<IconChevronLeft />}
        />
        <span className="pp-num px-2 text-xs">
          {page} / {pageCount}
        </span>
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          aria-label="Próxima página"
          disabled={page >= pageCount}
          onClick={() => onChange(page + 1)}
          icon={<IconChevronRight />}
        />
      </div>
    </div>
  );
};

// ---------- Modal e painel lateral ----------

const useEscape = (active: boolean, onClose: () => void) => {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, onClose]);
};

const MODAL_WIDTHS = { sm: 420, md: 560, lg: 720, xl: 960 } as const;

/**
 * Modal do painel. Fica dentro de .pp-admin quando renderizado no lugar; com
 * `portal` vai para o body (precisa da classe pp-admin para herdar o tema).
 */
export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: keyof typeof MODAL_WIDTHS;
  /** Impede fechar (ex.: enquanto salva) */
  locked?: boolean;
}> = ({ open, onClose, title, description, children, footer, size = "md", locked }) => {
  const close = () => {
    if (!locked) onClose();
  };
  useEscape(open, close);
  if (!open) return null;
  return createPortal(
    <div className="pp-admin" style={{ minHeight: 0, background: "transparent" }}>
      <div className="pp-modal-backdrop" onMouseDown={close}>
        <div
          className="pp-modal"
          role="dialog"
          aria-modal="true"
          style={{ maxWidth: MODAL_WIDTHS[size] }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {(title || description) && (
            <div className="pp-modal-header">
              <div className="min-w-0">
                {title && (
                  <h2 className="text-lg font-semibold text-[color:var(--pp-text)]">
                    {title}
                  </h2>
                )}
                {description && (
                  <p className="mt-1 text-sm text-[color:var(--pp-text-2)]">
                    {description}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                aria-label="Fechar"
                onClick={close}
                disabled={locked}
                icon={<IconX />}
              />
            </div>
          )}
          <div className="pp-modal-body">{children}</div>
          {footer && <div className="pp-modal-footer">{footer}</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export const Drawer: React.FC<{
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}> = ({ open, onClose, title, description, children, footer }) => {
  useEscape(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="pp-admin" style={{ minHeight: 0, background: "transparent" }}>
      <div className="pp-modal-backdrop" style={{ alignItems: "stretch" }} onMouseDown={onClose} />
      <aside className="pp-drawer" role="dialog" aria-modal="true">
        <div className="pp-modal-header">
          <div className="min-w-0">
            {title && (
              <h2 className="text-lg font-semibold text-[color:var(--pp-text)]">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-1 text-sm text-[color:var(--pp-text-2)]">
                {description}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label="Fechar"
            onClick={onClose}
            icon={<IconX />}
          />
        </div>
        <div className="pp-modal-body">{children}</div>
        {footer && <div className="pp-modal-footer">{footer}</div>}
      </aside>
    </div>,
    document.body,
  );
};

// ---------- Estilo dos gráficos (recharts) ----------

export const CHART_COLORS = [
  "#2563eb",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
  "#64748b",
];

export const chartAxisProps = {
  stroke: "#94a3b8",
  fontSize: 12,
  tickLine: false,
  axisLine: false,
} as const;

export const chartGridProps = {
  stroke: "#eef0f5",
  strokeDasharray: "0",
  vertical: false,
} as const;

export const chartTooltipProps = {
  cursor: { fill: "rgba(37, 99, 235, 0.06)" },
  contentStyle: {
    borderRadius: 12,
    border: "1px solid #e6e8ef",
    boxShadow: "0 12px 32px -12px rgba(15, 23, 42, 0.25)",
    fontSize: 13,
    padding: "8px 12px",
  },
  labelStyle: { color: "#0f172a", fontWeight: 600, marginBottom: 4 },
} as const;

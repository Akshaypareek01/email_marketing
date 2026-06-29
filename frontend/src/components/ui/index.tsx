'use client';

/**
 * Shared UI kit — production primitives per docs/DESIGN.md.
 * Dependency-free (Tailwind 4 + design tokens in globals.css).
 */
import Link from 'next/link';
import {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  ReactNode,
  forwardRef,
} from 'react';

/* ----------------------------- cn helper ----------------------------- */
export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

/* ------------------------------- Button ------------------------------ */
type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const variantCls: Record<Variant, string> = {
  primary: 'bg-[var(--primary)] text-white shadow-sm hover:bg-[var(--primary-600)]',
  secondary: 'bg-muted text-foreground hover:bg-slate-200',
  outline: 'border border-border bg-white text-foreground hover:bg-muted',
  ghost: 'text-foreground hover:bg-muted',
  destructive: 'bg-[var(--danger)] text-white shadow-sm hover:brightness-95',
  link: 'text-[var(--primary)] underline-offset-4 hover:underline',
};
const sizeCls: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-sm',
  icon: 'h-10 w-10',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/40',
        'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60',
        variantCls[variant],
        sizeCls[size],
        className
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

/** Link styled as a button. */
export function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all active:scale-[0.98]',
        variantCls[variant],
        sizeCls[size],
        className
      )}
    >
      {children}
    </Link>
  );
}

/* ------------------------------ Spinner ------------------------------ */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('animate-spin', className)} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4Z" />
    </svg>
  );
}

/* ------------------------------- Input ------------------------------- */
interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldProps>(
  function Input({ label, hint, error, className, id, ...rest }, ref) {
    const inputId = id || rest.name;
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-foreground">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'h-10 w-full rounded-lg border bg-white px-3 text-sm outline-none transition',
            'placeholder:text-muted-foreground/70',
            'focus:ring-2 focus:ring-[var(--primary)]/30',
            error ? 'border-[var(--danger)] focus:ring-[var(--danger)]/30' : 'border-border focus:border-[var(--primary)]',
            className
          )}
          {...rest}
        />
        {error ? (
          <p className="text-xs text-[var(--danger)]">{error}</p>
        ) : hint ? (
          <p className="text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </div>
    );
  }
);

/* ------------------------------ Select ------------------------------- */
export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & FieldProps
>(function Select({ label, hint, error, className, id, children, ...rest }, ref) {
  const selectId = id || rest.name;
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={selectId} className="block text-sm font-medium text-foreground">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        className={cn(
          'h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none transition',
          'focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/30',
          className
        )}
        {...rest}
      >
        {children}
      </select>
      {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
});

/* ----------------------------- Textarea ------------------------------ */
export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps
>(function Textarea({ label, hint, error, className, id, ...rest }, ref) {
  const taId = id || rest.name;
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={taId} className="block text-sm font-medium text-foreground">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={taId}
        className={cn(
          'w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none transition',
          'focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/30',
          className
        )}
        {...rest}
      />
      {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
});

/* -------------------------------- Card ------------------------------- */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-xl border border-border bg-card shadow-sm', className)}>{children}</div>
  );
}
export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
      <div>
        <h3 className="text-base font-semibold">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('p-5', className)}>{children}</div>;
}

/* ------------------------------- Badge ------------------------------- */
export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'primary';
const toneCls: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-600',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-700',
  info: 'bg-sky-100 text-sky-700',
  primary: 'bg-indigo-100 text-indigo-700',
};
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', toneCls[tone], className)}>
      {children}
    </span>
  );
}

/** Maps common status strings → badge tone. */
export function statusTone(status?: string): Tone {
  switch (status) {
    case 'active':
    case 'verified':
    case 'delivered':
    case 'healthy':
      return 'success';
    case 'pending':
    case 'verifying':
    case 'sending':
      return 'info';
    case 'past_due':
    case 'restricted':
    case 'warning':
      return 'warning';
    case 'suspended':
    case 'failed':
    case 'bounced':
    case 'complained':
      return 'danger';
    default:
      return 'neutral';
  }
}

/* ---------------------------- States --------------------------------- */
export function EmptyState({ icon, title, message, action }: { icon?: ReactNode; title: string; message?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-white px-6 py-16 text-center">
      {icon && <div className="mb-3 text-muted-foreground">{icon}</div>}
      <h3 className="text-sm font-semibold">{title}</h3>
      {message && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-slate-200/70', className)} />;
}

/* --------------------------- ConfirmDialog --------------------------- */
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Accessible confirmation modal — the production replacement for window.confirm.
 * Backdrop click and Cancel both dismiss; the confirm button shows a loading state.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  loading = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={() => !loading && onClose()}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className="text-lg font-semibold">
          {title}
        </h2>
        {message && <div className="mt-2 text-sm text-muted-foreground">{message}</div>}
        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={tone === 'danger' ? 'destructive' : 'primary'}
            size="sm"
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

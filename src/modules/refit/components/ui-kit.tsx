import { ReactNode } from "react";
import { Link  } from "react-router-dom";

/* =========================================================================
 * Shared UI primitives for the OceancOS operational module pages.
 * All modules use these so look + feel + state semantics stay consistent.
 * ========================================================================= */

// -------------------- STATUS / PRIORITY BADGES --------------------------

const STATUS_TONES: Record<string, string> = {
  // generic
  draft: "bg-slate-200 text-slate-700",
  submitted: "bg-blue-50 text-blue-700",
  under_review: "bg-blue-50 text-blue-700",
  more_info_required: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  in_progress: "bg-blue-100 text-blue-800",
  completed: "bg-emerald-50 text-emerald-700",
  closed: "bg-slate-100 text-slate-600",
  cancelled: "bg-slate-100 text-slate-500 line-through",
  // crew request specific
  new: "bg-violet-50 text-violet-700",
  triaged: "bg-blue-50 text-blue-700",
  assigned: "bg-blue-50 text-blue-700",
  blocked: "bg-amber-100 text-amber-800",
  awaiting_approval: "bg-amber-50 text-amber-800",
  // PO specific
  sent: "bg-blue-50 text-blue-700",
  received: "bg-emerald-50 text-emerald-700",
  // invoice specific
  paid: "bg-emerald-100 text-emerald-800",
  disputed: "bg-amber-100 text-amber-800",
  // logistics
  planned: "bg-slate-200 text-slate-700",
  booked: "bg-blue-50 text-blue-700",
  in_transit: "bg-blue-100 text-blue-800",
  arrived: "bg-emerald-50 text-emerald-700",
  // inventory
  in_stock: "bg-emerald-50 text-emerald-700",
  low_stock: "bg-amber-50 text-amber-800",
  reorder: "bg-amber-100 text-amber-800",
  on_order: "bg-blue-50 text-blue-700",
  out_of_stock: "bg-red-50 text-red-700",
  retired: "bg-slate-100 text-slate-600",
  // risk
  open: "bg-amber-50 text-amber-800",
  mitigating: "bg-blue-50 text-blue-700",
  accepted: "bg-slate-100 text-slate-700",
  // contractor
  prospect: "bg-slate-200 text-slate-700",
  active: "bg-emerald-50 text-emerald-700",
  suspended: "bg-amber-100 text-amber-800",
  terminated: "bg-red-50 text-red-700",
};

export function StatusBadge({ value }: { value: string | null | undefined }) {
  const v = value ?? "—";
  const tone = STATUS_TONES[v] ?? "bg-slate-100 text-slate-700";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-sm ${tone}`}
    >
      {v.replace(/_/g, " ")}
    </span>
  );
}

const PRIORITY_TONES: Record<string, string> = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-blue-50 text-blue-700",
  high: "bg-amber-50 text-amber-800",
  critical: "bg-red-50 text-red-700",
};
export function PriorityBadge({ value }: { value: string | null | undefined }) {
  const v = value ?? "medium";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-sm ${PRIORITY_TONES[v] ?? "bg-slate-100"}`}
    >
      {v}
    </span>
  );
}

// -------------------- TABLE / LIST WRAPPER -----------------------------

export function ListShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-card border border-black/5 rounded-sm shadow-sm overflow-hidden">
      {children}
    </div>
  );
}

export function ListHeader({ children }: { children: ReactNode }) {
  return (
    <div className="grid bg-paper border-b border-black/5 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

export function ListRow({
  children,
  to,
  onClick,
}: {
  children: ReactNode;
  to?: string;
  onClick?: () => void;
}) {
  const cls =
    "grid items-center px-4 py-3 border-b border-black/5 hover:bg-paper transition cursor-pointer text-sm";
  if (to)
    return (
      <Link to={to} className={cls}>
        {children}
      </Link>
    );
  return (
    <div className={cls} onClick={onClick}>
      {children}
    </div>
  );
}

// -------------------- EMPTY / LOADING / ERROR --------------------------

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="p-10 text-center">
      <div className="mx-auto mb-3 size-10 rounded-full bg-paper border border-black/5 flex items-center justify-center text-muted-foreground">
        ∅
      </div>
      <div className="text-sm font-medium">{title}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingRow({ cols = 5 }: { cols?: number }) {
  return (
    <div className="px-4 py-3 border-b border-black/5">
      <div className="animate-pulse h-4 bg-paper rounded-sm" style={{ width: `${cols * 12}%` }} />
    </div>
  );
}

export function ErrorBlock({ message }: { message: string }) {
  return <div className="p-4 m-4 text-xs text-danger bg-danger/10 rounded-sm">{message}</div>;
}

// -------------------- BUTTONS ------------------------------------------

export function PrimaryBtn({
  children,
  onClick,
  disabled,
  type,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
}) {
  return (
    <button
      type={type ?? "button"}
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-2 bg-navy text-white rounded-sm text-sm font-medium hover:opacity-90 disabled:opacity-50 ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

export function GhostBtn({
  children,
  onClick,
  disabled,
  type,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type ?? "button"}
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-2 bg-white border border-black/10 rounded-sm text-sm hover:bg-secondary disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function DangerBtn({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-2 bg-danger/10 text-danger border border-danger/20 rounded-sm text-sm hover:bg-danger/15 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

// -------------------- FORM PRIMITIVES ----------------------------------

export function Field({
  label,
  required,
  children,
  hint,
  error,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
  hint?: string;
  error?: string | null;
}) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wider text-muted-foreground mb-1">
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </span>
      {children}
      {hint && !error && (
        <span className="block text-[11px] text-muted-foreground mt-1">{hint}</span>
      )}
      {error && <span className="block text-[11px] text-danger mt-1">{error}</span>}
    </label>
  );
}

export const inputCls =
  "w-full px-3 py-2 bg-white border border-input rounded-sm text-sm focus:outline-none focus:ring-1 focus:ring-ring";

// -------------------- DRAWER ------------------------------------------

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex">
      <button aria-label="Close" onClick={onClose} className="flex-1 bg-black/40" />
      <div
        className={`bg-paper border-l border-black/10 shadow-xl flex flex-col w-full ${wide ? "max-w-3xl" : "max-w-md"}`}
      >
        <div className="flex items-center justify-between px-5 h-12 border-b border-black/10">
          <div className="text-xs uppercase tracking-[0.25em] text-ocean font-semibold truncate">
            {title}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-ink text-xs">
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="border-t border-black/10 p-4 bg-card">{footer}</div>}
      </div>
    </div>
  );
}

// -------------------- DETAIL META -------------------------------------

export function MetaGrid({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">{children}</dl>;
}

export function Meta({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-sm mt-0.5">{value ?? "—"}</dd>
    </div>
  );
}

// -------------------- CARDS ------------------------------------------

export function StatCard({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: ReactNode;
  tone?: "ok" | "warn" | "bad";
  sub?: string;
}) {
  const ring =
    tone === "bad" ? "ring-1 ring-danger/30" : tone === "warn" ? "ring-1 ring-warning/30" : "";
  return (
    <div className={`p-5 bg-card border border-black/5 rounded-sm shadow-sm ${ring}`}>
      <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-medium tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="p-6 bg-card border border-black/5 rounded-sm shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-deep">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

// -------------------- FORMATTING ------------------------------------

export const fmtMoney = (n: number | null | undefined, ccy = "USD") => {
  if (n == null) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: ccy,
      maximumFractionDigits: 0,
    }).format(Number(n));
  } catch {
    return `${ccy} ${Number(n).toLocaleString()}`;
  }
};

export const fmtDate = (s: string | null | undefined) =>
  s
    ? new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

export const fmtDateTime = (s: string | null | undefined) =>
  s
    ? new Date(s).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export const startCase = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

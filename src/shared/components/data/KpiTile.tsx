import * as React from 'react';
import { Link } from 'react-router-dom';
import { AlertOctagon, ArrowDown, ArrowUp, CheckCircle2, Minus, RotateCw, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { TONE_BAR, TONE_SURFACE, TONE_TEXT, type Tone } from '@/components/ui/tones';

export type KpiTileState = 'ready' | 'loading' | 'zero' | 'not-enabled' | 'error' | 'no-access';

export interface KpiDelta {
  /** Change against the comparison period, e.g. -2. */
  change: number;
  /** E.g. "vs last month". */
  label?: string;
  /** Which direction is good: `down` for overdue counts, `up` for compliance. */
  goodWhen: 'up' | 'down';
  /** Format the absolute change (default: whole number). */
  format?: (abs: number) => string;
}

export interface KpiTileProps {
  /** Eyebrow label, e.g. "Document alerts". */
  label: string;
  icon?: LucideIcon;
  value?: number | string | null;
  /** Unit after the value in muted text ("%", "h"). */
  unit?: string;
  /** One-line breakdown: "7 certificates · 3 crew documents". */
  sub?: React.ReactNode;
  delta?: KpiDelta;
  /** Alert tone: a 3 px left bar and the value in the tone (danger for overdue / expired). */
  tone?: Tone;
  /** The filtered list this number summarises; the whole tile becomes the link. */
  href?: string;
  /** Defaults to `zero` when `value` is 0, else `ready`. `no-access` renders nothing. */
  state?: KpiTileState;
  zeroLabel?: React.ReactNode;
  notEnabledReason?: React.ReactNode;
  /** For admins: where to switch the source on. */
  enableHref?: string;
  enableLabel?: string;
  errorMessage?: React.ReactNode;
  onRetry?: () => void;
  className?: string;
}

const numberFormat = new Intl.NumberFormat('en-GB');

const formatValue = (value: KpiTileProps['value']): string => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return Number.isFinite(value) ? numberFormat.format(value) : '—';
  return value;
};

function DeltaChip({ change, label, goodWhen, format }: KpiDelta) {
  const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
  const tone: Tone = direction === 'flat' ? 'neutral' : direction === goodWhen ? 'ok' : 'danger';
  const Icon = direction === 'up' ? ArrowUp : direction === 'down' ? ArrowDown : Minus;
  const abs = Math.abs(change);
  const sign = direction === 'up' ? '+' : direction === 'down' ? '−' : '';
  const verdict = direction === 'flat' ? 'no change' : tone === 'ok' ? 'better' : 'worse';
  return (
    <span
      data-delta={direction}
      className={cn(
        'inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums',
        TONE_SURFACE[tone],
      )}
    >
      <Icon aria-hidden="true" className="h-3 w-3" />
      {sign}
      {format ? format(abs) : numberFormat.format(abs)}
      {label ? ` ${label}` : null}
      <span className="sr-only">, {verdict}</span>
    </span>
  );
}

/**
 * KPI tile (gap/10 DS13, §A.9). An e1 card with an eyebrow label, an 18 px
 * icon, the value in `type-kpi` (tabular figures), a one-line breakdown and
 * an optional delta. It always says why a number is missing:
 *
 *   loading      skeleton bars where the value and breakdown will be
 *   zero         "0" and "All clear"
 *   not-enabled  "—" and the reason ("Hours of Rest is off on 3 vessels")
 *   error        "—" and "Could not load", with retry
 *   no-access    nothing (the tile is hidden)
 */
export function KpiTile({
  label,
  icon: Icon,
  value,
  unit,
  sub,
  delta,
  tone,
  href,
  state,
  zeroLabel = 'All clear',
  notEnabledReason = 'Not switched on',
  enableHref,
  enableLabel = 'Switch on',
  errorMessage = 'Could not load',
  onRetry,
  className,
}: KpiTileProps) {
  const resolved: KpiTileState = state ?? (value === 0 ? 'zero' : 'ready');
  if (resolved === 'no-access') return null;

  const isLoading = resolved === 'loading';
  const hasAlert = resolved === 'ready' && tone !== undefined && tone !== 'neutral';
  const showValue = resolved === 'ready' || resolved === 'zero';
  // Interactive children (enable link, retry) must not sit inside the tile link.
  const asLink = Boolean(href) && (resolved === 'ready' || resolved === 'zero');

  let subline: React.ReactNode = null;
  if (isLoading) {
    subline = <Skeleton aria-hidden="true" className="h-3 w-32" />;
  } else if (resolved === 'zero') {
    subline = (
      <span className="inline-flex items-center gap-1 text-sm font-medium text-success">
        <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
        {zeroLabel}
      </span>
    );
  } else if (resolved === 'not-enabled') {
    subline = (
      <span className="text-sm text-muted-foreground">
        {notEnabledReason}
        {enableHref ? (
          <>
            {' · '}
            <Link
              to={enableHref}
              className="whitespace-nowrap rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-ring"
            >
              {enableLabel}
            </Link>
          </>
        ) : null}
      </span>
    );
  } else if (resolved === 'error') {
    subline = (
      <span className="inline-flex flex-wrap items-center gap-2 text-sm font-medium text-critical">
        <AlertOctagon aria-hidden="true" className="h-3.5 w-3.5" />
        {errorMessage}
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-primary underline-offset-4 hover:underline focus-ring"
          >
            <RotateCw aria-hidden="true" className="h-3 w-3" />
            Try again
          </button>
        ) : null}
      </span>
    );
  } else if (sub) {
    subline = <span className="text-sm text-muted-foreground">{sub}</span>;
  }

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="type-eyebrow text-muted-foreground">{label}</span>
        {Icon ? <Icon aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-muted-foreground" strokeWidth={1.75} /> : null}
      </div>
      <div className="mt-3 flex min-h-9 items-baseline gap-1">
        {isLoading ? (
          <Skeleton aria-hidden="true" className="h-8 w-16" />
        ) : (
          <>
            <span
              data-kpi-value=""
              className={cn('type-kpi', hasAlert && tone ? TONE_TEXT[tone] : showValue ? 'text-foreground' : 'text-muted-foreground')}
            >
              {showValue ? formatValue(resolved === 'zero' && (value === undefined || value === null) ? 0 : value) : '—'}
            </span>
            {showValue && unit ? <span className="text-sm text-muted-foreground">{unit}</span> : null}
          </>
        )}
      </div>
      {subline ? <div className="mt-1 min-h-5">{subline}</div> : null}
      {delta && showValue ? (
        <div className="mt-auto pt-3">
          <DeltaChip {...delta} />
        </div>
      ) : null}
      {isLoading ? <span className="sr-only">Loading {label}</span> : null}
    </>
  );

  const classes = cn(
    'relative flex min-h-[132px] flex-col rounded-lg border bg-card p-[var(--card-pad)] text-card-foreground shadow-sm',
    hasAlert && tone && cn('border-l-[3px]', TONE_BAR[tone]),
    asLink && 'transition-colors duration-quick ease-tide hover:bg-accent/40 focus-ring',
    className,
  );

  const dataProps = { 'data-state': resolved, ...(hasAlert && tone ? { 'data-tone': tone } : {}) };

  if (asLink && href) {
    return (
      <Link to={href} className={classes} {...dataProps}>
        {content}
      </Link>
    );
  }
  return (
    <div className={classes} aria-busy={isLoading || undefined} {...dataProps}>
      {content}
    </div>
  );
}

/** KPI grid (§A.9): 6 across at ≥ 1440 px, 3 at ≥ 1024 px, 2 below. */
export function KpiGrid({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('grid grid-cols-2 gap-4 lg:grid-cols-3 min-[1440px]:grid-cols-6', className)} {...props} />;
}

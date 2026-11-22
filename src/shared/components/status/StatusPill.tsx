import * as React from 'react';
import { AlertOctagon, AlertTriangle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TONE_FILL, TONE_SURFACE, type Tone } from '@/components/ui/tones';
import { humanizeStatus, normalizeStatusKey, statusMeta, type StatusDomain } from './statusTone';

export interface StatusPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Explicit tone. Wins over the registry tone. */
  tone?: Tone;
  /** With `status`: tone and label come from `statusTone(domain, status)`. */
  domain?: StatusDomain;
  status?: string | null;
  /** Explicit label (children also work). Wins over the registry label. */
  label?: React.ReactNode;
  /**
   * Leading icon. Danger, warn and orange tones get a warning icon by default
   * so they read without colour; other tones get a dot. `null` forces the dot.
   */
  icon?: LucideIcon | null;
  /** `sm` 20 px (24 px in comfortable density), `md` 24 px. */
  size?: 'sm' | 'md';
}

const DEFAULT_ICON: Partial<Record<Tone, LucideIcon>> = {
  danger: AlertOctagon,
  orange: AlertTriangle,
  warn: AlertTriangle,
};

/**
 * Status pill (gap/10 §A.8): full radius, `{tone}-muted` fill, `{tone}` text,
 * `{tone}` / 25 % border, 12 px / 600 label. The label is always present, so
 * the meaning never depends on colour alone.
 *
 *   <StatusPill domain="incident" status={row.status} />
 *   <StatusPill tone="purple">Awaiting company sign-off</StatusPill>
 */
export const StatusPill = React.forwardRef<HTMLSpanElement, StatusPillProps>(
  ({ tone, domain, status, label, icon, size = 'sm', className, children, ...props }, ref) => {
    const meta = domain ? statusMeta(domain, status) : undefined;
    const resolvedTone: Tone = tone ?? meta?.tone ?? 'neutral';
    const text = children ?? label ?? meta?.label ?? humanizeStatus(status);
    const Icon = icon === null ? undefined : (icon ?? DEFAULT_ICON[resolvedTone]);

    return (
      <span
        ref={ref}
        data-tone={resolvedTone}
        data-status={status != null ? normalizeStatusKey(status) || undefined : undefined}
        className={cn(
          'inline-flex max-w-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border font-sans text-xs font-semibold leading-none',
          size === 'md' ? 'h-6 px-2.5' : 'h-5 px-2 [[data-density=comfortable]_&]:h-6',
          TONE_SURFACE[resolvedTone],
          className,
        )}
        {...props}
      >
        {Icon ? (
          <Icon aria-hidden="true" className="h-3 w-3 shrink-0" strokeWidth={2.25} />
        ) : (
          <span aria-hidden="true" className={cn('h-1.5 w-1.5 shrink-0 rounded-full', TONE_FILL[resolvedTone])} />
        )}
        <span className="truncate">{text}</span>
      </span>
    );
  },
);
StatusPill.displayName = 'StatusPill';

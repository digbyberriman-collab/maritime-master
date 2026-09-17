import { differenceInCalendarDays, format, isValid, parseISO } from 'date-fns';

export const formatDate = (value: string | Date | null | undefined, pattern = 'dd MMM yyyy'): string => {
  if (!value) return '—';
  const d = typeof value === 'string' ? parseISO(value) : value;
  return isValid(d) ? format(d, pattern) : '—';
};

export const formatDateTime = (value: string | Date | null | undefined): string => formatDate(value, 'dd MMM yyyy HH:mm');

export const daysUntil = (value: string | Date | null | undefined): number | null => {
  if (!value) return null;
  const d = typeof value === 'string' ? parseISO(value) : value;
  if (!isValid(d)) return null;
  return differenceInCalendarDays(d, new Date());
};

export type ExpiryTone = 'expired' | 'critical' | 'warning' | 'ok' | 'none';

/** 0 days or less = expired; ≤30 = critical; ≤90 = warning. */
export const expiryTone = (value: string | Date | null | undefined): ExpiryTone => {
  const days = daysUntil(value);
  if (days === null) return 'none';
  if (days < 0) return 'expired';
  if (days <= 30) return 'critical';
  if (days <= 90) return 'warning';
  return 'ok';
};

export const expiryLabel = (value: string | Date | null | undefined): string => {
  const days = daysUntil(value);
  if (days === null) return 'No date';
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return 'Expires today';
  return `${days}d remaining`;
};

export const toneClass: Record<ExpiryTone, string> = {
  expired: 'bg-destructive/10 text-destructive border-destructive/20',
  critical: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  warning: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  ok: 'bg-green-500/10 text-green-600 border-green-500/20',
  none: 'bg-muted text-muted-foreground border-border',
};

export const humanise = (value: string | null | undefined): string =>
  value ? value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—';

/** Money stored as integer minor units (e.g. cents). */
export const formatMinor = (minor: number | null | undefined, currency: string | null | undefined, locale = 'en-GB'): string => {
  if (minor === null || minor === undefined) return '—';
  const ccy = currency || 'EUR';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: ccy, minimumFractionDigits: 2 }).format(minor / 100);
  } catch {
    return `${ccy} ${(minor / 100).toFixed(2)}`;
  }
};

export const toMinor = (major: number | string | null | undefined): number | null => {
  if (major === null || major === undefined || major === '') return null;
  const n = typeof major === 'string' ? Number(major.replace(/[^0-9.-]/g, '')) : major;
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
};

export const fromMinor = (minor: number | null | undefined): string => (minor === null || minor === undefined ? '' : (minor / 100).toFixed(2));

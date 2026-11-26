/**
 * Small shared pieces of Fleet › Training and the vessel Crew Training
 * register (X5-07B): the freshness stamp with Refresh (D-88), a notice
 * line, the per-currency money cell and the "not set up yet" wording
 * (D-01).
 *
 * Tokens only; 44 px targets on coarse pointers; usable at 390 px.
 */
import React from 'react';
import { Info, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { currencyOrder, formatMoney, formatUpdatedUtc, type CurrencyTotals } from './fleetTrainingModel';

export const COARSE = '[@media(pointer:coarse)]:min-h-11';
export const COARSE_ICON = '[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11';

/** What a control says while the 040600 objects are not in the database (D-01). */
export const NOT_SET_UP_YET = 'Not set up yet';

/** One freshness stamp and Refresh, for PageHeader's actions slot (D-88). */
export function FreshnessActions({
  updatedAt,
  refreshing,
  onRefresh,
  testId,
}: {
  updatedAt: number | null;
  refreshing: boolean;
  onRefresh: () => void;
  testId?: string;
}) {
  return (
    <>
      {updatedAt ? (
        <span className="type-caption tabular-nums text-muted-foreground" data-testid={testId}>
          {formatUpdatedUtc(updatedAt)}
        </span>
      ) : null}
      <Button type="button" variant="outline" size="sm" className={COARSE} onClick={onRefresh} disabled={refreshing}>
        <RefreshCw aria-hidden="true" className={cn('h-4 w-4', refreshing && 'motion-safe:animate-spin')} />
        Refresh
      </Button>
    </>
  );
}

/** A quiet line of context (D-01 notes, rules the page applies). */
export function Notice({ children, testId, className }: { children: React.ReactNode; testId?: string; className?: string }) {
  return (
    <p className={cn('flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground', className)} data-testid={testId}>
      <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** Amounts per currency, one per line, never converted; a dash when there is nothing. */
export function CurrencyLines({ totals, empty = '–', className }: { totals: CurrencyTotals; empty?: string; className?: string }) {
  const codes = currencyOrder(totals);
  if (!codes.length) return <span className="text-muted-foreground">{empty}</span>;
  return (
    <span className={cn('flex flex-col tabular-nums', className)}>
      {codes.map((code) => (
        <span key={code} className="whitespace-nowrap">
          {formatMoney(code, totals.get(code) ?? 0)}
        </span>
      ))}
    </span>
  );
}

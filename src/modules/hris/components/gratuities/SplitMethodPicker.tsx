import React, { useEffect, useMemo, useState } from 'react';
import { Calculator, FlaskConical, Loader2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatMinor } from '@/modules/hris/lib/format';
import {
  SPLIT_METHODS,
  SPLIT_METHOD_DESCRIPTION,
  SPLIT_METHOD_LABEL,
  asSplitMethod,
  netAmountMinor,
  previewAllMethods,
  previewParticipants,
  type GratuitySplitMethod,
} from '@/modules/hris/lib/gratuities';
import { sumShares } from '@/modules/hris/lib/payroll/engine';
import type { GratuityPoolDetail } from '@/modules/hris/hooks/useGratuities';

interface SplitMethodPickerProps {
  pool: GratuityPoolDetail;
  canEdit: boolean;
  busy?: boolean;
  /** Persist the method on the pool and re-run the engine. */
  onApply: (method: GratuitySplitMethod) => Promise<void>;
}

/**
 * What-if comparison of the four split methods, computed client-side with
 * the engine mirror. Nothing is persisted until "Apply & recalculate".
 * Include/exclude checkboxes here are preview-only; the real exclusion
 * lives in the distributions table.
 */
export const SplitMethodPicker: React.FC<SplitMethodPickerProps> = ({ pool, canEdit, busy, onApply }) => {
  const saved = asSplitMethod(pool.split_method);
  const [selected, setSelected] = useState<GratuitySplitMethod>(saved);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setSelected(saved);
    setOverrides({});
  }, [saved, pool.id, pool.calculated_at]);

  const net = netAmountMinor(pool);
  const participants = useMemo(() => previewParticipants(pool.distributions, overrides), [pool.distributions, overrides]);
  const previews = useMemo(() => previewAllMethods(net, participants), [net, participants]);
  const totals = useMemo(
    () => Object.fromEntries(SPLIT_METHODS.map((m) => [m, sumShares(Array.from(previews[m].values()))])) as Record<GratuitySplitMethod, number>,
    [previews],
  );
  const hasOverrides = Object.keys(overrides).length > 0;
  const dirty = selected !== saved;
  const noShares = pool.distributions.length === 0;

  /** Flip the preview exclusion; drop the override when it lands back on the persisted value. */
  const toggle = (profileId: string, persistedExcluded: boolean) =>
    setOverrides((prev) => {
      const next = { ...prev };
      const nowExcluded = !(prev[profileId] ?? persistedExcluded);
      if (nowExcluded === persistedExcluded) delete next[profileId];
      else next[profileId] = nowExcluded;
      return next;
    });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <FlaskConical className="h-4 w-4 text-primary" /> Split method
            </CardTitle>
            <CardDescription>Compare what each crew member would receive under every method before you recalculate.</CardDescription>
          </div>
          {(hasOverrides || dirty) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelected(saved);
                setOverrides({});
              }}
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset preview
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" role="radiogroup" aria-label="Split method">
          {SPLIT_METHODS.map((m) => {
            const active = selected === m;
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={!canEdit || busy}
                onClick={() => setSelected(m)}
                className={cn(
                  'flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70',
                  active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border bg-card hover:bg-accent/50',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{SPLIT_METHOD_LABEL[m]}</span>
                  {m === saved && (
                    <Badge variant="secondary" className="text-[10px] uppercase">
                      Saved
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{SPLIT_METHOD_DESCRIPTION[m]}</span>
              </button>
            );
          })}
        </div>

        {noShares ? (
          <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            Calculate the pool to load the crew onboard for this period. The comparison will appear here.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Crew</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                  <TableHead className="text-center">Include</TableHead>
                  {SPLIT_METHODS.map((m) => (
                    <TableHead key={m} className={cn('text-right whitespace-nowrap', selected === m && 'bg-primary/5 text-foreground')}>
                      {SPLIT_METHOD_LABEL[m]}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pool.distributions.map((d) => {
                  const excluded = overrides[d.profile_id] ?? d.excluded;
                  return (
                    <TableRow key={d.id} className={cn(excluded && 'text-muted-foreground')}>
                      <TableCell className="font-medium">
                        {d.crew_name}
                        {d.profile?.rank && <span className="ml-1 text-xs text-muted-foreground">· {d.profile.rank}</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{d.days_onboard}</TableCell>
                      <TableCell className="text-right tabular-nums">{Number(d.points)}</TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={!excluded}
                          disabled={!canEdit || busy}
                          onCheckedChange={() => toggle(d.profile_id, d.excluded)}
                          aria-label={`Include ${d.crew_name} in the preview`}
                        />
                      </TableCell>
                      {SPLIT_METHODS.map((m) => {
                        const share = previews[m].get(d.profile_id);
                        return (
                          <TableCell key={m} className={cn('text-right tabular-nums', selected === m && 'bg-primary/5 font-medium text-foreground')}>
                            {excluded ? '—' : formatMinor(share?.amountMinor ?? 0, pool.currency)}
                            {!excluded && share && <span className="ml-1 text-[10px] text-muted-foreground">{(share.shareRatio * 100).toFixed(1)}%</span>}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
                <TableRow className="bg-muted/40 font-medium">
                  <TableCell colSpan={4}>Total (net {formatMinor(net, pool.currency)})</TableCell>
                  {SPLIT_METHODS.map((m) => (
                    <TableCell key={m} className={cn('text-right tabular-nums', selected === m && 'bg-primary/5')}>
                      {formatMinor(totals[m], pool.currency)}
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {hasOverrides
              ? 'Preview only: include/exclude changes here are not saved. Use the distributions table to exclude someone.'
              : dirty
                ? `Applying switches the pool to “${SPLIT_METHOD_LABEL[selected]}” and recalculates every share.`
                : 'Saved shares use the highlighted method.'}
          </p>
          {canEdit && (
            <Button size="sm" disabled={!dirty || busy} onClick={() => void onApply(selected)}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calculator className="mr-2 h-4 w-4" />}
              Apply & recalculate
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default SplitMethodPicker;

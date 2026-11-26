/**
 * The vessel's breach review (gap/04 C42, W6; T-142), a side panel over the
 * board opened by `?breaches=open` (Non-compliant only: not yet accepted or
 * dismissed) or `?breaches=all`, for the board's month.
 *
 * Serious breaches come first, then the ones still to review, then by day.
 * Each row shows the rule, what was measured against the limit and the
 * deficit in hours (a numeric column), its state, and the review outcomes
 * the server allows the viewer (lib/horBoard.ts reviewOptions): Accept with
 * justification or Request correction for an open breach; Accept or Dismiss
 * once a correction was requested. The review form is RHF + zod (a
 * justification is required to accept); a correction reopens the month for
 * the crew member (the server does it and says so).
 *
 * D-01: while the breach RPCs are missing the panel says the review is not
 * set up yet; any other error is an error with Try again. A table from the
 * tablet width up, cards below it.
 */
import React, { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ShieldAlert, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { DataTable, type DataTableColumn } from '@/shared/components/data/DataTable';
import { TABLET_MIN_WIDTH, useMinWidth } from '@/shared/components/data/useMinWidth';
import { PageEmpty, PageError, PageLoading } from '@/shared/components/states';
import { StatusPill } from '@/shared/components/status';
import { notify } from '@/shared/lib/notify';
import {
  BREACH_FILTERS,
  BREACH_FILTER_LABEL,
  MONTH_NAMES,
  NOTE_MAX,
  REVIEW_DONE_TEXT,
  REVIEW_NOTE_LABEL,
  REVIEW_OUTCOME_HINT,
  REVIEW_OUTCOME_LABEL,
  breachFigures,
  breachReviewSchema,
  breachState,
  deficitText,
  displayName,
  filterBreaches,
  isOpenBreach,
  reviewOptions,
  ruleLabel,
  sortBreaches,
  type BreachFilter,
  type BreachReviewValues,
  type ReviewOutcome,
} from '../../lib/horBoard';
import { boardErrorText } from '../../hooks/useVesselBoard';
import { useReviewBreach, useVesselBreaches } from '../../hooks/useBreaches';
import type { WorkRestVesselBreachRow } from '../../types/db.pending';

const COARSE = '[@media(pointer:coarse)]:h-11';

export interface BreachReviewPanelProps {
  vesselId: string;
  vesselName: string;
  year: number;
  month: number;
  /** First and last day of the month (YYYY-MM-DD). */
  from: string;
  to: string;
  /** The panel is open with this filter; null when closed. */
  filter: BreachFilter | null;
  onFilterChange: (filter: BreachFilter | null) => void;
}

const shortDay = (day: string | null): string => {
  if (!day) return '–';
  return `${Number(day.slice(8, 10))} ${MONTH_NAMES[Number(day.slice(5, 7)) - 1].slice(0, 3)}`;
};

const crewName = (r: WorkRestVesselBreachRow) => displayName({ preferredName: r.preferred_name, firstName: r.first_name, lastName: r.last_name });

export const BreachReviewPanel: React.FC<BreachReviewPanelProps> = ({ vesselId, vesselName, year, month, from, to, filter, onFilterChange }) => {
  const open = filter !== null;
  const breaches = useVesselBreaches({ vesselId, from, to, enabled: open });
  const [reviewing, setReviewing] = useState<WorkRestVesselBreachRow | null>(null);
  const wide = useMinWidth(TABLET_MIN_WIDTH);
  const title = `Breaches, ${MONTH_NAMES[month - 1]} ${year}`;

  const all = useMemo(() => (breaches.data?.applied ? sortBreaches(breaches.data.data) : []), [breaches.data]);
  const counts = useMemo(() => ({ open: all.filter(isOpenBreach).length, all: all.length }), [all]);
  const rows = useMemo(() => filterBreaches(all, filter ?? 'open'), [all, filter]);

  let body: React.ReactNode;
  if (breaches.isLoading) body = <PageLoading variant="list" rows={4} label="Loading the breaches" />;
  else if (breaches.error) body = <PageError error={breaches.error} variant="inline" title="The breaches could not load" onRetry={() => void breaches.refetch()} />;
  else if (breaches.data && !breaches.data.applied) {
    body = (
      <PageEmpty
        icon={ShieldAlert}
        title="Breach review is not set up yet"
        body="It becomes available once the hours-of-rest update is applied to this database."
        headingLevel={3}
        bordered
      />
    );
  } else if (!all.length) {
    body = <PageEmpty icon={ShieldAlert} title="No breaches this month" body="Nobody's records break the rest rules this month." headingLevel={3} bordered />;
  } else {
    body = (
      <div className="space-y-3">
        <div role="group" aria-label="Which breaches" className="flex flex-wrap gap-2">
          {BREACH_FILTERS.map((f) => {
            const active = (filter ?? 'open') === f;
            return (
              <button
                key={f}
                type="button"
                aria-pressed={active}
                onClick={() => onFilterChange(f)}
                data-breach-filter={f}
                className={cn(
                  'focus-ring inline-flex h-8 items-center gap-1.5 rounded-full border px-3 type-body-sm font-medium transition-colors duration-quick ease-tide',
                  COARSE,
                  active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-accent',
                )}
              >
                {BREACH_FILTER_LABEL[f]}
                <span className="tabular-nums opacity-80">{counts[f]}</span>
              </button>
            );
          })}
        </div>
        {!rows.length ? (
          <PageEmpty filtered title="Every breach this month is reviewed" body="Show all breaches to see the reviews." onClearFilters={() => onFilterChange('all')} headingLevel={3} bordered />
        ) : wide ? (
          <BreachTable rows={rows} onReview={setReviewing} />
        ) : (
          <BreachCards rows={rows} onReview={setReviewing} />
        )}
      </div>
    );
  }

  return (
    <Sheet open={open} onOpenChange={(o) => (o ? undefined : onFilterChange(null))}>
      <SheetContent side="right" hideClose className="flex w-full flex-col gap-0 p-0 sm:max-w-3xl xl:max-w-4xl" aria-describedby="hor-breaches-description" data-breach-panel="">
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0 space-y-1">
            <p className="type-eyebrow text-muted-foreground">{vesselName}</p>
            <SheetTitle className="type-h3">{title}</SheetTitle>
            <SheetDescription id="hor-breaches-description" className="type-body-sm text-muted-foreground">
              Accept a breach with a justification, or send it back to the crew member to correct the record. Serious breaches come first.
            </SheetDescription>
          </div>
          <SheetClose asChild>
            <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label="Close the breaches">
              <X aria-hidden="true" />
            </Button>
          </SheetClose>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{body}</div>
        {reviewing ? <ReviewDialog vesselId={vesselId} breach={reviewing} onClose={() => setReviewing(null)} /> : null}
      </SheetContent>
    </Sheet>
  );
};

const SeverityPill: React.FC<{ row: WorkRestVesselBreachRow }> = ({ row }) =>
  row.is_serious ? (
    <StatusPill tone="danger" data-serious="">
      Serious
    </StatusPill>
  ) : null;

const ReviewCell: React.FC<{ row: WorkRestVesselBreachRow; onReview: (row: WorkRestVesselBreachRow) => void }> = ({ row, onReview }) => {
  const options = reviewOptions(row);
  if (!options.length) {
    return row.reviewer_name ? <span className="type-caption text-muted-foreground">By {row.reviewer_name}</span> : null;
  }
  return (
    <Button type="button" variant="outline" size="sm" className={COARSE} onClick={() => onReview(row)} aria-label={`Review the breach of ${crewName(row)} on ${shortDay(row.breach_day)}`}>
      Review
    </Button>
  );
};

const BreachTable: React.FC<{ rows: readonly WorkRestVesselBreachRow[]; onReview: (row: WorkRestVesselBreachRow) => void }> = ({ rows, onReview }) => {
  const columns = useMemo<DataTableColumn<WorkRestVesselBreachRow>[]>(
    () => [
      {
        id: 'crew',
        header: 'Crew member',
        sticky: true,
        minWidth: 160,
        value: (r) => crewName(r),
        cell: (r) => (
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-foreground">{crewName(r)}</span>
            <span className="truncate type-caption text-muted-foreground">{r.position_name ?? r.department_label ?? ''}</span>
          </span>
        ),
      },
      { id: 'day', header: 'Day', kind: 'date', value: (r) => r.breach_day, cell: (r) => shortDay(r.breach_day) },
      {
        id: 'rule',
        header: 'Rule',
        minWidth: 180,
        value: (r) => ruleLabel(r.rule_code),
        cell: (r) => (
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="whitespace-nowrap">{ruleLabel(r.rule_code)}</span>
            <span className="type-caption text-muted-foreground">{breachFigures(r.rule_code, r.measured_value, r.threshold_value) ?? r.rule_description ?? ''}</span>
          </span>
        ),
      },
      { id: 'deficit', header: 'Deficit', headerLabel: 'Hours short', kind: 'number', value: (r) => r.deficit_hours, cell: (r) => deficitText(r.deficit_hours), emptyReason: 'Not an hours rule' },
      {
        id: 'state',
        header: 'State',
        value: (r) => breachState(r),
        cell: (r) => (
          <span className="flex flex-col items-start gap-1">
            <SeverityPill row={r} />
            <StatusPill domain="work_rest_nc" status={breachState(r)} />
          </span>
        ),
      },
      { id: 'review', header: <span className="sr-only">Review</span>, headerLabel: 'Review', sortable: false, cell: (r) => <ReviewCell row={r} onReview={onReview} /> },
    ],
    [onReview],
  );
  return (
    <DataTable
      label="Breaches"
      noun={{ one: 'breach', other: 'breaches' }}
      data={rows}
      columns={columns}
      getRowId={(r) => r.nc_id}
      rowLabel={(r) => `${crewName(r)}, ${shortDay(r.breach_day)}`}
      searchable={false}
      showDensityToggle={false}
    />
  );
};

const BreachCards: React.FC<{ rows: readonly WorkRestVesselBreachRow[]; onReview: (row: WorkRestVesselBreachRow) => void }> = ({ rows, onReview }) => (
  <ul aria-label="Breaches" className="space-y-2">
    {rows.map((r) => (
      <li
        key={r.nc_id}
        className={cn('space-y-2 rounded-lg border p-3', r.is_serious && isOpenBreach(r) ? 'border-critical/40 bg-critical-muted/40' : 'border-border bg-card')}
        data-breach={r.nc_id}
      >
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{crewName(r)}</p>
            <p className="truncate type-caption text-muted-foreground">
              {shortDay(r.breach_day)} · {ruleLabel(r.rule_code)}
            </p>
          </div>
          <StatusPill domain="work_rest_nc" status={breachState(r)} />
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 type-body-sm">
          <dt className="text-muted-foreground">Deficit</dt>
          <dd className="tabular-nums text-foreground">{deficitText(r.deficit_hours)}</dd>
          <dt className="text-muted-foreground">Measured</dt>
          <dd className="min-w-0 text-foreground">{breachFigures(r.rule_code, r.measured_value, r.threshold_value) ?? '–'}</dd>
        </dl>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SeverityPill row={r} />
          <span className="ml-auto">
            <ReviewCell row={r} onReview={onReview} />
          </span>
        </div>
      </li>
    ))}
  </ul>
);

const ReviewDialog: React.FC<{ vesselId: string; breach: WorkRestVesselBreachRow; onClose: () => void }> = ({ vesselId, breach, onClose }) => {
  const options = reviewOptions(breach);
  const review = useReviewBreach(vesselId);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<BreachReviewValues>({
    resolver: zodResolver(breachReviewSchema),
    defaultValues: { outcome: options[0] ?? 'accepted', note: '' },
  });
  const outcome = form.watch('outcome') as ReviewOutcome;
  const busy = review.isPending || form.formState.isSubmitting;
  const name = crewName(breach);

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const out = await review.mutateAsync({ ncId: breach.nc_id, outcome: values.outcome, note: values.note.trim() || null });
      notify.success(REVIEW_DONE_TEXT[values.outcome]);
      if (out.reopened) notify.info(`${name}'s month is reopened so they can correct the record.`);
      onClose();
    } catch (e) {
      setError(boardErrorText(e));
    }
  });

  return (
    <Dialog open onOpenChange={(o) => (o || busy ? undefined : onClose())}>
      <DialogContent data-review-dialog="">
        <DialogHeader>
          <DialogTitle>Review the breach</DialogTitle>
          <DialogDescription>
            {name}, {shortDay(breach.breach_day)}: {ruleLabel(breach.rule_code)}
            {breach.deficit_hours !== null ? `, ${deficitText(breach.deficit_hours)} short` : ''}.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={submit} className="space-y-4" noValidate aria-label="Review the breach">
            <FormField
              control={form.control}
              name="outcome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Outcome</FormLabel>
                  <FormControl>
                    <RadioGroup value={field.value} onValueChange={field.onChange} className="gap-2">
                      {options.map((o) => (
                        <label
                          key={o}
                          htmlFor={`review-${o}`}
                          className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 has-[[data-state=checked]]:border-primary"
                        >
                          <RadioGroupItem id={`review-${o}`} value={o} className="mt-0.5" />
                          <span className="space-y-0.5">
                            <span className="block type-body-sm font-medium text-foreground">{REVIEW_OUTCOME_LABEL[o]}</span>
                            <span className="block type-caption text-muted-foreground">{REVIEW_OUTCOME_HINT[o]}</span>
                          </span>
                        </label>
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{REVIEW_NOTE_LABEL[outcome] ?? 'Note'}</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} maxLength={NOTE_MAX} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !options.length}>
                {busy ? 'Saving…' : REVIEW_OUTCOME_LABEL[outcome]}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default BreachReviewPanel;

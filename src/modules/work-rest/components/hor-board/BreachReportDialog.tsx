/**
 * Create a consolidated hours-of-rest breach report (gap/04 C42, W6;
 * T-142; D-X1-14, D-X1-23; X1-08B), from the report page (and the board,
 * which links to the page with `?new=1`).
 *
 * The final approver chooses a period, the reviewed breaches of the vessel
 * in it that are in no report yet (accepted or dismissed; open breaches and
 * ones waiting on a correction cannot be reported), and the recipients
 * among the company's fleet HR and DPA. Create report calls
 * work_rest_breach_report_create, which checks every rule again; a refusal
 * is shown in words, naming the breach at fault when the server does.
 * STORM never sends a report on its own, and nothing here is emailed: the
 * recipients are told in STORM (D-249), so the copy says "Report shared in
 * STORM with <n> people". No file is stored (D-X1-23): the PDF is rebuilt
 * on demand from the report's breaches on the report page.
 *
 * D-01: while the breach list or the recipients RPC is missing the dialog
 * says breach reports are not set up yet and Create stays off.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertOctagon, Info, Send } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { StatusPill } from '@/shared/components/status';
import { notify } from '@/shared/lib/notify';
import { deficitText, ruleLabel } from '../../lib/horBoard';
import {
  BREACH_REPORT_LIMITS,
  BREACH_REPORT_NOT_SET_UP,
  RECIPIENT_KIND_LABEL,
  REFUSALS_NAMING_A_BREACH,
  breachReportSchema,
  firstDayOf,
  isReadableRange,
  lastDayOf,
  personName,
  reportableBreaches,
  sharedText,
  shortDate,
  type BreachReportCreated,
  type BreachReportValues,
} from '../../lib/horReport';
import { useVesselBreaches } from '../../hooks/useBreaches';
import { reportErrorText, useCreateBreachReport, useReportRecipients } from '../../hooks/useHorStats';
import { WorkRestRefusal } from '../../services/workRestService';
import type { WorkRestReportRecipientRow, WorkRestVesselBreachRow } from '../../types/db.pending';

const COARSE_ROW = 'min-h-10 [@media(pointer:coarse)]:min-h-11';

export interface BreachReportDialogProps {
  vesselId: string;
  vesselName: string;
  /** The period offered first (`yyyy-MM-dd`). */
  defaultFrom: string;
  defaultTo: string;
  /** Today (`yyyy-MM-dd`, local): the presets end here. */
  today: string;
  onClose: () => void;
  onCreated?: (created: BreachReportCreated) => void;
}

/** "Last month" and "This year" as periods, relative to today. */
function presets(today: string): { key: string; label: string; from: string; to: string }[] {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  return [
    { key: 'last-month', label: 'Last month', from: firstDayOf(prevY, prevM), to: lastDayOf(prevY, prevM) },
    { key: 'this-month', label: 'This month', from: firstDayOf(y, m), to: today },
    { key: 'this-year', label: 'This year', from: `${y}-01-01`, to: today },
  ];
}

const BreachReportDialog: React.FC<BreachReportDialogProps> = ({ vesselId, vesselName, defaultFrom, defaultTo, today, onClose, onCreated }) => {
  const create = useCreateBreachReport(vesselId);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<BreachReportValues>({
    resolver: zodResolver(breachReportSchema),
    defaultValues: { from: defaultFrom, to: defaultTo, ncIds: [], recipientIds: [], notes: '' },
  });
  const from = form.watch('from');
  const to = form.watch('to');
  const ncIds = form.watch('ncIds');
  const recipientIds = form.watch('recipientIds');
  const readable = isReadableRange(from, to);

  const breaches = useVesselBreaches({ vesselId, from: readable ? from : defaultFrom, to: readable ? to : defaultTo, onlyOpen: false, enabled: readable });
  const recipients = useReportRecipients({ vesselId });
  const offered = useMemo<WorkRestVesselBreachRow[]>(
    () => (readable && breaches.data?.applied ? reportableBreaches(breaches.data.data, from, to) : []),
    [readable, breaches.data, from, to],
  );
  const people = useMemo<WorkRestReportRecipientRow[]>(() => (recipients.data?.applied ? recipients.data.data : []), [recipients.data]);
  const notSetUp = (breaches.data && !breaches.data.applied) || (recipients.data && !recipients.data.applied);

  // A breach outside the new period (or no longer reportable) leaves the selection.
  useEffect(() => {
    const keep = new Set(offered.map((b) => b.nc_id));
    const current = form.getValues('ncIds');
    const next = current.filter((id) => keep.has(id));
    if (next.length !== current.length) form.setValue('ncIds', next, { shouldValidate: form.formState.isSubmitted });
  }, [offered, form]);

  const busy = create.isPending || form.formState.isSubmitting;

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const out = await create.mutateAsync({
        from: values.from,
        to: values.to,
        ncIds: values.ncIds,
        recipientIds: values.recipientIds,
        notes: values.notes.trim() || null,
      });
      notify.success(sharedText(out.recipientCount), { description: `${out.reference}: ${out.breachCount === 1 ? '1 breach' : `${out.breachCount} breaches`}` });
      onCreated?.(out);
      onClose();
    } catch (e) {
      let text = reportErrorText(e);
      if (e instanceof WorkRestRefusal && e.hint && REFUSALS_NAMING_A_BREACH.has(e.refusal)) {
        const at = offered.find((b) => b.nc_id === e.hint);
        if (at) text = `${text} (${personName(at)}, ${at.breach_day ? shortDate(at.breach_day) : 'no day'})`;
      }
      setError(text);
    }
  });

  const toggle = (field: 'ncIds' | 'recipientIds', id: string, on: boolean) => {
    const current = form.getValues(field);
    const next = on ? [...new Set([...current, id])] : current.filter((x) => x !== id);
    form.setValue(field, next, { shouldDirty: true, shouldValidate: form.formState.isSubmitted });
  };
  const allSelected = offered.length > 0 && offered.every((b) => ncIds.includes(b.nc_id));

  return (
    <Dialog open onOpenChange={(o) => (o || busy ? undefined : onClose())}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl" data-breach-report-dialog="">
        <DialogHeader>
          <DialogTitle>Create a breach report</DialogTitle>
          <DialogDescription>
            One report of {vesselName}'s reviewed breaches for a period, for the company's fleet HR and DPA. They are told in STORM and open it
            from the hours of rest report.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={submit} className="min-w-0 space-y-5" noValidate aria-label="Create a breach report">
            <fieldset className="min-w-0 space-y-2">
              <legend className="type-body-sm font-medium text-foreground">Period</legend>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Quick periods">
                {presets(today).map((p) => (
                  <Button
                    key={p.key}
                    type="button"
                    variant={from === p.from && to === p.to ? 'secondary' : 'outline'}
                    size="sm"
                    className="[@media(pointer:coarse)]:h-11"
                    aria-pressed={from === p.from && to === p.to}
                    onClick={() => {
                      form.setValue('from', p.from, { shouldDirty: true, shouldValidate: true });
                      form.setValue('to', p.to, { shouldDirty: true, shouldValidate: true });
                    }}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="from"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>From</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value ?? ''} max={today} className="[@media(pointer:coarse)]:h-11" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="to"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>To</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value ?? ''} max={today} className="[@media(pointer:coarse)]:h-11" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </fieldset>

            {notSetUp ? (
              <Alert variant="info" data-breach-report-not-set-up="">
                <Info aria-hidden="true" className="h-4 w-4" />
                <AlertDescription>{BREACH_REPORT_NOT_SET_UP}</AlertDescription>
              </Alert>
            ) : null}

            <FormField
              control={form.control}
              name="ncIds"
              render={() => (
                <FormItem>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <FormLabel>Reviewed breaches</FormLabel>
                    {offered.length > 1 ? (
                      <label className={cn('inline-flex cursor-pointer items-center gap-2 type-body-sm text-muted-foreground', COARSE_ROW)}>
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={(on) => form.setValue('ncIds', on === true ? offered.map((b) => b.nc_id) : [], { shouldDirty: true, shouldValidate: form.formState.isSubmitted })}
                          aria-label="Select every breach in the period"
                        />
                        Select all ({offered.length})
                      </label>
                    ) : null}
                  </div>
                  <BreachChoices
                    state={!readable ? 'range' : breaches.isLoading ? 'loading' : breaches.error ? 'error' : notSetUp ? 'off' : 'ready'}
                    rows={offered}
                    selected={ncIds}
                    onToggle={(id, on) => toggle('ncIds', id, on)}
                    onRetry={() => void breaches.refetch()}
                    error={breaches.error}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="recipientIds"
              render={() => (
                <FormItem>
                  <FormLabel>Share with</FormLabel>
                  <RecipientChoices
                    state={recipients.isLoading ? 'loading' : recipients.error ? 'error' : notSetUp ? 'off' : 'ready'}
                    rows={people}
                    selected={recipientIds}
                    onToggle={(id, on) => toggle('recipientIds', id, on)}
                    onRetry={() => void recipients.refetch()}
                    error={recipients.error}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl>
                    <Textarea rows={3} maxLength={BREACH_REPORT_LIMITS.notesMax} placeholder="Anything the fleet office should know about these breaches." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {error ? (
              <Alert variant="destructive" data-breach-report-error="">
                <AlertOctagon aria-hidden="true" className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <DialogFooter className="flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="type-caption text-muted-foreground" aria-live="polite" data-breach-report-summary="">
                {ncIds.length === 1 ? '1 breach' : `${ncIds.length} breaches`} · {recipientIds.length === 1 ? '1 person' : `${recipientIds.length} people`}
              </p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button type="button" variant="outline" onClick={onClose} disabled={busy} className="[@media(pointer:coarse)]:h-11">
                  Cancel
                </Button>
                <Button type="submit" disabled={busy || Boolean(notSetUp)} className="[@media(pointer:coarse)]:h-11" data-create-breach-report="">
                  <Send aria-hidden="true" />
                  {busy ? 'Creating…' : 'Create report'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

type ChoiceState = 'range' | 'loading' | 'error' | 'off' | 'ready';

const ListSkeleton: React.FC = () => (
  <div className="space-y-2 rounded-md border border-border p-3" aria-hidden="true">
    <Skeleton className="h-5 w-3/4" />
    <Skeleton className="h-5 w-2/3" />
    <Skeleton className="h-5 w-1/2" />
  </div>
);

const ListNote: React.FC<{ children: React.ReactNode; onRetry?: () => void; tone?: 'muted' | 'error' }> = ({ children, onRetry, tone = 'muted' }) => (
  <div className={cn('rounded-md border border-dashed border-border p-3 type-body-sm', tone === 'error' ? 'text-critical' : 'text-muted-foreground')}>
    {children}
    {onRetry ? (
      <Button type="button" variant="link" size="sm" className="ml-1 h-auto p-0" onClick={onRetry}>
        Try again
      </Button>
    ) : null}
  </div>
);

const BreachChoices: React.FC<{
  state: ChoiceState;
  rows: readonly WorkRestVesselBreachRow[];
  selected: readonly string[];
  onToggle: (id: string, on: boolean) => void;
  onRetry: () => void;
  error: unknown;
}> = ({ state, rows, selected, onToggle, onRetry, error }) => {
  if (state === 'range') return <ListNote>Choose a period of one year or less to see its breaches.</ListNote>;
  if (state === 'loading') return <ListSkeleton />;
  if (state === 'off') return null;
  if (state === 'error') return <ListNote tone="error" onRetry={onRetry}>{reportErrorText(error)}</ListNote>;
  if (!rows.length) {
    return (
      <ListNote>
        No reviewed breach in this period is waiting for a report. A breach can be reported once it is accepted with a justification or dismissed.
      </ListNote>
    );
  }
  return (
    <ul className="max-h-64 divide-y divide-border overflow-y-auto overscroll-contain rounded-md border border-border" aria-label="Reviewed breaches" data-breach-choices="">
      {rows.map((b) => {
        const id = `breach-choice-${b.nc_id}`;
        const checked = selected.includes(b.nc_id);
        return (
          <li key={b.nc_id}>
            <label htmlFor={id} className={cn('flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-muted/40', COARSE_ROW, checked && 'bg-muted/30')}>
              <Checkbox id={id} checked={checked} onCheckedChange={(on) => onToggle(b.nc_id, on === true)} className="mt-0.5" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-foreground">{personName(b)}</span>
                <span className="block type-caption text-muted-foreground">
                  {b.breach_day ? shortDate(b.breach_day) : 'No day'} · {ruleLabel(b.rule_code)}
                  {b.deficit_hours !== null ? ` · ${deficitText(b.deficit_hours)} short` : ''}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                {b.is_serious ? <StatusPill tone="danger" label="Serious" /> : null}
                <StatusPill domain="work_rest_nc" status={b.review_outcome ?? b.status ?? 'reviewed'} />
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
};

const RecipientChoices: React.FC<{
  state: Exclude<ChoiceState, 'range'>;
  rows: readonly WorkRestReportRecipientRow[];
  selected: readonly string[];
  onToggle: (id: string, on: boolean) => void;
  onRetry: () => void;
  error: unknown;
}> = ({ state, rows, selected, onToggle, onRetry, error }) => {
  if (state === 'loading') return <ListSkeleton />;
  if (state === 'off') return null;
  if (state === 'error') return <ListNote tone="error" onRetry={onRetry}>{reportErrorText(error)}</ListNote>;
  if (!rows.length) {
    return (
      <ListNote>
        Nobody in the company holds the fleet HR or DPA role, so there is no one to share a breach report with. An administrator assigns these roles
        in Users &amp; Access.
      </ListNote>
    );
  }
  const groups = (['dpa', 'fleet_hr'] as const).map((kind) => ({ kind, people: rows.filter((r) => r.kind === kind) })).filter((g) => g.people.length);
  return (
    <div className="space-y-3" data-recipient-choices="">
      {groups.map((g) => (
        <div key={g.kind} className="space-y-1">
          <p className="type-eyebrow text-muted-foreground">{RECIPIENT_KIND_LABEL[g.kind]}</p>
          <ul className="divide-y divide-border rounded-md border border-border" aria-label={RECIPIENT_KIND_LABEL[g.kind]}>
            {g.people.map((p) => {
              const id = `recipient-choice-${p.user_id}`;
              const checked = selected.includes(p.user_id);
              return (
                <li key={p.user_id}>
                  <label htmlFor={id} className={cn('flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/40', COARSE_ROW, checked && 'bg-muted/30')}>
                    <Checkbox id={id} checked={checked} onCheckedChange={(on) => onToggle(p.user_id, on === true)} />
                    <span className="min-w-0 flex-1 truncate text-foreground">{personName(p)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <p className="type-caption text-muted-foreground">They see the report in STORM, in their notifications.</p>
    </div>
  );
};

export default BreachReportDialog;

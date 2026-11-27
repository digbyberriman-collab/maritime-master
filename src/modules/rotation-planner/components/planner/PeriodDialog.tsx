import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Info, Loader2, Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { StatusPill } from '@/shared/components/status';
import { errorMessage } from '@/shared/lib/notify';
import { periodDurationLabel } from '../../lib/duration';
import { leaveTypeByKey, leaveTypeLegend, type LeaveType } from '../../lib/leaveTypes';
import { PlannerRefusalError, type PlannerPeriod } from '../../lib/periods';
import { LeaveTypeLabel } from './LeaveLegend';
import { periodEditSchema, type PeriodEditValues } from './plannerSchemas';
import { dayLabel, periodLockReason } from './plannerModel';

const COARSE = '[@media(pointer:coarse)]:h-11';

export interface PeriodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The person the period belongs to. */
  person: { profileId: string; name: string };
  /** The period to edit, or null for a new one starting on `initial`. */
  period: PlannerPeriod | null;
  initial?: { start: string; end: string | null; leaveTypeKey?: string };
  types: readonly LeaveType[];
  canEdit: boolean;
  canApproveLeave: boolean;
  today: string;
  /** Saves the values (create when `period` is null). Throws PlannerRefusalError for a refusal. */
  onSave: (values: PeriodEditValues) => Promise<void>;
  onDelete?: () => Promise<void>;
}

/**
 * One period of the timeline or the manning grid (gap/04 C47, C48, W7):
 * its type, first and last day (or End unknown), notes, and the choice to
 * replace overlapping rotation leave. Personal leave types appear only to
 * leave approvers (D-X1-10; others add it as a request). A period from a
 * request, or one waiting for a decision, opens read only with the reason.
 * A refusal shows the server's sentence; an overlap offers Replace.
 *
 * Mount it per period (the parent renders it while open, keyed by the
 * period): the form takes its values when it mounts.
 */
export const PeriodDialog: React.FC<PeriodDialogProps> = ({
  open,
  onOpenChange,
  person,
  period,
  initial,
  types,
  canEdit,
  canApproveLeave,
  today,
  onSave,
  onDelete,
}) => {
  const lock = periodLockReason(period, types, canEdit, canApproveLeave);
  const options = leaveTypeLegend(types).filter((t) => canApproveLeave || !t.needsApproval || t.key === period?.leaveTypeKey);
  const defaults: PeriodEditValues = period
    ? {
        leaveTypeKey: period.leaveTypeKey ?? '',
        start: period.start,
        end: period.endUnknown ? '' : period.end,
        endUnknown: period.endUnknown,
        notes: period.notes ?? '',
        replace: false,
      }
    : {
        leaveTypeKey: initial?.leaveTypeKey ?? options.find((t) => t.key === 'rotation')?.key ?? options[0]?.key ?? '',
        start: initial?.start ?? today,
        end: initial?.end ?? '',
        endUnknown: false,
        notes: '',
        replace: false,
      };
  const form = useForm<PeriodEditValues>({ resolver: zodResolver(periodEditSchema(today)), defaultValues: defaults });
  const [refusal, setRefusal] = React.useState<{ text: string; overlap: boolean } | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const endUnknown = form.watch('endUnknown');
  const values = form.watch();

  const submit = form.handleSubmit(async (v) => {
    setRefusal(null);
    try {
      await onSave(v);
      onOpenChange(false);
    } catch (error) {
      if (error instanceof PlannerRefusalError) {
        setRefusal({ text: error.message, overlap: error.refusal === 'period_overlap' });
      } else {
        setRefusal({ text: errorMessage(error, 'The period could not be saved.'), overlap: false });
      }
    }
  });

  const remove = async () => {
    if (!onDelete) return;
    setDeleting(true);
    setRefusal(null);
    try {
      await onDelete();
      onOpenChange(false);
    } catch (error) {
      setRefusal({ text: error instanceof PlannerRefusalError ? error.message : errorMessage(error, 'The period could not be removed.'), overlap: false });
    } finally {
      setDeleting(false);
    }
  };

  const type = leaveTypeByKey(values.leaveTypeKey, types);
  const duration = values.start && (endUnknown || values.end) ? periodDurationLabel({ start: values.start, end: endUnknown ? null : values.end, endUnknown }) : null;
  const busy = form.formState.isSubmitting || deleting;

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{period ? (lock ? 'Period' : 'Change period') : 'New period'}</DialogTitle>
          <DialogDescription>
            {person.name}
            {period ? ` · ${dayLabel(period.start)}${period.endUnknown ? ', end unknown' : ` to ${dayLabel(period.end)}`}` : ''}
          </DialogDescription>
        </DialogHeader>

        {lock ? (
          <div className="space-y-3" data-period-locked="">
            {period ? (
              <dl className="grid gap-2 type-body">
                <div className="flex gap-2">
                  <dt className="w-24 text-muted-foreground">Type</dt>
                  <dd>{leaveTypeByKey(period.leaveTypeKey, types)?.label ?? 'No leave type'}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 text-muted-foreground">Length</dt>
                  <dd>{periodDurationLabel({ start: period.start, end: period.endUnknown ? null : period.end, endUnknown: period.endUnknown })}</dd>
                </div>
                <div className="flex items-center gap-2">
                  <dt className="w-24 text-muted-foreground">Status</dt>
                  <dd>
                    <StatusPill tone={period.status === 'confirmed' || period.status === 'complete' ? 'ok' : 'info'}>
                      {period.status === 'pending_approval' ? 'Awaiting approval' : period.status === 'draft' ? 'Draft' : period.status === 'complete' ? 'Complete' : 'Confirmed'}
                    </StatusPill>
                  </dd>
                </div>
                {period.notes ? (
                  <div className="flex gap-2">
                    <dt className="w-24 text-muted-foreground">Notes</dt>
                    <dd className="whitespace-pre-wrap break-words">{period.notes}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
            <Alert variant="info">
              <Info aria-hidden="true" className="size-4" />
              <AlertDescription>{lock}</AlertDescription>
            </Alert>
            <DialogFooter>
              <Button type="button" variant="outline" className={COARSE} onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={submit} className="space-y-4" noValidate>
              <FormField
                control={form.control}
                name="leaveTypeKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className={COARSE}>
                          <SelectValue placeholder="Choose a type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {options.map((t) => (
                          <SelectItem key={t.key} value={t.key}>
                            <LeaveTypeLabel type={t} />
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!canApproveLeave ? <FormDescription>Holiday and other personal leave go through Add leave as a request.</FormDescription> : null}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="start"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First day</FormLabel>
                      <FormControl>
                        <Input type="date" className={COARSE} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="end"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last day</FormLabel>
                      <FormControl>
                        <Input type="date" className={COARSE} disabled={endUnknown} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="endUnknown"
                render={({ field }) => (
                  <FormItem className="flex items-start gap-2 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          field.onChange(checked === true);
                          if (checked === true) form.setValue('end', '');
                        }}
                      />
                    </FormControl>
                    <div className="space-y-0.5">
                      <FormLabel className="font-normal">End unknown</FormLabel>
                      <FormDescription>The period runs until the next one starts.</FormDescription>
                    </div>
                  </FormItem>
                )}
              />
              {duration && type ? <p className="type-caption text-muted-foreground">{`${type.label} · ${duration}`}</p> : null}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea rows={2} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {refusal ? (
                <Alert variant="destructive" data-period-refusal="">
                  <AlertDescription>{refusal.text}</AlertDescription>
                </Alert>
              ) : null}
              {refusal?.overlap || values.replace ? (
                <FormField
                  control={form.control}
                  name="replace"
                  render={({ field }) => (
                    <FormItem className="flex items-start gap-2 space-y-0">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                      </FormControl>
                      <div className="space-y-0.5">
                        <FormLabel className="font-normal">Replace rotation leave</FormLabel>
                        <FormDescription>Overlapping rotation leave is shortened, split or removed. Other leave is never changed.</FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
              ) : null}
              <DialogFooter className="gap-2 sm:justify-between">
                {period && onDelete ? (
                  <Button type="button" variant="ghost" className={`text-critical ${COARSE}`} disabled={busy} onClick={remove}>
                    {deleting ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Trash2 aria-hidden="true" />}
                    Remove
                  </Button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className={COARSE} disabled={busy} onClick={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" className={COARSE} disabled={busy}>
                    {form.formState.isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
                    Save
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PeriodDialog;

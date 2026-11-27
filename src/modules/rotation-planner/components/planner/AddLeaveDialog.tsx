import React from 'react';
import { useFieldArray, useForm, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Info, Loader2, Plus, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { notify, errorMessage } from '@/shared/lib/notify';
import { periodDurationLabel } from '../../lib/duration';
import { leaveTypeByKey, offLeaveTypes, requestableLeaveTypes, type LeaveType } from '../../lib/leaveTypes';
import { MAX_PERIODS_PER_REQUEST, PlannerRefusalError } from '../../lib/periods';
import { useLeaveRequestMutations } from '../../hooks/useLeaveRequests';
import { usePlannerPeriodMutations } from '../../hooks/usePlannerPeriods';
import { LeaveTypeLabel } from './LeaveLegend';
import { addLeaveDefaults, addLeaveSchema, emptyPeriod, periodInputs, type AddLeaveValues } from './plannerSchemas';
import type { PlannerVessel } from './usePlannerContext';

const COARSE = '[@media(pointer:coarse)]:h-11';

export interface AddLeavePerson {
  profileId: string;
  name: string;
  positionLabel: string | null;
  /** A person without a login gets periods only from a leave approver (request_needs_login). */
  hasLogin: boolean;
}

export interface AddLeaveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vessel: PlannerVessel;
  /**
   * `add`: a planner or leave approver adds leave for a crew member
   * (planner_add_leave: approved at once for someone else's leave when the
   * viewer approves leave, a pending request otherwise).
   * `own`: the viewer requests their own leave (crew_leave_request_submit).
   */
  mode: 'add' | 'own';
  people: readonly AddLeavePerson[];
  initialProfileId?: string | null;
  /** The viewer's own profile (their own leave is always a request, D-X1-10). */
  viewerProfileId: string | null;
  canApproveLeave: boolean;
  types: readonly LeaveType[];
  today: string;
}

/** The form field a refusal's HINT names (a 1-based period index). */
function refusalField(error: PlannerRefusalError): FieldPath<AddLeaveValues> | null {
  const index = error.hint && /^\d+$/.test(error.hint) ? Number(error.hint) - 1 : null;
  if (index !== null && index >= 0 && index < MAX_PERIODS_PER_REQUEST) {
    return error.refusal === 'period_dates_invalid' ? `periods.${index}.end` : `periods.${index}.start`;
  }
  if (error.refusal === 'notes_too_long') return 'note';
  if (error.refusal === 'person_not_found' || error.refusal === 'request_needs_login') return 'profileId';
  return null;
}

/**
 * Add leave (gap/04 C50, T-71, D-X1-10): one crew member, one or more
 * periods, each with its type, first day and last day or End unknown, and a
 * note. Each period becomes its own bar. A leave approver adding someone
 * else's leave saves it approved; anyone else (and an approver's own leave)
 * creates a pending request, and the dialog says which before Save.
 * Loaded lazily by the planner (gap/00 I6).
 */
const AddLeaveDialog: React.FC<AddLeaveDialogProps> = ({
  open,
  onOpenChange,
  vessel,
  mode,
  people,
  initialProfileId,
  viewerProfileId,
  canApproveLeave,
  types,
  today,
}) => {
  const periodsMutations = usePlannerPeriodMutations(vessel);
  const requestMutations = useLeaveRequestMutations(vessel);
  const ownProfile = mode === 'own' ? viewerProfileId ?? '' : initialProfileId ?? '';
  const options = mode === 'own' ? requestableLeaveTypes(types) : offLeaveTypes(types);
  const defaultType = options.find((t) => t.key === 'holiday')?.key ?? options[0]?.key ?? '';
  const form = useForm<AddLeaveValues>({
    resolver: zodResolver(addLeaveSchema(today)),
    defaultValues: { ...addLeaveDefaults(today, ownProfile), periods: [emptyPeriod(today, defaultType)] },
  });
  const periods = useFieldArray({ control: form.control, name: 'periods' });
  const [refusal, setRefusal] = React.useState<string | null>(null);
  const profileId = form.watch('profileId');
  const watched = form.watch('periods');
  const person = people.find((p) => p.profileId === profileId) ?? null;
  const own = mode === 'own' || (profileId !== '' && profileId === viewerProfileId);
  const approvesDirectly = mode === 'add' && canApproveLeave && !own;

  const submit = form.handleSubmit(async (values) => {
    setRefusal(null);
    const name = people.find((p) => p.profileId === values.profileId)?.name ?? 'the crew member';
    const input = periodInputs(values.periods);
    try {
      if (mode === 'own') {
        await requestMutations.submit.mutateAsync({ periods: input, note: values.note || null });
        notify.success('Leave requested', { description: 'Your request waits for a leave approver.' });
      } else {
        const result = await periodsMutations.addLeave.mutateAsync({ profileId: values.profileId, periods: input, note: values.note || null, replace: values.replace });
        if (result.status === 'approved') {
          notify.success(`Leave added for ${name}`, { description: `${result.period_ids.length} ${result.period_ids.length === 1 ? 'period' : 'periods'} approved and on the planner.` });
        } else {
          notify.success(`Leave request created for ${name}`, { description: 'It waits for a leave approver.' });
        }
      }
      onOpenChange(false);
    } catch (error) {
      if (error instanceof PlannerRefusalError) {
        const field = refusalField(error);
        if (field) form.setError(field, { type: 'server', message: error.message });
        else setRefusal(error.message);
        return;
      }
      setRefusal(errorMessage(error, 'The leave could not be saved.'));
    }
  });

  const busy = form.formState.isSubmitting;
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" data-add-leave={mode}>
        <DialogHeader>
          <DialogTitle>{mode === 'own' ? 'Request leave' : 'Add leave'}</DialogTitle>
          <DialogDescription>
            {mode === 'own'
              ? `Your leave on ${vessel.name}. Each period becomes its own bar once it is approved.`
              : `Leave for a crew member of ${vessel.name}. Each period becomes its own bar on the planner.`}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={submit} className="space-y-4" noValidate>
            {mode === 'add' ? (
              <FormField
                control={form.control}
                name="profileId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Crew member</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className={COARSE}>
                          <SelectValue placeholder="Choose a crew member" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {people.map((p) => (
                          <SelectItem key={p.profileId} value={p.profileId}>
                            {p.name}
                            {p.positionLabel ? ` · ${p.positionLabel}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            <fieldset className="space-y-3">
              <legend className="type-subtitle">Periods</legend>
              {periods.fields.map((row, index) => {
                const p = watched[index];
                const type = leaveTypeByKey(p?.leaveTypeKey, types);
                const duration = p?.start && (p.endUnknown || p.end) ? periodDurationLabel({ start: p.start, end: p.endUnknown ? null : p.end, endUnknown: p.endUnknown }) : null;
                return (
                  <div key={row.id} className="space-y-3 rounded-md border border-border p-3" data-add-leave-period={index + 1}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="type-caption font-medium text-muted-foreground">
                        Period {index + 1}
                        {duration && type ? ` · ${type.label} · ${duration}` : ''}
                      </span>
                      {periods.fields.length > 1 ? (
                        <Button type="button" variant="ghost" size="icon" className="size-8 [@media(pointer:coarse)]:size-11" aria-label={`Remove period ${index + 1}`} onClick={() => periods.remove(index)}>
                          <X aria-hidden="true" />
                        </Button>
                      ) : null}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
                      <FormField
                        control={form.control}
                        name={`periods.${index}.leaveTypeKey`}
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
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name={`periods.${index}.start`}
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
                        name={`periods.${index}.end`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Last day</FormLabel>
                            <FormControl>
                              <Input type="date" className={COARSE} disabled={p?.endUnknown} {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name={`periods.${index}.endUnknown`}
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={(checked) => {
                                field.onChange(checked === true);
                                if (checked === true) form.setValue(`periods.${index}.end`, '');
                              }}
                            />
                          </FormControl>
                          <FormLabel className="font-normal">End unknown</FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>
                );
              })}
              {form.formState.errors.periods?.root?.message || form.formState.errors.periods?.message ? (
                <p className="type-caption text-critical" role="alert">
                  {form.formState.errors.periods?.root?.message ?? form.formState.errors.periods?.message}
                </p>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={COARSE}
                disabled={periods.fields.length >= MAX_PERIODS_PER_REQUEST}
                onClick={() => periods.append(emptyPeriod(today, defaultType))}
              >
                <Plus aria-hidden="true" />
                Add another period
              </Button>
            </fieldset>

            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder="Optional" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {mode === 'add' ? (
              <FormField
                control={form.control}
                name="replace"
                render={({ field }) => (
                  <FormItem className="flex items-start gap-2 space-y-0">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={(checked) => field.onChange(checked === true)} />
                    </FormControl>
                    <div className="space-y-0.5">
                      <FormLabel className="font-normal">Replace overlapping rotation leave</FormLabel>
                      <FormDescription>Rotation leave in the way is shortened, split or removed. Other leave is never changed.</FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            ) : null}

            {mode === 'add' && profileId ? (
              <Alert variant="info" data-add-leave-outcome={approvesDirectly ? 'approved' : 'pending'}>
                <Info aria-hidden="true" className="size-4" />
                <AlertDescription>
                  {approvesDirectly
                    ? `Saved approved: you approve leave on ${vessel.name}.`
                    : own
                      ? 'Your own leave is saved as a request for another leave approver.'
                      : person && !person.hasLogin
                        ? 'This crew member has no sign-in, so only a leave approver can add their leave.'
                        : 'Saved as a request: a leave approver decides it.'}
                </AlertDescription>
              </Alert>
            ) : null}

            {refusal ? (
              <Alert variant="destructive" data-add-leave-refusal="">
                <AlertDescription>{refusal}</AlertDescription>
              </Alert>
            ) : null}

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" className={COARSE} disabled={busy} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" className={COARSE} disabled={busy}>
                {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
                {mode === 'own' ? 'Send request' : approvesDirectly ? 'Add leave' : 'Create request'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default AddLeaveDialog;

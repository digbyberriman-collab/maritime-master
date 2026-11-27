import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { notify, errorMessage } from '@/shared/lib/notify';
import { crewKeys } from '@/modules/crew/hooks/crewKeys';
import type { CrewListRow } from '@/modules/crew/lib/crewListModel';
import { DEFAULT_OFF_LEAVE_TYPE, offLeaveTypes, type LeaveType } from '@/modules/rotation-planner/lib/leaveTypes';
import { PlannerRefusalError } from '@/modules/rotation-planner/lib/periods';
import { usePlannerPeriodMutations } from '@/modules/rotation-planner/hooks/usePlannerPeriods';
import { LeaveTypeLabel } from '@/modules/rotation-planner/components/planner/LeaveLegend';
import { toggleSchema, type ToggleValues } from '@/modules/rotation-planner/components/planner/plannerSchemas';
import { toggleDirectionFor, type ToggleVessel } from '@/modules/rotation-planner/components/planner/onboardToggle';

const COARSE = '[@media(pointer:coarse)]:h-11';

/** The switch in a crew list row's status cell: on board or off; a change opens the dialog, never writes by itself. */
export const OnboardToggleSwitch: React.FC<{ row: CrewListRow; onRequest: (row: CrewListRow) => void }> = ({ row, onRequest }) => {
  const direction = toggleDirectionFor(row);
  if (!direction) return null;
  const onBoard = direction === 'off';
  return (
    <label className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 type-caption text-muted-foreground [@media(pointer:coarse)]:min-h-11" data-onboard-toggle={row.profileId}>
      <Switch
        checked={onBoard}
        onCheckedChange={() => onRequest(row)}
        aria-label={onBoard ? `${row.displayName} is on board. Mark off the vessel` : `${row.displayName} is off. Mark on board`}
      />
      <span aria-hidden="true">{onBoard ? 'On' : 'Off'}</span>
    </label>
  );
};

export interface OnboardToggleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vessel: ToggleVessel;
  row: Pick<CrewListRow, 'profileId' | 'displayName' | 'status' | 'placementKind'>;
  types: readonly LeaveType[];
  today: string;
}

/**
 * On/Off (gap/04 C4, W7): Off ends the person's time on board from a day and
 * writes their time off as a planner period (Rotation leave by default; end
 * unknown, or a last day) with a disembark movement; On ends the time off
 * the day before and records the embark. Both through crew_toggle_onboard,
 * never a free-text status. The day stays within a month of today.
 */
export const OnboardToggleDialog: React.FC<OnboardToggleDialogProps> = ({ open, onOpenChange, vessel, row, types, today }) => {
  const direction = toggleDirectionFor(row) ?? 'off';
  const options = offLeaveTypes(types);
  const mutations = usePlannerPeriodMutations(vessel);
  const queryClient = useQueryClient();
  const form = useForm<ToggleValues>({
    resolver: zodResolver(toggleSchema(today)),
    defaultValues: {
      direction,
      leaveTypeKey: options.find((t) => t.key === DEFAULT_OFF_LEAVE_TYPE)?.key ?? options[0]?.key ?? '',
      start: today,
      end: '',
      endUnknown: true,
    },
  });
  const [refusal, setRefusal] = React.useState<string | null>(null);
  const endUnknown = form.watch('endUnknown');

  const submit = form.handleSubmit(async (v) => {
    setRefusal(null);
    try {
      await mutations.toggle.mutateAsync(
        v.direction === 'off'
          ? { profileId: row.profileId, direction: 'off', leaveTypeKey: v.leaveTypeKey, start: v.start, end: v.endUnknown ? null : v.end, endUnknown: v.endUnknown }
          : { profileId: row.profileId, direction: 'on', start: v.start },
      );
      await queryClient.invalidateQueries({ queryKey: crewKeys.vessel(vessel.companyId, vessel.id) });
      notify.success(v.direction === 'off' ? `${row.displayName} is off the vessel` : `${row.displayName} is back on board`, {
        description: v.direction === 'off' ? 'Their time off is on the planner.' : 'The embark is recorded in the movements.',
      });
      onOpenChange(false);
    } catch (error) {
      if (error instanceof PlannerRefusalError) {
        if (error.refusal === 'date_out_of_range') form.setError('start', { type: 'server', message: error.message });
        else setRefusal(error.message);
        return;
      }
      setRefusal(errorMessage(error, 'The change was not saved.'));
    }
  });
  const busy = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md" data-onboard-dialog={direction}>
        <DialogHeader>
          <DialogTitle>{direction === 'off' ? 'Mark off the vessel' : 'Mark on board'}</DialogTitle>
          <DialogDescription>
            {direction === 'off'
              ? `${row.displayName} leaves ${vessel.name}. Their time off goes on the planner.`
              : `${row.displayName} comes back on board ${vessel.name}. Their time off ends the day before.`}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={submit} className="space-y-4" noValidate>
            <FormField
              control={form.control}
              name="start"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{direction === 'off' ? 'First day off' : 'Back on board from'}</FormLabel>
                  <FormControl>
                    <Input type="date" className={COARSE} {...field} />
                  </FormControl>
                  <FormDescription>Within a month of today.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {direction === 'off' ? (
              <>
                <FormField
                  control={form.control}
                  name="leaveTypeKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Time off as</FormLabel>
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
                  name="endUnknown"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(checked) => {
                            field.onChange(checked === true);
                            if (checked === true) form.setValue('end', '');
                          }}
                        />
                      </FormControl>
                      <FormLabel className="font-normal">Return date unknown</FormLabel>
                    </FormItem>
                  )}
                />
                {!endUnknown ? (
                  <FormField
                    control={form.control}
                    name="end"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last day off</FormLabel>
                        <FormControl>
                          <Input type="date" className={COARSE} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}
              </>
            ) : null}
            {refusal ? (
              <Alert variant="destructive" data-onboard-refusal="">
                <AlertDescription>{refusal}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" className={COARSE} disabled={busy} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" className={COARSE} disabled={busy}>
                {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
                {direction === 'off' ? 'Mark off' : 'Mark on board'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default OnboardToggleDialog;

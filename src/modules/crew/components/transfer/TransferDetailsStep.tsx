import React, { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { StatusPill } from '@/shared/components/status';
import type { TransferDestination, TransferOptions } from '@/modules/crew/lib/transfer';
import {
  buildTransferDetailsSchema,
  transferDetailsDefaults,
  type TransferDetailsValues,
} from '@/modules/crew/lib/transferSchema';
import type { TransferError } from '@/modules/crew/hooks/useTransfers';

const FIELD = 'min-h-10 [@media(pointer:coarse)]:min-h-11';

interface TransferDetailsStepProps {
  options: TransferOptions;
  today: string;
  /** The open draft's details, when restarting it. */
  initial?: Partial<TransferDetailsValues>;
  busy: boolean;
  error: TransferError | null;
  onSubmit: (values: TransferDetailsValues) => void;
  onClose: () => void;
  /** The destination chosen so far (the wizard's timeline shows Fleet approval when it asks for it). */
  onDestinationChange?: (vesselId: string) => void;
}

/** Positions of a destination grouped by department, in its rank order. */
function groupPositions(d: TransferDestination | undefined): Array<{ label: string; items: TransferDestination['positions'] }> {
  if (!d) return [];
  const groups = new Map<string, TransferDestination['positions']>();
  for (const p of d.positions) {
    const label = p.departmentLabel ?? 'Other';
    const list = groups.get(label) ?? [];
    list.push(p);
    groups.set(label, list);
  }
  return [...groups.entries()].map(([label, items]) => ({ label, items }));
}

/**
 * Step 1 of the transfer (gap/04 W9): the destination (vessels where the
 * caller assigns crew, with the fleet approval they ask for), the same or
 * a new position, the sign-off and sign-on dates and notes. The rules are
 * lib/transferSchema.ts (the server's own); a server refusal lands on the
 * field its HINT names, or above the buttons.
 */
export const TransferDetailsStep: React.FC<TransferDetailsStepProps> = ({ options, today, initial, busy, error, onSubmit, onClose, onDestinationChange }) => {
  const destinations = options.destinations;
  const schema = useMemo(
    () =>
      buildTransferDetailsSchema({
        today,
        fromVesselId: options.from.vesselId,
        joinDate: options.from.joinDate,
        hasSamePosition: (id) => Boolean(destinations.find((d) => d.vesselId === id)?.samePositionId),
      }),
    [today, options.from.vesselId, options.from.joinDate, destinations],
  );
  const form = useForm<TransferDetailsValues>({
    resolver: zodResolver(schema),
    defaultValues: transferDetailsDefaults(today, {
      toVesselId: destinations.length === 1 ? destinations[0].vesselId : '',
      ...initial,
    }),
  });
  const { register, control, handleSubmit, watch, setError, formState } = form;
  const toVesselId = watch('toVesselId');
  const positionMode = watch('positionMode');
  const destination = destinations.find((d) => d.vesselId === toVesselId);
  const groups = groupPositions(destination);
  const samePosition = destination?.samePositionId ? destination.positions.find((p) => p.id === destination.samePositionId) : undefined;
  const currentTitle = options.from.positionText ?? 'their current position';

  useEffect(() => {
    onDestinationChange?.(toVesselId);
  }, [toVesselId, onDestinationChange]);

  // A refusal that names a field lands on it.
  useEffect(() => {
    if (error?.field) setError(error.field, { type: 'server', message: error.message });
  }, [error, setError]);

  if (destinations.length === 0) {
    return (
      <div className="space-y-4" data-transfer-step="details">
        <Alert variant="info">
          <AlertDescription>
            You can transfer crew to vessels where you assign crew. There is no other such vessel in your fleet, so ask a fleet manager to make this move.
          </AlertDescription>
        </Alert>
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  const errorText = (name: keyof TransferDetailsValues) => {
    const message = formState.errors[name]?.message;
    return typeof message === 'string' ? message : null;
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate data-transfer-step="details">
      <div className="space-y-2">
        <Label htmlFor="transfer-to-vessel">Move to</Label>
        <Controller
          control={control}
          name="toVesselId"
          render={({ field }) => (
            <Select value={field.value || undefined} onValueChange={field.onChange}>
              <SelectTrigger id="transfer-to-vessel" className={FIELD} aria-invalid={Boolean(errorText('toVesselId'))} aria-describedby="transfer-to-vessel-help">
                <SelectValue placeholder="Choose a vessel" />
              </SelectTrigger>
              <SelectContent>
                {destinations.map((d) => (
                  <SelectItem key={d.vesselId} value={d.vesselId}>
                    {d.name}
                    {d.requiresApproval ? ' · fleet approval' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <p id="transfer-to-vessel-help" className="type-caption text-muted-foreground">
          The vessels of your fleet where you assign crew.
        </p>
        {destination?.requiresApproval ? (
          <p className="flex flex-wrap items-center gap-2 type-caption text-muted-foreground">
            <StatusPill tone="purple">Fleet approval</StatusPill>
            A fleet approver decides before the transfer is scheduled.
          </p>
        ) : null}
        {errorText('toVesselId') ? <p className="type-caption text-critical">{errorText('toVesselId')}</p> : null}
      </div>

      <fieldset className="space-y-2">
        <legend className="type-body font-medium">Position on the new vessel</legend>
        <Controller
          control={control}
          name="positionMode"
          render={({ field }) => (
            <RadioGroup value={field.value} onValueChange={field.onChange} className="gap-2">
              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-border p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                <RadioGroupItem value="same" id="transfer-position-same" className="mt-0.5" />
                <span className="min-w-0">
                  <span className="block type-body">Same position</span>
                  <span className="block type-caption text-muted-foreground">
                    {samePosition ? samePosition.name : destination ? `${currentTitle} is not on this vessel’s list` : currentTitle}
                  </span>
                </span>
              </label>
              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-border p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                <RadioGroupItem value="new" id="transfer-position-new" className="mt-0.5" />
                <span className="block type-body">A new position</span>
              </label>
            </RadioGroup>
          )}
        />
        {errorText('positionMode') ? <p className="type-caption text-critical">{errorText('positionMode')}</p> : null}
        {positionMode === 'new' ? (
          <div className="space-y-2 pt-1">
            <Label htmlFor="transfer-to-position">New position</Label>
            <Controller
              control={control}
              name="toPositionId"
              render={({ field }) => (
                <Select value={field.value ?? undefined} onValueChange={field.onChange} disabled={!destination}>
                  <SelectTrigger id="transfer-to-position" className={FIELD} aria-invalid={Boolean(errorText('toPositionId'))}>
                    <SelectValue placeholder={destination ? 'Choose a position' : 'Choose the vessel first'} />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {groups.map((g) => (
                      <SelectGroup key={g.label}>
                        <SelectLabel>{g.label}</SelectLabel>
                        {g.items.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errorText('toPositionId') ? <p className="type-caption text-critical">{errorText('toPositionId')}</p> : null}
          </div>
        ) : null}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="transfer-sign-off">Signs off {options.from.vesselName ?? 'this vessel'}</Label>
          <Input id="transfer-sign-off" type="date" className={FIELD} {...register('signOffDate')} aria-invalid={Boolean(errorText('signOffDate'))} />
          {errorText('signOffDate') ? <p className="type-caption text-critical">{errorText('signOffDate')}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="transfer-sign-on">Joins {destination?.name ?? 'the new vessel'}</Label>
          <Input id="transfer-sign-on" type="date" className={FIELD} {...register('signOnDate')} aria-invalid={Boolean(errorText('signOnDate'))} />
          {errorText('signOnDate') ? <p className="type-caption text-critical">{errorText('signOnDate')}</p> : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="transfer-notes">Notes (optional)</Label>
        <Textarea id="transfer-notes" rows={3} className="resize-none" placeholder="For example: relieving the bosun during the yard period." {...register('notes')} />
        {errorText('notes') ? <p className="type-caption text-critical">{errorText('notes')}</p> : null}
      </div>

      {error && !error.field ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
          Close
        </Button>
        <Button type="submit" variant="signal" disabled={busy}>
          {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
          Save and review
        </Button>
      </div>
    </form>
  );
};

export default TransferDetailsStep;

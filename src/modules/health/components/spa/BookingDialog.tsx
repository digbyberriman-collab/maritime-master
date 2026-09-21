import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PersonPicker } from '@/modules/health/components/PersonPicker';
import { formatDuration } from '@/modules/health/lib/format';
import {
  BOOKING_SOURCES,
  BOOKING_STATUSES,
  addMinutesIso,
  combineDayAndTime,
  localDayIso,
  timeOfDay,
  type BookingFormData,
  type SpaBookingEntry,
  type SpaRoom,
  type SpaTreatment,
} from '@/modules/health/hooks/useSpa';
import type { PractitionerEntry } from '@/modules/health/hooks/usePractitioners';

const NONE = '__none__';

interface BookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: SpaBookingEntry | null;
  /** Prefill for a new booking: the slot the user clicked. */
  defaults?: { dayIso: string; time?: string; therapistId?: string | null; roomId?: string | null };
  treatments: SpaTreatment[];
  rooms: SpaRoom[];
  therapists: PractitionerEntry[];
  openingTime: string;
  closingTime: string;
  onSubmit: (values: BookingFormData) => Promise<void>;
  isPending?: boolean;
  /** Message from the database, typically a therapist or room clash. */
  errorMessage?: string | null;
  /** Complete, no show and cancel, offered only when editing. */
  onStatusChange?: (status: string) => void;
  statusPending?: boolean;
}

const bookingToForm = (booking: SpaBookingEntry): BookingFormData => ({
  id: booking.id,
  person_id: booking.person_id,
  treatment_id: booking.treatment_id,
  therapist_id: booking.therapist_id,
  room_id: booking.room_id,
  vessel_id: booking.vessel_id,
  starts_at: booking.starts_at,
  ends_at: booking.ends_at,
  status: booking.status,
  booking_source: booking.booking_source,
  client_notes: booking.client_notes,
  therapist_notes: booking.therapist_notes,
  contraindications_checked: booking.contraindications_checked,
  cancelled_reason: booking.cancelled_reason,
});

/**
 * Create or edit a spa booking. Duration follows the chosen treatment, and
 * the clash check lives in the database, so a clash comes back as a message
 * here rather than being guessed at before the save.
 */
export const BookingDialog: React.FC<BookingDialogProps> = ({
  open,
  onOpenChange,
  booking,
  defaults,
  treatments,
  rooms,
  therapists,
  openingTime,
  closingTime,
  onSubmit,
  isPending,
  errorMessage,
  onStatusChange,
  statusPending,
}) => {
  const [values, setValues] = useState<BookingFormData | null>(null);
  const [day, setDay] = useState(defaults?.dayIso ?? localDayIso(new Date()));
  const [time, setTime] = useState(defaults?.time ?? openingTime.slice(0, 5));
  const [duration, setDuration] = useState(60);

  useEffect(() => {
    if (!open) return;
    if (booking) {
      const form = bookingToForm(booking);
      setValues(form);
      setDay(localDayIso(new Date(booking.starts_at)));
      setTime(timeOfDay(booking.starts_at));
      setDuration(booking.durationMinutes || 60);
      return;
    }
    const startDay = defaults?.dayIso ?? localDayIso(new Date());
    const startTime = defaults?.time ?? openingTime.slice(0, 5);
    setDay(startDay);
    setTime(startTime);
    setDuration(60);
    setValues({
      person_id: '',
      treatment_id: null,
      therapist_id: defaults?.therapistId ?? null,
      room_id: defaults?.roomId ?? null,
      vessel_id: null,
      starts_at: combineDayAndTime(startDay, startTime),
      ends_at: addMinutesIso(combineDayAndTime(startDay, startTime), 60),
      status: 'confirmed',
      booking_source: 'staff',
      client_notes: null,
      therapist_notes: null,
      contraindications_checked: false,
      cancelled_reason: null,
    });
  }, [open, booking, defaults?.dayIso, defaults?.time, defaults?.therapistId, defaults?.roomId, openingTime]);

  const treatment = useMemo(
    () => treatments.find((t) => t.id === values?.treatment_id) ?? null,
    [treatments, values?.treatment_id],
  );

  const patch = (next: Partial<BookingFormData>) =>
    setValues((prev) => (prev ? { ...prev, ...next } : prev));

  const applyTiming = (nextDay: string, nextTime: string, nextDuration: number) => {
    const startsAt = combineDayAndTime(nextDay, nextTime);
    patch({ starts_at: startsAt, ends_at: addMinutesIso(startsAt, Math.max(5, nextDuration)) });
  };

  const chooseTreatment = (id: string) => {
    const chosen = treatments.find((t) => t.id === id) ?? null;
    const nextDuration = chosen?.duration_minutes ?? duration;
    setDuration(nextDuration);
    const startsAt = combineDayAndTime(day, time);
    patch({
      treatment_id: id === NONE ? null : id,
      starts_at: startsAt,
      ends_at: addMinutesIso(startsAt, nextDuration),
      room_id: chosen && !chosen.requires_room ? null : values?.room_id ?? null,
    });
  };

  if (!values) return null;

  const outsideHours = time < openingTime.slice(0, 5) || time >= closingTime.slice(0, 5);
  const needsContraindicationCheck = Boolean(treatment?.contraindications);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onSubmit(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{booking ? 'Edit booking' : 'New booking'}</DialogTitle>
          <DialogDescription>
            The treatment sets the length. A therapist or a room cannot be booked twice at once.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={submit}>
          {errorMessage && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>That slot will not take this booking</AlertTitle>
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label>Client</Label>
            <PersonPicker
              value={values.person_id || null}
              onChange={(id) => patch({ person_id: id ?? '' })}
              placeholder="Search crew, guests and the owner's party"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Treatment</Label>
              <Select value={values.treatment_id ?? NONE} onValueChange={chooseTreatment}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a treatment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not set</SelectItem>
                  {treatments.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} · {formatDuration(t.duration_minutes)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {treatment?.contraindications && (
                <p className="text-xs text-warning">Contraindications: {treatment.contraindications}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Therapist</Label>
              <Select
                value={values.therapist_id ?? NONE}
                onValueChange={(v) => patch({ therapist_id: v === NONE ? null : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Unassigned</SelectItem>
                  {therapists.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name}
                      {p.role_title ? ` · ${p.role_title}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Room</Label>
              <Select
                value={values.room_id ?? NONE}
                onValueChange={(v) => patch({ room_id: v === NONE ? null : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No room" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No room</SelectItem>
                  {rooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                      {r.deck ? ` · ${r.deck}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {treatment?.requires_room && !values.room_id && (
                <p className="text-xs text-warning">This treatment normally needs a room.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="booking-date">Date</Label>
              <Input
                id="booking-date"
                type="date"
                value={day}
                onChange={(e) => {
                  setDay(e.target.value);
                  applyTiming(e.target.value, time, duration);
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="booking-time">Start time</Label>
              <Input
                id="booking-time"
                type="time"
                value={time}
                onChange={(e) => {
                  setTime(e.target.value);
                  applyTiming(day, e.target.value, duration);
                }}
              />
              {outsideHours && (
                <p className="text-xs text-warning">
                  The spa opens {openingTime.slice(0, 5)} and closes {closingTime.slice(0, 5)}.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="booking-duration">Length (minutes)</Label>
              <Input
                id="booking-duration"
                type="number"
                min={5}
                step={5}
                value={duration}
                onChange={(e) => {
                  const next = Number(e.target.value) || 5;
                  setDuration(next);
                  applyTiming(day, time, next);
                }}
              />
              <p className="text-xs text-muted-foreground">Finishes at {timeOfDay(values.ends_at)}</p>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={values.status} onValueChange={(v) => patch({ status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BOOKING_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Booked through</Label>
              <Select value={values.booking_source} onValueChange={(v) => patch({ booking_source: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BOOKING_SOURCES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {values.status === 'cancelled' && (
            <div className="space-y-2">
              <Label htmlFor="booking-cancel-reason">Why was it cancelled</Label>
              <Input
                id="booking-cancel-reason"
                value={values.cancelled_reason ?? ''}
                onChange={(e) => patch({ cancelled_reason: e.target.value })}
                placeholder="Guest changed plans, rough weather, therapist unwell"
              />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="booking-client-notes">Client notes</Label>
              <Textarea
                id="booking-client-notes"
                rows={3}
                value={values.client_notes ?? ''}
                onChange={(e) => patch({ client_notes: e.target.value })}
                placeholder="Preferences, pressure, areas to avoid"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="booking-therapist-notes">Therapist notes</Label>
              <Textarea
                id="booking-therapist-notes"
                rows={3}
                value={values.therapist_notes ?? ''}
                onChange={(e) => patch({ therapist_notes: e.target.value })}
                placeholder="What was done, products used, follow up"
              />
            </div>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/30 p-3">
            <div className="space-y-0.5">
              <Label htmlFor="booking-contra">Contraindications checked</Label>
              <p className="text-xs text-muted-foreground">
                {needsContraindicationCheck
                  ? 'This treatment has contraindications. Confirm you have been through them with the client.'
                  : 'Confirm you have asked about injuries, pregnancy, medication and recent surgery.'}
              </p>
            </div>
            <Switch
              id="booking-contra"
              checked={values.contraindications_checked}
              onCheckedChange={(checked) => patch({ contraindications_checked: checked })}
            />
          </div>

          {booking && onStatusChange && (
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={statusPending}
                onClick={() => onStatusChange('completed')}
              >
                Mark completed
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={statusPending}
                onClick={() => onStatusChange('no_show')}
              >
                Mark no show
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="text-destructive"
                disabled={statusPending}
                onClick={() => onStatusChange('cancelled')}
              >
                Cancel this booking
              </Button>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button type="submit" disabled={isPending || !values.person_id}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {booking ? 'Save booking' : 'Create booking'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default BookingDialog;

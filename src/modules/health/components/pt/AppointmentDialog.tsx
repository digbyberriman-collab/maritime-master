import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PersonPicker } from '@/modules/health/components/PersonPicker';
import { usePractitioners } from '@/modules/health/hooks/usePractitioners';
import {
  APPOINTMENT_STATUSES,
  APPOINTMENT_TYPES,
  GROUP_APPOINTMENT_TYPES,
  useAthleteTraining,
  type AppointmentConflict,
  type PtAppointment,
} from '@/modules/health/hooks/usePtPrograms';
import { formatDate, formatTime } from '@/modules/health/lib/format';

interface AppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: PtAppointment | null;
  /** Pre-filled start when the trainer taps an empty slot. */
  defaultStart?: string | null;
  onSave: (values: Partial<PtAppointment> & { starts_at: string; ends_at: string }) => void;
  saving?: boolean;
  findConflicts: (input: {
    trainerId: string | null;
    startsAt: string;
    endsAt: string;
    ignoreId?: string | null;
  }) => AppointmentConflict[];
}

/** `datetime-local` wants local wall-clock text, not an ISO instant. */
const toLocalInput = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fromLocalInput = (value: string): string | null => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const addMinutesLocal = (value: string, minutes: number): string => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  d.setMinutes(d.getMinutes() + minutes);
  return toLocalInput(d.toISOString());
};

/** Book, move, cancel or complete one session in the trainer's diary. */
export const AppointmentDialog: React.FC<AppointmentDialogProps> = ({
  open,
  onOpenChange,
  appointment,
  defaultStart,
  onSave,
  saving,
  findConflicts,
}) => {
  const trainers = usePractitioners('pt');
  const [sessionType, setSessionType] = useState('one_to_one');
  const [personId, setPersonId] = useState<string | null>(null);
  const [trainerId, setTrainerId] = useState('none');
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [location, setLocation] = useState('');
  const [capacity, setCapacity] = useState('');
  const [status, setStatus] = useState('confirmed');
  const [programSessionId, setProgramSessionId] = useState('none');
  const [notes, setNotes] = useState('');

  const training = useAthleteTraining(personId);

  useEffect(() => {
    if (!open) return;
    if (appointment) {
      setSessionType(appointment.session_type);
      setPersonId(appointment.person_id);
      setTrainerId(appointment.trainer_id ?? 'none');
      setTitle(appointment.title ?? '');
      setStartsAt(toLocalInput(appointment.starts_at));
      setEndsAt(toLocalInput(appointment.ends_at));
      setLocation(appointment.location ?? '');
      setCapacity(appointment.capacity?.toString() ?? '');
      setStatus(appointment.status);
      setProgramSessionId(appointment.program_session_id ?? 'none');
      setNotes(appointment.notes ?? '');
      return;
    }
    const start = defaultStart ? toLocalInput(defaultStart) : toLocalInput(new Date().toISOString());
    setSessionType('one_to_one');
    setPersonId(null);
    setTrainerId('none');
    setTitle('');
    setStartsAt(start);
    setEndsAt(addMinutesLocal(start, 60));
    setLocation('');
    setCapacity('');
    setStatus('confirmed');
    setProgramSessionId('none');
    setNotes('');
  }, [open, appointment, defaultStart]);

  const isGroup = GROUP_APPOINTMENT_TYPES.includes(sessionType);

  const conflicts = useMemo(() => {
    const startIso = fromLocalInput(startsAt);
    const endIso = fromLocalInput(endsAt);
    if (!startIso || !endIso) return [];
    return findConflicts({
      trainerId: trainerId === 'none' ? null : trainerId,
      startsAt: startIso,
      endsAt: endIso,
      ignoreId: appointment?.id ?? null,
    });
  }, [findConflicts, trainerId, startsAt, endsAt, appointment?.id]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const startIso = fromLocalInput(startsAt);
    const endIso = fromLocalInput(endsAt);
    if (!startIso || !endIso) return;
    onSave({
      ...(appointment ? { id: appointment.id } : {}),
      session_type: sessionType,
      person_id: personId,
      trainer_id: trainerId === 'none' ? null : trainerId,
      title: title.trim() || null,
      starts_at: startIso,
      ends_at: endIso,
      location: location.trim() || null,
      capacity: isGroup && capacity.trim() ? Number(capacity) : null,
      status,
      program_session_id: programSessionId === 'none' ? null : programSessionId,
      notes: notes.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{appointment ? 'Edit session' : 'Book a session'}</DialogTitle>
          <DialogDescription>
            Classes do not need an athlete. One to one sessions do, so the athlete can see it in their
            own training.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit}>
          <ScrollArea className="max-h-[60vh] pr-3">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={sessionType} onValueChange={setSessionType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {APPOINTMENT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {APPOINTMENT_STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Athlete {isGroup && <span className="text-muted-foreground">(optional for a class)</span>}</Label>
                <PersonPicker
                  value={personId}
                  onChange={(id) => {
                    setPersonId(id);
                    setProgramSessionId('none');
                  }}
                  placeholder={isGroup ? 'Leave blank for an open class' : 'Choose an athlete'}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Trainer</Label>
                <Select value={trainerId} onValueChange={setTrainerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {trainers.active.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="appointment-start">Starts</Label>
                  <Input
                    id="appointment-start"
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => {
                      setStartsAt(e.target.value);
                      if (e.target.value && (!endsAt || endsAt <= e.target.value)) {
                        setEndsAt(addMinutesLocal(e.target.value, 60));
                      }
                    }}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="appointment-end">Ends</Label>
                  <Input
                    id="appointment-end"
                    type="datetime-local"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                    required
                  />
                </div>
              </div>

              {conflicts.length > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>That trainer is already booked</AlertTitle>
                  <AlertDescription>
                    <ul className="mt-1 space-y-1">
                      {conflicts.map((c) => (
                        <li key={c.id} className="text-xs">
                          {c.title} · {formatDate(c.starts_at)} {formatTime(c.starts_at)} to{' '}
                          {formatTime(c.ends_at)}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs">You can still save it if the overlap is intended.</p>
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="appointment-location">Location</Label>
                  <Input
                    id="appointment-location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Gym, beach club, sun deck"
                  />
                </div>
                {isGroup && (
                  <div className="space-y-1.5">
                    <Label htmlFor="appointment-capacity">Capacity</Label>
                    <Input
                      id="appointment-capacity"
                      type="number"
                      min={1}
                      value={capacity}
                      onChange={(e) => setCapacity(e.target.value)}
                      placeholder="8"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="appointment-title">Title</Label>
                <Input
                  id="appointment-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Circuits on the sun deck"
                />
              </div>

              {personId && training.sessions.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Linked programme session</Label>
                  <Select value={programSessionId} onValueChange={setProgramSessionId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Not linked" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not linked</SelectItem>
                      {training.sessions.slice(0, 40).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          W{s.week_number} D{s.day_number} · {s.title}
                          {s.scheduled_on ? ` · ${formatDate(s.scheduled_on)}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Linking lets the athlete open the workout from the diary entry.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="appointment-notes">Notes</Label>
                <Textarea
                  id="appointment-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !startsAt || !endsAt}>
              {saving ? 'Saving...' : 'Save session'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AppointmentDialog;

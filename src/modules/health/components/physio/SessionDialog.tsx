import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PersonPicker } from '@/modules/health/components/PersonPicker';
import { PainScoreField } from '@/modules/health/components/physio/PainScoreField';
import { usePractitioners } from '@/modules/health/hooks/usePractitioners';
import {
  SESSION_STATUSES,
  usePhysioSessions,
  usePhysioTreatmentPlans,
  type PhysioSessionEntry,
} from '@/modules/health/hooks/usePhysio';
import { todayIso } from '@/modules/health/lib/format';

interface SessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: PhysioSessionEntry | null;
  defaultPersonId?: string | null;
  defaultPlanId?: string | null;
  /** Opens the dialog ready to close off a scheduled session. */
  completing?: boolean;
  canEdit: boolean;
}

interface FormState {
  person_id: string | null;
  plan_id: string | null;
  practitioner_id: string | null;
  session_date: string;
  start_time: string;
  duration_minutes: string;
  status: string;
  subjective: string;
  objective: string;
  treatment_given: string;
  pain_before: number | null;
  pain_after: number | null;
  home_exercise: string;
  next_session_on: string;
  notes: string;
}

const NONE = '__none__';

const emptyForm = (personId: string | null, planId: string | null): FormState => ({
  person_id: personId,
  plan_id: planId,
  practitioner_id: null,
  session_date: todayIso(),
  start_time: '',
  duration_minutes: '30',
  status: 'completed',
  subjective: '',
  objective: '',
  treatment_given: '',
  pain_before: null,
  pain_after: null,
  home_exercise: '',
  next_session_on: '',
  notes: '',
});

const blankToNull = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

/** "08:30" in the browser's timezone, from the stored timestamp. */
const timeFromIso = (value: string | null): string => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const isoFromDateTime = (date: string, time: string): string | null => {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** Record a treatment session, or close off one that was only scheduled. */
export const SessionDialog: React.FC<SessionDialogProps> = ({
  open,
  onOpenChange,
  session,
  defaultPersonId,
  defaultPlanId,
  completing,
  canEdit,
}) => {
  const [form, setForm] = useState<FormState>(() =>
    emptyForm(defaultPersonId ?? null, defaultPlanId ?? null),
  );
  const { save } = usePhysioSessions({ enabled: false });
  const { practitioners } = usePractitioners();
  const planQuery = usePhysioTreatmentPlans({
    personId: form.person_id,
    enabled: open && Boolean(form.person_id),
  });

  const physios = useMemo(
    () =>
      practitioners.filter(
        (p) => p.is_active && (p.discipline === 'physio' || p.discipline === 'medical'),
      ),
    [practitioners],
  );

  useEffect(() => {
    if (!open) return;
    if (session) {
      setForm({
        person_id: session.person_id,
        plan_id: session.plan_id,
        practitioner_id: session.practitioner_id,
        session_date: session.session_date,
        start_time: timeFromIso(session.starts_at),
        duration_minutes: session.duration_minutes ? String(session.duration_minutes) : '',
        status: completing ? 'completed' : session.status,
        subjective: session.subjective ?? '',
        objective: session.objective ?? '',
        treatment_given: session.treatment_given ?? '',
        pain_before: session.pain_before,
        pain_after: session.pain_after,
        home_exercise: session.home_exercise ?? '',
        next_session_on: session.next_session_on ?? '',
        notes: session.notes ?? '',
      });
    } else {
      setForm(emptyForm(defaultPersonId ?? null, defaultPlanId ?? null));
    }
  }, [open, session, completing, defaultPersonId, defaultPlanId]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit || !form.person_id) return;
    try {
      await save.mutateAsync({
        ...(session ? { id: session.id } : {}),
        person_id: form.person_id,
        plan_id: form.plan_id,
        practitioner_id: form.practitioner_id,
        session_date: form.session_date,
        starts_at: isoFromDateTime(form.session_date, form.start_time),
        duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null,
        status: form.status,
        subjective: blankToNull(form.subjective),
        objective: blankToNull(form.objective),
        treatment_given: blankToNull(form.treatment_given),
        pain_before: form.pain_before,
        pain_after: form.pain_after,
        home_exercise: blankToNull(form.home_exercise),
        next_session_on: form.next_session_on || null,
        notes: blankToNull(form.notes),
      });
      onOpenChange(false);
    } catch {
      // The hook raises the toast; keep the dialog open to retry.
    }
  };

  const readOnly = !canEdit;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {completing ? 'Complete session' : session ? 'Session' : 'Record a session'}
          </DialogTitle>
          <DialogDescription>
            {readOnly
              ? 'You can read this session but not change it.'
              : 'Subjective, objective, what you did and how the pain moved.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Person</Label>
              {session ? (
                <Input value={session.person_name ?? 'Unknown'} readOnly disabled />
              ) : (
                <PersonPicker
                  value={form.person_id}
                  onChange={(id) => set('person_id', id)}
                  disabled={readOnly || Boolean(defaultPersonId)}
                />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="session-plan">Treatment plan</Label>
              <Select
                value={form.plan_id ?? NONE}
                disabled={readOnly || !form.person_id}
                onValueChange={(value) => set('plan_id', value === NONE ? null : value)}
              >
                <SelectTrigger id="session-plan">
                  <SelectValue placeholder={form.person_id ? 'No plan' : 'Choose a person first'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No plan</SelectItem>
                  {planQuery.plans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="session-date">Date</Label>
              <Input
                id="session-date"
                type="date"
                value={form.session_date}
                disabled={readOnly}
                onChange={(e) => set('session_date', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="session-time">Start time</Label>
              <Input
                id="session-time"
                type="time"
                value={form.start_time}
                disabled={readOnly}
                onChange={(e) => set('start_time', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="session-duration">Duration in minutes</Label>
              <Input
                id="session-duration"
                type="number"
                min={1}
                value={form.duration_minutes}
                disabled={readOnly}
                onChange={(e) => set('duration_minutes', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="session-status">Status</Label>
              <Select
                value={form.status}
                disabled={readOnly}
                onValueChange={(value) => set('status', value)}
              >
                <SelectTrigger id="session-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SESSION_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="session-practitioner">Practitioner</Label>
            <Select
              value={form.practitioner_id ?? NONE}
              disabled={readOnly}
              onValueChange={(value) => set('practitioner_id', value === NONE ? null : value)}
            >
              <SelectTrigger id="session-practitioner" className="md:max-w-sm">
                <SelectValue placeholder="Not recorded" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not recorded</SelectItem>
                {physios.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="session-subjective">Subjective</Label>
              <Textarea
                id="session-subjective"
                rows={3}
                value={form.subjective}
                disabled={readOnly}
                placeholder="What the crew member reports since the last session"
                onChange={(e) => set('subjective', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="session-objective">Objective</Label>
              <Textarea
                id="session-objective"
                rows={3}
                value={form.objective}
                disabled={readOnly}
                placeholder="Measurements, range, strength, movement quality"
                onChange={(e) => set('objective', e.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="session-treatment">Treatment given</Label>
              <Textarea
                id="session-treatment"
                rows={3}
                value={form.treatment_given}
                disabled={readOnly}
                placeholder="Manual therapy, dry needling, loaded exercise, education"
                onChange={(e) => set('treatment_given', e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <PainScoreField
              id="session-pain-before"
              label="Pain before"
              value={form.pain_before}
              disabled={readOnly}
              onChange={(value) => set('pain_before', value)}
            />
            <PainScoreField
              id="session-pain-after"
              label="Pain after"
              value={form.pain_after}
              disabled={readOnly}
              onChange={(value) => set('pain_after', value)}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="session-home-exercise">Home exercise</Label>
              <Textarea
                id="session-home-exercise"
                rows={2}
                value={form.home_exercise}
                disabled={readOnly}
                placeholder="Three sets of ten, twice daily, stop at pain above four out of ten"
                onChange={(e) => set('home_exercise', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="session-next">Next session</Label>
              <Input
                id="session-next"
                type="date"
                value={form.next_session_on}
                disabled={readOnly}
                onChange={(e) => set('next_session_on', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="session-notes">Notes</Label>
              <Input
                id="session-notes"
                value={form.notes}
                disabled={readOnly}
                onChange={(e) => set('notes', e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {readOnly ? 'Close' : 'Cancel'}
            </Button>
            {!readOnly && (
              <Button type="submit" disabled={save.isPending || !form.person_id}>
                {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {session ? 'Save session' : 'Record session'}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default SessionDialog;

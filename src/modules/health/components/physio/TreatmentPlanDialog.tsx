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
import { usePractitioners } from '@/modules/health/hooks/usePractitioners';
import {
  PLAN_STATUSES,
  assessmentTypeLabel,
  usePhysioAssessments,
  usePhysioTreatmentPlans,
  useRehabProtocolTemplates,
  type PhysioTreatmentPlanEntry,
} from '@/modules/health/hooks/usePhysio';
import { addDaysIso, formatDate, todayIso } from '@/modules/health/lib/format';

interface TreatmentPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: PhysioTreatmentPlanEntry | null;
  defaultPersonId?: string | null;
  canEdit: boolean;
}

interface FormState {
  person_id: string | null;
  title: string;
  diagnosis: string;
  goals: string;
  frequency: string;
  assessment_id: string | null;
  protocol_template_id: string | null;
  practitioner_id: string | null;
  start_date: string;
  review_date: string;
  end_date: string;
  status: string;
  notes: string;
}

const NONE = '__none__';

const emptyForm = (personId: string | null): FormState => ({
  person_id: personId,
  title: '',
  diagnosis: '',
  goals: '',
  frequency: 'Twice a week',
  assessment_id: null,
  protocol_template_id: null,
  practitioner_id: null,
  start_date: todayIso(),
  review_date: addDaysIso(todayIso(), 28),
  end_date: '',
  status: 'active',
  notes: '',
});

const blankToNull = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

/** Create or edit a treatment plan and link it to an assessment and a protocol. */
export const TreatmentPlanDialog: React.FC<TreatmentPlanDialogProps> = ({
  open,
  onOpenChange,
  plan,
  defaultPersonId,
  canEdit,
}) => {
  const [form, setForm] = useState<FormState>(() => emptyForm(defaultPersonId ?? null));
  const { save } = usePhysioTreatmentPlans({ enabled: false });
  const { practitioners } = usePractitioners();
  const { templates, isLoading: templatesLoading } = useRehabProtocolTemplates();

  const assessmentQuery = usePhysioAssessments({
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
    if (plan) {
      setForm({
        person_id: plan.person_id,
        title: plan.title,
        diagnosis: plan.diagnosis ?? '',
        goals: plan.goals ?? '',
        frequency: plan.frequency ?? '',
        assessment_id: plan.assessment_id,
        protocol_template_id: plan.protocol_template_id,
        practitioner_id: plan.practitioner_id,
        start_date: plan.start_date,
        review_date: plan.review_date ?? '',
        end_date: plan.end_date ?? '',
        status: plan.status,
        notes: plan.notes ?? '',
      });
    } else {
      setForm(emptyForm(defaultPersonId ?? null));
    }
  }, [open, plan, defaultPersonId]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit || !form.person_id || !form.title.trim()) return;
    try {
      await save.mutateAsync({
        ...(plan ? { id: plan.id } : {}),
        person_id: form.person_id,
        title: form.title.trim(),
        diagnosis: blankToNull(form.diagnosis),
        goals: blankToNull(form.goals),
        frequency: blankToNull(form.frequency),
        assessment_id: form.assessment_id,
        protocol_template_id: form.protocol_template_id,
        practitioner_id: form.practitioner_id,
        start_date: form.start_date,
        review_date: form.review_date || null,
        end_date: form.end_date || null,
        status: form.status,
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
          <DialogTitle>{plan ? 'Treatment plan' : 'New treatment plan'}</DialogTitle>
          <DialogDescription>
            {readOnly
              ? 'You can read this plan but not change it.'
              : 'What you are treating, how often, and when it gets reviewed.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Person</Label>
              {plan ? (
                <Input value={plan.person_name ?? 'Unknown'} readOnly disabled />
              ) : (
                <PersonPicker
                  value={form.person_id}
                  onChange={(id) => set('person_id', id)}
                  disabled={readOnly || Boolean(defaultPersonId)}
                />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-title">Title</Label>
              <Input
                id="plan-title"
                value={form.title}
                disabled={readOnly}
                placeholder="Right shoulder rehabilitation"
                onChange={(e) => set('title', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="plan-diagnosis">Diagnosis</Label>
              <Textarea
                id="plan-diagnosis"
                rows={2}
                value={form.diagnosis}
                disabled={readOnly}
                placeholder="Subacromial pain syndrome, no red flags"
                onChange={(e) => set('diagnosis', e.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="plan-goals">Goals</Label>
              <Textarea
                id="plan-goals"
                rows={3}
                value={form.goals}
                disabled={readOnly}
                placeholder="Pain free overhead reach by week four, back to full tender duties by week six"
                onChange={(e) => set('goals', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-frequency">Frequency</Label>
              <Input
                id="plan-frequency"
                value={form.frequency}
                disabled={readOnly}
                placeholder="Twice a week"
                onChange={(e) => set('frequency', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-practitioner">Treating practitioner</Label>
              <Select
                value={form.practitioner_id ?? NONE}
                disabled={readOnly}
                onValueChange={(value) => set('practitioner_id', value === NONE ? null : value)}
              >
                <SelectTrigger id="plan-practitioner">
                  <SelectValue placeholder="Not assigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not assigned</SelectItem>
                  {physios.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="plan-assessment">Linked assessment</Label>
              <Select
                value={form.assessment_id ?? NONE}
                disabled={readOnly || !form.person_id}
                onValueChange={(value) => set('assessment_id', value === NONE ? null : value)}
              >
                <SelectTrigger id="plan-assessment">
                  <SelectValue
                    placeholder={form.person_id ? 'None' : 'Choose a person first'}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {assessmentQuery.assessments.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {assessmentTypeLabel(a.assessment_type)} · {formatDate(a.assessed_on)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.person_id && !assessmentQuery.isLoading && !assessmentQuery.assessments.length && (
                <p className="text-xs text-muted-foreground">
                  No assessments on file for this person yet.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-protocol">Rehabilitation protocol</Label>
              <Select
                value={form.protocol_template_id ?? NONE}
                disabled={readOnly}
                onValueChange={(value) =>
                  set('protocol_template_id', value === NONE ? null : value)
                }
              >
                <SelectTrigger id="plan-protocol">
                  <SelectValue placeholder={templatesLoading ? 'Loading…' : 'None'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                      {t.body_region ? ` · ${t.body_region}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!templatesLoading && !templates.length && (
                <p className="text-xs text-muted-foreground">
                  No rehabilitation protocols in the library yet. Build one in the protocol library
                  and it will appear here.
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="plan-start">Start date</Label>
              <Input
                id="plan-start"
                type="date"
                value={form.start_date}
                disabled={readOnly}
                onChange={(e) => set('start_date', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-review">Review date</Label>
              <Input
                id="plan-review"
                type="date"
                value={form.review_date}
                disabled={readOnly}
                onChange={(e) => set('review_date', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-end">End date</Label>
              <Input
                id="plan-end"
                type="date"
                value={form.end_date}
                disabled={readOnly}
                onChange={(e) => set('end_date', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-status">Status</Label>
              <Select
                value={form.status}
                disabled={readOnly}
                onValueChange={(value) => set('status', value)}
              >
                <SelectTrigger id="plan-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLAN_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="plan-notes">Notes</Label>
            <Textarea
              id="plan-notes"
              rows={2}
              value={form.notes}
              disabled={readOnly}
              onChange={(e) => set('notes', e.target.value)}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {readOnly ? 'Close' : 'Cancel'}
            </Button>
            {!readOnly && (
              <Button
                type="submit"
                disabled={save.isPending || !form.person_id || !form.title.trim()}
              >
                {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {plan ? 'Save changes' : 'Create plan'}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TreatmentPlanDialog;

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { AssessmentFindingsEditor } from '@/modules/health/components/physio/AssessmentFindingsEditor';
import { usePractitioners } from '@/modules/health/hooks/usePractitioners';
import {
  ASSESSMENT_TYPES,
  FIT_FOR_DUTY_OPTIONS,
  usePhysioAssessmentItems,
  usePhysioAssessments,
  type AssessmentItemDraft,
  type PhysioAssessmentEntry,
} from '@/modules/health/hooks/usePhysio';
import { todayIso } from '@/modules/health/lib/format';

interface PhysioAssessmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assessment: PhysioAssessmentEntry | null;
  /** Pre-selected subject when the page is already showing one person. */
  defaultPersonId?: string | null;
  canEdit: boolean;
}

interface FormState {
  person_id: string | null;
  assessed_on: string;
  practitioner_id: string | null;
  assessment_type: string;
  chief_complaint: string;
  history: string;
  observations: string;
  pain_score: number | null;
  pain_location: string;
  aggravating_factors: string;
  easing_factors: string;
  diagnosis: string;
  red_flags: string;
  fit_for_duty: string | null;
  plan: string;
  notes: string;
}

const emptyForm = (personId: string | null): FormState => ({
  person_id: personId,
  assessed_on: todayIso(),
  practitioner_id: null,
  assessment_type: 'initial',
  chief_complaint: '',
  history: '',
  observations: '',
  pain_score: null,
  pain_location: '',
  aggravating_factors: '',
  easing_factors: '',
  diagnosis: '',
  red_flags: '',
  fit_for_duty: null,
  plan: '',
  notes: '',
});

const blankToNull = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const NONE = '__none__';

/**
 * Create or edit one assessment, with its structured findings underneath.
 * The findings are kept as a local draft while the dialog is open and written
 * once the assessment has an id, so a brand new assessment and its measures
 * save as a single action.
 */
export const PhysioAssessmentDialog: React.FC<PhysioAssessmentDialogProps> = ({
  open,
  onOpenChange,
  assessment,
  defaultPersonId,
  canEdit,
}) => {
  const [form, setForm] = useState<FormState>(() => emptyForm(defaultPersonId ?? null));
  const [drafts, setDrafts] = useState<AssessmentItemDraft[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const { save } = usePhysioAssessments({ enabled: false });
  const { items, syncItems, isLoading: itemsLoading } = usePhysioAssessmentItems(
    open ? assessment?.id ?? null : null,
  );
  const { practitioners } = usePractitioners();

  const clinicians = useMemo(
    () =>
      practitioners.filter(
        (p) => p.is_active && (p.discipline === 'physio' || p.discipline === 'medical'),
      ),
    [practitioners],
  );

  useEffect(() => {
    if (!open) return;
    if (assessment) {
      setForm({
        person_id: assessment.person_id,
        assessed_on: assessment.assessed_on,
        practitioner_id: assessment.practitioner_id,
        assessment_type: assessment.assessment_type,
        chief_complaint: assessment.chief_complaint ?? '',
        history: assessment.history ?? '',
        observations: assessment.observations ?? '',
        pain_score: assessment.pain_score,
        pain_location: assessment.pain_location ?? '',
        aggravating_factors: assessment.aggravating_factors ?? '',
        easing_factors: assessment.easing_factors ?? '',
        diagnosis: assessment.diagnosis ?? '',
        red_flags: assessment.red_flags ?? '',
        fit_for_duty: assessment.fit_for_duty,
        plan: assessment.plan ?? '',
        notes: assessment.notes ?? '',
      });
    } else {
      setForm(emptyForm(defaultPersonId ?? null));
      setDrafts([]);
    }
    setRemovedIds([]);
  }, [open, assessment, defaultPersonId]);

  // Hydrate the findings once per opening. A background refetch must not
  // overwrite what the physiotherapist has typed but not yet saved.
  const hydratedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      hydratedFor.current = null;
      return;
    }
    if (!assessment || itemsLoading || hydratedFor.current === assessment.id) return;
    hydratedFor.current = assessment.id;
    setDrafts(
      items.map((item) => ({
        id: item.id,
        category: item.category,
        label: item.label,
        side: item.side,
        value_numeric: item.value_numeric,
        value_text: item.value_text,
        unit: item.unit,
        normal_range: item.normal_range,
        is_flagged: item.is_flagged,
        notes: item.notes,
      })),
    );
  }, [open, assessment, items, itemsLoading]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit || !form.person_id) return;
    setSaving(true);
    try {
      const assessmentId = await save.mutateAsync({
        ...(assessment ? { id: assessment.id } : {}),
        person_id: form.person_id,
        assessed_on: form.assessed_on,
        practitioner_id: form.practitioner_id,
        assessment_type: form.assessment_type,
        chief_complaint: blankToNull(form.chief_complaint),
        history: blankToNull(form.history),
        observations: blankToNull(form.observations),
        pain_score: form.pain_score,
        pain_location: blankToNull(form.pain_location),
        aggravating_factors: blankToNull(form.aggravating_factors),
        easing_factors: blankToNull(form.easing_factors),
        diagnosis: blankToNull(form.diagnosis),
        red_flags: blankToNull(form.red_flags),
        fit_for_duty: form.fit_for_duty,
        plan: blankToNull(form.plan),
        notes: blankToNull(form.notes),
      });
      if (drafts.length || removedIds.length) {
        await syncItems.mutateAsync({ assessmentId, items: drafts, removedIds });
      }
      onOpenChange(false);
    } catch {
      // The mutation hooks raise the toast; keep the dialog open to retry.
    } finally {
      setSaving(false);
    }
  };

  const readOnly = !canEdit;
  const hasRedFlags = Boolean(form.red_flags.trim());
  const isUnfit = form.fit_for_duty === 'unfit';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {assessment ? 'Assessment' : 'New physiotherapy assessment'}
          </DialogTitle>
          <DialogDescription>
            {readOnly
              ? 'You can read this assessment but not change it.'
              : 'Record the subjective history, what you found and what happens next.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {(hasRedFlags || isUnfit) && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{isUnfit ? 'Not fit for duty' : 'Red flags recorded'}</AlertTitle>
              <AlertDescription>
                {isUnfit
                  ? 'This result stops the crew member working. Tell the captain and raise a medical referral.'
                  : 'Red flags need a medical opinion before treatment continues.'}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="assessment-person">Person</Label>
              {assessment ? (
                <Input
                  id="assessment-person"
                  value={assessment.person_name ?? 'Unknown'}
                  readOnly
                  disabled
                />
              ) : (
                <PersonPicker
                  value={form.person_id}
                  onChange={(id) => set('person_id', id)}
                  disabled={readOnly || Boolean(defaultPersonId)}
                />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="assessment-date">Date</Label>
              <Input
                id="assessment-date"
                type="date"
                value={form.assessed_on}
                disabled={readOnly}
                onChange={(e) => set('assessed_on', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="assessment-type">Type</Label>
              <Select
                value={form.assessment_type}
                disabled={readOnly}
                onValueChange={(value) => set('assessment_type', value)}
              >
                <SelectTrigger id="assessment-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSESSMENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="assessment-practitioner">Practitioner</Label>
              <Select
                value={form.practitioner_id ?? NONE}
                disabled={readOnly}
                onValueChange={(value) => set('practitioner_id', value === NONE ? null : value)}
              >
                <SelectTrigger id="assessment-practitioner">
                  <SelectValue placeholder="Not recorded" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not recorded</SelectItem>
                  {clinicians.map((p) => (
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
              <Label htmlFor="assessment-complaint">Chief complaint</Label>
              <Textarea
                id="assessment-complaint"
                rows={2}
                value={form.chief_complaint}
                disabled={readOnly}
                placeholder="Right shoulder pain lifting tender lines"
                onChange={(e) => set('chief_complaint', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="assessment-history">History</Label>
              <Textarea
                id="assessment-history"
                rows={2}
                value={form.history}
                disabled={readOnly}
                placeholder="Onset, mechanism, previous episodes, treatment so far"
                onChange={(e) => set('history', e.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="assessment-observations">Observations</Label>
              <Textarea
                id="assessment-observations"
                rows={3}
                value={form.observations}
                disabled={readOnly}
                placeholder="Posture, gait, swelling, palpation findings"
                onChange={(e) => set('observations', e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <PainScoreField
              id="assessment-pain"
              label="Pain score today"
              value={form.pain_score}
              disabled={readOnly}
              onChange={(value) => set('pain_score', value)}
            />
            <div className="space-y-2">
              <Label htmlFor="assessment-pain-location">Pain location</Label>
              <Input
                id="assessment-pain-location"
                value={form.pain_location}
                disabled={readOnly}
                placeholder="Right anterolateral shoulder"
                onChange={(e) => set('pain_location', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="assessment-aggravating">Aggravating factors</Label>
              <Textarea
                id="assessment-aggravating"
                rows={2}
                value={form.aggravating_factors}
                disabled={readOnly}
                placeholder="Overhead work, lying on that side"
                onChange={(e) => set('aggravating_factors', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="assessment-easing">Easing factors</Label>
              <Textarea
                id="assessment-easing"
                rows={2}
                value={form.easing_factors}
                disabled={readOnly}
                placeholder="Rest, ice, anti-inflammatories"
                onChange={(e) => set('easing_factors', e.target.value)}
              />
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="assessment-diagnosis">Working diagnosis</Label>
              <Textarea
                id="assessment-diagnosis"
                rows={2}
                value={form.diagnosis}
                disabled={readOnly}
                placeholder="Subacromial pain syndrome"
                onChange={(e) => set('diagnosis', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="assessment-fit">Fit for duty</Label>
              <Select
                value={form.fit_for_duty ?? NONE}
                disabled={readOnly}
                onValueChange={(value) => set('fit_for_duty', value === NONE ? null : value)}
              >
                <SelectTrigger id="assessment-fit">
                  <SelectValue placeholder="Not assessed" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not assessed</SelectItem>
                  {FIT_FOR_DUTY_OPTIONS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="assessment-red-flags" className="text-destructive">
                Red flags
              </Label>
              <Textarea
                id="assessment-red-flags"
                rows={2}
                value={form.red_flags}
                disabled={readOnly}
                placeholder="Night pain, unexplained weight loss, neurological signs. Leave empty if none."
                onChange={(e) => set('red_flags', e.target.value)}
                className={hasRedFlags ? 'border-destructive/50 bg-destructive/5' : undefined}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="assessment-plan">Plan</Label>
              <Textarea
                id="assessment-plan"
                rows={3}
                value={form.plan}
                disabled={readOnly}
                placeholder="Treatment, home exercise, review interval, duty restrictions"
                onChange={(e) => set('plan', e.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="assessment-notes">Notes</Label>
              <Textarea
                id="assessment-notes"
                rows={2}
                value={form.notes}
                disabled={readOnly}
                onChange={(e) => set('notes', e.target.value)}
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Findings</h3>
              <p className="text-xs text-muted-foreground">
                Range of motion, strength, special tests and screens. Flag anything outside the
                normal range so it stands out on review.
              </p>
            </div>
            {itemsLoading && assessment ? (
              <p className="text-sm text-muted-foreground">Loading findings…</p>
            ) : (
              <AssessmentFindingsEditor
                items={drafts}
                onChange={setDrafts}
                onRemoveSaved={(id) => setRemovedIds((prev) => [...prev, id])}
                readOnly={readOnly}
              />
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {readOnly ? 'Close' : 'Cancel'}
            </Button>
            {!readOnly && (
              <Button type="submit" disabled={saving || !form.person_id}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {assessment ? 'Save changes' : 'Create assessment'}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default PhysioAssessmentDialog;

import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BriefcaseMedical,
  CalendarClock,
  Loader2,
  Pencil,
  Plus,
  Stethoscope,
  Trash2,
  Users,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import { StatTile, StatGrid } from '@/modules/health/components/StatTile';
import {
  HealthEmpty,
  HealthError,
  HealthLoading,
  NoSubjectRecord,
} from '@/modules/health/components/HealthStates';
import { PersonPicker } from '@/modules/health/components/PersonPicker';
import { PersonClinicalBanner } from '@/modules/health/components/medical/PersonClinicalBanner';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { useSelectedPerson } from '@/modules/health/hooks/useSelectedPerson';
import { usePractitioners } from '@/modules/health/hooks/usePractitioners';
import { useHealthSettings } from '@/modules/health/hooks/useHealthSettings';
import { useReferrals } from '@/modules/health/hooks/useReferrals';
import {
  CONSULTATION_OUTCOMES,
  CONSULTATION_TYPES,
  ESCALATED_OUTCOMES,
  FIT_FOR_DUTY,
  consultationTypeLabel,
  outcomeLabel,
  useConsultations,
  type Consultation,
} from '@/modules/health/hooks/useConsultations';
import { addDaysIso, formatDate, formatDateTime, todayIso, toneClass } from '@/modules/health/lib/format';

/**
 * The treatment and consultation log. Every clinical contact on board, the
 * observations taken, what was done and whether the person went back to
 * work. Escalated cases are separated out because they are the ones that
 * end up in an insurance claim or a flag state report.
 */
const TreatmentHistoryPage: React.FC = () => {
  const { personId, person, setPersonId, selfOnly, myPerson, access, directoryLoading } =
    useSelectedPerson('medical');
  const personal = useConsultations({ personId });
  const recent = useConsultations({ since: `${addDaysIso(todayIso(), -90)}T00:00:00Z`, limit: 300 });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Consultation | null>(null);

  const canEdit = !access.loading && access.canEdit;

  const summary = useMemo(() => {
    const rows = recent.consultations;
    return {
      total: rows.length,
      escalated: rows.filter((c) => ESCALATED_OUTCOMES.includes(c.outcome)).length,
      workRelated: rows.filter((c) => c.is_work_related).length,
      daysLost: rows.reduce((sum, c) => sum + (c.days_off_work ?? 0), 0),
    };
  }, [recent.consultations]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const renderList = (
    rows: Consultation[],
    emptyTitle: string,
    emptyDescription: string,
    showPerson = false,
  ) => {
    if (rows.length === 0) {
      return (
        <HealthEmpty
          icon={BriefcaseMedical}
          title={emptyTitle}
          description={emptyDescription}
          action={
            canEdit ? (
              <Button onClick={openCreate} className="gap-1">
                <Plus className="h-4 w-4" /> Record a consultation
              </Button>
            ) : undefined
          }
        />
      );
    }
    return (
      <div className="space-y-3">
        {rows.map((c) => (
          <ConsultationCard
            key={c.id}
            consultation={c as Consultation & { person_name?: string | null }}
            showPerson={showPerson}
            canEdit={canEdit}
            onEdit={(x) => {
              setEditing(x);
              setFormOpen(true);
            }}
            onDelete={(id) => personal.remove.mutate(id)}
          />
        ))}
      </div>
    );
  };

  let personBody: React.ReactNode;
  if (access.loading || (personId && directoryLoading && !person)) {
    personBody = <HealthLoading rows={3} />;
  } else if (selfOnly && !myPerson) {
    personBody = <NoSubjectRecord />;
  } else if (!personId) {
    personBody = (
      <HealthEmpty
        icon={Users}
        title="Choose someone"
        description="Pick a person to see every consultation they have had on board."
      />
    );
  } else if (personal.isError) {
    personBody = <HealthError error={personal.error} title="Could not load the treatment history" />;
  } else if (personal.isLoading) {
    personBody = <HealthLoading rows={3} />;
  } else {
    personBody = (
      <div className="space-y-4">
        {person && <PersonClinicalBanner person={person} compact />}
        {renderList(
          personal.consultations,
          `No consultations for ${person?.displayName ?? 'this person'}`,
          'Recording contacts here builds the history that supports an insurance claim or a flag state report.',
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={BriefcaseMedical}
        scope="medical"
        title="Incident and treatment history"
        description="Every clinical contact on board, what was done and who went back to work."
        actions={
          canEdit && (
            <Button size="sm" className="gap-1" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Record a consultation
            </Button>
          )
        }
      />

      {!selfOnly && (
        <StatGrid>
          <StatTile
            icon={BriefcaseMedical}
            label="Consultations in 90 days"
            value={recent.isLoading ? null : summary.total}
          />
          <StatTile
            icon={Activity}
            label="Referred or evacuated"
            value={recent.isLoading ? null : summary.escalated}
            tone={summary.escalated > 0 ? 'warning' : 'good'}
          />
          <StatTile
            icon={AlertTriangle}
            label="Work related"
            value={recent.isLoading ? null : summary.workRelated}
            tone={summary.workRelated > 0 ? 'warning' : 'good'}
          />
          <StatTile
            icon={CalendarClock}
            label="Days lost"
            value={recent.isLoading ? null : summary.daysLost}
          />
        </StatGrid>
      )}

      <Tabs defaultValue={selfOnly ? 'person' : 'recent'}>
        <TabsList>
          {!selfOnly && <TabsTrigger value="recent">Last 90 days</TabsTrigger>}
          {!selfOnly && <TabsTrigger value="escalated">Escalated</TabsTrigger>}
          <TabsTrigger value="person">One person</TabsTrigger>
        </TabsList>

        {!selfOnly && (
          <TabsContent value="recent" className="mt-4">
            {recent.isLoading ? (
              <HealthLoading rows={4} />
            ) : (
              renderList(
                recent.consultations,
                'No consultations in the last 90 days',
                'Recording contacts here builds the history an auditor or insurer will ask for.',
                true,
              )
            )}
          </TabsContent>
        )}

        {!selfOnly && (
          <TabsContent value="escalated" className="mt-4">
            {recent.isLoading ? (
              <HealthLoading rows={3} />
            ) : (
              renderList(
                recent.consultations.filter((c) => ESCALATED_OUTCOMES.includes(c.outcome)),
                'Nothing escalated',
                'No case in the last 90 days went beyond the vessel.',
                true,
              )
            )}
          </TabsContent>
        )}

        <TabsContent value="person" className="mt-4 space-y-4">
          {!selfOnly && (
            <PersonPicker
              value={personId}
              onChange={(id) => setPersonId(id)}
              includeInactive
              placeholder="Choose whose history to see"
              className="md:w-[420px]"
            />
          )}
          {personBody}
        </TabsContent>
      </Tabs>

      <ConsultationDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        consultation={editing}
        personId={personId}
        onSubmit={(values) => personal.save.mutateAsync(values)}
        busy={personal.isMutating}
      />
    </div>
  );
};

const ConsultationCard: React.FC<{
  consultation: Consultation & { person_name?: string | null; practitioner_name?: string | null };
  showPerson: boolean;
  canEdit: boolean;
  onEdit: (c: Consultation) => void;
  onDelete: (id: string) => void;
}> = ({ consultation: c, showPerson, canEdit, onEdit, onDelete }) => {
  const escalated = ESCALATED_OUTCOMES.includes(c.outcome);
  const vitals = [
    c.temperature_c !== null ? `${c.temperature_c}°C` : null,
    c.pulse_bpm !== null ? `HR ${c.pulse_bpm}` : null,
    c.blood_pressure_systolic !== null && c.blood_pressure_diastolic !== null
      ? `BP ${c.blood_pressure_systolic}/${c.blood_pressure_diastolic}`
      : null,
    c.oxygen_saturation !== null ? `SpO2 ${c.oxygen_saturation}%` : null,
    c.respiratory_rate !== null ? `RR ${c.respiratory_rate}` : null,
    c.pain_score !== null ? `Pain ${c.pain_score}/10` : null,
  ].filter(Boolean);

  return (
    <Card className={cn(escalated && 'border-warning/40')}>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">{c.consultation_number}</span>
              {showPerson && c.person_name && (
                <span className="text-sm text-muted-foreground">{c.person_name}</span>
              )}
              <Badge variant="outline" className="text-[10px]">
                {consultationTypeLabel(c.consultation_type)}
              </Badge>
              <Badge
                variant="outline"
                className={cn('text-[10px]', escalated ? toneClass.warning : toneClass.ok)}
              >
                {outcomeLabel(c.outcome)}
              </Badge>
              {c.is_work_related && (
                <Badge variant="outline" className={cn('text-[10px]', toneClass.warning)}>
                  Work related
                </Badge>
              )}
              {c.telemedicine_used && (
                <Badge variant="outline" className="text-[10px]">
                  Telemedicine
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {[
                formatDateTime(c.occurred_at),
                c.location,
                c.practitioner_name,
                c.fit_for_duty ? FIT_FOR_DUTY.find((f) => f.value === c.fit_for_duty)?.label : null,
                c.days_off_work ? `${c.days_off_work} days off` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          {canEdit && (
            <div className="flex shrink-0 gap-1">
              <Button variant="ghost" size="icon" aria-label="Edit consultation" onClick={() => onEdit(c)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete consultation"
                onClick={() => onDelete(c.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {c.presenting_complaint && (
          <p className="text-sm text-foreground">
            <span className="text-muted-foreground">Presenting: </span>
            {c.presenting_complaint}
          </p>
        )}
        {vitals.length > 0 && (
          <p className="text-xs text-muted-foreground">{vitals.join(' · ')}</p>
        )}
        {c.assessment && (
          <p className="text-sm text-foreground">
            <span className="text-muted-foreground">Assessment: </span>
            {c.assessment}
          </p>
        )}
        {c.treatment_given && (
          <p className="text-sm text-foreground">
            <span className="text-muted-foreground">Treatment: </span>
            {c.treatment_given}
          </p>
        )}
        {c.medication_given && (
          <p className="text-sm text-foreground">
            <span className="text-muted-foreground">Medication: </span>
            {c.medication_given}
          </p>
        )}
        {c.telemedicine_provider && (
          <p className="text-xs text-muted-foreground">
            {c.telemedicine_provider}
            {c.telemedicine_case_ref ? ` · case ${c.telemedicine_case_ref}` : ''}
          </p>
        )}
        {c.follow_up_on && (
          <p className="text-xs text-muted-foreground">Follow up {formatDate(c.follow_up_on)}</p>
        )}
      </CardContent>
    </Card>
  );
};

const ConsultationDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  consultation: Consultation | null;
  personId: string | null;
  onSubmit: (values: Partial<Consultation> & { person_id?: string }) => Promise<unknown>;
  busy: boolean;
}> = ({ open, onOpenChange, consultation, personId, onSubmit, busy }) => {
  const { vessels, selectedVesselId } = useVessel();
  const practitioners = usePractitioners('medical');
  const { settings } = useHealthSettings();
  const referrals = useReferrals();
  const [target, setTarget] = useState<string | null>(personId);
  const [raiseReferral, setRaiseReferral] = useState(false);

  const [form, setForm] = useState({
    occurred_at: new Date().toISOString().slice(0, 16),
    consultation_type: 'walk_in',
    location: '',
    presenting_complaint: '',
    history: '',
    observations: '',
    temperature_c: '',
    pulse_bpm: '',
    respiratory_rate: '',
    blood_pressure_systolic: '',
    blood_pressure_diastolic: '',
    oxygen_saturation: '',
    pain_score: '',
    assessment: '',
    treatment_given: '',
    medication_given: '',
    outcome: 'resolved',
    fit_for_duty: 'fit',
    days_off_work: '',
    follow_up_on: '',
    telemedicine_used: false,
    telemedicine_provider: '',
    telemedicine_case_ref: '',
    attended_by_practitioner_id: 'none',
    vessel_id: selectedVesselId ?? 'none',
    is_work_related: false,
    is_confidential: false,
    notes: '',
  });

  React.useEffect(() => {
    if (!open) return;
    setTarget(consultation ? consultation.person_id : personId);
    setRaiseReferral(false);
    if (consultation) {
      setForm({
        occurred_at: consultation.occurred_at.slice(0, 16),
        consultation_type: consultation.consultation_type,
        location: consultation.location ?? '',
        presenting_complaint: consultation.presenting_complaint ?? '',
        history: consultation.history ?? '',
        observations: consultation.observations ?? '',
        temperature_c: consultation.temperature_c?.toString() ?? '',
        pulse_bpm: consultation.pulse_bpm?.toString() ?? '',
        respiratory_rate: consultation.respiratory_rate?.toString() ?? '',
        blood_pressure_systolic: consultation.blood_pressure_systolic?.toString() ?? '',
        blood_pressure_diastolic: consultation.blood_pressure_diastolic?.toString() ?? '',
        oxygen_saturation: consultation.oxygen_saturation?.toString() ?? '',
        pain_score: consultation.pain_score?.toString() ?? '',
        assessment: consultation.assessment ?? '',
        treatment_given: consultation.treatment_given ?? '',
        medication_given: consultation.medication_given ?? '',
        outcome: consultation.outcome,
        fit_for_duty: consultation.fit_for_duty ?? 'fit',
        days_off_work: consultation.days_off_work?.toString() ?? '',
        follow_up_on: consultation.follow_up_on ?? '',
        telemedicine_used: consultation.telemedicine_used,
        telemedicine_provider: consultation.telemedicine_provider ?? '',
        telemedicine_case_ref: consultation.telemedicine_case_ref ?? '',
        attended_by_practitioner_id: consultation.attended_by_practitioner_id ?? 'none',
        vessel_id: consultation.vessel_id ?? 'none',
        is_work_related: consultation.is_work_related,
        is_confidential: consultation.is_confidential,
        notes: consultation.notes ?? '',
      });
    } else {
      setForm((prev) => ({
        ...prev,
        occurred_at: new Date().toISOString().slice(0, 16),
        presenting_complaint: '',
        history: '',
        observations: '',
        temperature_c: '',
        pulse_bpm: '',
        respiratory_rate: '',
        blood_pressure_systolic: '',
        blood_pressure_diastolic: '',
        oxygen_saturation: '',
        pain_score: '',
        assessment: '',
        treatment_given: '',
        medication_given: '',
        outcome: 'resolved',
        fit_for_duty: 'fit',
        days_off_work: '',
        follow_up_on: '',
        telemedicine_used: false,
        telemedicine_provider: settings?.telemedicine_provider ?? '',
        telemedicine_case_ref: '',
        notes: '',
        vessel_id: selectedVesselId ?? 'none',
      }));
    }
  }, [open, consultation, personId, selectedVesselId, settings?.telemedicine_provider]);

  const set = (key: keyof typeof form) => (value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const num = (value: string) => (value === '' ? null : Number(value));

  const submit = async () => {
    if (!target) return;
    await onSubmit({
      ...(consultation ? { id: consultation.id } : {}),
      person_id: target,
      occurred_at: new Date(form.occurred_at).toISOString(),
      consultation_type: form.consultation_type,
      location: form.location || null,
      presenting_complaint: form.presenting_complaint || null,
      history: form.history || null,
      observations: form.observations || null,
      temperature_c: num(form.temperature_c),
      pulse_bpm: num(form.pulse_bpm),
      respiratory_rate: num(form.respiratory_rate),
      blood_pressure_systolic: num(form.blood_pressure_systolic),
      blood_pressure_diastolic: num(form.blood_pressure_diastolic),
      oxygen_saturation: num(form.oxygen_saturation),
      pain_score: num(form.pain_score),
      assessment: form.assessment || null,
      treatment_given: form.treatment_given || null,
      medication_given: form.medication_given || null,
      outcome: form.outcome,
      fit_for_duty: form.fit_for_duty,
      days_off_work: num(form.days_off_work),
      follow_up_on: form.follow_up_on || null,
      telemedicine_used: form.telemedicine_used,
      telemedicine_provider: form.telemedicine_provider || null,
      telemedicine_case_ref: form.telemedicine_case_ref || null,
      attended_by_practitioner_id:
        form.attended_by_practitioner_id === 'none' ? null : form.attended_by_practitioner_id,
      vessel_id: form.vessel_id === 'none' ? null : form.vessel_id,
      is_work_related: form.is_work_related,
      is_confidential: form.is_confidential,
      notes: form.notes || null,
    });

    if (raiseReferral && form.outcome === 'referred_physio') {
      await referrals.save.mutateAsync({
        person_id: target,
        from_discipline: 'medical',
        to_discipline: 'physio',
        reason: form.assessment || form.presenting_complaint || 'Referred from a consultation',
        clinical_notes: form.treatment_given || null,
        urgency: 'routine',
        vessel_id: form.vessel_id === 'none' ? null : form.vessel_id,
      });
    }

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{consultation ? 'Edit consultation' : 'Record a consultation'}</DialogTitle>
          <DialogDescription>
            The consultation number is generated for you. Anything recorded here is clinical and is
            never shown to the bridge or HR.
          </DialogDescription>
        </DialogHeader>

        {!consultation && (
          <div className="space-y-1.5">
            <Label>Patient</Label>
            <PersonPicker value={target} onChange={(id) => setTarget(id)} includeInactive />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cons-when">When</Label>
            <Input
              id="cons-when"
              type="datetime-local"
              value={form.occurred_at}
              onChange={(e) => set('occurred_at')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cons-type">Type</Label>
            <Select value={form.consultation_type} onValueChange={set('consultation_type')}>
              <SelectTrigger id="cons-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONSULTATION_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cons-vessel">Vessel</Label>
            <Select value={form.vessel_id} onValueChange={set('vessel_id')}>
              <SelectTrigger id="cons-vessel">
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not set</SelectItem>
                {vessels.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cons-location">Location</Label>
            <Input
              id="cons-location"
              placeholder="Ship's hospital, cabin, tender"
              value={form.location}
              onChange={(e) => set('location')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cons-practitioner">Attended by</Label>
            <Select
              value={form.attended_by_practitioner_id}
              onValueChange={set('attended_by_practitioner_id')}
            >
              <SelectTrigger id="cons-practitioner">
                <SelectValue placeholder="Not recorded" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not recorded</SelectItem>
                {practitioners.active.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cons-complaint">Presenting complaint</Label>
          <Textarea
            id="cons-complaint"
            rows={2}
            value={form.presenting_complaint}
            onChange={(e) => set('presenting_complaint')(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cons-history">History</Label>
          <Textarea
            id="cons-history"
            rows={2}
            value={form.history}
            onChange={(e) => set('history')(e.target.value)}
          />
        </div>

        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-sm font-medium text-foreground">Observations</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <VitalInput id="cons-temp" label="Temperature (°C)" value={form.temperature_c} onChange={set('temperature_c')} step="0.1" />
            <VitalInput id="cons-pulse" label="Pulse (bpm)" value={form.pulse_bpm} onChange={set('pulse_bpm')} />
            <VitalInput id="cons-rr" label="Respiratory rate" value={form.respiratory_rate} onChange={set('respiratory_rate')} />
            <VitalInput id="cons-sys" label="BP systolic" value={form.blood_pressure_systolic} onChange={set('blood_pressure_systolic')} />
            <VitalInput id="cons-dia" label="BP diastolic" value={form.blood_pressure_diastolic} onChange={set('blood_pressure_diastolic')} />
            <VitalInput id="cons-spo2" label="SpO2 (%)" value={form.oxygen_saturation} onChange={set('oxygen_saturation')} />
            <VitalInput id="cons-pain" label="Pain (0-10)" value={form.pain_score} onChange={set('pain_score')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cons-obs">Other observations</Label>
            <Textarea
              id="cons-obs"
              rows={2}
              value={form.observations}
              onChange={(e) => set('observations')(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cons-assessment">Assessment</Label>
          <Textarea
            id="cons-assessment"
            rows={2}
            value={form.assessment}
            onChange={(e) => set('assessment')(e.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cons-treatment">Treatment given</Label>
            <Textarea
              id="cons-treatment"
              rows={3}
              value={form.treatment_given}
              onChange={(e) => set('treatment_given')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cons-medication">Medication given</Label>
            <Textarea
              id="cons-medication"
              rows={3}
              value={form.medication_given}
              onChange={(e) => set('medication_given')(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Issue it from the stores as well, so the register balances.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="cons-outcome">Outcome</Label>
            <Select value={form.outcome} onValueChange={set('outcome')}>
              <SelectTrigger id="cons-outcome">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONSULTATION_OUTCOMES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cons-fit">Fit for duty</Label>
            <Select value={form.fit_for_duty} onValueChange={set('fit_for_duty')}>
              <SelectTrigger id="cons-fit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIT_FOR_DUTY.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cons-days">Days off work</Label>
            <Input
              id="cons-days"
              type="number"
              min={0}
              value={form.days_off_work}
              onChange={(e) => set('days_off_work')(e.target.value)}
            />
          </div>
        </div>

        {form.outcome === 'referred_physio' && !consultation && (
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label htmlFor="cons-refer" className="text-sm">
                Raise a physio referral
              </Label>
              <p className="text-xs text-muted-foreground">
                Creates the referral so the physiotherapist sees it in their list.
              </p>
            </div>
            <Switch id="cons-refer" checked={raiseReferral} onCheckedChange={setRaiseReferral} />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cons-followup">Follow up on</Label>
            <Input
              id="cons-followup"
              type="date"
              value={form.follow_up_on}
              onChange={(e) => set('follow_up_on')(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <Label htmlFor="cons-work" className="text-sm">
              Work related
            </Label>
            <Switch
              id="cons-work"
              checked={form.is_work_related}
              onCheckedChange={set('is_work_related')}
            />
          </div>
        </div>

        <div className="space-y-3 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="cons-tele" className="text-sm">
              Telemedicine was used
            </Label>
            <Switch
              id="cons-tele"
              checked={form.telemedicine_used}
              onCheckedChange={set('telemedicine_used')}
            />
          </div>
          {form.telemedicine_used && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cons-tele-provider">Provider</Label>
                <Input
                  id="cons-tele-provider"
                  value={form.telemedicine_provider}
                  onChange={(e) => set('telemedicine_provider')(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cons-tele-ref">Case reference</Label>
                <Input
                  id="cons-tele-ref"
                  value={form.telemedicine_case_ref}
                  onChange={(e) => set('telemedicine_case_ref')(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cons-notes">Notes</Label>
          <Textarea
            id="cons-notes"
            rows={2}
            value={form.notes}
            onChange={(e) => set('notes')(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !target} className="gap-1">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stethoscope className="h-4 w-4" />}
            {consultation ? 'Save' : 'Record'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const VitalInput: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  step?: string;
}> = ({ id, label, value, onChange, step }) => (
  <div className="space-y-1.5">
    <Label htmlFor={id} className="text-xs">
      {label}
    </Label>
    <Input id={id} type="number" step={step} value={value} onChange={(e) => onChange(e.target.value)} />
  </div>
);

export default TreatmentHistoryPage;

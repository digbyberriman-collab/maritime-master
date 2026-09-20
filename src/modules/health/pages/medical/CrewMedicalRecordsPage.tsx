import React, { useEffect, useState } from 'react';
import { ClipboardCheck, HeartPulse, Loader2, Save, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import { PersonPicker } from '@/modules/health/components/PersonPicker';
import {
  HealthError,
  HealthLoading,
  NoSubjectRecord,
  PickPersonPrompt,
} from '@/modules/health/components/HealthStates';
import { PersonClinicalBanner } from '@/modules/health/components/medical/PersonClinicalBanner';
import { useSelectedPerson } from '@/modules/health/hooks/useSelectedPerson';
import {
  BLOOD_GROUPS,
  useAllergies,
  useConditions,
  useMedications,
  usePatientRecord,
} from '@/modules/health/hooks/usePatientRecord';
import { formatDate } from '@/modules/health/lib/format';

/**
 * The master clinical record for one person: blood group, history, the
 * practice and insurer to contact, and the alert a medic must see first.
 * Day-to-day detail lives on the dedicated pages this links out to.
 */
const CrewMedicalRecordsPage: React.FC = () => {
  const { personId, person, setPersonId, selfOnly, myPerson, access, directoryLoading } =
    useSelectedPerson('medical');
  const record = usePatientRecord(personId);
  const allergies = useAllergies({ personId, activeOnly: true });
  const conditions = useConditions({ personId, activeOnly: true });
  const medications = useMedications({ personId, activeOnly: true });

  const canEdit = !access.loading && access.canEdit;

  const [form, setForm] = useState({
    blood_group: 'unknown',
    height_cm: '',
    weight_kg: '',
    organ_donor: false,
    gp_name: '',
    gp_contact: '',
    insurance_provider: '',
    insurance_policy_number: '',
    insurance_contact: '',
    medical_history: '',
    surgical_history: '',
    family_history: '',
    smoker: 'never',
    alcohol_units_week: '',
    critical_alert: '',
    notes: '',
  });

  useEffect(() => {
    const r = record.record;
    setForm({
      blood_group: r?.blood_group ?? 'unknown',
      height_cm: r?.height_cm != null ? String(r.height_cm) : '',
      weight_kg: r?.weight_kg != null ? String(r.weight_kg) : '',
      organ_donor: r?.organ_donor ?? false,
      gp_name: r?.gp_name ?? '',
      gp_contact: r?.gp_contact ?? '',
      insurance_provider: r?.insurance_provider ?? '',
      insurance_policy_number: r?.insurance_policy_number ?? '',
      insurance_contact: r?.insurance_contact ?? '',
      medical_history: r?.medical_history ?? '',
      surgical_history: r?.surgical_history ?? '',
      family_history: r?.family_history ?? '',
      smoker: r?.smoker ?? 'never',
      alcohol_units_week: r?.alcohol_units_week != null ? String(r.alcohol_units_week) : '',
      critical_alert: r?.critical_alert ?? '',
      notes: r?.notes ?? '',
    });
  }, [record.record]);

  const set = (key: keyof typeof form) => (value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const save = () =>
    record.save.mutate({
      blood_group: form.blood_group,
      height_cm: form.height_cm ? Number(form.height_cm) : null,
      weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
      organ_donor: form.organ_donor,
      gp_name: form.gp_name || null,
      gp_contact: form.gp_contact || null,
      insurance_provider: form.insurance_provider || null,
      insurance_policy_number: form.insurance_policy_number || null,
      insurance_contact: form.insurance_contact || null,
      medical_history: form.medical_history || null,
      surgical_history: form.surgical_history || null,
      family_history: form.family_history || null,
      smoker: form.smoker,
      alcohol_units_week: form.alcohol_units_week ? Number(form.alcohol_units_week) : null,
      critical_alert: form.critical_alert || null,
      notes: form.notes || null,
      last_reviewed_on: new Date().toISOString().slice(0, 10),
    });

  let body: React.ReactNode;
  if (access.loading || (personId && directoryLoading && !person)) {
    body = <HealthLoading rows={3} />;
  } else if (selfOnly && !myPerson) {
    body = <NoSubjectRecord />;
  } else if (!personId) {
    body = <PickPersonPrompt what="medical record" icon={Users} />;
  } else if (!person) {
    body = <HealthError error={new Error('That person is not in your company directory.')} />;
  } else if (record.isError) {
    body = <HealthError error={record.error} title="Could not load the medical record" />;
  } else if (record.isLoading) {
    body = <HealthLoading rows={3} />;
  } else {
    body = (
      <div className="space-y-4">
        <PersonClinicalBanner person={person} />

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Clinical summary</CardTitle>
              <CardDescription>
                {record.record?.last_reviewed_on
                  ? `Last reviewed ${formatDate(record.record.last_reviewed_on)}`
                  : 'Not reviewed yet'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="rec-alert">Critical alert</Label>
                <Textarea
                  id="rec-alert"
                  rows={2}
                  disabled={!canEdit}
                  value={form.critical_alert}
                  onChange={(e) => set('critical_alert')(e.target.value)}
                  placeholder="Anything that must be seen before treatment begins"
                />
                <p className="text-xs text-muted-foreground">
                  Shown at the top of every page for this person.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="rec-blood">Blood group</Label>
                  <Select
                    value={form.blood_group}
                    onValueChange={set('blood_group')}
                    disabled={!canEdit}
                  >
                    <SelectTrigger id="rec-blood">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BLOOD_GROUPS.map((g) => (
                        <SelectItem key={g} value={g}>
                          {g === 'unknown' ? 'Not known' : g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rec-height">Height (cm)</Label>
                  <Input
                    id="rec-height"
                    type="number"
                    disabled={!canEdit}
                    value={form.height_cm}
                    onChange={(e) => set('height_cm')(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rec-weight">Weight (kg)</Label>
                  <Input
                    id="rec-weight"
                    type="number"
                    step="0.1"
                    disabled={!canEdit}
                    value={form.weight_kg}
                    onChange={(e) => set('weight_kg')(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rec-history">Medical history</Label>
                <Textarea
                  id="rec-history"
                  rows={3}
                  disabled={!canEdit}
                  value={form.medical_history}
                  onChange={(e) => set('medical_history')(e.target.value)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="rec-surgical">Surgical history</Label>
                  <Textarea
                    id="rec-surgical"
                    rows={3}
                    disabled={!canEdit}
                    value={form.surgical_history}
                    onChange={(e) => set('surgical_history')(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rec-family">Family history</Label>
                  <Textarea
                    id="rec-family"
                    rows={3}
                    disabled={!canEdit}
                    value={form.family_history}
                    onChange={(e) => set('family_history')(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="rec-smoker">Smoking</Label>
                  <Select value={form.smoker} onValueChange={set('smoker')} disabled={!canEdit}>
                    <SelectTrigger id="rec-smoker">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="never">Never</SelectItem>
                      <SelectItem value="former">Former</SelectItem>
                      <SelectItem value="current">Current</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rec-alcohol">Alcohol (units a week)</Label>
                  <Input
                    id="rec-alcohol"
                    type="number"
                    disabled={!canEdit}
                    value={form.alcohol_units_week}
                    onChange={(e) => set('alcohol_units_week')(e.target.value)}
                  />
                </div>
                <div className="flex items-end justify-between gap-3 rounded-lg border p-3">
                  <Label htmlFor="rec-donor" className="text-sm">
                    Organ donor
                  </Label>
                  <Switch
                    id="rec-donor"
                    disabled={!canEdit}
                    checked={form.organ_donor}
                    onCheckedChange={set('organ_donor')}
                  />
                </div>
              </div>

              {canEdit && (
                <Button onClick={save} disabled={record.isMutating} className="gap-1">
                  {record.isMutating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save record
                </Button>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Currently</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <SummaryLine
                  label="Active allergies"
                  value={allergies.allergies.length}
                  detail={allergies.allergies.map((a) => a.allergen).join(', ')}
                />
                <SummaryLine
                  label="Ongoing conditions"
                  value={conditions.conditions.length}
                  detail={conditions.conditions.map((c) => c.condition_name).join(', ')}
                />
                <SummaryLine
                  label="Regular medication"
                  value={medications.medications.length}
                  detail={medications.medications.map((m) => m.medication_name).join(', ')}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Contacts</CardTitle>
                <CardDescription>Who to call ashore.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="rec-gp">Doctor or practice</Label>
                  <Input
                    id="rec-gp"
                    disabled={!canEdit}
                    value={form.gp_name}
                    onChange={(e) => set('gp_name')(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rec-gp-contact">Practice contact</Label>
                  <Input
                    id="rec-gp-contact"
                    disabled={!canEdit}
                    value={form.gp_contact}
                    onChange={(e) => set('gp_contact')(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rec-insurer">Insurer</Label>
                  <Input
                    id="rec-insurer"
                    disabled={!canEdit}
                    value={form.insurance_provider}
                    onChange={(e) => set('insurance_provider')(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rec-policy">Policy number</Label>
                  <Input
                    id="rec-policy"
                    disabled={!canEdit}
                    value={form.insurance_policy_number}
                    onChange={(e) => set('insurance_policy_number')(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rec-insurer-contact">Insurer contact</Label>
                  <Input
                    id="rec-insurer-contact"
                    disabled={!canEdit}
                    value={form.insurance_contact}
                    onChange={(e) => set('insurance_contact')(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={HeartPulse}
        scope="medical"
        title="Crew medical records"
        description="The clinical record a medic reads before treating someone."
        toolbar={
          !selfOnly ? (
            <PersonPicker
              value={personId}
              onChange={(id) => setPersonId(id)}
              includeInactive
              placeholder="Choose whose record to open"
              className="md:w-[420px]"
            />
          ) : undefined
        }
        actions={
          record.record?.last_reviewed_on ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <ClipboardCheck className="h-4 w-4" />
              Reviewed {formatDate(record.record.last_reviewed_on)}
            </span>
          ) : undefined
        }
      />
      {body}
    </div>
  );
};

const SummaryLine: React.FC<{ label: string; value: number; detail: string }> = ({
  label,
  value,
  detail,
}) => (
  <div>
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
    {detail && <p className="truncate text-xs text-muted-foreground">{detail}</p>}
  </div>
);

export default CrewMedicalRecordsPage;

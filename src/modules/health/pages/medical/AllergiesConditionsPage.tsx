import React, { useState } from 'react';
import { AlertTriangle, HeartPulse, Loader2, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import {
  HealthEmpty,
  HealthError,
  HealthLoading,
  NoSubjectRecord,
  PickPersonPrompt,
} from '@/modules/health/components/HealthStates';
import { PersonPicker } from '@/modules/health/components/PersonPicker';
import { PersonClinicalBanner } from '@/modules/health/components/medical/PersonClinicalBanner';
import { useSelectedPerson } from '@/modules/health/hooks/useSelectedPerson';
import {
  ALLERGY_SEVERITIES,
  ALLERGY_TYPES,
  CONDITION_CATEGORIES,
  useAllergies,
  useConditions,
  type Allergy,
  type Condition,
} from '@/modules/health/hooks/usePatientRecord';
import { SEVERITY_TONE, badgeToneClass, formatDate, humanise } from '@/modules/health/lib/format';

/**
 * Allergies and long-term conditions for one person. Allergies are the one
 * clinical record wellness staff can read, under the subject's consent,
 * because the galley has to know what not to serve.
 */
const AllergiesConditionsPage: React.FC = () => {
  const { personId, person, setPersonId, selfOnly, myPerson, access, directoryLoading } =
    useSelectedPerson('medical');
  const allergies = useAllergies({ personId });
  const conditions = useConditions({ personId });

  const [allergyOpen, setAllergyOpen] = useState(false);
  const [editingAllergy, setEditingAllergy] = useState<Allergy | null>(null);
  const [conditionOpen, setConditionOpen] = useState(false);
  const [editingCondition, setEditingCondition] = useState<Condition | null>(null);

  const canEdit = !access.loading && access.canEdit;

  let body: React.ReactNode;
  if (access.loading || (personId && directoryLoading && !person)) {
    body = <HealthLoading rows={3} />;
  } else if (selfOnly && !myPerson) {
    body = <NoSubjectRecord />;
  } else if (!personId) {
    body = <PickPersonPrompt what="allergies and conditions" icon={Users} />;
  } else if (allergies.isError) {
    body = <HealthError error={allergies.error} title="Could not load allergies" />;
  } else if (allergies.isLoading || conditions.isLoading) {
    body = <HealthLoading rows={3} />;
  } else {
    body = (
      <div className="space-y-4">
        {person && <PersonClinicalBanner person={person} compact />}

        {person && !person.consent_share_safety_flags && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Safety flags are not shared</AlertTitle>
            <AlertDescription>
              This person has not consented to the galley, spa and gym seeing their allergies. Only
              medical staff will see what is recorded here.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-base">Allergies</CardTitle>
                <CardDescription>Shared with the galley when consent is given.</CardDescription>
              </div>
              {canEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => {
                    setEditingAllergy(null);
                    setAllergyOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" /> Add
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {allergies.allergies.length === 0 ? (
                <HealthEmpty
                  icon={AlertTriangle}
                  title="No allergies recorded"
                  description="Recording none is not the same as not asking. Confirm with the person."
                  className="border-0 p-6"
                />
              ) : (
                allergies.allergies.map((a) => (
                  <div
                    key={a.id}
                    className={cn(
                      'rounded-lg border p-3',
                      !a.is_active && 'opacity-60',
                      (a.severity === 'anaphylaxis' || a.severity === 'severe') &&
                        a.is_active &&
                        'border-destructive/40',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-foreground">{a.allergen}</span>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px]',
                              badgeToneClass[SEVERITY_TONE[a.severity] ?? 'default'],
                            )}
                          >
                            {humanise(a.severity)}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {humanise(a.allergy_type)}
                          </Badge>
                          {a.carries_autoinjector && (
                            <Badge variant="outline" className="text-[10px]">
                              Carries auto-injector
                            </Badge>
                          )}
                          {!a.is_active && (
                            <Badge variant="outline" className="text-[10px]">
                              No longer active
                            </Badge>
                          )}
                        </div>
                        {a.reaction && (
                          <p className="mt-1 text-xs text-muted-foreground">Reaction: {a.reaction}</p>
                        )}
                        {a.treatment && (
                          <p className="text-xs text-muted-foreground">Treatment: {a.treatment}</p>
                        )}
                      </div>
                      {canEdit && (
                        <div className="flex shrink-0 gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Edit allergy"
                            onClick={() => {
                              setEditingAllergy(a);
                              setAllergyOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete allergy"
                            onClick={() => allergies.remove.mutate(a.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-base">Conditions</CardTitle>
                <CardDescription>Clinical only. Never shared with wellness staff.</CardDescription>
              </div>
              {canEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => {
                    setEditingCondition(null);
                    setConditionOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" /> Add
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {conditions.conditions.length === 0 ? (
                <HealthEmpty
                  icon={HeartPulse}
                  title="No conditions recorded"
                  description="Long-term conditions that affect treatment or fitness belong here."
                  className="border-0 p-6"
                />
              ) : (
                conditions.conditions.map((c) => (
                  <div
                    key={c.id}
                    className={cn('rounded-lg border p-3', c.status === 'resolved' && 'opacity-60')}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-foreground">{c.condition_name}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {humanise(c.status)}
                          </Badge>
                          {c.category && (
                            <Badge variant="outline" className="text-[10px]">
                              {humanise(c.category)}
                            </Badge>
                          )}
                          {c.affects_fitness && (
                            <Badge
                              variant="outline"
                              className={cn('text-[10px]', badgeToneClass.warning)}
                            >
                              Affects fitness
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {[
                            c.diagnosed_on ? `Diagnosed ${formatDate(c.diagnosed_on)}` : null,
                            c.resolved_on ? `Resolved ${formatDate(c.resolved_on)}` : null,
                            c.severity ? humanise(c.severity) : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        {c.treatment_summary && (
                          <p className="text-xs text-muted-foreground">{c.treatment_summary}</p>
                        )}
                      </div>
                      {canEdit && (
                        <div className="flex shrink-0 gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Edit condition"
                            onClick={() => {
                              setEditingCondition(c);
                              setConditionOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete condition"
                            onClick={() => conditions.remove.mutate(c.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={AlertTriangle}
        scope="medical"
        title="Allergies and conditions"
        description="What would harm this person and what they live with."
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
      />
      {body}

      <AllergyDialog
        open={allergyOpen}
        onOpenChange={setAllergyOpen}
        allergy={editingAllergy}
        personId={personId}
        onSubmit={(values) => allergies.save.mutateAsync(values)}
        busy={allergies.isMutating}
      />

      <ConditionDialog
        open={conditionOpen}
        onOpenChange={setConditionOpen}
        condition={editingCondition}
        personId={personId}
        onSubmit={(values) => conditions.save.mutateAsync(values)}
        busy={conditions.isMutating}
      />
    </div>
  );
};

const AllergyDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allergy: Allergy | null;
  personId: string | null;
  onSubmit: (values: Partial<Allergy> & { allergen: string; person_id?: string }) => Promise<unknown>;
  busy: boolean;
}> = ({ open, onOpenChange, allergy, personId, onSubmit, busy }) => {
  const [form, setForm] = useState({
    allergen: '',
    allergy_type: 'food',
    severity: 'moderate',
    reaction: '',
    treatment: '',
    carries_autoinjector: false,
    diagnosed_on: '',
    is_active: true,
    notes: '',
  });

  React.useEffect(() => {
    if (!open) return;
    setForm({
      allergen: allergy?.allergen ?? '',
      allergy_type: allergy?.allergy_type ?? 'food',
      severity: allergy?.severity ?? 'moderate',
      reaction: allergy?.reaction ?? '',
      treatment: allergy?.treatment ?? '',
      carries_autoinjector: allergy?.carries_autoinjector ?? false,
      diagnosed_on: allergy?.diagnosed_on ?? '',
      is_active: allergy?.is_active ?? true,
      notes: allergy?.notes ?? '',
    });
  }, [open, allergy]);

  const set = (key: keyof typeof form) => (value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    if (!form.allergen.trim() || (!allergy && !personId)) return;
    await onSubmit({
      ...(allergy ? { id: allergy.id } : { person_id: personId as string }),
      allergen: form.allergen.trim(),
      allergy_type: form.allergy_type,
      severity: form.severity,
      reaction: form.reaction || null,
      treatment: form.treatment || null,
      carries_autoinjector: form.carries_autoinjector,
      diagnosed_on: form.diagnosed_on || null,
      is_active: form.is_active,
      notes: form.notes || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{allergy ? 'Edit allergy' : 'Add an allergy'}</DialogTitle>
          <DialogDescription>
            Severe and anaphylactic allergies appear on the banner at the top of every page for this
            person.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="al-allergen">Allergen</Label>
          <Input
            id="al-allergen"
            value={form.allergen}
            onChange={(e) => set('allergen')(e.target.value)}
            placeholder="Peanuts, penicillin, bee stings"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="al-type">Type</Label>
            <Select value={form.allergy_type} onValueChange={set('allergy_type')}>
              <SelectTrigger id="al-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALLERGY_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="al-severity">Severity</Label>
            <Select value={form.severity} onValueChange={set('severity')}>
              <SelectTrigger id="al-severity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALLERGY_SEVERITIES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="al-reaction">Reaction</Label>
          <Textarea
            id="al-reaction"
            rows={2}
            value={form.reaction}
            onChange={(e) => set('reaction')(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="al-treatment">Treatment</Label>
          <Textarea
            id="al-treatment"
            rows={2}
            value={form.treatment}
            onChange={(e) => set('treatment')(e.target.value)}
            placeholder="Adrenaline auto-injector then chlorphenamine"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="al-diagnosed">Diagnosed</Label>
            <Input
              id="al-diagnosed"
              type="date"
              value={form.diagnosed_on}
              onChange={(e) => set('diagnosed_on')(e.target.value)}
            />
          </div>
          <div className="flex items-end justify-between gap-3 rounded-lg border p-3">
            <Label htmlFor="al-auto" className="text-sm">
              Carries auto-injector
            </Label>
            <Switch
              id="al-auto"
              checked={form.carries_autoinjector}
              onCheckedChange={set('carries_autoinjector')}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <Label htmlFor="al-active" className="text-sm">
            Still active
          </Label>
          <Switch id="al-active" checked={form.is_active} onCheckedChange={set('is_active')} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !form.allergen.trim()}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {allergy ? 'Save' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ConditionDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  condition: Condition | null;
  personId: string | null;
  onSubmit: (
    values: Partial<Condition> & { condition_name: string; person_id?: string },
  ) => Promise<unknown>;
  busy: boolean;
}> = ({ open, onOpenChange, condition, personId, onSubmit, busy }) => {
  const [form, setForm] = useState({
    condition_name: '',
    category: 'other',
    severity: 'mild',
    status: 'active',
    diagnosed_on: '',
    resolved_on: '',
    treatment_summary: '',
    affects_fitness: false,
    requires_medication: false,
    notes: '',
  });

  React.useEffect(() => {
    if (!open) return;
    setForm({
      condition_name: condition?.condition_name ?? '',
      category: condition?.category ?? 'other',
      severity: condition?.severity ?? 'mild',
      status: condition?.status ?? 'active',
      diagnosed_on: condition?.diagnosed_on ?? '',
      resolved_on: condition?.resolved_on ?? '',
      treatment_summary: condition?.treatment_summary ?? '',
      affects_fitness: condition?.affects_fitness ?? false,
      requires_medication: condition?.requires_medication ?? false,
      notes: condition?.notes ?? '',
    });
  }, [open, condition]);

  const set = (key: keyof typeof form) => (value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    if (!form.condition_name.trim() || (!condition && !personId)) return;
    await onSubmit({
      ...(condition ? { id: condition.id } : { person_id: personId as string }),
      condition_name: form.condition_name.trim(),
      category: form.category,
      severity: form.severity,
      status: form.status,
      diagnosed_on: form.diagnosed_on || null,
      resolved_on: form.resolved_on || null,
      treatment_summary: form.treatment_summary || null,
      affects_fitness: form.affects_fitness,
      requires_medication: form.requires_medication,
      notes: form.notes || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{condition ? 'Edit condition' : 'Add a condition'}</DialogTitle>
          <DialogDescription>
            Marking a condition as affecting fitness does not change the certificate; record that on
            the fitness page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="co-name">Condition</Label>
          <Input
            id="co-name"
            value={form.condition_name}
            onChange={(e) => set('condition_name')(e.target.value)}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="co-category">Category</Label>
            <Select value={form.category} onValueChange={set('category')}>
              <SelectTrigger id="co-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONDITION_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="co-severity">Severity</Label>
            <Select value={form.severity} onValueChange={set('severity')}>
              <SelectTrigger id="co-severity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mild">Mild</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="severe">Severe</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="co-status">Status</Label>
            <Select value={form.status} onValueChange={set('status')}>
              <SelectTrigger id="co-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="managed">Managed</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="co-diagnosed">Diagnosed</Label>
            <Input
              id="co-diagnosed"
              type="date"
              value={form.diagnosed_on}
              onChange={(e) => set('diagnosed_on')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="co-resolved">Resolved</Label>
            <Input
              id="co-resolved"
              type="date"
              value={form.resolved_on}
              onChange={(e) => set('resolved_on')(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="co-treatment">Treatment</Label>
          <Textarea
            id="co-treatment"
            rows={3}
            value={form.treatment_summary}
            onChange={(e) => set('treatment_summary')(e.target.value)}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <Label htmlFor="co-fitness" className="text-sm">
              Affects fitness
            </Label>
            <Switch
              id="co-fitness"
              checked={form.affects_fitness}
              onCheckedChange={set('affects_fitness')}
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <Label htmlFor="co-meds" className="text-sm">
              Needs medication
            </Label>
            <Switch
              id="co-meds"
              checked={form.requires_medication}
              onCheckedChange={set('requires_medication')}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !form.condition_name.trim()}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {condition ? 'Save' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AllergiesConditionsPage;

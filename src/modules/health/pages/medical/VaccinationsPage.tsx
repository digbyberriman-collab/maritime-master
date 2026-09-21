import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  Syringe,
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
import { cn } from '@/lib/utils';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import { StatTile, StatGrid } from '@/modules/health/components/StatTile';
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
import { useHealthPeople } from '@/modules/health/hooks/useHealthPeople';
import {
  COMMON_VACCINES,
  useVaccinations,
  type Vaccination,
} from '@/modules/health/hooks/usePatientRecord';
import { expiryLabel, expiryTone, formatDate, toneClass } from '@/modules/health/lib/format';

/**
 * Vaccinations and immunisations. Yellow fever and the rest are itinerary
 * driven, so the page shows what is held and what has lapsed rather than
 * asserting a fixed requirement.
 */
const VaccinationsPage: React.FC = () => {
  const { personId, person, setPersonId, selfOnly, myPerson, access, directoryLoading } =
    useSelectedPerson('medical');
  const personal = useVaccinations({ personId });
  const fleet = useVaccinations();
  const people = useHealthPeople();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Vaccination | null>(null);

  const canEdit = !access.loading && access.canEdit;

  const expiring = useMemo(
    () =>
      fleet.vaccinations
        .filter((v) => v.valid_until)
        .map((v) => ({ ...v, tone: expiryTone(v.valid_until) }))
        .filter((v) => v.tone === 'expired' || v.tone === 'critical' || v.tone === 'warning')
        .sort((a, b) => (a.valid_until ?? '').localeCompare(b.valid_until ?? '')),
    [fleet.vaccinations],
  );

  const missing = useMemo(() => {
    const held = new Set(fleet.vaccinations.map((v) => v.person_id));
    return people.entries.filter((p) => p.isCrew && !held.has(p.id));
  }, [fleet.vaccinations, people.entries]);

  const nameById = useMemo(
    () => new Map(people.all.map((p) => [p.id, p.displayName])),
    [people.all],
  );

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  let personBody: React.ReactNode;
  if (access.loading || (personId && directoryLoading && !person)) {
    personBody = <HealthLoading rows={3} />;
  } else if (selfOnly && !myPerson) {
    personBody = <NoSubjectRecord />;
  } else if (!personId) {
    personBody = <PickPersonPrompt what="vaccination record" icon={Users} />;
  } else if (personal.isError) {
    personBody = <HealthError error={personal.error} title="Could not load vaccinations" />;
  } else if (personal.isLoading) {
    personBody = <HealthLoading rows={3} />;
  } else {
    personBody = (
      <div className="space-y-4">
        {person && <PersonClinicalBanner person={person} compact />}

        {personal.vaccinations.length === 0 ? (
          <HealthEmpty
            icon={Syringe}
            title="No vaccinations recorded"
            description="Record what this person holds so lapses are caught before the next trading area needs them."
            action={
              canEdit ? (
                <Button onClick={openCreate} className="gap-1">
                  <Plus className="h-4 w-4" /> Record a vaccination
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {personal.vaccinations.map((v) => (
              <Card key={v.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{v.vaccine}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[v.dose_label, v.administered_by, v.site].filter(Boolean).join(' · ') ||
                          'No details'}
                      </p>
                    </div>
                    {v.valid_until ? (
                      <Badge
                        variant="outline"
                        className={cn('shrink-0 text-[10px]', toneClass[expiryTone(v.valid_until)])}
                      >
                        {expiryLabel(v.valid_until)}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        No expiry
                      </Badge>
                    )}
                  </div>

                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <dt className="text-muted-foreground">Given</dt>
                    <dd className="text-foreground">{formatDate(v.administered_on)}</dd>
                    <dt className="text-muted-foreground">Valid until</dt>
                    <dd className="text-foreground">{formatDate(v.valid_until)}</dd>
                    <dt className="text-muted-foreground">Batch</dt>
                    <dd className="text-foreground">{v.batch_number ?? '—'}</dd>
                  </dl>

                  {v.exemption_reason && (
                    <p className="rounded-md bg-warning/10 p-2 text-xs text-warning">
                      Exempt: {v.exemption_reason}
                    </p>
                  )}
                  {v.notes && <p className="text-xs text-muted-foreground">{v.notes}</p>}

                  {canEdit && (
                    <div className="flex justify-end gap-1 border-t pt-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Edit vaccination"
                        onClick={() => {
                          setEditing(v);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete vaccination"
                        onClick={() => personal.remove.mutate(v.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={Syringe}
        scope="medical"
        title="Vaccinations and immunisations"
        description="What the crew hold, what has lapsed and who has nothing recorded."
        actions={
          canEdit && (
            <Button size="sm" className="gap-1" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Record a vaccination
            </Button>
          )
        }
      />

      {!selfOnly && (
        <StatGrid>
          <StatTile
            icon={Syringe}
            label="Vaccinations recorded"
            value={fleet.isLoading ? null : fleet.vaccinations.length}
          />
          <StatTile
            icon={AlertTriangle}
            label="Lapsed or lapsing"
            value={fleet.isLoading ? null : expiring.length}
            tone={expiring.length > 0 ? 'warning' : 'good'}
          />
          <StatTile
            icon={Users}
            label="Crew with nothing recorded"
            value={people.isLoading ? null : missing.length}
            tone={missing.length > 0 ? 'warning' : 'good'}
          />
          <StatTile
            icon={CheckCircle2}
            label="Crew covered"
            value={people.isLoading ? null : people.entries.filter((p) => p.isCrew).length - missing.length}
            tone="good"
          />
        </StatGrid>
      )}

      <Tabs defaultValue={selfOnly ? 'person' : 'fleet'}>
        <TabsList>
          {!selfOnly && <TabsTrigger value="fleet">Across the fleet</TabsTrigger>}
          <TabsTrigger value="person">One person</TabsTrigger>
        </TabsList>

        {!selfOnly && (
          <TabsContent value="fleet" className="mt-4 space-y-4">
            {fleet.isLoading ? (
              <HealthLoading rows={4} />
            ) : expiring.length === 0 ? (
              <HealthEmpty
                icon={CheckCircle2}
                title="Nothing lapsing"
                description="No recorded vaccination is within its warning window."
              />
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-4 py-2.5 font-medium">Person</th>
                          <th className="px-4 py-2.5 font-medium">Vaccine</th>
                          <th className="px-4 py-2.5 font-medium">Given</th>
                          <th className="px-4 py-2.5 font-medium">Valid until</th>
                          <th className="px-4 py-2.5" />
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {expiring.map((v) => (
                          <tr key={v.id} className="hover:bg-accent/40">
                            <td className="px-4 py-2.5 font-medium text-foreground">
                              {nameById.get(v.person_id) ?? '—'}
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground">{v.vaccine}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">
                              {formatDate(v.administered_on)}
                            </td>
                            <td className="px-4 py-2.5">
                              <Badge variant="outline" className={cn('text-[10px]', toneClass[v.tone])}>
                                {expiryLabel(v.valid_until)}
                              </Badge>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setPersonId(v.person_id)}
                              >
                                Open
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {missing.length > 0 && (
              <Card>
                <CardContent className="space-y-2 p-4">
                  <p className="text-sm font-medium text-foreground">
                    {missing.length} crew have no vaccination recorded
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {missing.slice(0, 24).map((p) => (
                      <Button
                        key={p.id}
                        variant="outline"
                        size="sm"
                        onClick={() => setPersonId(p.id)}
                      >
                        {p.displayName}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}

        <TabsContent value="person" className="mt-4 space-y-4">
          {!selfOnly && (
            <PersonPicker
              value={personId}
              onChange={(id) => setPersonId(id)}
              includeInactive
              placeholder="Choose whose vaccinations to see"
              className="md:w-[420px]"
            />
          )}
          {personBody}
        </TabsContent>
      </Tabs>

      <VaccinationFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        vaccination={editing}
        personId={personId}
        onSubmit={(values) => personal.save.mutateAsync(values)}
        busy={personal.isMutating}
      />
    </div>
  );
};

const VaccinationFormDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vaccination: Vaccination | null;
  personId: string | null;
  onSubmit: (values: Partial<Vaccination> & { vaccine: string; person_id?: string }) => Promise<unknown>;
  busy: boolean;
}> = ({ open, onOpenChange, vaccination, personId, onSubmit, busy }) => {
  const [target, setTarget] = useState<string | null>(personId);
  const [form, setForm] = useState({
    vaccine: '',
    dose_label: '',
    administered_on: '',
    valid_until: '',
    batch_number: '',
    administered_by: '',
    site: '',
    is_required: false,
    exemption_reason: '',
    notes: '',
  });

  React.useEffect(() => {
    if (!open) return;
    setTarget(vaccination ? vaccination.person_id : personId);
    setForm({
      vaccine: vaccination?.vaccine ?? '',
      dose_label: vaccination?.dose_label ?? '',
      administered_on: vaccination?.administered_on ?? '',
      valid_until: vaccination?.valid_until ?? '',
      batch_number: vaccination?.batch_number ?? '',
      administered_by: vaccination?.administered_by ?? '',
      site: vaccination?.site ?? '',
      is_required: vaccination?.is_required ?? false,
      exemption_reason: vaccination?.exemption_reason ?? '',
      notes: vaccination?.notes ?? '',
    });
  }, [open, vaccination, personId]);

  const set = (key: keyof typeof form) => (value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    if (!target || !form.vaccine.trim()) return;
    await onSubmit({
      ...(vaccination ? { id: vaccination.id } : {}),
      person_id: target,
      vaccine: form.vaccine.trim(),
      dose_label: form.dose_label || null,
      administered_on: form.administered_on || null,
      valid_until: form.valid_until || null,
      batch_number: form.batch_number || null,
      administered_by: form.administered_by || null,
      site: form.site || null,
      is_required: form.is_required,
      exemption_reason: form.exemption_reason || null,
      notes: form.notes || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{vaccination ? 'Edit vaccination' : 'Record a vaccination'}</DialogTitle>
          <DialogDescription>
            Yellow fever validity is set by the certificate, not the vaccine, so record what the
            certificate says.
          </DialogDescription>
        </DialogHeader>

        {!vaccination && (
          <div className="space-y-1.5">
            <Label>Person</Label>
            <PersonPicker value={target} onChange={(id) => setTarget(id)} includeInactive />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="vac-name">Vaccine</Label>
            <Input
              id="vac-name"
              list="common-vaccines"
              value={form.vaccine}
              onChange={(e) => set('vaccine')(e.target.value)}
            />
            <datalist id="common-vaccines">
              {COMMON_VACCINES.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vac-dose">Dose</Label>
            <Input
              id="vac-dose"
              placeholder="First, booster"
              value={form.dose_label}
              onChange={(e) => set('dose_label')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vac-given">Given on</Label>
            <Input
              id="vac-given"
              type="date"
              value={form.administered_on}
              onChange={(e) => set('administered_on')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vac-valid">Valid until</Label>
            <Input
              id="vac-valid"
              type="date"
              value={form.valid_until}
              onChange={(e) => set('valid_until')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vac-batch">Batch</Label>
            <Input
              id="vac-batch"
              value={form.batch_number}
              onChange={(e) => set('batch_number')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vac-by">Given by</Label>
            <Input
              id="vac-by"
              value={form.administered_by}
              onChange={(e) => set('administered_by')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vac-site">Site</Label>
            <Input
              id="vac-site"
              placeholder="Left deltoid"
              value={form.site}
              onChange={(e) => set('site')(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div>
            <Label htmlFor="vac-required" className="text-sm">
              Required for the current itinerary
            </Label>
            <p className="text-xs text-muted-foreground">Flags it as a compliance item, not optional.</p>
          </div>
          <Switch
            id="vac-required"
            checked={form.is_required}
            onCheckedChange={set('is_required')}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="vac-exempt">Exemption reason</Label>
          <Input
            id="vac-exempt"
            value={form.exemption_reason}
            onChange={(e) => set('exemption_reason')(e.target.value)}
            placeholder="Medical contraindication, certificate of exemption held"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="vac-notes">Notes</Label>
          <Textarea
            id="vac-notes"
            rows={2}
            value={form.notes}
            onChange={(e) => set('notes')(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !target || !form.vaccine.trim()}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {vaccination ? 'Save' : 'Record'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default VaccinationsPage;

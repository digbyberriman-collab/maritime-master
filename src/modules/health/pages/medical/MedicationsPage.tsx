import React, { useMemo, useState } from 'react';
import { Loader2, Package, Pencil, Pill, Plus, Trash2, Users } from 'lucide-react';
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
import { useSupplyItems } from '@/modules/health/hooks/useMedicalStores';
import {
  MEDICATION_ROUTES,
  useMedications,
  type Medication,
} from '@/modules/health/hooks/usePatientRecord';
import { formatDate, humanise } from '@/modules/health/lib/format';

/**
 * Medication for one person. A line can be linked to the ship's stores so a
 * medic can see at a glance whether the vessel actually carries what someone
 * depends on.
 */
const MedicationsPage: React.FC = () => {
  const { personId, person, setPersonId, selfOnly, myPerson, access, directoryLoading } =
    useSelectedPerson('medical');
  const medications = useMedications({ personId });
  const stores = useSupplyItems();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Medication | null>(null);

  const canEdit = !access.loading && access.canEdit;

  const active = useMemo(
    () => medications.medications.filter((m) => m.is_active),
    [medications.medications],
  );
  const past = useMemo(
    () => medications.medications.filter((m) => !m.is_active),
    [medications.medications],
  );

  const storeById = useMemo(() => new Map(stores.items.map((i) => [i.id, i])), [stores.items]);

  let body: React.ReactNode;
  if (access.loading || (personId && directoryLoading && !person)) {
    body = <HealthLoading rows={3} />;
  } else if (selfOnly && !myPerson) {
    body = <NoSubjectRecord />;
  } else if (!personId) {
    body = <PickPersonPrompt what="medication" icon={Users} />;
  } else if (medications.isError) {
    body = <HealthError error={medications.error} title="Could not load medication" />;
  } else if (medications.isLoading) {
    body = <HealthLoading rows={3} />;
  } else {
    body = (
      <div className="space-y-4">
        {person && <PersonClinicalBanner person={person} compact />}

        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">Current medication</CardTitle>
              <CardDescription>
                What this person takes now, and whether the vessel carries it.
              </CardDescription>
            </div>
            {canEdit && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> Add
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {active.length === 0 ? (
              <HealthEmpty
                icon={Pill}
                title="No current medication"
                description="Add anything taken regularly or prescribed for this trip."
                className="border-0 p-6"
              />
            ) : (
              active.map((m) => (
                <MedicationRow
                  key={m.id}
                  medication={m}
                  stock={m.supply_item_id ? storeById.get(m.supply_item_id) ?? null : null}
                  canEdit={canEdit}
                  onEdit={(x) => {
                    setEditing(x);
                    setFormOpen(true);
                  }}
                  onDelete={(id) => medications.remove.mutate(id)}
                />
              ))
            )}
          </CardContent>
        </Card>

        {past.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Past medication</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {past.map((m) => (
                <MedicationRow
                  key={m.id}
                  medication={m}
                  stock={null}
                  canEdit={canEdit}
                  onEdit={(x) => {
                    setEditing(x);
                    setFormOpen(true);
                  }}
                  onDelete={(id) => medications.remove.mutate(id)}
                />
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={Pill}
        scope="medical"
        title="Medications"
        description="What each person takes, at what dose, and whether the ship carries it."
        toolbar={
          !selfOnly ? (
            <PersonPicker
              value={personId}
              onChange={(id) => setPersonId(id)}
              includeInactive
              placeholder="Choose whose medication to see"
              className="md:w-[420px]"
            />
          ) : undefined
        }
      />
      {body}

      <MedicationDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        medication={editing}
        personId={personId}
        onSubmit={(values) => medications.save.mutateAsync(values)}
        busy={medications.isMutating}
      />
    </div>
  );
};

const MedicationRow: React.FC<{
  medication: Medication;
  stock: { name: string; quantity: number; unit: string } | null;
  canEdit: boolean;
  onEdit: (m: Medication) => void;
  onDelete: (id: string) => void;
}> = ({ medication: m, stock, canEdit, onEdit, onDelete }) => (
  <div className={cn('rounded-lg border p-3', !m.is_active && 'opacity-60')}>
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground">{m.medication_name}</span>
          {m.dosage && <Badge variant="outline" className="text-[10px]">{m.dosage}</Badge>}
          {m.route && (
            <Badge variant="outline" className="text-[10px]">
              {humanise(m.route)}
            </Badge>
          )}
          {m.is_regular && (
            <Badge variant="secondary" className="text-[10px]">
              Regular
            </Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {[
            m.frequency,
            m.reason ? `For ${m.reason}` : null,
            m.prescriber ? `Prescribed by ${m.prescriber}` : null,
            m.start_date ? `From ${formatDate(m.start_date)}` : null,
            m.end_date ? `To ${formatDate(m.end_date)}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {stock && (
          <p
            className={cn(
              'mt-1 flex items-center gap-1 text-xs',
              stock.quantity > 0 ? 'text-success' : 'text-destructive',
            )}
          >
            <Package className="h-3 w-3" />
            {stock.quantity > 0
              ? `${stock.quantity} ${stock.unit} in the ship's stores`
              : 'Not currently in the ship’s stores'}
          </p>
        )}
        {m.notes && <p className="text-xs text-muted-foreground">{m.notes}</p>}
      </div>
      {canEdit && (
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon" aria-label="Edit medication" onClick={() => onEdit(m)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete medication"
            onClick={() => onDelete(m.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  </div>
);

const MedicationDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  medication: Medication | null;
  personId: string | null;
  onSubmit: (
    values: Partial<Medication> & { medication_name: string; person_id?: string },
  ) => Promise<unknown>;
  busy: boolean;
}> = ({ open, onOpenChange, medication, personId, onSubmit, busy }) => {
  const stores = useSupplyItems();
  const [form, setForm] = useState({
    medication_name: '',
    dosage: '',
    frequency: '',
    route: 'oral',
    reason: '',
    prescriber: '',
    start_date: '',
    end_date: '',
    is_regular: true,
    is_active: true,
    supply_item_id: 'none',
    notes: '',
  });

  React.useEffect(() => {
    if (!open) return;
    setForm({
      medication_name: medication?.medication_name ?? '',
      dosage: medication?.dosage ?? '',
      frequency: medication?.frequency ?? '',
      route: medication?.route ?? 'oral',
      reason: medication?.reason ?? '',
      prescriber: medication?.prescriber ?? '',
      start_date: medication?.start_date ?? '',
      end_date: medication?.end_date ?? '',
      is_regular: medication?.is_regular ?? true,
      is_active: medication?.is_active ?? true,
      supply_item_id: medication?.supply_item_id ?? 'none',
      notes: medication?.notes ?? '',
    });
  }, [open, medication]);

  const set = (key: keyof typeof form) => (value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    if (!form.medication_name.trim() || (!medication && !personId)) return;
    await onSubmit({
      ...(medication ? { id: medication.id } : { person_id: personId as string }),
      medication_name: form.medication_name.trim(),
      dosage: form.dosage || null,
      frequency: form.frequency || null,
      route: form.route,
      reason: form.reason || null,
      prescriber: form.prescriber || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      is_regular: form.is_regular,
      is_active: form.is_active,
      supply_item_id: form.supply_item_id === 'none' ? null : form.supply_item_id,
      notes: form.notes || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{medication ? 'Edit medication' : 'Add medication'}</DialogTitle>
          <DialogDescription>
            Linking a ship&apos;s stores item shows whether the vessel carries it whenever the record
            is opened.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="med-name">Medication</Label>
            <Input
              id="med-name"
              value={form.medication_name}
              onChange={(e) => set('medication_name')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="med-dosage">Dose</Label>
            <Input
              id="med-dosage"
              placeholder="10 mg"
              value={form.dosage}
              onChange={(e) => set('dosage')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="med-frequency">Frequency</Label>
            <Input
              id="med-frequency"
              placeholder="Twice daily"
              value={form.frequency}
              onChange={(e) => set('frequency')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="med-route">Route</Label>
            <Select value={form.route} onValueChange={set('route')}>
              <SelectTrigger id="med-route">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEDICATION_ROUTES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="med-reason">Reason</Label>
            <Input
              id="med-reason"
              value={form.reason}
              onChange={(e) => set('reason')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="med-prescriber">Prescriber</Label>
            <Input
              id="med-prescriber"
              value={form.prescriber}
              onChange={(e) => set('prescriber')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="med-stock">Ship&apos;s stores item</Label>
            <Select value={form.supply_item_id} onValueChange={set('supply_item_id')}>
              <SelectTrigger id="med-stock">
                <SelectValue placeholder="Not linked" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not linked</SelectItem>
                {stores.items.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="med-start">Started</Label>
            <Input
              id="med-start"
              type="date"
              value={form.start_date}
              onChange={(e) => set('start_date')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="med-end">Ends</Label>
            <Input
              id="med-end"
              type="date"
              value={form.end_date}
              onChange={(e) => set('end_date')(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="med-notes">Notes</Label>
          <Textarea
            id="med-notes"
            rows={2}
            value={form.notes}
            onChange={(e) => set('notes')(e.target.value)}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <Label htmlFor="med-regular" className="text-sm">
              Taken regularly
            </Label>
            <Switch
              id="med-regular"
              checked={form.is_regular}
              onCheckedChange={set('is_regular')}
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <Label htmlFor="med-active" className="text-sm">
              Still taking it
            </Label>
            <Switch id="med-active" checked={form.is_active} onCheckedChange={set('is_active')} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !form.medication_name.trim()}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {medication ? 'Save' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MedicationsPage;

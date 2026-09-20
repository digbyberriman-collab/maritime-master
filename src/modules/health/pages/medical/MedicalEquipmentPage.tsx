import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Wrench,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import { HealthEmpty, HealthError, HealthLoading } from '@/modules/health/components/HealthStates';
import { CheckDialog } from '@/modules/health/components/medical/CheckDialog';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { useMedicalAccess } from '@/modules/auth/hooks/useMedicalAccess';
import { useSupplyLocations } from '@/modules/health/hooks/useMedicalStores';
import {
  EQUIPMENT_STATUSES,
  EQUIPMENT_TYPES,
  equipmentStatusLabel,
  equipmentTypeLabel,
  useKitChecks,
  useMedicalEquipment,
  type EquipmentEntry,
} from '@/modules/health/hooks/useMedicalEquipment';
import { expiryLabel, expiryTone, formatDate, toneClass } from '@/modules/health/lib/format';

/**
 * Medical equipment: AEDs, oxygen, monitors and the rest. The page leads
 * with what is defective or overdue, because an AED that has not been
 * checked is the same as not having one.
 */
const MedicalEquipmentPage: React.FC = () => {
  const access = useMedicalAccess();
  const { vessels, selectedVesselId } = useVessel();
  const [vesselId, setVesselId] = useState<string | null>(selectedVesselId);
  const equipment = useMedicalEquipment(vesselId);
  const checks = useKitChecks({ limit: 100 });

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EquipmentEntry | null>(null);
  const [checking, setChecking] = useState<EquipmentEntry | null>(null);
  const [deleting, setDeleting] = useState<EquipmentEntry | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return equipment.equipment.filter((item) => {
      if (statusFilter === 'attention' && !item.checkOverdue && !item.serviceOverdue && item.status === 'operational') {
        return false;
      }
      if (statusFilter !== 'all' && statusFilter !== 'attention' && item.status !== statusFilter) {
        return false;
      }
      if (!term) return true;
      return [item.name, item.manufacturer, item.model, item.serial_number, item.location_name]
        .filter(Boolean)
        .some((value) => (value as string).toLowerCase().includes(term));
    });
  }, [equipment.equipment, search, statusFilter]);

  let body: React.ReactNode;
  if (equipment.isError) {
    body = <HealthError error={equipment.error} title="Could not load medical equipment" />;
  } else if (equipment.isLoading) {
    body = <HealthLoading rows={4} />;
  } else if (equipment.equipment.length === 0) {
    body = (
      <HealthEmpty
        icon={Wrench}
        title="No medical equipment recorded"
        description="Add the defibrillator, oxygen sets, monitors and stretchers so their checks and services are tracked."
        action={
          access.canEdit && (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              className="gap-1"
            >
              <Plus className="h-4 w-4" /> Add equipment
            </Button>
          )
        }
      />
    );
  } else if (filtered.length === 0) {
    body = (
      <HealthEmpty
        icon={Search}
        title="Nothing matches those filters"
        description="Clear the search or choose a different status."
      />
    );
  } else {
    body = (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((item) => (
          <EquipmentCard
            key={item.id}
            item={item}
            canEdit={access.canEdit}
            onEdit={(e) => {
              setEditing(e);
              setFormOpen(true);
            }}
            onCheck={setChecking}
            onDelete={setDeleting}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={Wrench}
        scope="medical"
        title="Medical equipment"
        description="Defibrillators, oxygen and diagnostics, with their checks, services and defects."
        actions={
          access.canEdit && (
            <Button
              size="sm"
              className="gap-1"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Add equipment
            </Button>
          )
        }
        toolbar={
          <>
            <Select value={vesselId ?? 'all'} onValueChange={(v) => setVesselId(v === 'all' ? null : v)}>
              <SelectTrigger className="md:w-52">
                <SelectValue placeholder="All vessels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All vessels</SelectItem>
                {vessels.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative md:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, model or serial"
                className="pl-8"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="md:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="attention">Needs attention</SelectItem>
                {EQUIPMENT_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
      />

      <StatGrid>
        <StatTile icon={Wrench} label="Items" value={equipment.isLoading ? null : equipment.summary.total} />
        <StatTile
          icon={CheckCircle2}
          label="Operational"
          value={equipment.isLoading ? null : equipment.summary.operational}
          tone="good"
        />
        <StatTile
          icon={AlertTriangle}
          label="Defective or out of service"
          value={equipment.isLoading ? null : equipment.summary.defective}
          tone={equipment.summary.defective > 0 ? 'critical' : 'good'}
        />
        <StatTile
          icon={CalendarClock}
          label="Checks overdue"
          value={equipment.isLoading ? null : equipment.summary.checkOverdue}
          hint={`${equipment.summary.serviceOverdue} services overdue`}
          tone={equipment.summary.checkOverdue > 0 ? 'warning' : 'good'}
        />
      </StatGrid>

      <Tabs defaultValue="equipment">
        <TabsList>
          <TabsTrigger value="equipment">Equipment</TabsTrigger>
          <TabsTrigger value="history">Check history</TabsTrigger>
        </TabsList>
        <TabsContent value="equipment" className="mt-4">
          {body}
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          {checks.isLoading ? (
            <HealthLoading rows={4} />
          ) : checks.checks.filter((c) => c.equipment_id).length === 0 ? (
            <HealthEmpty
              icon={ClipboardCheck}
              title="No checks recorded"
              description="Recording a check here builds the history an auditor will ask for."
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Date</th>
                        <th className="px-4 py-2.5 font-medium">Equipment</th>
                        <th className="px-4 py-2.5 font-medium">Result</th>
                        <th className="px-4 py-2.5 font-medium">Findings</th>
                        <th className="px-4 py-2.5 font-medium">Next due</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {checks.checks
                        .filter((c) => c.equipment_id)
                        .map((c) => (
                          <tr key={c.id} className="hover:bg-accent/40">
                            <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                              {formatDate(c.checked_on)}
                            </td>
                            <td className="px-4 py-2.5 font-medium text-foreground">
                              {c.equipment_name ?? '—'}
                            </td>
                            <td className="px-4 py-2.5">
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[10px]',
                                  c.result === 'fail'
                                    ? toneClass.expired
                                    : c.result === 'pass'
                                      ? toneClass.ok
                                      : toneClass.warning,
                                )}
                              >
                                {c.result === 'pass_with_actions' ? 'Pass with actions' : c.result}
                              </Badge>
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground">{c.findings ?? '—'}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">
                              {formatDate(c.next_due)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <EquipmentFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        item={editing}
        vesselId={vesselId}
        onSubmit={(values) => equipment.save.mutateAsync(values)}
        busy={equipment.isMutating}
      />

      <CheckDialog
        open={Boolean(checking)}
        onOpenChange={(open) => !open && setChecking(null)}
        equipmentId={checking?.id ?? null}
        targetName={checking?.name ?? ''}
        intervalDays={checking?.check_interval_days ?? null}
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its check history goes with it. To take it out of use instead, set the status to
              retired.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) equipment.remove.mutate(deleting.id);
                setDeleting(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

interface EquipmentCardProps {
  item: EquipmentEntry;
  canEdit: boolean;
  onEdit: (item: EquipmentEntry) => void;
  onCheck: (item: EquipmentEntry) => void;
  onDelete: (item: EquipmentEntry) => void;
}

const EquipmentCard: React.FC<EquipmentCardProps> = ({ item, canEdit, onEdit, onCheck, onDelete }) => {
  const critical = item.status === 'defective' || item.status === 'out_of_service';
  return (
    <Card className={cn(critical && 'border-destructive/40')}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{item.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {[equipmentTypeLabel(item.equipment_type), item.manufacturer, item.model]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <Badge
            variant="outline"
            className={cn('shrink-0 text-[10px]', critical ? toneClass.expired : toneClass.ok)}
          >
            {equipmentStatusLabel(item.status)}
          </Badge>
        </div>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">Location</dt>
          <dd className="truncate text-foreground">
            {[item.location_name, item.vessel_name].filter(Boolean).join(' · ') || '—'}
          </dd>
          <dt className="text-muted-foreground">Serial</dt>
          <dd className="truncate text-foreground">{item.serial_number ?? '—'}</dd>
          <dt className="text-muted-foreground">Next check</dt>
          <dd>
            {item.next_check_due ? (
              <Badge variant="outline" className={cn('text-[10px]', toneClass[expiryTone(item.next_check_due)])}>
                {expiryLabel(item.next_check_due)}
              </Badge>
            ) : (
              <span className="text-muted-foreground">Not scheduled</span>
            )}
          </dd>
          <dt className="text-muted-foreground">Next service</dt>
          <dd>
            {item.next_service_due ? (
              <Badge variant="outline" className={cn('text-[10px]', toneClass[expiryTone(item.next_service_due)])}>
                {expiryLabel(item.next_service_due)}
              </Badge>
            ) : (
              <span className="text-muted-foreground">Not scheduled</span>
            )}
          </dd>
        </dl>

        {item.defect_notes && critical && (
          <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{item.defect_notes}</p>
        )}

        {canEdit && (
          <div className="flex items-center justify-between gap-2 border-t pt-3">
            <Button variant="outline" size="sm" className="gap-1" onClick={() => onCheck(item)}>
              <ClipboardCheck className="h-4 w-4" /> Record check
            </Button>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => onEdit(item)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => onDelete(item)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

interface FormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: EquipmentEntry | null;
  vesselId: string | null;
  onSubmit: (values: Record<string, unknown> & { name: string }) => Promise<unknown>;
  busy: boolean;
}

const EquipmentFormDialog: React.FC<FormProps> = ({
  open,
  onOpenChange,
  item,
  vesselId,
  onSubmit,
  busy,
}) => {
  const { vessels } = useVessel();
  const locations = useSupplyLocations(null);
  const [form, setForm] = useState({
    name: '',
    equipment_type: 'aed',
    manufacturer: '',
    model: '',
    serial_number: '',
    asset_reference: '',
    commissioned_on: '',
    last_service_on: '',
    next_service_due: '',
    next_check_due: '',
    check_interval_days: '30',
    consumable_expiry: '',
    status: 'operational',
    defect_notes: '',
    notes: '',
    location_id: 'none',
    vessel_id: vesselId ?? 'none',
  });

  React.useEffect(() => {
    if (!open) return;
    if (item) {
      setForm({
        name: item.name,
        equipment_type: item.equipment_type,
        manufacturer: item.manufacturer ?? '',
        model: item.model ?? '',
        serial_number: item.serial_number ?? '',
        asset_reference: item.asset_reference ?? '',
        commissioned_on: item.commissioned_on ?? '',
        last_service_on: item.last_service_on ?? '',
        next_service_due: item.next_service_due ?? '',
        next_check_due: item.next_check_due ?? '',
        check_interval_days: item.check_interval_days ? String(item.check_interval_days) : '',
        consumable_expiry: item.consumable_expiry ?? '',
        status: item.status,
        defect_notes: item.defect_notes ?? '',
        notes: item.notes ?? '',
        location_id: item.location_id ?? 'none',
        vessel_id: item.vessel_id ?? 'none',
      });
    } else {
      setForm((prev) => ({
        ...prev,
        name: '',
        manufacturer: '',
        model: '',
        serial_number: '',
        defect_notes: '',
        notes: '',
        vessel_id: vesselId ?? 'none',
      }));
    }
  }, [open, item, vesselId]);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    if (!form.name.trim()) return;
    await onSubmit({
      ...(item ? { id: item.id } : {}),
      name: form.name.trim(),
      equipment_type: form.equipment_type,
      manufacturer: form.manufacturer || null,
      model: form.model || null,
      serial_number: form.serial_number || null,
      asset_reference: form.asset_reference || null,
      commissioned_on: form.commissioned_on || null,
      last_service_on: form.last_service_on || null,
      next_service_due: form.next_service_due || null,
      next_check_due: form.next_check_due || null,
      check_interval_days: form.check_interval_days ? Number(form.check_interval_days) : null,
      consumable_expiry: form.consumable_expiry || null,
      status: form.status,
      defect_notes: form.defect_notes || null,
      notes: form.notes || null,
      location_id: form.location_id === 'none' ? null : form.location_id,
      vessel_id: form.vessel_id === 'none' ? null : form.vessel_id,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item ? 'Edit equipment' : 'Add equipment'}</DialogTitle>
          <DialogDescription>
            Set a check interval and the next due date rolls forward automatically each time a check
            is recorded.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="eq-name">Name</Label>
            <Input id="eq-name" value={form.name} onChange={(e) => set('name')(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eq-type">Type</Label>
            <Select value={form.equipment_type} onValueChange={set('equipment_type')}>
              <SelectTrigger id="eq-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EQUIPMENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eq-status">Status</Label>
            <Select value={form.status} onValueChange={set('status')}>
              <SelectTrigger id="eq-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EQUIPMENT_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eq-manufacturer">Manufacturer</Label>
            <Input
              id="eq-manufacturer"
              value={form.manufacturer}
              onChange={(e) => set('manufacturer')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eq-model">Model</Label>
            <Input id="eq-model" value={form.model} onChange={(e) => set('model')(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eq-serial">Serial number</Label>
            <Input
              id="eq-serial"
              value={form.serial_number}
              onChange={(e) => set('serial_number')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eq-asset">Asset reference</Label>
            <Input
              id="eq-asset"
              value={form.asset_reference}
              onChange={(e) => set('asset_reference')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eq-vessel">Vessel</Label>
            <Select value={form.vessel_id} onValueChange={set('vessel_id')}>
              <SelectTrigger id="eq-vessel">
                <SelectValue placeholder="Not vessel specific" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not vessel specific</SelectItem>
                {vessels.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eq-location">Location</Label>
            <Select value={form.location_id} onValueChange={set('location_id')}>
              <SelectTrigger id="eq-location">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {locations.locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eq-interval">Check interval (days)</Label>
            <Input
              id="eq-interval"
              type="number"
              min={1}
              value={form.check_interval_days}
              onChange={(e) => set('check_interval_days')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eq-next-check">Next check due</Label>
            <Input
              id="eq-next-check"
              type="date"
              value={form.next_check_due}
              onChange={(e) => set('next_check_due')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eq-last-service">Last service</Label>
            <Input
              id="eq-last-service"
              type="date"
              value={form.last_service_on}
              onChange={(e) => set('last_service_on')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eq-next-service">Next service due</Label>
            <Input
              id="eq-next-service"
              type="date"
              value={form.next_service_due}
              onChange={(e) => set('next_service_due')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eq-consumable">Consumable expiry</Label>
            <Input
              id="eq-consumable"
              type="date"
              value={form.consumable_expiry}
              onChange={(e) => set('consumable_expiry')(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Pads, batteries, cylinder test date.</p>
          </div>
        </div>

        {(form.status === 'defective' || form.status === 'out_of_service') && (
          <div className="space-y-1.5">
            <Label htmlFor="eq-defect">Defect</Label>
            <Textarea
              id="eq-defect"
              rows={2}
              value={form.defect_notes}
              onChange={(e) => set('defect_notes')(e.target.value)}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="eq-notes">Notes</Label>
          <Textarea
            id="eq-notes"
            rows={2}
            value={form.notes}
            onChange={(e) => set('notes')(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !form.name.trim()}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {item ? 'Save' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MedicalEquipmentPage;

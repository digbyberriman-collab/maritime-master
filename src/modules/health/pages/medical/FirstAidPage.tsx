import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  LifeBuoy,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
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
  KIT_STATUSES,
  KIT_TYPES,
  kitStatusLabel,
  kitTypeLabel,
  useFirstAidKits,
  useKitChecks,
  type KitEntry,
} from '@/modules/health/hooks/useMedicalEquipment';
import { expiryLabel, expiryTone, formatDate, toneClass } from '@/modules/health/lib/format';

/**
 * First aid kits: the general kits, grab bags, tender kits and dive kits.
 * Each carries an inspection interval, so the page is really a due list with
 * the kits attached.
 */
const FirstAidPage: React.FC = () => {
  const access = useMedicalAccess();
  const { vessels, selectedVesselId } = useVessel();
  const [vesselId, setVesselId] = useState<string | null>(selectedVesselId);
  const kits = useFirstAidKits(vesselId);
  const checks = useKitChecks({ limit: 100 });

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<KitEntry | null>(null);
  const [checking, setChecking] = useState<KitEntry | null>(null);
  const [deleting, setDeleting] = useState<KitEntry | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return kits.kits.filter((kit) => {
      if (statusFilter === 'overdue' && !kit.inspectionOverdue) return false;
      if (statusFilter !== 'all' && statusFilter !== 'overdue' && kit.status !== statusFilter) {
        return false;
      }
      if (!term) return true;
      return [kit.name, kit.location_name, kit.seal_number, kit.vessel_name]
        .filter(Boolean)
        .some((value) => (value as string).toLowerCase().includes(term));
    });
  }, [kits.kits, search, statusFilter]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  let body: React.ReactNode;
  if (kits.isError) {
    body = <HealthError error={kits.error} title="Could not load first aid kits" />;
  } else if (kits.isLoading) {
    body = <HealthLoading rows={4} />;
  } else if (kits.kits.length === 0) {
    body = (
      <HealthEmpty
        icon={LifeBuoy}
        title="No first aid kits recorded"
        description="Add each kit on board, including the grab bags and tender kits, so inspections are tracked and nothing is forgotten in a locker."
        action={
          access.canEdit && (
            <Button onClick={openCreate} className="gap-1">
              <Plus className="h-4 w-4" /> Add a kit
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
        {filtered.map((kit) => (
          <KitCard
            key={kit.id}
            kit={kit}
            canEdit={access.canEdit}
            onEdit={(k) => {
              setEditing(k);
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
        icon={LifeBuoy}
        scope="medical"
        title="First aid"
        description="Every kit on board, when it was last opened and when it is next due an inspection."
        actions={
          access.canEdit && (
            <Button size="sm" className="gap-1" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add a kit
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
                placeholder="Search kit, location or seal"
                className="pl-8"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="md:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="overdue">Inspection overdue</SelectItem>
                {KIT_STATUSES.map((s) => (
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
        <StatTile icon={LifeBuoy} label="Kits" value={kits.isLoading ? null : kits.summary.total} />
        <StatTile
          icon={CheckCircle2}
          label="Ready"
          value={kits.isLoading ? null : kits.summary.ready}
          tone="good"
        />
        <StatTile
          icon={AlertTriangle}
          label="Needing attention"
          value={kits.isLoading ? null : kits.summary.needsAttention}
          tone={kits.summary.needsAttention > 0 ? 'warning' : 'good'}
        />
        <StatTile
          icon={CalendarClock}
          label="Inspections overdue"
          value={kits.isLoading ? null : kits.summary.overdue}
          tone={kits.summary.overdue > 0 ? 'critical' : 'good'}
        />
      </StatGrid>

      <Tabs defaultValue="kits">
        <TabsList>
          <TabsTrigger value="kits">Kits</TabsTrigger>
          <TabsTrigger value="history">Inspection history</TabsTrigger>
        </TabsList>
        <TabsContent value="kits" className="mt-4">
          {body}
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          {checks.isLoading ? (
            <HealthLoading rows={4} />
          ) : checks.checks.filter((c) => c.kit_id).length === 0 ? (
            <HealthEmpty
              icon={ClipboardCheck}
              title="No inspections recorded"
              description="Recording an inspection here builds the history an auditor will ask for."
            />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Date</th>
                        <th className="px-4 py-2.5 font-medium">Kit</th>
                        <th className="px-4 py-2.5 font-medium">Result</th>
                        <th className="px-4 py-2.5 font-medium">Items replaced</th>
                        <th className="px-4 py-2.5 font-medium">Next due</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {checks.checks
                        .filter((c) => c.kit_id)
                        .map((c) => (
                          <tr key={c.id} className="hover:bg-accent/40">
                            <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                              {formatDate(c.checked_on)}
                            </td>
                            <td className="px-4 py-2.5 font-medium text-foreground">
                              {c.kit_name ?? '—'}
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
                            <td className="px-4 py-2.5 text-muted-foreground">
                              {c.items_replaced ?? '—'}
                            </td>
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

      <KitFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        kit={editing}
        vesselId={vesselId}
        onSubmit={(values) => kits.save.mutateAsync(values)}
        busy={kits.isMutating}
      />

      <CheckDialog
        open={Boolean(checking)}
        onOpenChange={(open) => !open && setChecking(null)}
        kitId={checking?.id ?? null}
        targetName={checking?.name ?? ''}
        intervalDays={checking?.inspection_interval_days ?? null}
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its inspection history goes with it. If the kit has simply been used, record an
              inspection instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) kits.remove.mutate(deleting.id);
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

interface KitCardProps {
  kit: KitEntry;
  canEdit: boolean;
  onEdit: (kit: KitEntry) => void;
  onCheck: (kit: KitEntry) => void;
  onDelete: (kit: KitEntry) => void;
}

const KitCard: React.FC<KitCardProps> = ({ kit, canEdit, onEdit, onCheck, onDelete }) => {
  const critical = kit.status === 'missing' || kit.status === 'expired' || kit.inspectionOverdue;
  return (
    <Card className={cn(critical && 'border-destructive/40')}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{kit.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {[kitTypeLabel(kit.kit_type), kit.location_name, kit.vessel_name]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <Badge
            variant="outline"
            className={cn(
              'shrink-0 text-[10px]',
              kit.status === 'ready' ? toneClass.ok : toneClass.warning,
            )}
          >
            {kitStatusLabel(kit.status)}
          </Badge>
        </div>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">Seal</dt>
          <dd className="truncate text-foreground">{kit.seal_number ?? '—'}</dd>
          <dt className="text-muted-foreground">Last inspected</dt>
          <dd className="text-foreground">{formatDate(kit.last_inspection_on)}</dd>
          <dt className="text-muted-foreground">Next due</dt>
          <dd>
            {kit.next_inspection_due ? (
              <Badge
                variant="outline"
                className={cn('text-[10px]', toneClass[expiryTone(kit.next_inspection_due)])}
              >
                {expiryLabel(kit.next_inspection_due)}
              </Badge>
            ) : (
              <span className="text-muted-foreground">Not scheduled</span>
            )}
          </dd>
          <dt className="text-muted-foreground">Interval</dt>
          <dd className="text-foreground">{kit.inspection_interval_days} days</dd>
        </dl>

        {kit.contents_reference && (
          <p className="text-xs text-muted-foreground">Contents list: {kit.contents_reference}</p>
        )}

        {canEdit && (
          <div className="flex items-center justify-between gap-2 border-t pt-3">
            <Button variant="outline" size="sm" className="gap-1" onClick={() => onCheck(kit)}>
              <ClipboardCheck className="h-4 w-4" /> Inspect
            </Button>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => onEdit(kit)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => onDelete(kit)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

interface KitFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kit: KitEntry | null;
  vesselId: string | null;
  onSubmit: (values: Record<string, unknown> & { name: string }) => Promise<unknown>;
  busy: boolean;
}

const KitFormDialog: React.FC<KitFormProps> = ({
  open,
  onOpenChange,
  kit,
  vesselId,
  onSubmit,
  busy,
}) => {
  const { vessels } = useVessel();
  const locations = useSupplyLocations(null);
  const [form, setForm] = useState({
    name: '',
    kit_type: 'general',
    seal_number: '',
    contents_reference: '',
    last_inspection_on: '',
    next_inspection_due: '',
    inspection_interval_days: '90',
    status: 'ready',
    notes: '',
    location_id: 'none',
    vessel_id: vesselId ?? 'none',
  });

  React.useEffect(() => {
    if (!open) return;
    if (kit) {
      setForm({
        name: kit.name,
        kit_type: kit.kit_type,
        seal_number: kit.seal_number ?? '',
        contents_reference: kit.contents_reference ?? '',
        last_inspection_on: kit.last_inspection_on ?? '',
        next_inspection_due: kit.next_inspection_due ?? '',
        inspection_interval_days: String(kit.inspection_interval_days),
        status: kit.status,
        notes: kit.notes ?? '',
        location_id: kit.location_id ?? 'none',
        vessel_id: kit.vessel_id ?? 'none',
      });
    } else {
      setForm((prev) => ({
        ...prev,
        name: '',
        seal_number: '',
        contents_reference: '',
        notes: '',
        vessel_id: vesselId ?? 'none',
      }));
    }
  }, [open, kit, vesselId]);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    if (!form.name.trim()) return;
    await onSubmit({
      ...(kit ? { id: kit.id } : {}),
      name: form.name.trim(),
      kit_type: form.kit_type,
      seal_number: form.seal_number || null,
      contents_reference: form.contents_reference || null,
      last_inspection_on: form.last_inspection_on || null,
      next_inspection_due: form.next_inspection_due || null,
      inspection_interval_days: Number(form.inspection_interval_days) || 90,
      status: form.status,
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
          <DialogTitle>{kit ? 'Edit kit' : 'Add a first aid kit'}</DialogTitle>
          <DialogDescription>
            The inspection interval sets the next due date each time an inspection is recorded.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="kit-name">Name</Label>
            <Input id="kit-name" value={form.name} onChange={(e) => set('name')(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kit-type">Type</Label>
            <Select value={form.kit_type} onValueChange={set('kit_type')}>
              <SelectTrigger id="kit-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KIT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kit-status">Status</Label>
            <Select value={form.status} onValueChange={set('status')}>
              <SelectTrigger id="kit-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KIT_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kit-vessel">Vessel</Label>
            <Select value={form.vessel_id} onValueChange={set('vessel_id')}>
              <SelectTrigger id="kit-vessel">
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
            <Label htmlFor="kit-location">Location</Label>
            <Select value={form.location_id} onValueChange={set('location_id')}>
              <SelectTrigger id="kit-location">
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
            <Label htmlFor="kit-seal">Seal number</Label>
            <Input
              id="kit-seal"
              value={form.seal_number}
              onChange={(e) => set('seal_number')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kit-contents">Contents list reference</Label>
            <Input
              id="kit-contents"
              value={form.contents_reference}
              onChange={(e) => set('contents_reference')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kit-interval">Inspection interval (days)</Label>
            <Input
              id="kit-interval"
              type="number"
              min={1}
              value={form.inspection_interval_days}
              onChange={(e) => set('inspection_interval_days')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kit-next">Next inspection due</Label>
            <Input
              id="kit-next"
              type="date"
              value={form.next_inspection_due}
              onChange={(e) => set('next_inspection_due')(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="kit-notes">Notes</Label>
          <Textarea
            id="kit-notes"
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
            {kit ? 'Save' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FirstAidPage;

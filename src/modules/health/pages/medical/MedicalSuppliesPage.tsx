import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardList,
  Loader2,
  Lock,
  Package,
  PackageX,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import { StatTile, StatGrid } from '@/modules/health/components/StatTile';
import { HealthEmpty, HealthError, HealthLoading } from '@/modules/health/components/HealthStates';
import { PersonPicker } from '@/modules/health/components/PersonPicker';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { useMedicalAccess } from '@/modules/auth/hooks/useMedicalAccess';
import { useHealthSettings } from '@/modules/health/hooks/useHealthSettings';
import { usePractitioners } from '@/modules/health/hooks/usePractitioners';
import {
  ITEM_CATEGORIES,
  LOCATION_CATEGORIES,
  TRANSACTION_TYPES,
  WITNESSED_TRANSACTIONS,
  itemCategoryLabel,
  locationCategoryLabel,
  transactionTypeLabel,
  useSupplyItems,
  useSupplyLocations,
  useSupplyTransactions,
  type SupplyItemEntry,
} from '@/modules/health/hooks/useMedicalStores';
import { expiryLabel, expiryTone, formatDate, formatDateTime, toneClass } from '@/modules/health/lib/format';

type StockFilter = 'all' | 'low' | 'expiring' | 'expired' | 'controlled';

/**
 * Medical stores. Stock levels are maintained by the database on every
 * movement, and a controlled drug cannot be issued, disposed of or adjusted
 * without a named witness, so the register stands up to an inspection.
 */
const MedicalSuppliesPage: React.FC = () => {
  const access = useMedicalAccess();
  const { vessels, selectedVesselId } = useVessel();
  const { settings } = useHealthSettings();
  const [vesselId, setVesselId] = useState<string | null>(selectedVesselId);
  const items = useSupplyItems({ vesselId });
  const locations = useSupplyLocations(vesselId);
  const transactions = useSupplyTransactions(null, 150);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StockFilter>('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [itemFormOpen, setItemFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SupplyItemEntry | null>(null);
  const [movementFor, setMovementFor] = useState<SupplyItemEntry | null>(null);
  const [deletingItem, setDeletingItem] = useState<SupplyItemEntry | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.items.filter((item) => {
      if (!item.is_active) return false;
      if (locationFilter !== 'all' && item.location_id !== locationFilter) return false;
      if (filter === 'low' && !item.isLow) return false;
      if (filter === 'expiring' && !item.isExpiringSoon) return false;
      if (filter === 'expired' && !item.isExpired) return false;
      if (filter === 'controlled' && !item.is_controlled) return false;
      if (!term) return true;
      return [item.name, item.generic_name, item.batch_number, item.location_name]
        .filter(Boolean)
        .some((value) => (value as string).toLowerCase().includes(term));
    });
  }, [items.items, search, filter, locationFilter]);

  const controlledMovements = useMemo(
    () => transactions.transactions.filter((t) => WITNESSED_TRANSACTIONS.includes(t.transaction_type)),
    [transactions.transactions],
  );

  const openCreate = () => {
    setEditingItem(null);
    setItemFormOpen(true);
  };

  let stockBody: React.ReactNode;
  if (items.isError) {
    stockBody = <HealthError error={items.error} title="Could not load medical stores" />;
  } else if (items.isLoading) {
    stockBody = <HealthLoading rows={5} />;
  } else if (items.items.length === 0) {
    stockBody = (
      <HealthEmpty
        icon={Package}
        title="No medical stores recorded"
        description="Start from the MCA Category A list and count your stock in, or add items one at a time."
        action={
          access.canEdit && (
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                onClick={() => vesselId && items.seedCategoryA.mutate(vesselId)}
                disabled={!vesselId || items.isMutating}
                className="gap-1"
              >
                {items.seedCategoryA.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Create the Category A list
              </Button>
              <Button variant="outline" onClick={openCreate} className="gap-1">
                <Plus className="h-4 w-4" /> Add an item
              </Button>
            </div>
          )
        }
      />
    );
  } else if (filtered.length === 0) {
    stockBody = (
      <HealthEmpty
        icon={Search}
        title="Nothing matches those filters"
        description="Clear the search or choose a different filter."
      />
    );
  } else {
    stockBody = (
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Item</th>
                  <th className="px-4 py-2.5 font-medium">Location</th>
                  <th className="px-4 py-2.5 font-medium text-right">Stock</th>
                  <th className="px-4 py-2.5 font-medium">Batch</th>
                  <th className="px-4 py-2.5 font-medium">Expiry</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-accent/40">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{item.name}</span>
                        {item.is_controlled && (
                          <Badge variant="outline" className="gap-1 text-[10px]">
                            <Lock className="h-3 w-3" /> Controlled
                          </Badge>
                        )}
                        {item.msn_category && (
                          <Badge variant="secondary" className="text-[10px]">
                            Cat {item.msn_category}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {[itemCategoryLabel(item.category), item.strength, item.form]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{item.location_name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span
                        className={cn(
                          'font-medium',
                          item.isLow ? 'text-destructive' : 'text-foreground',
                        )}
                      >
                        {item.quantity} {item.unit}
                      </span>
                      <p className="text-xs text-muted-foreground">min {item.minimum_quantity}</p>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{item.batch_number ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      {item.expiry_date ? (
                        <Badge
                          variant="outline"
                          className={cn('text-[10px]', toneClass[expiryTone(item.expiry_date)])}
                        >
                          {expiryLabel(item.expiry_date)}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1">
                        {access.canEdit && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1"
                              onClick={() => setMovementFor(item)}
                            >
                              <ArrowUpFromLine className="h-4 w-4" /> Move
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Edit item"
                              onClick={() => {
                                setEditingItem(item);
                                setItemFormOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Delete item"
                              onClick={() => setDeletingItem(item)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={Package}
        scope="medical"
        title="Medical stores"
        description="What is on board, what is running out, what is expiring and where every controlled drug went."
        actions={
          access.canEdit && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => vesselId && items.seedCategoryA.mutate(vesselId)}
                disabled={!vesselId || items.isMutating}
              >
                Category A list
              </Button>
              <Button size="sm" onClick={openCreate} className="gap-1">
                <Plus className="h-4 w-4" /> Add item
              </Button>
            </>
          )
        }
        toolbar={
          <>
            <Select
              value={vesselId ?? 'all'}
              onValueChange={(v) => setVesselId(v === 'all' ? null : v)}
            >
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
                placeholder="Search item, batch or location"
                className="pl-8"
              />
            </div>
            <Select value={filter} onValueChange={(v) => setFilter(v as StockFilter)}>
              <SelectTrigger className="md:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everything</SelectItem>
                <SelectItem value="low">Below minimum</SelectItem>
                <SelectItem value="expiring">Expiring soon</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="controlled">Controlled drugs</SelectItem>
              </SelectContent>
            </Select>
            <Select value={locationFilter} onValueChange={setLocationFilter}>
              <SelectTrigger className="md:w-48">
                <SelectValue placeholder="All locations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {locations.locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
      />

      <StatGrid>
        <StatTile icon={Package} label="Lines in stock" value={items.isLoading ? null : items.summary.total} />
        <StatTile
          icon={AlertTriangle}
          label="Below minimum"
          value={items.isLoading ? null : items.summary.low}
          hint={
            items.summary.outOfStock > 0 ? `${items.summary.outOfStock} of them at zero` : undefined
          }
          tone={items.summary.outOfStock > 0 ? 'critical' : items.summary.low > 0 ? 'warning' : 'good'}
        />
        <StatTile
          icon={PackageX}
          label="Expired"
          value={items.isLoading ? null : items.summary.expired}
          hint={`${items.summary.expiringSoon} expiring within 90 days`}
          tone={items.summary.expired > 0 ? 'critical' : 'good'}
        />
        <StatTile
          icon={Lock}
          label="Controlled drugs"
          value={items.isLoading ? null : items.summary.controlled}
        />
      </StatGrid>

      {settings && !settings.controlled_drugs_require_witness && (
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertTitle>Controlled drug witnessing is switched off</AlertTitle>
          <AlertDescription>
            Movements are being recorded without a second signature. Most flag states expect one.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="movements">Movements</TabsTrigger>
          <TabsTrigger value="controlled">Controlled drugs register</TabsTrigger>
          <TabsTrigger value="locations">Locations</TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="mt-4">
          {stockBody}
        </TabsContent>

        <TabsContent value="movements" className="mt-4">
          <MovementsTable
            rows={transactions.transactions}
            loading={transactions.isLoading}
            emptyTitle="No movements yet"
            emptyDescription="Receiving stock or issuing to a patient records a movement here."
          />
        </TabsContent>

        <TabsContent value="controlled" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Controlled drugs register</CardTitle>
              <CardDescription>
                Every issue, disposal and adjustment with the witness who signed for it.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <MovementsTable
                rows={controlledMovements}
                loading={transactions.isLoading}
                showWitness
                emptyTitle="Nothing to show"
                emptyDescription="No controlled drug movements have been recorded."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="locations" className="mt-4">
          <LocationsPanel vesselId={vesselId} canEdit={access.canEdit} />
        </TabsContent>
      </Tabs>

      <ItemFormDialog
        open={itemFormOpen}
        onOpenChange={setItemFormOpen}
        item={editingItem}
        vesselId={vesselId}
        onSubmit={(values) => items.save.mutateAsync(values)}
        busy={items.isMutating}
      />

      <MovementDialog
        item={movementFor}
        onOpenChange={(open) => !open && setMovementFor(null)}
        requireWitness={settings?.controlled_drugs_require_witness ?? true}
      />

      <AlertDialog open={Boolean(deletingItem)} onOpenChange={(open) => !open && setDeletingItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deletingItem?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The movement history goes with it. If you are simply out of stock, record a stock check
              of zero instead so the register stays intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingItem) items.remove.mutate(deletingItem.id);
                setDeletingItem(null);
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

interface MovementsTableProps {
  rows: ReturnType<typeof useSupplyTransactions>['transactions'];
  loading: boolean;
  showWitness?: boolean;
  emptyTitle: string;
  emptyDescription: string;
}

const MovementsTable: React.FC<MovementsTableProps> = ({
  rows,
  loading,
  showWitness,
  emptyTitle,
  emptyDescription,
}) => {
  if (loading) return <HealthLoading rows={4} />;
  if (rows.length === 0) {
    return <HealthEmpty icon={ClipboardList} title={emptyTitle} description={emptyDescription} />;
  }
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">When</th>
                <th className="px-4 py-2.5 font-medium">Item</th>
                <th className="px-4 py-2.5 font-medium">Movement</th>
                <th className="px-4 py-2.5 font-medium text-right">Change</th>
                <th className="px-4 py-2.5 font-medium text-right">Balance</th>
                <th className="px-4 py-2.5 font-medium">Patient</th>
                {showWitness && <th className="px-4 py-2.5 font-medium">Witness</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-accent/40">
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                    {formatDateTime(row.occurred_at)}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-foreground">{row.item_name ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline" className="text-[10px]">
                      {transactionTypeLabel(row.transaction_type)}
                    </Badge>
                    {row.reason && <p className="text-xs text-muted-foreground">{row.reason}</p>}
                  </td>
                  <td
                    className={cn(
                      'px-4 py-2.5 text-right font-medium',
                      row.quantity_delta < 0 ? 'text-destructive' : 'text-success',
                    )}
                  >
                    {row.quantity_delta > 0 ? '+' : ''}
                    {row.quantity_delta}
                  </td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">
                    {row.quantity_after ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{row.person_name ?? '—'}</td>
                  {showWitness && (
                    <td className="px-4 py-2.5 text-muted-foreground">{row.witness_display ?? '—'}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};

const LocationsPanel: React.FC<{ vesselId: string | null; canEdit: boolean }> = ({
  vesselId,
  canEdit,
}) => {
  const locations = useSupplyLocations(vesselId);
  const { vessels } = useVessel();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('hospital');
  const [targetVessel, setTargetVessel] = useState<string | null>(vesselId);

  const add = async () => {
    if (!name.trim()) return;
    await locations.save.mutateAsync({
      name: name.trim(),
      category,
      vessel_id: targetVessel,
    });
    setName('');
    setOpen(false);
  };

  if (locations.isLoading) return <HealthLoading rows={2} />;

  return (
    <div className="space-y-4">
      {canEdit && (
        <Button size="sm" variant="outline" className="gap-1" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Add a location
        </Button>
      )}

      {locations.locations.length === 0 ? (
        <HealthEmpty
          icon={Package}
          title="No storage locations"
          description="Add the ship's hospital, bridge kit, tenders and grab bags so every item has a home."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {locations.locations.map((l) => (
            <Card key={l.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{l.name}</CardTitle>
                <CardDescription>{locationCategoryLabel(l.category)}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {l.description || 'No description'}
                {l.is_controlled_store && (
                  <Badge variant="outline" className="ml-2 gap-1 text-[10px]">
                    <Lock className="h-3 w-3" /> Controlled store
                  </Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a storage location</DialogTitle>
            <DialogDescription>
              Locations let a medic count a grab bag without counting the whole hospital.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="loc-name">Name</Label>
              <Input id="loc-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loc-category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="loc-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCATION_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loc-vessel">Vessel</Label>
              <Select
                value={targetVessel ?? 'none'}
                onValueChange={(v) => setTargetVessel(v === 'none' ? null : v)}
              >
                <SelectTrigger id="loc-vessel">
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={add} disabled={locations.isMutating || !name.trim()}>
              {locations.isMutating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

interface ItemFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: SupplyItemEntry | null;
  vesselId: string | null;
  onSubmit: (values: Record<string, unknown> & { name: string }) => Promise<unknown>;
  busy: boolean;
}

const ItemFormDialog: React.FC<ItemFormDialogProps> = ({
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
    generic_name: '',
    category: 'medicine',
    msn_category: 'none',
    form: '',
    strength: '',
    unit: 'unit',
    minimum_quantity: '0',
    batch_number: '',
    expiry_date: '',
    supplier: '',
    storage_requirements: '',
    location_id: 'none',
    vessel_id: vesselId ?? 'none',
    is_controlled: false,
    notes: '',
  });

  React.useEffect(() => {
    if (!open) return;
    if (item) {
      setForm({
        name: item.name,
        generic_name: item.generic_name ?? '',
        category: item.category,
        msn_category: item.msn_category ?? 'none',
        form: item.form ?? '',
        strength: item.strength ?? '',
        unit: item.unit,
        minimum_quantity: String(item.minimum_quantity),
        batch_number: item.batch_number ?? '',
        expiry_date: item.expiry_date ?? '',
        supplier: item.supplier ?? '',
        storage_requirements: item.storage_requirements ?? '',
        location_id: item.location_id ?? 'none',
        vessel_id: item.vessel_id ?? 'none',
        is_controlled: item.is_controlled,
        notes: item.notes ?? '',
      });
    } else {
      setForm((prev) => ({
        ...prev,
        name: '',
        generic_name: '',
        batch_number: '',
        expiry_date: '',
        notes: '',
        vessel_id: vesselId ?? 'none',
      }));
    }
  }, [open, item, vesselId]);

  const submit = async () => {
    if (!form.name.trim()) return;
    await onSubmit({
      ...(item ? { id: item.id } : {}),
      name: form.name.trim(),
      generic_name: form.generic_name || null,
      category: form.category,
      msn_category: form.msn_category === 'none' ? null : form.msn_category,
      form: form.form || null,
      strength: form.strength || null,
      unit: form.unit || 'unit',
      minimum_quantity: Number(form.minimum_quantity) || 0,
      batch_number: form.batch_number || null,
      expiry_date: form.expiry_date || null,
      supplier: form.supplier || null,
      storage_requirements: form.storage_requirements || null,
      location_id: form.location_id === 'none' ? null : form.location_id,
      vessel_id: form.vessel_id === 'none' ? null : form.vessel_id,
      is_controlled: form.is_controlled || form.category === 'controlled_drug',
      notes: form.notes || null,
    });
    onOpenChange(false);
  };

  const set = (key: keyof typeof form) => (value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item ? 'Edit item' : 'Add an item'}</DialogTitle>
          <DialogDescription>
            Quantities are set by recording a movement, not here, so the register always matches the
            count.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="item-name">Name</Label>
            <Input id="item-name" value={form.name} onChange={(e) => set('name')(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="item-generic">Generic name or use</Label>
            <Input
              id="item-generic"
              value={form.generic_name}
              onChange={(e) => set('generic_name')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="item-category">Category</Label>
            <Select value={form.category} onValueChange={set('category')}>
              <SelectTrigger id="item-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ITEM_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="item-strength">Strength</Label>
            <Input
              id="item-strength"
              value={form.strength}
              onChange={(e) => set('strength')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="item-form">Form</Label>
            <Input
              id="item-form"
              placeholder="tablet, ampoule, pack"
              value={form.form}
              onChange={(e) => set('form')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="item-unit">Unit</Label>
            <Input id="item-unit" value={form.unit} onChange={(e) => set('unit')(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="item-minimum">Minimum quantity</Label>
            <Input
              id="item-minimum"
              type="number"
              min={0}
              value={form.minimum_quantity}
              onChange={(e) => set('minimum_quantity')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="item-batch">Batch</Label>
            <Input
              id="item-batch"
              value={form.batch_number}
              onChange={(e) => set('batch_number')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="item-expiry">Expiry</Label>
            <Input
              id="item-expiry"
              type="date"
              value={form.expiry_date}
              onChange={(e) => set('expiry_date')(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="item-vessel">Vessel</Label>
            <Select value={form.vessel_id} onValueChange={set('vessel_id')}>
              <SelectTrigger id="item-vessel">
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
            <Label htmlFor="item-location">Location</Label>
            <Select value={form.location_id} onValueChange={set('location_id')}>
              <SelectTrigger id="item-location">
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
            <Label htmlFor="item-msn">MSN 1768 category</Label>
            <Select value={form.msn_category} onValueChange={set('msn_category')}>
              <SelectTrigger id="item-msn">
                <SelectValue placeholder="Not categorised" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not categorised</SelectItem>
                <SelectItem value="A">Category A</SelectItem>
                <SelectItem value="B">Category B</SelectItem>
                <SelectItem value="C">Category C</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="item-supplier">Supplier</Label>
            <Input
              id="item-supplier"
              value={form.supplier}
              onChange={(e) => set('supplier')(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="item-storage">Storage requirements</Label>
          <Input
            id="item-storage"
            placeholder="Refrigerate 2-8°C"
            value={form.storage_requirements}
            onChange={(e) => set('storage_requirements')(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="item-notes">Notes</Label>
          <Textarea
            id="item-notes"
            rows={2}
            value={form.notes}
            onChange={(e) => set('notes')(e.target.value)}
          />
        </div>

        <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <div>
            <Label htmlFor="item-controlled" className="text-sm">
              Controlled drug
            </Label>
            <p className="text-xs text-muted-foreground">
              Every issue, disposal and adjustment will require a named witness.
            </p>
          </div>
          <Switch
            id="item-controlled"
            checked={form.is_controlled || form.category === 'controlled_drug'}
            onCheckedChange={set('is_controlled')}
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

const MovementDialog: React.FC<{
  item: SupplyItemEntry | null;
  onOpenChange: (open: boolean) => void;
  requireWitness: boolean;
}> = ({ item, onOpenChange, requireWitness }) => {
  const transactions = useSupplyTransactions(item?.id ?? null, 20);
  const practitioners = usePractitioners('medical');
  const [type, setType] = useState('issue');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');
  const [personId, setPersonId] = useState<string | null>(null);
  const [witnessId, setWitnessId] = useState<string | null>(null);
  const [witnessName, setWitnessName] = useState('');
  const [batch, setBatch] = useState('');
  const [expiry, setExpiry] = useState('');

  React.useEffect(() => {
    if (!item) return;
    setType('issue');
    setQuantity('1');
    setReason('');
    setPersonId(null);
    setWitnessId(null);
    setWitnessName('');
    setBatch('');
    setExpiry('');
  }, [item]);

  const needsWitness =
    Boolean(item?.is_controlled) && requireWitness && WITNESSED_TRANSACTIONS.includes(type);
  const witnessMissing = needsWitness && !witnessId && !witnessName.trim();
  const isStockCheck = type === 'stock_check';
  const amount = Number(quantity);
  // A stock check states the counted quantity; everything else is a delta,
  // negative for anything leaving the store.
  const signed = isStockCheck
    ? amount
    : ['issue', 'disposal', 'transfer'].includes(type)
      ? -Math.abs(amount)
      : Math.abs(amount);

  const submit = async () => {
    if (!item || !Number.isFinite(amount)) return;
    await transactions.recordMovement.mutateAsync({
      item_id: item.id,
      transaction_type: type,
      quantity: signed,
      reason: reason || null,
      person_id: personId,
      batch_number: batch || null,
      expiry_date: expiry || null,
      witnessed_by_practitioner_id: witnessId,
      witness_name: witnessName || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={Boolean(item)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item?.name}</DialogTitle>
          <DialogDescription>
            In stock: {item?.quantity} {item?.unit}
            {item?.expiry_date ? ` · expires ${formatDate(item.expiry_date)}` : ''}
          </DialogDescription>
        </DialogHeader>

        {item?.is_controlled && (
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertTitle>Controlled drug</AlertTitle>
            <AlertDescription>
              {requireWitness
                ? 'A named witness is required and the database will refuse the movement without one.'
                : 'Witnessing is switched off for this company, so no second signature is required.'}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="mv-type">Movement</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="mv-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRANSACTION_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mv-quantity">
              {isStockCheck ? 'Counted quantity' : 'Quantity'}
            </Label>
            <Input
              id="mv-quantity"
              type="number"
              min={0}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            {!isStockCheck && (
              <p className="text-xs text-muted-foreground">
                Stock will change by {signed > 0 ? '+' : ''}
                {signed}
              </p>
            )}
          </div>
        </div>

        {type === 'issue' && (
          <div className="space-y-1.5">
            <Label>Issued to</Label>
            <PersonPicker value={personId} onChange={(id) => setPersonId(id)} />
          </div>
        )}

        {(type === 'receipt' || type === 'stock_check') && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mv-batch">Batch</Label>
              <Input id="mv-batch" value={batch} onChange={(e) => setBatch(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mv-expiry">Expiry</Label>
              <Input
                id="mv-expiry"
                type="date"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
              />
            </div>
          </div>
        )}

        {needsWitness && (
          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-medium text-foreground">Witness</p>
            <div className="space-y-1.5">
              <Label htmlFor="mv-witness">Medical staff</Label>
              <Select
                value={witnessId ?? 'none'}
                onValueChange={(v) => setWitnessId(v === 'none' ? null : v)}
              >
                <SelectTrigger id="mv-witness">
                  <SelectValue placeholder="Choose a witness" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not on the roster</SelectItem>
                  {practitioners.active.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mv-witness-name">Or name the witness</Label>
              <Input
                id="mv-witness-name"
                value={witnessName}
                onChange={(e) => setWitnessName(e.target.value)}
                placeholder="Captain, officer or other person present"
              />
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="mv-reason">Reason</Label>
          <Input
            id="mv-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Treatment, routine restock, expired"
          />
        </div>

        {transactions.transactions.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Recent movements
            </p>
            <ul className="divide-y rounded-lg border text-sm">
              {transactions.transactions.slice(0, 5).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="text-muted-foreground">
                    {formatDateTime(t.occurred_at)} · {transactionTypeLabel(t.transaction_type)}
                  </span>
                  <span className={cn(t.quantity_delta < 0 ? 'text-destructive' : 'text-success')}>
                    {t.quantity_delta > 0 ? '+' : ''}
                    {t.quantity_delta}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={transactions.isMutating || witnessMissing || !Number.isFinite(amount)}
            className="gap-1"
          >
            {transactions.isMutating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : signed < 0 ? (
              <ArrowUpFromLine className="h-4 w-4" />
            ) : (
              <ArrowDownToLine className="h-4 w-4" />
            )}
            Record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MedicalSuppliesPage;

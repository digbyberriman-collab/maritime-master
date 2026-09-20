import React, { useMemo, useState } from 'react';
import { ArrowLeftRight, Boxes, CalendarClock, Package, PackageMinus, Pencil, Plus, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import { StatGrid, StatTile } from '@/modules/health/components/StatTile';
import { HealthEmpty, HealthError, HealthLoading } from '@/modules/health/components/HealthStates';
import { InventoryItemDialog } from '@/modules/health/components/spa/InventoryItemDialog';
import { StockMovementDialog } from '@/modules/health/components/spa/StockMovementDialog';
import { useWellnessAccess } from '@/modules/auth/hooks/useWellnessAccess';
import { useHealthSettings } from '@/modules/health/hooks/useHealthSettings';
import { useCompanyVessels } from '@/modules/hris/hooks/useCrewContracts';
import {
  SPA_ITEM_CATEGORIES,
  spaItemCategoryLabel,
  spaTransactionTypeLabel,
  useSpaInventory,
  useSpaInventoryTransactions,
  type SpaInventoryEntry,
  type SpaItemFormData,
  type SpaMovementInput,
} from '@/modules/health/hooks/useSpa';
import { formatDate, formatDateTime, formatMinor } from '@/modules/health/lib/format';

const ALL = '__all__';
type StockFilter = 'all' | 'low' | 'expiring';

/** The spa store: what is on the shelf, what is running out and what moved. */
const SpaInventoryPage: React.FC = () => {
  const wellness = useWellnessAccess();
  const canEdit = !wellness.loading && wellness.canEdit;
  const { settings } = useHealthSettings();
  const defaultCurrency = settings?.default_currency ?? 'EUR';
  const warningDays = settings?.stock_expiry_warning_days ?? 90;

  const { vessels } = useCompanyVessels();
  const [vesselId, setVesselId] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [filter, setFilter] = useState<StockFilter>('all');
  const [search, setSearch] = useState('');

  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SpaInventoryEntry | null>(null);
  const [movementFor, setMovementFor] = useState<SpaInventoryEntry | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);

  const inventory = useSpaInventory({
    vesselId: vesselId === ALL ? null : vesselId,
    expiryWarningDays: warningDays,
  });
  const transactions = useSpaInventoryTransactions(historyFor, 60);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return inventory.items.filter((item) => {
      if (category !== ALL && item.category !== category) return false;
      if (filter === 'low' && !item.isLow) return false;
      if (filter === 'expiring' && !(item.isExpired || item.isExpiringSoon)) return false;
      if (!term) return true;
      return [item.name, item.brand, item.supplier, item.storage_location]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [inventory.items, category, filter, search]);

  const submitItem = async (values: SpaItemFormData) => {
    await inventory.saveItem.mutateAsync(values);
    setItemDialogOpen(false);
    setEditing(null);
  };

  const submitMovement = async (values: SpaMovementInput) => {
    await transactions.recordMovement.mutateAsync(values);
    setMovementFor(null);
  };

  const isEmpty = !inventory.isLoading && !inventory.isError && inventory.allItems.length === 0;

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={Boxes}
        title="Spa store"
        description="Oils, linens and consumables. Stock changes only through a recorded movement."
        actions={
          canEdit ? (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setItemDialogOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> New item
            </Button>
          ) : undefined
        }
        toolbar={
          <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1 lg:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, brand or supplier"
                className="pl-9"
              />
            </div>
            <Select value={vesselId} onValueChange={setVesselId}>
              <SelectTrigger className="lg:w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All vessels</SelectItem>
                {vessels.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="lg:w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All categories</SelectItem>
                {SPA_ITEM_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Tabs value={filter} onValueChange={(v) => setFilter(v as StockFilter)}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="low">Low stock</TabsTrigger>
                <TabsTrigger value="expiring">Expiring</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        }
      />

      <StatGrid>
        <StatTile icon={Package} label="Lines in use" value={inventory.isLoading ? null : inventory.summary.total} />
        <StatTile
          icon={PackageMinus}
          label="Below minimum"
          value={inventory.isLoading ? null : inventory.summary.low}
          tone={inventory.summary.low > 0 ? 'warning' : 'good'}
        />
        <StatTile
          icon={CalendarClock}
          label={`Expiring within ${warningDays} days`}
          value={inventory.isLoading ? null : inventory.summary.expiringSoon}
          tone={inventory.summary.expiringSoon > 0 ? 'warning' : 'good'}
        />
        <StatTile
          icon={CalendarClock}
          label="Already expired"
          value={inventory.isLoading ? null : inventory.summary.expired}
          hint="Dispose and record the movement"
          tone={inventory.summary.expired > 0 ? 'critical' : 'good'}
        />
      </StatGrid>

      {inventory.isLoading ? (
        <HealthLoading rows={5} />
      ) : inventory.isError ? (
        <HealthError title="Could not load the spa store" error={inventory.error} />
      ) : isEmpty ? (
        <HealthEmpty
          icon={Boxes}
          title="The spa store is empty"
          description="Add the oils, creams, linens and consumables you carry, then record a stock check on each one to set the opening quantity."
          action={
            canEdit ? (
              <Button
                onClick={() => {
                  setEditing(null);
                  setItemDialogOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" /> Add the first item
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Ask the spa manager or the purser to set the store up.
              </p>
            )
          }
        />
      ) : rows.length === 0 ? (
        <HealthEmpty
          icon={Search}
          title="Nothing matches those filters"
          description={
            filter === 'low'
              ? 'Nothing is below its minimum. Switch the filter back to All to see the whole store.'
              : filter === 'expiring'
                ? 'Nothing is close to expiry. Switch the filter back to All to see the whole store.'
                : 'Clear the search or choose a different category.'
          }
          action={
            <Button
              variant="outline"
              onClick={() => {
                setSearch('');
                setCategory(ALL);
                setFilter('all');
              }}
            >
              Clear the filters
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-3 md:hidden">
            {rows.map((item) => (
              <Card key={item.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[spaItemCategoryLabel(item.category), item.brand, item.storage_location]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <p className={cn('shrink-0 text-sm font-medium', item.isLow ? 'text-warning' : 'text-foreground')}>
                      {Number(item.quantity)} {item.unit}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {item.isLow && (
                      <Badge variant="outline" className="border-warning/20 bg-warning/10 text-[10px] text-warning">
                        Below minimum {Number(item.minimum_quantity)}
                      </Badge>
                    )}
                    {item.isExpired ? (
                      <Badge
                        variant="outline"
                        className="border-destructive/20 bg-destructive/10 text-[10px] text-destructive"
                      >
                        Expired {formatDate(item.expiry_date)}
                      </Badge>
                    ) : item.isExpiringSoon ? (
                      <Badge variant="outline" className="border-warning/20 bg-warning/10 text-[10px] text-warning">
                        {item.daysToExpiry}d to expiry
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex gap-2 pt-1">
                    {canEdit && (
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => setMovementFor(item)}>
                        <ArrowLeftRight className="mr-2 h-3.5 w-3.5" /> Movement
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setHistoryFor(item.id)}>
                      History
                    </Button>
                    {canEdit && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditing(item);
                          setItemDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span className="sr-only">Edit {item.name}</span>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="hidden md:block">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">On hand</TableHead>
                      <TableHead className="text-right">Minimum</TableHead>
                      <TableHead>Expiry</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead className="text-right">Unit cost</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((item) => (
                      <TableRow
                        key={item.id}
                        className={cn(historyFor === item.id && 'bg-accent/40')}
                      >
                        <TableCell>
                          <p className="font-medium text-foreground">{item.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {[item.brand, item.storage_location, item.vessel_name]
                              .filter(Boolean)
                              .join(' · ') || 'Fleet wide'}
                          </p>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {spaItemCategoryLabel(item.category)}
                        </TableCell>
                        <TableCell
                          className={cn('text-right text-sm font-medium', item.isLow && 'text-warning')}
                        >
                          {Number(item.quantity)} {item.unit}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {Number(item.minimum_quantity)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {item.expiry_date ? (
                            <span
                              className={cn(
                                item.isExpired
                                  ? 'text-destructive'
                                  : item.isExpiringSoon
                                    ? 'text-warning'
                                    : 'text-muted-foreground',
                              )}
                            >
                              {formatDate(item.expiry_date)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {item.supplier ?? '—'}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {formatMinor(item.unit_cost_minor, item.currency ?? defaultCurrency)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {canEdit && (
                              <Button size="sm" variant="ghost" onClick={() => setMovementFor(item)}>
                                <ArrowLeftRight className="h-3.5 w-3.5" />
                                <span className="sr-only">Record a movement for {item.name}</span>
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setHistoryFor(historyFor === item.id ? null : item.id)}
                            >
                              History
                            </Button>
                            {canEdit && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditing(item);
                                  setItemDialogOpen(true);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                <span className="sr-only">Edit {item.name}</span>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Movement history</CardTitle>
          <CardDescription>
            {historyFor
              ? 'Every movement on the chosen item, newest first.'
              : 'The last movements across the whole spa store. Choose History on an item to narrow it.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {transactions.isLoading ? (
            <div className="p-4">
              <HealthLoading rows={2} />
            </div>
          ) : transactions.isError ? (
            <div className="p-4">
              <HealthError title="Could not load the movement history" error={transactions.error} />
            </div>
          ) : transactions.transactions.length === 0 ? (
            <HealthEmpty
              icon={ArrowLeftRight}
              title="No movements recorded"
              description="Record a stock check to set the opening quantity, then log each use, receipt and disposal so the shelf and the screen agree."
              className="border-0 p-8"
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Movement</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                    <TableHead className="text-right">After</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.transactions.map((tx) => {
                    const delta = Number(tx.quantity_delta);
                    return (
                      <TableRow key={tx.id}>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatDateTime(tx.occurred_at)}
                        </TableCell>
                        <TableCell className="text-sm text-foreground">{tx.item_name ?? '—'}</TableCell>
                        <TableCell className="text-sm">
                          <Badge variant="secondary" className="text-[10px]">
                            {spaTransactionTypeLabel(tx.transaction_type)}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right text-sm font-medium',
                            delta < 0 ? 'text-destructive' : 'text-success',
                          )}
                        >
                          {delta > 0 ? '+' : ''}
                          {delta}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {tx.quantity_after === null ? '—' : Number(tx.quantity_after)}
                          {tx.item_unit ? ` ${tx.item_unit}` : ''}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                          {tx.reason ?? tx.notes ?? '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <InventoryItemDialog
        open={itemDialogOpen}
        onOpenChange={(open) => {
          setItemDialogOpen(open);
          if (!open) setEditing(null);
        }}
        item={editing}
        vessels={vessels}
        defaultCurrency={defaultCurrency}
        onSubmit={submitItem}
        isPending={inventory.saveItem.isPending}
      />

      <StockMovementDialog
        open={Boolean(movementFor)}
        onOpenChange={(open) => !open && setMovementFor(null)}
        item={movementFor}
        onSubmit={submitMovement}
        isPending={transactions.recordMovement.isPending}
      />
    </div>
  );
};

export default SpaInventoryPage;

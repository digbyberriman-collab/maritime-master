import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  AlertCircle,
  ArrowDown,
  Filter,
  Loader2,
  Package,
  Search,
  Settings,
  Ship,
  ShoppingCart,
  Tag,
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useMaintenance, type SparePart } from '@/hooks/useMaintenance';
import { useVessels } from '@/hooks/useVessels';
import {
  getStockStatus as stockStatusOf,
  getStockPercent as stockPercentOf,
  type StockStatus,
} from '@/lib/maintenanceConstants';

const STOCK_LABELS: Record<StockStatus, string> = {
  ok: 'In Stock',
  low: 'Low Stock',
  out: 'Out of Stock',
};

const getStockStatus = (part: SparePart) =>
  stockStatusOf(part.quantity_onboard, part.minimum_stock);

const getStockPercent = (part: SparePart) =>
  stockPercentOf(part.quantity_onboard, part.minimum_stock);

const EMPTY_FORM = {
  part_name: '',
  part_number: '',
  vessel_id: '',
  manufacturer: '',
  supplier: '',
  location_onboard: '',
  quantity_onboard: '0',
  minimum_stock: '0',
  unit_cost: '',
  notes: '',
};

export default function SpareParts() {
  const { spareParts, equipment, createSparePart, updateSparePart, isLoading } = useMaintenance();
  const { vessels } = useVessels();

  const [search, setSearch] = useState('');
  const [vesselFilter, setVesselFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  // The spare_parts table has no criticality column of its own. A part counts as
  // critical when it serves equipment the vessel cannot operate without.
  const criticalEquipmentIds = useMemo(
    () => new Set(equipment.filter((e) => e.criticality === 'Critical').map((e) => e.id)),
    [equipment]
  );

  const isCritical = (part: SparePart) =>
    (part.equipment_ids ?? []).some((id) => criticalEquipmentIds.has(id));

  const filteredParts = useMemo(() => {
    const term = search.trim().toLowerCase();

    return spareParts.filter((part) => {
      if (vesselFilter !== 'all' && part.vessel_id !== vesselFilter) return false;

      const status = getStockStatus(part);
      if (stockFilter === 'low' && status !== 'low') return false;
      if (stockFilter === 'out' && status !== 'out') return false;
      if (stockFilter === 'critical' && !isCritical(part)) return false;

      if (term) {
        return [part.part_name, part.part_number, part.supplier, part.manufacturer].some((field) =>
          field?.toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [spareParts, search, vesselFilter, stockFilter, criticalEquipmentIds]);

  const stats = useMemo(() => {
    const byStatus = spareParts.map((p) => ({ part: p, status: getStockStatus(p) }));
    return {
      total: spareParts.length,
      low: byStatus.filter((p) => p.status === 'low').length,
      out: byStatus.filter((p) => p.status === 'out').length,
      criticalLow: byStatus.filter((p) => p.status !== 'ok' && isCritical(p.part)).length,
      value: spareParts.reduce((sum, p) => sum + p.quantity_onboard * (p.unit_cost ?? 0), 0),
    };
  }, [spareParts, criticalEquipmentIds]);

  const canSubmit =
    form.part_name.trim() !== '' && form.part_number.trim() !== '' && form.vessel_id !== '';

  function handleAddPart() {
    if (!canSubmit) return;

    createSparePart.mutate(
      {
        part_name: form.part_name.trim(),
        part_number: form.part_number.trim(),
        vessel_id: form.vessel_id,
        manufacturer: form.manufacturer.trim() || null,
        supplier: form.supplier.trim() || null,
        location_onboard: form.location_onboard.trim() || null,
        quantity_onboard: Number(form.quantity_onboard) || 0,
        minimum_stock: Number(form.minimum_stock) || 0,
        unit_cost: form.unit_cost === '' ? null : Number(form.unit_cost),
        notes: form.notes.trim() || null,
        equipment_ids: null,
        last_ordered_date: null,
      },
      {
        onSuccess: () => {
          setForm(EMPTY_FORM);
          setIsDialogOpen(false);
        },
      }
    );
  }

  function handleMarkOrdered(part: SparePart) {
    updateSparePart.mutate({
      id: part.id,
      last_ordered_date: format(new Date(), 'yyyy-MM-dd'),
    });
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Package className="w-6 h-6" />
              Spare Parts Inventory
            </h1>
            <p className="text-muted-foreground">Manage spare parts inventory across the fleet</p>
          </div>

          <Dialog
            open={isDialogOpen}
            onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) setForm(EMPTY_FORM);
            }}
          >
            <DialogTrigger asChild>
              <Button disabled={vessels.length === 0}>
                <Package className="w-4 h-4 mr-2" />
                Add Part
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Spare Part</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="part_name">Part Name *</Label>
                    <Input
                      id="part_name"
                      placeholder="e.g., Fuel Injector"
                      value={form.part_name}
                      onChange={(e) => setForm({ ...form, part_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="part_number">Part Number *</Label>
                    <Input
                      id="part_number"
                      placeholder="e.g., ME-FI-001"
                      value={form.part_number}
                      onChange={(e) => setForm({ ...form, part_number: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Vessel *</Label>
                    <Select
                      value={form.vessel_id}
                      onValueChange={(value) => setForm({ ...form, vessel_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select vessel" />
                      </SelectTrigger>
                      <SelectContent>
                        {vessels.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location">Location Onboard</Label>
                    <Input
                      id="location"
                      placeholder="e.g., Engine Store A1"
                      value={form.location_onboard}
                      onChange={(e) => setForm({ ...form, location_onboard: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="manufacturer">Manufacturer</Label>
                    <Input
                      id="manufacturer"
                      placeholder="e.g., MAN Energy Solutions"
                      value={form.manufacturer}
                      onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="supplier">Supplier</Label>
                    <Input
                      id="supplier"
                      placeholder="e.g., Wartsila Parts"
                      value={form.supplier}
                      onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="quantity">Quantity Onboard</Label>
                    <Input
                      id="quantity"
                      type="number"
                      min="0"
                      value={form.quantity_onboard}
                      onChange={(e) => setForm({ ...form, quantity_onboard: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="minimum">Reorder Point</Label>
                    <Input
                      id="minimum"
                      type="number"
                      min="0"
                      value={form.minimum_stock}
                      onChange={(e) => setForm({ ...form, minimum_stock: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cost">Unit Cost</Label>
                    <Input
                      id="cost"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={form.unit_cost}
                      onChange={(e) => setForm({ ...form, unit_cost: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Any additional detail"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddPart} disabled={!canSubmit || createSparePart.isPending}>
                  {createSparePart.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Add Part
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <StatCard icon={Package} tone="blue" value={stats.total} label="Total Parts" />
          <StatCard icon={ArrowDown} tone="yellow" value={stats.low} label="Low Stock" />
          <StatCard icon={AlertCircle} tone="red" value={stats.out} label="Out of Stock" />
          <StatCard icon={Settings} tone="orange" value={stats.criticalLow} label="Critical Low" />
          <StatCard
            icon={Tag}
            tone="green"
            value={`${(stats.value / 1000).toFixed(1)}k`}
            label="Total Value"
          />
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, part number, supplier, or manufacturer..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={vesselFilter} onValueChange={setVesselFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <Ship className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Vessel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Vessels</SelectItem>
                  {vessels.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={stockFilter} onValueChange={setStockFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Stock Level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="low">Low Stock</SelectItem>
                  <SelectItem value="out">Out of Stock</SelectItem>
                  <SelectItem value="critical">Critical Parts</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredParts.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {spareParts.length === 0
                  ? 'No spare parts recorded yet'
                  : 'No spare parts match these filters'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredParts.map((part) => {
              const status = getStockStatus(part);
              const critical = isCritical(part);

              return (
                <Card key={part.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                      <div
                        className={`flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center ${
                          status === 'ok'
                            ? 'bg-green-100'
                            : status === 'low'
                              ? 'bg-yellow-100'
                              : 'bg-red-100'
                        }`}
                      >
                        <Package
                          className={`w-6 h-6 ${
                            status === 'ok'
                              ? 'text-green-600'
                              : status === 'low'
                                ? 'text-yellow-600'
                                : 'text-red-600'
                          }`}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="font-medium">{part.part_name}</p>
                          {critical && (
                            <Badge variant="destructive" className="text-xs">
                              Critical
                            </Badge>
                          )}
                          <Badge
                            variant={
                              status === 'ok'
                                ? 'default'
                                : status === 'low'
                                  ? 'secondary'
                                  : 'destructive'
                            }
                            className="text-xs"
                          >
                            {STOCK_LABELS[status]}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-x-4 gap-y-1 text-sm text-muted-foreground flex-wrap">
                          <span className="font-mono">{part.part_number}</span>
                          {part.vessel?.name && (
                            <span className="flex items-center gap-1">
                              <Ship className="w-3 h-3" />
                              {part.vessel.name}
                            </span>
                          )}
                          {part.location_onboard && <span>{part.location_onboard}</span>}
                          {part.supplier && <span>{part.supplier}</span>}
                          {part.last_ordered_date && (
                            <span>
                              Ordered {format(new Date(part.last_ordered_date), 'd MMM yyyy')}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex-shrink-0 w-full lg:w-32">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">
                            {part.quantity_onboard}
                            {part.minimum_stock > 0 && ` / ${part.minimum_stock}`}
                          </span>
                          {part.minimum_stock > 0 && (
                            <span className="text-xs text-muted-foreground">min</span>
                          )}
                        </div>
                        <Progress
                          value={getStockPercent(part)}
                          className={`h-2 ${
                            status === 'out'
                              ? '[&>div]:bg-red-500'
                              : status === 'low'
                                ? '[&>div]:bg-yellow-500'
                                : ''
                          }`}
                        />
                      </div>

                      {part.unit_cost != null && (
                        <div className="flex-shrink-0 text-right w-24">
                          <p className="font-medium">{part.unit_cost.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">per unit</p>
                        </div>
                      )}

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleMarkOrdered(part)}
                        disabled={updateSparePart.isPending}
                      >
                        <ShoppingCart className="w-4 h-4 mr-1" />
                        Mark Ordered
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

const TONES = {
  blue: 'bg-blue-100 text-blue-600',
  yellow: 'bg-yellow-100 text-yellow-600',
  red: 'bg-red-100 text-red-600',
  orange: 'bg-orange-100 text-orange-600',
  green: 'bg-green-100 text-green-600',
} as const;

function StatCard({
  icon: Icon,
  tone,
  value,
  label,
}: {
  icon: typeof Package;
  tone: keyof typeof TONES;
  value: number | string;
  label: string;
}) {
  const [bg, fg] = TONES[tone].split(' ');

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${bg}`}>
            <Icon className={`w-5 h-5 ${fg}`} />
          </div>
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

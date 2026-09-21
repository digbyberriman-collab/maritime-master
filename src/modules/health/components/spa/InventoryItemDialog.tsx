import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { fromMinor, toMinor } from '@/modules/health/lib/format';
import {
  SPA_ITEM_CATEGORIES,
  emptySpaItemForm,
  type SpaInventoryEntry,
  type SpaItemFormData,
} from '@/modules/health/hooks/useSpa';

const NO_VESSEL = '__none__';

interface InventoryItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: SpaInventoryEntry | null;
  vessels: { id: string; name: string }[];
  defaultCurrency: string;
  onSubmit: (values: SpaItemFormData) => Promise<void>;
  isPending?: boolean;
}

const toForm = (row: SpaInventoryEntry): SpaItemFormData => ({
  id: row.id,
  name: row.name,
  category: row.category,
  brand: row.brand,
  unit: row.unit,
  minimum_quantity: Number(row.minimum_quantity),
  expiry_date: row.expiry_date,
  supplier: row.supplier,
  unit_cost_minor: row.unit_cost_minor === null ? null : Number(row.unit_cost_minor),
  currency: row.currency,
  storage_location: row.storage_location,
  vessel_id: row.vessel_id,
  is_active: row.is_active,
  notes: row.notes,
});

/**
 * Create or edit a spa stock line. Quantity is deliberately absent: it is
 * owned by the transaction trigger and only changes through a movement.
 */
export const InventoryItemDialog: React.FC<InventoryItemDialogProps> = ({
  open,
  onOpenChange,
  item,
  vessels,
  defaultCurrency,
  onSubmit,
  isPending,
}) => {
  const [values, setValues] = useState<SpaItemFormData>(emptySpaItemForm(defaultCurrency));
  const [cost, setCost] = useState('');

  useEffect(() => {
    if (!open) return;
    const next = item ? toForm(item) : emptySpaItemForm(defaultCurrency);
    setValues(next);
    setCost(fromMinor(next.unit_cost_minor));
  }, [open, item, defaultCurrency]);

  const patch = (next: Partial<SpaItemFormData>) => setValues((prev) => ({ ...prev, ...next }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onSubmit({ ...values, unit_cost_minor: toMinor(cost) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item ? 'Edit item' : 'New item'}</DialogTitle>
          <DialogDescription>
            Stock on hand changes through a movement, not here. Record a stock check to set the
            opening figure.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="item-name">Name</Label>
              <Input
                id="item-name"
                required
                value={values.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="Massage oil, sweet almond"
              />
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={values.category} onValueChange={(v) => patch({ category: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SPA_ITEM_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="item-brand">Brand</Label>
              <Input
                id="item-brand"
                value={values.brand ?? ''}
                onChange={(e) => patch({ brand: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="item-unit">Unit</Label>
              <Input
                id="item-unit"
                value={values.unit}
                onChange={(e) => patch({ unit: e.target.value })}
                placeholder="bottle, litre, pack"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="item-minimum">Minimum to hold</Label>
              <Input
                id="item-minimum"
                type="number"
                min={0}
                step="0.01"
                value={values.minimum_quantity}
                onChange={(e) => patch({ minimum_quantity: Number(e.target.value) || 0 })}
              />
              <p className="text-xs text-muted-foreground">Anything below this shows as low stock.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="item-expiry">Expiry date</Label>
              <Input
                id="item-expiry"
                type="date"
                value={values.expiry_date ?? ''}
                onChange={(e) => patch({ expiry_date: e.target.value || null })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="item-supplier">Supplier</Label>
              <Input
                id="item-supplier"
                value={values.supplier ?? ''}
                onChange={(e) => patch({ supplier: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="item-cost">Unit cost</Label>
              <Input
                id="item-cost"
                inputMode="decimal"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="item-currency">Currency</Label>
              <Input
                id="item-currency"
                maxLength={3}
                value={values.currency ?? ''}
                onChange={(e) => patch({ currency: e.target.value.toUpperCase() })}
                placeholder="EUR"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="item-storage">Storage location</Label>
              <Input
                id="item-storage"
                value={values.storage_location ?? ''}
                onChange={(e) => patch({ storage_location: e.target.value })}
                placeholder="Spa store, lower deck"
              />
            </div>

            <div className="space-y-2">
              <Label>Vessel</Label>
              <Select
                value={values.vessel_id ?? NO_VESSEL}
                onValueChange={(v) => patch({ vessel_id: v === NO_VESSEL ? null : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Fleet wide" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_VESSEL}>Fleet wide</SelectItem>
                  {vessels.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="item-notes">Notes</Label>
              <Textarea
                id="item-notes"
                rows={2}
                value={values.notes ?? ''}
                onChange={(e) => patch({ notes: e.target.value })}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 p-3">
            <div className="space-y-0.5">
              <Label htmlFor="item-active">In use</Label>
              <p className="text-xs text-muted-foreground">
                Turn this off for a line you no longer carry. Its movement history is kept.
              </p>
            </div>
            <Switch
              id="item-active"
              checked={values.is_active}
              onCheckedChange={(checked) => patch({ is_active: checked })}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !values.name.trim()}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {item ? 'Save item' : 'Add item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default InventoryItemDialog;

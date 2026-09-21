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
  TREATMENT_CATEGORIES,
  emptyTreatmentForm,
  type SpaTreatment,
  type TreatmentFormData,
} from '@/modules/health/hooks/useSpa';

interface TreatmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  treatment: SpaTreatment | null;
  defaultCurrency: string;
  onSubmit: (values: TreatmentFormData) => Promise<void>;
  isPending?: boolean;
}

const toForm = (row: SpaTreatment): TreatmentFormData => ({
  id: row.id,
  name: row.name,
  category: row.category,
  description: row.description,
  duration_minutes: row.duration_minutes,
  buffer_minutes: row.buffer_minutes,
  price_minor: row.price_minor === null ? null : Number(row.price_minor),
  currency: row.currency,
  requires_room: row.requires_room,
  equipment_required: row.equipment_required,
  products_used: row.products_used,
  contraindications: row.contraindications,
  is_active: row.is_active,
  notes: row.notes,
});

/** Create or edit one line on the treatment menu. Price is in minor units. */
export const TreatmentDialog: React.FC<TreatmentDialogProps> = ({
  open,
  onOpenChange,
  treatment,
  defaultCurrency,
  onSubmit,
  isPending,
}) => {
  const [values, setValues] = useState<TreatmentFormData>(emptyTreatmentForm(defaultCurrency));
  const [price, setPrice] = useState('');

  useEffect(() => {
    if (!open) return;
    const next = treatment ? toForm(treatment) : emptyTreatmentForm(defaultCurrency);
    setValues(next);
    setPrice(fromMinor(next.price_minor));
  }, [open, treatment, defaultCurrency]);

  const patch = (next: Partial<TreatmentFormData>) => setValues((prev) => ({ ...prev, ...next }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onSubmit({ ...values, price_minor: toMinor(price) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{treatment ? 'Edit treatment' : 'New treatment'}</DialogTitle>
          <DialogDescription>
            The length set here becomes the default length of every booking for this treatment.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="treatment-name">Name</Label>
              <Input
                id="treatment-name"
                required
                value={values.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="Deep tissue massage"
              />
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={values.category} onValueChange={(v) => patch({ category: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TREATMENT_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="treatment-currency">Currency</Label>
              <Input
                id="treatment-currency"
                maxLength={3}
                value={values.currency ?? ''}
                onChange={(e) => patch({ currency: e.target.value.toUpperCase() })}
                placeholder="EUR"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="treatment-duration">Length (minutes)</Label>
              <Input
                id="treatment-duration"
                type="number"
                min={5}
                step={5}
                value={values.duration_minutes}
                onChange={(e) => patch({ duration_minutes: Number(e.target.value) || 5 })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="treatment-buffer">Turnaround buffer (minutes)</Label>
              <Input
                id="treatment-buffer"
                type="number"
                min={0}
                step={5}
                value={values.buffer_minutes}
                onChange={(e) => patch({ buffer_minutes: Number(e.target.value) || 0 })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="treatment-price">Price</Label>
              <Input
                id="treatment-price"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
              />
              <p className="text-xs text-muted-foreground">Leave empty if the treatment is not charged.</p>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="treatment-description">Description</Label>
              <Textarea
                id="treatment-description"
                rows={2}
                value={values.description ?? ''}
                onChange={(e) => patch({ description: e.target.value })}
                placeholder="What the guest can expect"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="treatment-products">Products used</Label>
              <Textarea
                id="treatment-products"
                rows={2}
                value={values.products_used ?? ''}
                onChange={(e) => patch({ products_used: e.target.value })}
                placeholder="Oils, creams and linens drawn from the spa store"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="treatment-equipment">Equipment required</Label>
              <Textarea
                id="treatment-equipment"
                rows={2}
                value={values.equipment_required ?? ''}
                onChange={(e) => patch({ equipment_required: e.target.value })}
                placeholder="Heated table, hot stone unit"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="treatment-contra">Contraindications</Label>
              <Textarea
                id="treatment-contra"
                rows={2}
                value={values.contraindications ?? ''}
                onChange={(e) => patch({ contraindications: e.target.value })}
                placeholder="Pregnancy, recent surgery, high blood pressure, skin conditions"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 p-3">
              <div className="space-y-0.5">
                <Label htmlFor="treatment-room">Needs a room</Label>
                <p className="text-xs text-muted-foreground">Blocks a treatment room for the booking.</p>
              </div>
              <Switch
                id="treatment-room"
                checked={values.requires_room}
                onCheckedChange={(checked) => patch({ requires_room: checked })}
              />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 p-3">
              <div className="space-y-0.5">
                <Label htmlFor="treatment-active">On the menu</Label>
                <p className="text-xs text-muted-foreground">Archived treatments stay on past bookings.</p>
              </div>
              <Switch
                id="treatment-active"
                checked={values.is_active}
                onCheckedChange={(checked) => patch({ is_active: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !values.name.trim()}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {treatment ? 'Save treatment' : 'Add treatment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default TreatmentDialog;

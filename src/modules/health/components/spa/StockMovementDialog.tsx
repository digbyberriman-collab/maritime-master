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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  SPA_TRANSACTION_TYPES,
  type SpaInventoryEntry,
  type SpaMovementInput,
} from '@/modules/health/hooks/useSpa';

interface StockMovementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: SpaInventoryEntry | null;
  onSubmit: (values: SpaMovementInput) => Promise<void>;
  isPending?: boolean;
}

/** How the number in the box is read, per movement type. */
const QUANTITY_HELP: Record<string, string> = {
  receipt: 'How many units arrived.',
  use: 'How many units were used. This comes off the shelf.',
  disposal: 'How many units were thrown away or expired.',
  adjustment: 'The change to make. Use a negative number to take stock off.',
  stock_check: 'The quantity you actually counted. The system works out the difference.',
};

/**
 * Record a spa stock movement. A stock check sends the counted quantity, not
 * a delta: the database trigger converts it and writes the new figure back.
 */
export const StockMovementDialog: React.FC<StockMovementDialogProps> = ({
  open,
  onOpenChange,
  item,
  onSubmit,
  isPending,
}) => {
  const [type, setType] = useState('use');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setType('use');
    setQuantity('1');
    setReason('');
    setNotes('');
  }, [open, item?.id]);

  if (!item) return null;

  const parsed = Number(quantity);
  const valid = Number.isFinite(parsed) && (type === 'adjustment' || parsed >= 0);
  const projected =
    type === 'stock_check'
      ? parsed
      : type === 'use' || type === 'disposal'
        ? Number(item.quantity) - Math.abs(parsed)
        : Number(item.quantity) + parsed;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    // Use and disposal always reduce stock, so send them as a negative delta.
    const signed = type === 'use' || type === 'disposal' ? -Math.abs(parsed) : parsed;
    await onSubmit({
      item_id: item.id,
      transaction_type: type,
      quantity: signed,
      reason: reason || null,
      notes: notes || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record a movement</DialogTitle>
          <DialogDescription>
            {item.name} · {Number(item.quantity)} {item.unit} on hand
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label>Movement</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SPA_TRANSACTION_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="movement-quantity">
              {type === 'stock_check' ? `Counted quantity (${item.unit})` : `Quantity (${item.unit})`}
            </Label>
            <Input
              id="movement-quantity"
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{QUANTITY_HELP[type]}</p>
          </div>

          {valid && (
            <Alert className={projected < 0 ? 'border-destructive/40' : undefined}>
              <AlertDescription className="text-sm">
                {projected < 0
                  ? 'Stock cannot go below zero. The database will refuse this movement.'
                  : `Stock after this movement: ${projected} ${item.unit}.`}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="movement-reason">Reason</Label>
            <Input
              id="movement-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Used on a booking, damaged in transit, monthly count"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="movement-notes">Notes</Label>
            <Textarea
              id="movement-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !valid || projected < 0}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record movement
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default StockMovementDialog;

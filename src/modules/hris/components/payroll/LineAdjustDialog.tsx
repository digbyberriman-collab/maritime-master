import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatMinor, fromMinor, toMinor } from '@/modules/hris/lib/format';
import { recomputeLine } from '@/modules/hris/lib/payroll/runHelpers';
import type { PayrollLine, UpdateLineArgs } from '@/modules/hris/hooks/usePayroll';

interface LineAdjustDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  line: PayrollLine | null;
  runCurrency: string;
  roundingMinor: number;
  onSubmit: (args: UpdateLineArgs) => Promise<void>;
  isPending?: boolean;
}

/** Manual adjustment of other earnings / deductions with a live gross/net preview. */
export const LineAdjustDialog: React.FC<LineAdjustDialogProps> = ({ open, onOpenChange, line, runCurrency, roundingMinor, onSubmit, isPending }) => {
  const [other, setOther] = useState('');
  const [deductions, setDeductions] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && line) {
      setOther(fromMinor(line.other_earnings_minor));
      setDeductions(fromMinor(line.deductions_minor));
      setNotes(line.notes ?? '');
      setError(null);
    }
  }, [open, line]);

  const otherMinor = toMinor(other) ?? 0;
  const deductionsMinor = toMinor(deductions) ?? 0;
  const preview = useMemo(
    () => (line ? recomputeLine({ ...line, other_earnings_minor: otherMinor, deductions_minor: deductionsMinor }, roundingMinor) : null),
    [line, otherMinor, deductionsMinor, roundingMinor],
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!line) return;
    if (deductionsMinor < 0) {
      setError('Deductions cannot be negative.');
      return;
    }
    if (!notes.trim()) {
      setError('Add a short note explaining the adjustment (it is audited).');
      return;
    }
    await onSubmit({ line, other_earnings_minor: otherMinor, deductions_minor: deductionsMinor, notes: notes.trim() });
  };

  const ccy = line?.currency ?? runCurrency;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Adjust line{line ? ` — ${line.crew_name}` : ''}</DialogTitle>
            <DialogDescription>
              Add one-off earnings or deductions in {ccy}. Adjusted lines are kept when the run is recalculated.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="other">Other earnings ({ccy})</Label>
              <Input id="other" inputMode="decimal" value={other} onChange={(e) => setOther(e.target.value)} placeholder="0.00" />
              <p className="text-xs text-muted-foreground">Bonuses, overtime, expense reimbursements. Negative values reduce gross.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deductions">Deductions ({ccy})</Label>
              <Input id="deductions" inputMode="decimal" value={deductions} onChange={(e) => setDeductions(e.target.value)} placeholder="0.00" />
              <p className="text-xs text-muted-foreground">Advances, cash draws, fines, loan repayments.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Reason</Label>
            <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Why is this line being adjusted?" />
          </div>

          {line && preview && (
            <div className="grid grid-cols-3 gap-3 rounded-md border bg-muted/30 p-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Gross</p>
                <p className="font-medium tabular-nums text-foreground">{formatMinor(preview.gross_minor, ccy)}</p>
                <p className="text-xs text-muted-foreground">was {formatMinor(line.gross_minor, ccy)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Net</p>
                <p className="font-medium tabular-nums text-foreground">{formatMinor(preview.net_minor, ccy)}</p>
                <p className="text-xs text-muted-foreground">was {formatMinor(line.net_minor, ccy)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Net ({runCurrency})</p>
                <p className="font-medium tabular-nums text-foreground">
                  {formatMinor(preview.net_run_currency_minor ?? (ccy === runCurrency ? preview.net_minor : null), runCurrency)}
                </p>
                {roundingMinor > 1 && <p className="text-xs text-muted-foreground">rounded to {roundingMinor} minor units</p>}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || !line}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save adjustment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default LineAdjustDialog;

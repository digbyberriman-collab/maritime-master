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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useKitChecks } from '@/modules/health/hooks/useMedicalEquipment';
import { addDaysIso, formatDate, todayIso } from '@/modules/health/lib/format';

interface CheckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Exactly one of these identifies what is being checked. */
  kitId?: string | null;
  equipmentId?: string | null;
  targetName: string;
  /** Days until the next check, used to propose the next due date. */
  intervalDays?: number | null;
}

const RESULTS = [
  { value: 'pass', label: 'Pass' },
  { value: 'pass_with_actions', label: 'Pass with actions' },
  { value: 'fail', label: 'Fail' },
];

/**
 * Record an inspection of a first aid kit or a piece of medical equipment.
 * The database rolls the next due date forward and marks a failed item
 * defective, so this only has to capture what was found.
 */
export const CheckDialog: React.FC<CheckDialogProps> = ({
  open,
  onOpenChange,
  kitId,
  equipmentId,
  targetName,
  intervalDays,
}) => {
  const checks = useKitChecks({ kitId, equipmentId, limit: 10 });
  const [checkedOn, setCheckedOn] = useState(todayIso());
  const [result, setResult] = useState('pass');
  const [findings, setFindings] = useState('');
  const [actions, setActions] = useState('');
  const [replaced, setReplaced] = useState('');
  const [nextDue, setNextDue] = useState('');

  useEffect(() => {
    if (!open) return;
    const today = todayIso();
    setCheckedOn(today);
    setResult('pass');
    setFindings('');
    setActions('');
    setReplaced('');
    setNextDue(intervalDays ? addDaysIso(today, intervalDays) : '');
  }, [open, intervalDays]);

  const submit = async () => {
    await checks.recordCheck.mutateAsync({
      kit_id: kitId ?? null,
      equipment_id: equipmentId ?? null,
      checked_on: checkedOn,
      result,
      findings: findings || null,
      actions: actions || null,
      items_replaced: replaced || null,
      next_due: nextDue || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Check {targetName}</DialogTitle>
          <DialogDescription>
            A failed check marks the item defective straight away so nobody relies on it.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="check-date">Checked on</Label>
            <Input
              id="check-date"
              type="date"
              value={checkedOn}
              onChange={(e) => setCheckedOn(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="check-result">Result</Label>
            <Select value={result} onValueChange={setResult}>
              <SelectTrigger id="check-result">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESULTS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="check-findings">Findings</Label>
          <Textarea
            id="check-findings"
            rows={2}
            value={findings}
            onChange={(e) => setFindings(e.target.value)}
            placeholder="Seal intact, contents complete, battery at 90 percent"
          />
        </div>

        {result !== 'pass' && (
          <div className="space-y-1.5">
            <Label htmlFor="check-actions">Actions taken or needed</Label>
            <Textarea
              id="check-actions"
              rows={2}
              value={actions}
              onChange={(e) => setActions(e.target.value)}
            />
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="check-replaced">Items replaced</Label>
            <Input
              id="check-replaced"
              value={replaced}
              onChange={(e) => setReplaced(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="check-next">Next due</Label>
            <Input
              id="check-next"
              type="date"
              value={nextDue}
              onChange={(e) => setNextDue(e.target.value)}
            />
          </div>
        </div>

        {checks.checks.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Previous checks
            </p>
            <ul className="divide-y rounded-lg border text-sm">
              {checks.checks.slice(0, 5).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="text-muted-foreground">{formatDate(c.checked_on)}</span>
                  <span
                    className={
                      c.result === 'fail'
                        ? 'text-destructive'
                        : c.result === 'pass'
                          ? 'text-success'
                          : 'text-warning'
                    }
                  >
                    {RESULTS.find((r) => r.value === c.result)?.label ?? c.result}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={checks.isMutating}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={checks.isMutating}>
            {checks.isMutating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Record check
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CheckDialog;

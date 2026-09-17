import React, { useEffect, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDate } from '@/modules/hris/lib/format';
import {
  DEFAULT_EXPIRY_MONTHS,
  DISCIPLINARY_STAGES,
  STAGE_LABEL,
  defaultExpiryDate,
  suggestNextStage,
  type DisciplinaryRecordRow,
  type DisciplinaryStage,
} from '@/modules/hris/lib/disciplinary';

interface StageChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: DisciplinaryRecordRow | null;
  /** Other records for the subject, for the ladder suggestion. */
  existingRecords?: DisciplinaryRecordRow[];
  onConfirm: (values: { stage: DisciplinaryStage; outcome: string | null; outcome_date: string | null; expiry_date: string | null }) => Promise<void>;
  isPending?: boolean;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Move a case to a new stage, recording the outcome and the warning's live-until date. */
export const StageChangeDialog: React.FC<StageChangeDialogProps> = ({ open, onOpenChange, record, existingRecords = [], onConfirm, isPending }) => {
  const [stage, setStage] = useState<DisciplinaryStage>('verbal_warning');
  const [outcome, setOutcome] = useState('');
  const [outcomeDate, setOutcomeDate] = useState(today());
  const [expiry, setExpiry] = useState('');
  const [expiryTouched, setExpiryTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const others = existingRecords.filter((r) => r.id !== record?.id);
  const suggested = suggestNextStage(others, record?.severity);

  useEffect(() => {
    if (!open || !record) return;
    const next = record.stage === 'investigation' ? suggested : (record.stage as DisciplinaryStage);
    setStage(next);
    setOutcome(record.outcome ?? '');
    setOutcomeDate(record.outcome_date ?? today());
    setExpiry(record.expiry_date ?? defaultExpiryDate(next, record.outcome_date ?? today()) ?? '');
    setExpiryTouched(Boolean(record.expiry_date));
    setError(null);
    // Seed only when the dialog opens for a record.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, record?.id]);

  useEffect(() => {
    if (expiryTouched) return;
    setExpiry(defaultExpiryDate(stage, outcomeDate || today()) ?? '');
  }, [stage, outcomeDate, expiryTouched]);

  const confirm = async () => {
    if (expiry && outcomeDate && expiry < outcomeDate) {
      setError('Expiry must be on or after the outcome date.');
      return;
    }
    setError(null);
    await onConfirm({ stage, outcome: outcome.trim() || null, outcome_date: outcomeDate || null, expiry_date: expiry || null });
  };

  const months = DEFAULT_EXPIRY_MONTHS[stage];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Change stage</DialogTitle>
          <DialogDescription>
            Currently <span className="font-medium text-foreground">{record ? STAGE_LABEL[record.stage as DisciplinaryStage] ?? record.stage : '—'}</span>.
            The progressive-discipline ladder suggests{' '}
            <button type="button" className="inline-flex items-center gap-1 underline underline-offset-2" onClick={() => setStage(suggested)}>
              <Sparkles className="h-3 w-3" /> {STAGE_LABEL[suggested].toLowerCase()}
            </button>
            .
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>New stage</Label>
            <Select value={stage} onValueChange={(v) => setStage(v as DisciplinaryStage)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DISCIPLINARY_STAGES.map((s) => <SelectItem key={s} value={s}>{STAGE_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="stage-outcome">Outcome</Label>
            <Textarea id="stage-outcome" rows={3} value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="Decision and any conditions attached…" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="stage-outcome-date">Outcome date</Label>
              <Input id="stage-outcome-date" type="date" value={outcomeDate} onChange={(e) => setOutcomeDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stage-expiry">Live until</Label>
              <Input
                id="stage-expiry"
                type="date"
                value={expiry}
                onChange={(e) => {
                  setExpiryTouched(true);
                  setExpiry(e.target.value);
                }}
              />
              <p className="text-xs text-muted-foreground">
                {months ? `Typical ${months} months (${formatDate(defaultExpiryDate(stage, outcomeDate || today()))}).` : 'Leave blank unless this should lapse.'}
              </p>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
          <Button onClick={() => void confirm()} disabled={isPending || !record}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Apply stage
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default StageChangeDialog;

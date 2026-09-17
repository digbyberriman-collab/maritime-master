import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDate, humanise } from '@/modules/hris/lib/format';
import { CURRENCY_PRESETS, OTHER_CURRENCY } from '@/modules/hris/lib/contractHelpers';
import { runNumberPrefix } from '@/modules/hris/lib/payroll/runHelpers';
import type { CompanyVessel } from '@/modules/hris/hooks/useCrewContracts';
import type { CreateRunArgs, PayPeriodOption } from '@/modules/hris/hooks/usePayroll';

const COMPANY_WIDE = '__company__';

interface NewRunDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periods: PayPeriodOption[];
  vessels: CompanyVessel[];
  defaultCurrency: string;
  onSubmit: (args: CreateRunArgs) => Promise<void>;
  isPending?: boolean;
}

/** Create a draft payroll run for an open/locked pay period. */
export const NewRunDialog: React.FC<NewRunDialogProps> = ({ open, onOpenChange, periods, vessels, defaultCurrency, onSubmit, isPending }) => {
  const [periodId, setPeriodId] = useState('');
  const [vesselId, setVesselId] = useState(COMPANY_WIDE);
  const [currencyChoice, setCurrencyChoice] = useState<string>(defaultCurrency);
  const [otherCurrency, setOtherCurrency] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPeriodId(periods[0]?.id ?? '');
      setVesselId(periods[0]?.vessel_id ?? COMPANY_WIDE);
      setCurrencyChoice((CURRENCY_PRESETS as readonly string[]).includes(defaultCurrency) ? defaultCurrency : OTHER_CURRENCY);
      setOtherCurrency((CURRENCY_PRESETS as readonly string[]).includes(defaultCurrency) ? '' : defaultCurrency);
      setNotes('');
      setError(null);
    }
  }, [open, periods, defaultCurrency]);

  const period = useMemo(() => periods.find((p) => p.id === periodId) ?? null, [periods, periodId]);

  // A vessel-specific period pins the run to that vessel.
  useEffect(() => {
    if (period?.vessel_id) setVesselId(period.vessel_id);
  }, [period?.vessel_id]);

  const currency = (currencyChoice === OTHER_CURRENCY ? otherCurrency : currencyChoice).trim().toUpperCase();
  const vesselName = vesselId === COMPANY_WIDE ? null : vessels.find((v) => v.id === vesselId)?.name ?? null;
  const previewPrefix = period ? `${runNumberPrefix(vesselName, period.start_date)}-n` : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!period) {
      setError('Select a pay period.');
      return;
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      setError('Currency must be a 3-letter ISO code.');
      return;
    }
    await onSubmit({ pay_period_id: period.id, vessel_id: vesselId === COMPANY_WIDE ? null : vesselId, currency, notes: notes.trim() || null });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New payroll run</DialogTitle>
            <DialogDescription>A draft run is created; calculate it to build the lines from active compensation and days onboard.</DialogDescription>
          </DialogHeader>

          {periods.length === 0 ? (
            <p className="rounded-md border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-500">
              No open pay periods. Create one under Compensation Settings first.
            </p>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Pay period</Label>
                <Select value={periodId} onValueChange={setPeriodId}>
                  <SelectTrigger><SelectValue placeholder="Select a period" /></SelectTrigger>
                  <SelectContent>
                    {periods.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label} · {formatDate(p.start_date)} – {formatDate(p.end_date)}
                        {p.vessel_name ? ` · ${p.vessel_name}` : ''} ({humanise(p.status)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Vessel</Label>
                  <Select value={vesselId} onValueChange={setVesselId} disabled={Boolean(period?.vessel_id)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={COMPANY_WIDE}>Company-wide (all crew)</SelectItem>
                      {vessels.map((v) => (
                        <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Only crew currently assigned to the vessel are included.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Run currency</Label>
                  <Select value={currencyChoice} onValueChange={setCurrencyChoice}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCY_PRESETS.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                      <SelectItem value={OTHER_CURRENCY}>Other…</SelectItem>
                    </SelectContent>
                  </Select>
                  {currencyChoice === OTHER_CURRENCY && (
                    <Input value={otherCurrency} onChange={(e) => setOtherCurrency(e.target.value)} placeholder="e.g. NOK" maxLength={3} />
                  )}
                  <p className="text-xs text-muted-foreground">Lines in other currencies are converted with the FX table.</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="run-notes">Notes</Label>
                <Textarea id="run-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
              </div>

              {previewPrefix && (
                <p className="text-xs text-muted-foreground">
                  Run number will be <span className="font-mono text-foreground">{previewPrefix}</span>
                </p>
              )}
            </>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
            <Button type="submit" disabled={isPending || periods.length === 0}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create draft run
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default NewRunDialog;

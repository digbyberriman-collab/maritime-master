import React, { useMemo, useState } from 'react';
import { CalendarRange, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { CompanyVessel } from '@/modules/hris/hooks/useCrewContracts';
import { generatePeriods, type GeneratePeriodsInput } from '@/modules/hris/lib/compensation';

const COMPANY_WIDE = '__company__';

export interface GeneratePeriodsValues extends GeneratePeriodsInput {
  vesselId: string | null;
}

interface GeneratePeriodsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vessels: CompanyVessel[];
  defaultType: 'calendar_month' | 'four_weekly';
  defaultYear: number;
  onSubmit: (values: GeneratePeriodsValues) => Promise<void>;
  isPending?: boolean;
}

/** Bulk-creates a year of pay periods. Existing periods (same scope + start date) are skipped. */
export const GeneratePeriodsDialog: React.FC<GeneratePeriodsDialogProps> = ({ open, onOpenChange, vessels, defaultType, defaultYear, onSubmit, isPending }) => {
  const [vesselId, setVesselId] = useState<string>(COMPANY_WIDE);
  const [year, setYear] = useState<string>(String(defaultYear));
  const [type, setType] = useState<'calendar_month' | 'four_weekly'>(defaultType);
  const [startDate, setStartDate] = useState<string>(`${defaultYear}-01-01`);

  const yearNumber = Number(year);
  const yearValid = /^\d{4}$/.test(year) && yearNumber >= 2000 && yearNumber <= 2100;
  const startValid = type === 'calendar_month' || startDate.startsWith(year);
  const preview = useMemo(
    () => (yearValid && startValid ? generatePeriods({ year: yearNumber, type, startDate: type === 'four_weekly' ? startDate : undefined }) : []),
    [yearValid, startValid, yearNumber, type, startDate],
  );

  const submit = async () => {
    if (!yearValid || !startValid) return;
    await onSubmit({ vesselId: vesselId === COMPANY_WIDE ? null : vesselId, year: yearNumber, type, startDate: type === 'four_weekly' ? startDate : undefined });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate pay periods</DialogTitle>
          <DialogDescription>Creates every period of the year for the chosen scope. Periods that already exist are left untouched.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Scope</Label>
            <Select value={vesselId} onValueChange={setVesselId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={COMPANY_WIDE}>Company-wide</SelectItem>
                {vessels.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="gen-year">Year</Label>
            <Input id="gen-year" inputMode="numeric" value={year} onChange={(e) => { setYear(e.target.value); if (/^\d{4}$/.test(e.target.value)) setStartDate(`${e.target.value}-01-01`); }} />
          </div>
          <div className="space-y-2">
            <Label>Period type</Label>
            <Select value={type} onValueChange={(v) => setType(v as 'calendar_month' | 'four_weekly')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="calendar_month">Calendar month</SelectItem>
                <SelectItem value="four_weekly">Four-weekly (28 days)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {type === 'four_weekly' && (
            <div className="space-y-2">
              <Label htmlFor="gen-start">First period starts</Label>
              <Input id="gen-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              {!startValid && <p className="text-xs text-destructive">Start date must be within {year}.</p>}
            </div>
          )}
        </div>

        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <CalendarRange className="h-4 w-4 text-muted-foreground" />
            {preview.length ? `${preview.length} periods` : 'Nothing to generate'}
          </p>
          {preview.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {preview[0].label} → {preview[preview.length - 1].label}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
          <Button type="button" onClick={() => void submit()} disabled={isPending || preview.length === 0}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GeneratePeriodsDialog;

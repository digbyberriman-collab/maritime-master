import React from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { CompanyVessel } from '@/modules/hris/hooks/useCrewContracts';
import { defaultReportFilters, type ReportFilters as Filters } from '@/modules/hris/hooks/useHrReports';

const ALL = '__all__';

interface ReportFiltersProps {
  value: Filters;
  onChange: (next: Filters) => void;
  vessels: CompanyVessel[];
  departments: string[];
}

/** Vessel, department and date range. Dates drive the monthly series; vessel/department scope every report. */
export const ReportFilters: React.FC<ReportFiltersProps> = ({ value, onChange, vessels, departments }) => {
  const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch });
  const dirty = JSON.stringify(value) !== JSON.stringify(defaultReportFilters());
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 md:flex-row md:flex-wrap md:items-end">
      <div className="min-w-[180px] flex-1 space-y-1">
        <Label className="text-xs text-muted-foreground">Vessel</Label>
        <Select value={value.vesselId ?? ALL} onValueChange={(v) => set({ vesselId: v === ALL ? null : v })}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="All vessels" />
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
      </div>
      <div className="min-w-[180px] flex-1 space-y-1">
        <Label className="text-xs text-muted-foreground">Department</Label>
        <Select value={value.department ?? ALL} onValueChange={(v) => set({ department: v === ALL ? null : v })}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="All departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="hr-report-from" className="text-xs text-muted-foreground">
          From
        </Label>
        <Input id="hr-report-from" type="date" className="h-9 w-[160px]" value={value.from} max={value.to} onChange={(e) => e.target.value && set({ from: e.target.value })} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="hr-report-to" className="text-xs text-muted-foreground">
          To
        </Label>
        <Input id="hr-report-to" type="date" className="h-9 w-[160px]" value={value.to} min={value.from} onChange={(e) => e.target.value && set({ to: e.target.value })} />
      </div>
      <Button type="button" variant="ghost" size="sm" className="h-9" disabled={!dirty} onClick={() => onChange(defaultReportFilters())}>
        <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset
      </Button>
    </div>
  );
};

export default ReportFilters;

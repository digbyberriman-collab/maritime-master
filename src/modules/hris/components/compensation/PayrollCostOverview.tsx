import React, { useMemo, useState } from 'react';
import { AlertTriangle, ChevronRight, Coins, Search, UserCheck, UserX, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCompanyVessels } from '@/modules/hris/hooks/useCrewContracts';
import { useCompanyCompensation, useFxRatesTo } from '@/modules/hris/hooks/useCompensation';
import { useHrCompanySettings } from '@/modules/hris/hooks/useCompensationSettings';
import { formatDate, formatMinor, humanise } from '@/modules/hris/lib/format';
import { computePayrollKpis, filterOverviewRows, DEFAULT_OVERVIEW_FILTERS, type OverviewFilters } from '@/modules/hris/lib/compensation';

interface PayrollCostOverviewProps {
  onSelectCrew: (profileId: string) => void;
  /** Wage figures are only rendered for payroll viewers. */
  showWage: boolean;
}

interface KpiTileProps {
  icon: LucideIcon;
  label: string;
  value: string | null;
  hint?: string;
  tone?: 'default' | 'warning';
  active?: boolean;
  onClick?: () => void;
}

const KpiTile: React.FC<KpiTileProps> = ({ icon: Icon, label, value, hint, tone = 'default', active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    className={cn(
      'flex items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      onClick && 'hover:bg-accent/50',
      active && 'border-primary ring-1 ring-primary',
    )}
  >
    <div className={cn('rounded-md p-2', tone === 'warning' ? 'bg-yellow-500/10 text-yellow-600' : 'bg-primary/10 text-primary')}>
      <Icon className="h-5 w-5" />
    </div>
    <div className="min-w-0">
      {value === null ? <Skeleton className="h-7 w-16" /> : <p className="truncate text-2xl font-semibold leading-none tabular-nums text-foreground">{value}</p>}
      <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
      {hint && <p className="truncate text-[11px] text-muted-foreground/80">{hint}</p>}
    </div>
  </button>
);

/** Company-wide view: KPI tiles, department averages and a filterable crew table. */
export const PayrollCostOverview: React.FC<PayrollCostOverviewProps> = ({ onSelectCrew, showWage }) => {
  const [filters, setFilters] = useState<OverviewFilters>(DEFAULT_OVERVIEW_FILTERS);
  const { vessels } = useCompanyVessels();
  const company = useCompanyCompensation();
  const { settings } = useHrCompanySettings();
  const defaultCurrency = settings?.default_currency ?? 'EUR';

  const currencies = useMemo(() => company.active.map((c) => c.currency), [company.active]);
  const fx = useFxRatesTo(currencies, defaultCurrency);

  const loading = company.isLoading || fx.isLoading;
  const kpis = useMemo(() => (loading ? null : computePayrollKpis(company.rows, fx.rates, defaultCurrency)), [loading, company.rows, fx.rates, defaultCurrency]);

  const departments = useMemo(
    () => Array.from(new Set(company.rows.map((r) => r.department?.trim() || 'Unassigned'))).sort(),
    [company.rows],
  );
  const rows = useMemo(() => filterOverviewRows(company.rows, filters), [company.rows, filters]);
  const patch = (next: Partial<OverviewFilters>) => setFilters((prev) => ({ ...prev, ...next }));
  const filtered = filters.search || filters.vesselId !== 'all' || filters.department !== 'all' || filters.coverage !== 'all';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          icon={UserCheck}
          label="Crew with active compensation"
          value={kpis ? String(kpis.withCompensation) : null}
          active={filters.coverage === 'with'}
          onClick={() => patch({ coverage: filters.coverage === 'with' ? 'all' : 'with' })}
        />
        <KpiTile
          icon={UserX}
          label="Crew missing compensation"
          value={kpis ? String(kpis.missingCompensation) : null}
          tone={kpis && kpis.missingCompensation > 0 ? 'warning' : 'default'}
          active={filters.coverage === 'missing'}
          onClick={() => patch({ coverage: filters.coverage === 'missing' ? 'all' : 'missing' })}
        />
        <KpiTile
          icon={Wallet}
          label={`Monthly payroll cost (${defaultCurrency})`}
          value={kpis ? (showWage ? formatMinor(kpis.monthlyCostMinor, defaultCurrency) : 'Restricted') : null}
          hint={kpis && kpis.unconvertedCurrencies.length ? `No FX rate for ${kpis.unconvertedCurrencies.join(', ')} (counted 1:1)` : 'Base + recurring allowances'}
          tone={kpis && kpis.unconvertedCurrencies.length ? 'warning' : 'default'}
        />
        <KpiTile
          icon={Coins}
          label="Highest department average"
          value={kpis ? (kpis.byDepartment[0] ? (showWage ? formatMinor(kpis.byDepartment[0].averageMonthlyMinor, defaultCurrency) : 'Restricted') : '—') : null}
          hint={kpis?.byDepartment[0] ? `${kpis.byDepartment[0].department} · ${kpis.byDepartment[0].crew} crew` : undefined}
        />
      </div>

      {showWage && kpis && kpis.byDepartment.length > 0 && (
        <Card className="bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Average monthly package by department</CardTitle>
            <CardDescription>Base plus recurring allowances per crew member, converted to {defaultCurrency}.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {kpis.byDepartment.map((d) => (
              <button
                key={d.department}
                type="button"
                onClick={() => patch({ department: filters.department === d.department ? 'all' : d.department })}
                className={cn(
                  'flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50',
                  filters.department === d.department && 'border-primary ring-1 ring-primary',
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{d.department}</span>
                  <span className="text-xs text-muted-foreground">{d.crew} crew</span>
                </span>
                <span className="tabular-nums">{formatMinor(d.averageMonthlyMinor, defaultCurrency)}</span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All crew</CardTitle>
          <CardDescription>Everyone in the directory with their active package. Click a row to open that crew member.</CardDescription>
          <div className="flex flex-col gap-2 pt-2 md:flex-row md:items-center">
            <div className="relative md:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search crew, rank, grade…" value={filters.search} onChange={(e) => patch({ search: e.target.value })} />
            </div>
            <Select value={filters.vesselId} onValueChange={(v) => patch({ vesselId: v })}>
              <SelectTrigger className="md:w-44"><SelectValue placeholder="Vessel" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All vessels</SelectItem>
                <SelectItem value="none">Unassigned</SelectItem>
                {vessels.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.department} onValueChange={(v) => patch({ department: v })}>
              <SelectTrigger className="md:w-44"><SelectValue placeholder="Department" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.coverage} onValueChange={(v) => patch({ coverage: v as OverviewFilters['coverage'] })}>
              <SelectTrigger className="md:w-44"><SelectValue placeholder="Coverage" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">With and without</SelectItem>
                <SelectItem value="with">With compensation</SelectItem>
                <SelectItem value="missing">Missing compensation</SelectItem>
              </SelectContent>
            </Select>
            {filtered && <Button variant="ghost" size="sm" onClick={() => setFilters(DEFAULT_OVERVIEW_FILTERS)}>Clear</Button>}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {company.isLoading ? (
            <div className="space-y-2 px-6 pb-6"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-3/4" /></div>
          ) : rows.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              {company.rows.length === 0 ? 'No crew in the directory yet.' : 'No crew match these filters.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Crew</TableHead>
                    <TableHead>Vessel</TableHead>
                    <TableHead>Department</TableHead>
                    {showWage && <TableHead className="text-right">Base salary</TableHead>}
                    {showWage && <TableHead>Frequency</TableHead>}
                    <TableHead>Pay grade</TableHead>
                    <TableHead className="text-right">Gratuity pts</TableHead>
                    <TableHead>Effective from</TableHead>
                    <TableHead className="w-[1%]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const c = r.compensation;
                    return (
                      <TableRow key={r.profile_id} className="cursor-pointer" onClick={() => onSelectCrew(r.profile_id)}>
                        <TableCell className="font-medium">
                          {r.crew_name}
                          {r.rank && <span className="block text-xs font-normal text-muted-foreground">{r.rank}</span>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{r.vessel_name ?? '—'}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{r.department ?? '—'}</TableCell>
                        {showWage && (
                          <TableCell className="whitespace-nowrap text-right tabular-nums">
                            {c ? formatMinor(c.base_salary_minor, c.currency) : (
                              <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20 text-[10px]">
                                <AlertTriangle className="mr-1 h-3 w-3" /> Missing
                              </Badge>
                            )}
                          </TableCell>
                        )}
                        {showWage && <TableCell className="whitespace-nowrap">{c ? humanise(c.pay_frequency) : '—'}</TableCell>}
                        <TableCell className="whitespace-nowrap">
                          {c?.pay_grade_code ? <span title={c.pay_grade_name ?? undefined}>{c.pay_grade_code}</span> : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">
                          {c ? (c.gratuity_eligible ? c.gratuity_points ?? '—' : <span className="text-muted-foreground">n/a</span>) : '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{c ? formatDate(c.effective_from) : '—'}</TableCell>
                        <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PayrollCostOverview;

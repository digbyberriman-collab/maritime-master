import React, { useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, ChevronRight, FileSignature, Hourglass, Search, UserX } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useHrCrewDirectory } from '@/modules/hris/hooks/useHrCrewDirectory';
import { useCompanyContracts, useCompanyVessels, useHrExpiryItems } from '@/modules/hris/hooks/useCrewContracts';
import { expiryLabel, expiryTone, formatDate, humanise, toneClass } from '@/modules/hris/lib/format';
import {
  CONTRACT_STATUSES,
  DEFAULT_CONTRACT_FILTERS,
  computeContractKpis,
  deriveContractStatus,
  type CompanyContractFilters,
  type ContractStatus,
} from '@/modules/hris/lib/contractHelpers';
import { ContractStatusBadge } from './ContractStatusBadge';
import { ExpiryTable } from './ExpiryTable';

interface ContractsOverviewProps {
  onSelectCrew: (profileId: string) => void;
}

interface KpiTileProps {
  icon: LucideIcon;
  label: string;
  value: number | null;
  tone?: 'default' | 'warning' | 'critical';
  active?: boolean;
  onClick: () => void;
}

const KpiTile: React.FC<KpiTileProps> = ({ icon: Icon, label, value, tone = 'default', active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      'flex items-center gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      active && 'border-primary ring-1 ring-primary',
    )}
  >
    <div
      className={cn(
        'rounded-md p-2',
        tone === 'critical' ? 'bg-destructive/10 text-destructive' : tone === 'warning' ? 'bg-yellow-500/10 text-yellow-600' : 'bg-primary/10 text-primary',
      )}
    >
      <Icon className="h-5 w-5" />
    </div>
    <div className="min-w-0">
      {value === null ? <Skeleton className="h-7 w-10" /> : <p className="text-2xl font-semibold leading-none text-foreground">{value}</p>}
      <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
    </div>
  </button>
);

type View = 'contracts' | 'missing';

/** Company-wide view: KPI tiles, upcoming expiries and a filterable contract table. */
export const ContractsOverview: React.FC<ContractsOverviewProps> = ({ onSelectCrew }) => {
  const [filters, setFilters] = useState<CompanyContractFilters>(DEFAULT_CONTRACT_FILTERS);
  const [view, setView] = useState<View>('contracts');

  const directory = useHrCrewDirectory();
  const { vessels, vesselName } = useCompanyVessels();
  const company = useCompanyContracts(filters);
  const expiry = useHrExpiryItems({ itemTypes: ['contract', 'probation'], withinDays: 90 });

  const crewIds = useMemo(() => directory.entries.map((e) => e.id), [directory.entries]);
  const loadingKpis = company.isLoading || directory.isLoading;
  const kpis = useMemo(() => (loadingKpis ? null : computeContractKpis(company.all, crewIds)), [loadingKpis, company.all, crewIds]);

  const missingCrew = useMemo(() => {
    const covered = new Set(company.all.filter((c) => deriveContractStatus(c) === 'active').map((c) => c.profile_id));
    return directory.entries.filter((e) => !covered.has(e.id));
  }, [company.all, directory.entries]);

  const patch = (next: Partial<CompanyContractFilters>) => {
    setView('contracts');
    setFilters((prev) => ({ ...prev, ...next }));
  };
  const isFilter = (next: Partial<CompanyContractFilters>) =>
    view === 'contracts' && (Object.keys(next) as (keyof CompanyContractFilters)[]).every((k) => filters[k] === next[k]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile
          icon={FileSignature}
          label="Active contracts"
          value={kpis?.activeContracts ?? null}
          active={isFilter({ status: 'active', expiringWithinDays: null })}
          onClick={() => patch({ status: 'active', expiringWithinDays: null, vesselId: 'all' })}
        />
        <KpiTile
          icon={AlertTriangle}
          label="Expiring within 30 days"
          value={kpis?.expiring30 ?? null}
          tone="critical"
          active={isFilter({ expiringWithinDays: 30 })}
          onClick={() => patch({ status: 'active', expiringWithinDays: 30, vesselId: 'all' })}
        />
        <KpiTile
          icon={CalendarClock}
          label="Expiring within 90 days"
          value={kpis?.expiring90 ?? null}
          tone="warning"
          active={isFilter({ expiringWithinDays: 90 })}
          onClick={() => patch({ status: 'active', expiringWithinDays: 90, vesselId: 'all' })}
        />
        <KpiTile
          icon={UserX}
          label="Crew without a contract"
          value={kpis?.missingContract ?? null}
          tone={kpis && kpis.missingContract > 0 ? 'warning' : 'default'}
          active={view === 'missing'}
          onClick={() => setView('missing')}
        />
        <KpiTile
          icon={Hourglass}
          label="Probation ending ≤30 days"
          value={kpis?.probationEnding30 ?? null}
          onClick={() => document.getElementById('hris-expiring-soon')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
      </div>

      <div id="hris-expiring-soon">
        <ExpiryTable items={expiry.items} isLoading={expiry.isLoading} vesselName={vesselName} onSelectCrew={onSelectCrew} />
      </div>

      {view === 'missing' ? (
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="text-base">Crew without an active contract</CardTitle>
              <CardDescription>Active crew in the directory who have no contract in force.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => setView('contracts')}>Show contracts</Button>
          </CardHeader>
          <CardContent className="p-0">
            {directory.isLoading ? (
              <div className="space-y-2 px-6 pb-6"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
            ) : missingCrew.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">Everyone has an active contract.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Crew</TableHead>
                      <TableHead>Rank</TableHead>
                      <TableHead>Vessel</TableHead>
                      <TableHead className="w-[1%]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {missingCrew.map((e) => (
                      <TableRow key={e.id} className="cursor-pointer" onClick={() => onSelectCrew(e.id)}>
                        <TableCell className="font-medium">
                          {e.displayName}
                          {e.is_imported && <Badge variant="outline" className="ml-2 text-[10px]">Imported</Badge>}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{e.rank ?? e.position ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{e.vessel_name ?? '—'}</TableCell>
                        <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">All contracts</CardTitle>
            <CardDescription>Every contract in the company. Click a row to open that crew member.</CardDescription>
            <div className="flex flex-col gap-2 pt-2 md:flex-row md:items-center">
              <div className="relative md:w-64">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search crew, vessel, reference…"
                  value={filters.search}
                  onChange={(e) => patch({ search: e.target.value })}
                />
              </div>
              <Select value={filters.status} onValueChange={(v) => patch({ status: v as ContractStatus | 'all' })}>
                <SelectTrigger className="md:w-40"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {CONTRACT_STATUSES.map((s) => <SelectItem key={s} value={s}>{humanise(s)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filters.vesselId} onValueChange={(v) => patch({ vesselId: v })}>
                <SelectTrigger className="md:w-44"><SelectValue placeholder="Vessel" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All vessels</SelectItem>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {vessels.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select
                value={filters.expiringWithinDays === null ? 'any' : String(filters.expiringWithinDays)}
                onValueChange={(v) => patch({ expiringWithinDays: v === 'any' ? null : Number(v), status: v === 'any' ? filters.status : 'active' })}
              >
                <SelectTrigger className="md:w-44"><SelectValue placeholder="Expiry" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any end date</SelectItem>
                  <SelectItem value="30">Ending ≤30 days</SelectItem>
                  <SelectItem value="90">Ending ≤90 days</SelectItem>
                  <SelectItem value="180">Ending ≤180 days</SelectItem>
                </SelectContent>
              </Select>
              {(filters.search || filters.status !== 'all' || filters.vesselId !== 'all' || filters.expiringWithinDays !== null) && (
                <Button variant="ghost" size="sm" onClick={() => setFilters(DEFAULT_CONTRACT_FILTERS)}>Clear</Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {company.isLoading ? (
              <div className="space-y-2 px-6 pb-6"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-3/4" /></div>
            ) : company.contracts.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">
                {company.all.length === 0 ? 'No contracts recorded yet. Select a crew member to create one.' : 'No contracts match these filters.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Crew</TableHead>
                      <TableHead>Vessel</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Start</TableHead>
                      <TableHead>End</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[1%]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {company.contracts.map((c) => {
                      const status = deriveContractStatus(c);
                      const tone = status === 'active' ? expiryTone(c.end_date) : 'none';
                      return (
                        <TableRow key={c.id} className="cursor-pointer" onClick={() => onSelectCrew(c.profile_id)}>
                          <TableCell className="font-medium">
                            {c.crew_name}
                            {(c.position ?? c.rank) && <span className="block text-xs font-normal text-muted-foreground">{c.position ?? c.rank}</span>}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">{c.vessel_name ?? '—'}</TableCell>
                          <TableCell className="whitespace-nowrap">{humanise(c.contract_type)}</TableCell>
                          <TableCell className="max-w-[140px] truncate text-muted-foreground">{c.contract_number ?? '—'}</TableCell>
                          <TableCell className="whitespace-nowrap">{formatDate(c.start_date)}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            <span className="flex items-center gap-2">
                              {c.end_date ? formatDate(c.end_date) : 'Open'}
                              {c.end_date && status === 'active' && (
                                <Badge variant="outline" className={cn('text-[10px]', toneClass[tone])}>{expiryLabel(c.end_date)}</Badge>
                              )}
                            </span>
                          </TableCell>
                          <TableCell><ContractStatusBadge contract={c} /></TableCell>
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
      )}
    </div>
  );
};

export default ContractsOverview;

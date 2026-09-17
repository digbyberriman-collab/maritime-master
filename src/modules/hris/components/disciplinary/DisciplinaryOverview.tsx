import React, { useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, FolderOpen, Gavel, Scale, Search, ExternalLink } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCompanyVessels } from '@/modules/hris/hooks/useCrewContracts';
import { useDisciplinaryRecords, useWarningDueItems } from '@/modules/hris/hooks/useDisciplinary';
import { formatDate, humanise } from '@/modules/hris/lib/format';
import {
  DEFAULT_DISCIPLINARY_FILTERS,
  DISCIPLINARY_CATEGORIES,
  DISCIPLINARY_SEVERITIES,
  DISCIPLINARY_STAGES,
  RECORD_STATUSES,
  SEVERITY_LABEL,
  STAGE_LABEL,
  computeDisciplinaryKpis,
  incidentYears,
  type DisciplinaryFilters,
} from '@/modules/hris/lib/disciplinary';
import { AppealBadge, LifecycleBadge, SeverityBadge, StageBadge } from './DisciplinaryBadges';
import { WarningsExpiringTable } from './WarningsExpiringTable';

interface DisciplinaryOverviewProps {
  onSelectCrew: (profileId: string) => void;
  onOpenRecord: (recordId: string) => void;
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
    <div className={cn('rounded-md p-2', tone === 'critical' ? 'bg-destructive/10 text-destructive' : tone === 'warning' ? 'bg-yellow-500/10 text-yellow-500' : 'bg-primary/10 text-primary')}>
      <Icon className="h-5 w-5" />
    </div>
    <div className="min-w-0">
      {value === null ? <Skeleton className="h-7 w-10" /> : <p className="text-2xl font-semibold leading-none text-foreground">{value}</p>}
      <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
    </div>
  </button>
);

/** Company-wide view for HR editors: KPI tiles, warnings lapsing soon and a filterable register. */
export const DisciplinaryOverview: React.FC<DisciplinaryOverviewProps> = ({ onSelectCrew, onOpenRecord }) => {
  const [filters, setFilters] = useState<DisciplinaryFilters>(DEFAULT_DISCIPLINARY_FILTERS);
  const { vessels, vesselName } = useCompanyVessels();
  const company = useDisciplinaryRecords(filters);
  const expiring = useWarningDueItems(30);

  const kpis = useMemo(() => (company.isLoading ? null : computeDisciplinaryKpis(company.all)), [company.isLoading, company.all]);
  const years = useMemo(() => incidentYears(company.all), [company.all]);

  const patch = (next: Partial<DisciplinaryFilters>) => setFilters((prev) => ({ ...prev, ...next }));
  const isFilter = (next: Partial<DisciplinaryFilters>) => (Object.keys(next) as (keyof DisciplinaryFilters)[]).every((k) => filters[k] === next[k]);
  const dirty = JSON.stringify(filters) !== JSON.stringify(DEFAULT_DISCIPLINARY_FILTERS);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile icon={FolderOpen} label="Open cases" value={kpis?.openCases ?? null} active={isFilter({ status: 'open' })} onClick={() => patch({ status: 'open' })} />
        <KpiTile icon={Gavel} label="Live warnings" value={kpis?.liveWarnings ?? null} tone="warning" active={isFilter({ status: 'live' })} onClick={() => patch({ status: 'live' })} />
        <KpiTile
          icon={CalendarClock}
          label="Lapsing within 30 days"
          value={kpis?.expiring30 ?? null}
          tone="critical"
          onClick={() => document.getElementById('hris-warnings-expiring')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
        <KpiTile
          icon={Scale}
          label="Appeals lodged"
          value={kpis?.appealsLodged ?? null}
          tone={kpis && kpis.appealsLodged > 0 ? 'warning' : 'default'}
          onClick={() => patch({ status: 'all', search: '' })}
        />
      </div>

      <div id="hris-warnings-expiring">
        <WarningsExpiringTable items={expiring.items} isLoading={expiring.isLoading} vesselName={vesselName} onSelectCrew={onSelectCrew} />
      </div>

      <Card className="bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Disciplinary register</CardTitle>
          <CardDescription>Every record in the company. Click a row to open the crew member's file, or the arrow to open the case.</CardDescription>
          <div className="flex flex-col gap-2 pt-2 md:flex-row md:flex-wrap md:items-center">
            <div className="relative md:w-60">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search crew, incident, outcome…" value={filters.search} onChange={(e) => patch({ search: e.target.value })} />
            </div>
            <Select value={filters.status} onValueChange={(v) => patch({ status: v as DisciplinaryFilters['status'] })}>
              <SelectTrigger className="md:w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="live">Live warnings</SelectItem>
                {RECORD_STATUSES.map((s) => <SelectItem key={s} value={s}>{humanise(s)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.severity} onValueChange={(v) => patch({ severity: v as DisciplinaryFilters['severity'] })}>
              <SelectTrigger className="md:w-40"><SelectValue placeholder="Severity" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                {DISCIPLINARY_SEVERITIES.map((s) => <SelectItem key={s} value={s}>{SEVERITY_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.category} onValueChange={(v) => patch({ category: v as DisciplinaryFilters['category'] })}>
              <SelectTrigger className="md:w-40"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {DISCIPLINARY_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{humanise(c)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.stage} onValueChange={(v) => patch({ stage: v as DisciplinaryFilters['stage'] })}>
              <SelectTrigger className="md:w-44"><SelectValue placeholder="Stage" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                {DISCIPLINARY_STAGES.map((s) => <SelectItem key={s} value={s}>{STAGE_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.vesselId} onValueChange={(v) => patch({ vesselId: v })}>
              <SelectTrigger className="md:w-40"><SelectValue placeholder="Vessel" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All vessels</SelectItem>
                <SelectItem value="none">No vessel</SelectItem>
                {vessels.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.year} onValueChange={(v) => patch({ year: v })}>
              <SelectTrigger className="md:w-28"><SelectValue placeholder="Year" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All years</SelectItem>
                {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            {dirty && <Button variant="ghost" size="sm" onClick={() => setFilters(DEFAULT_DISCIPLINARY_FILTERS)}>Clear</Button>}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {company.isLoading ? (
            <div className="space-y-2 px-6 pb-6"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-3/4" /></div>
          ) : company.records.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              {company.all.length === 0 ? 'No disciplinary records. Select a crew member to open a case.' : 'No records match these filters.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Crew</TableHead>
                    <TableHead>Incident</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="w-[1%]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {company.records.map((r) => (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => onSelectCrew(r.profile_id)}>
                      <TableCell className="font-medium">
                        {r.crew_name}
                        <span className="block text-xs font-normal text-muted-foreground">{[r.crew_rank, r.vessel_name].filter(Boolean).join(' · ') || '—'}</span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(r.incident_date)}
                        {r.incident_number && <span className="block text-xs text-muted-foreground">{r.incident_number}</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{humanise(r.category)}</TableCell>
                      <TableCell><SeverityBadge severity={r.severity} /></TableCell>
                      <TableCell><StageBadge stage={r.stage} /></TableCell>
                      <TableCell>
                        <span className="flex flex-wrap gap-1">
                          <LifecycleBadge record={r} />
                          <AppealBadge appeal={r.appeal_status} />
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{r.expiry_date ? formatDate(r.expiry_date) : '—'}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          aria-label="Open case"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenRecord(r.id);
                          }}
                        >
                          <ExternalLink className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {kpis && kpis.liveWarnings === 0 && kpis.openCases === 0 && company.all.length > 0 && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5" /> Nothing is currently live. Historical records stay on file for their retention period.
        </p>
      )}
    </div>
  );
};

export default DisciplinaryOverview;

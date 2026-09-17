import React, { useMemo, useState } from 'react';
import { Briefcase, CalendarClock, ChevronRight, Flame, Search, Send, UserCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LEAVE_DEPARTMENTS } from '@/modules/crew/leaveConstants';
import { useCompanyVessels } from '@/modules/hris/hooks/useCrewContracts';
import { useVacancies } from '@/modules/hris/hooks/useRecruitment';
import { formatDate, humanise } from '@/modules/hris/lib/format';
import {
  DEFAULT_VACANCY_FILTERS,
  VACANCY_PRIORITIES,
  VACANCY_STATUSES,
  computeVacancyKpis,
  type VacancyFilters,
  type VacancyPriority,
  type VacancyStatus,
} from '@/modules/hris/lib/recruitment';
import { PipelineBar } from './PipelineBar';
import { PriorityBadge, VacancyStatusBadge } from './RecruitmentBadges';

interface VacanciesOverviewProps {
  onSelectVacancy: (vacancyId: string) => void;
  canEdit: boolean;
  onCreate: () => void;
}

interface KpiTileProps {
  icon: LucideIcon;
  label: string;
  value: number | string | null;
  tone?: 'default' | 'warning' | 'critical' | 'success';
  active?: boolean;
  onClick?: () => void;
}

const KpiTile: React.FC<KpiTileProps> = ({ icon: Icon, label, value, tone = 'default', active, onClick }) => (
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
    <div
      className={cn(
        'rounded-md p-2',
        tone === 'critical'
          ? 'bg-destructive/10 text-destructive'
          : tone === 'warning'
            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            : tone === 'success'
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'bg-primary/10 text-primary',
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

const DEPARTMENTS = LEAVE_DEPARTMENTS.filter((d) => d !== 'All');

/** Company-wide recruitment view: KPI tiles and a filterable vacancy table. */
export const VacanciesOverview: React.FC<VacanciesOverviewProps> = ({ onSelectVacancy, canEdit, onCreate }) => {
  const [filters, setFilters] = useState<VacancyFilters>(DEFAULT_VACANCY_FILTERS);
  const { vessels } = useCompanyVessels();
  const { all, vacancies, allApplications, isLoading } = useVacancies(filters);

  const kpis = useMemo(() => (isLoading ? null : computeVacancyKpis(all, allApplications)), [isLoading, all, allApplications]);

  const patch = (next: Partial<VacancyFilters>) => setFilters((prev) => ({ ...prev, ...next }));
  const isFilter = (next: Partial<VacancyFilters>) => (Object.keys(next) as (keyof VacancyFilters)[]).every((k) => filters[k] === next[k]);
  const dirty =
    filters.search ||
    filters.status !== DEFAULT_VACANCY_FILTERS.status ||
    filters.vesselId !== 'all' ||
    filters.department !== 'all' ||
    filters.priority !== 'all';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile
          icon={Briefcase}
          label="Open vacancies"
          value={kpis?.openVacancies ?? null}
          active={isFilter({ status: 'open', priority: 'all' })}
          onClick={() => patch({ status: 'open', priority: 'all' })}
        />
        <KpiTile
          icon={Flame}
          label="Urgent"
          value={kpis?.urgent ?? null}
          tone={kpis && kpis.urgent > 0 ? 'critical' : 'default'}
          active={isFilter({ status: 'open', priority: 'urgent' })}
          onClick={() => patch({ status: 'open', priority: 'urgent' })}
        />
        <KpiTile icon={Send} label="Offers out" value={kpis?.offersOut ?? null} tone="warning" />
        <KpiTile icon={UserCheck} label="Hired this year" value={kpis?.hiredThisYear ?? null} tone="success" />
        <KpiTile
          icon={CalendarClock}
          label="Avg. days to fill"
          value={kpis ? (kpis.avgDaysToFill === null ? '—' : kpis.avgDaysToFill) : null}
          active={isFilter({ status: 'filled' })}
          onClick={() => patch({ status: 'filled', priority: 'all' })}
        />
      </div>

      <Card className="bg-card">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base">Vacancies</CardTitle>
              <CardDescription>Every position the company is recruiting for. Click a row to open its pipeline.</CardDescription>
            </div>
            {canEdit && (
              <Button size="sm" onClick={onCreate}>
                New vacancy
              </Button>
            )}
          </div>
          <div className="flex flex-col gap-2 pt-2 md:flex-row md:flex-wrap md:items-center">
            <div className="relative md:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search title, reference, rank…" value={filters.search} onChange={(e) => patch({ search: e.target.value })} />
            </div>
            <Select value={filters.status} onValueChange={(v) => patch({ status: v as VacancyStatus | 'all' | 'active' })}>
              <SelectTrigger className="md:w-40"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active (draft, open, on hold)</SelectItem>
                <SelectItem value="all">All statuses</SelectItem>
                {VACANCY_STATUSES.map((s) => <SelectItem key={s} value={s}>{humanise(s)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.vesselId} onValueChange={(v) => patch({ vesselId: v })}>
              <SelectTrigger className="md:w-44"><SelectValue placeholder="Vessel" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All vessels</SelectItem>
                <SelectItem value="none">Shore / unassigned</SelectItem>
                {vessels.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.department} onValueChange={(v) => patch({ department: v })}>
              <SelectTrigger className="md:w-40"><SelectValue placeholder="Department" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.priority} onValueChange={(v) => patch({ priority: v as VacancyPriority | 'all' })}>
              <SelectTrigger className="md:w-36"><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any priority</SelectItem>
                {VACANCY_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{humanise(p)}</SelectItem>)}
              </SelectContent>
            </Select>
            {dirty && (
              <Button variant="ghost" size="sm" onClick={() => setFilters(DEFAULT_VACANCY_FILTERS)}>Clear</Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 px-6 pb-6"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-3/4" /></div>
          ) : vacancies.length === 0 ? (
            <div className="px-6 pb-6 text-sm text-muted-foreground">
              {all.length === 0 ? (
                <span>No vacancies yet.{canEdit ? ' Create one to start building a pipeline.' : ''}</span>
              ) : (
                'No vacancies match these filters.'
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vacancy</TableHead>
                    <TableHead>Vessel</TableHead>
                    <TableHead>Rank / dept</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Pipeline</TableHead>
                    <TableHead>Filled</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[1%]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vacancies.map((v) => (
                    <TableRow key={v.id} className="cursor-pointer" onClick={() => onSelectVacancy(v.id)}>
                      <TableCell className="font-medium">
                        {v.title}
                        <span className="block text-xs font-normal text-muted-foreground">{v.reference ?? humanise(v.contract_type)}</span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{v.vessel_name ?? 'Shore'}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {v.rank ?? '—'}
                        {v.department && <span className="block text-xs text-muted-foreground">{v.department}</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(v.start_date)}</TableCell>
                      <TableCell><PriorityBadge priority={v.priority} /></TableCell>
                      <TableCell><PipelineBar counts={v.counts} /></TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {v.progress.hired}/{v.progress.headcount}
                      </TableCell>
                      <TableCell><VacancyStatusBadge status={v.status} /></TableCell>
                      <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default VacanciesOverview;

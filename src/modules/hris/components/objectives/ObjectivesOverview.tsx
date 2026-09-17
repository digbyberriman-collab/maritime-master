import React, { useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, ChevronRight, Gauge, Search, Target, Trophy } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCompanyVessels } from '@/modules/hris/hooks/useCrewContracts';
import { useObjectiveDueItems, useObjectives } from '@/modules/hris/hooks/useObjectives';
import { formatDate } from '@/modules/hris/lib/format';
import {
  CATEGORY_CLASS,
  CATEGORY_LABEL,
  DEFAULT_OBJECTIVE_FILTERS,
  OBJECTIVE_CATEGORIES,
  OBJECTIVE_STATUSES,
  computeObjectiveKpis,
  isObjectiveCategory,
  statusLabel,
  type ObjectiveCategory,
  type ObjectiveFilters,
} from '@/modules/hris/lib/objectives';
import { ObjectiveStatusBadge } from './ObjectiveStatusBadge';
import { ObjectivesDueTable } from './ObjectivesDueTable';

interface ObjectivesOverviewProps {
  onSelectCrew: (profileId: string) => void;
  onOpenObjective: (objectiveId: string) => void;
}

interface KpiTileProps {
  icon: LucideIcon;
  label: string;
  value: number | null;
  suffix?: string;
  tone?: 'default' | 'warning' | 'critical' | 'success';
  active?: boolean;
  onClick: () => void;
}

const KpiTile: React.FC<KpiTileProps> = ({ icon: Icon, label, value, suffix, tone = 'default', active, onClick }) => (
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
        tone === 'critical'
          ? 'bg-destructive/10 text-destructive'
          : tone === 'warning'
            ? 'bg-yellow-500/10 text-yellow-500'
            : tone === 'success'
              ? 'bg-green-500/10 text-green-500'
              : 'bg-primary/10 text-primary',
      )}
    >
      <Icon className="h-5 w-5" />
    </div>
    <div className="min-w-0">
      {value === null ? (
        <Skeleton className="h-7 w-10" />
      ) : (
        <p className="text-2xl font-semibold leading-none text-foreground">
          {value}
          {suffix && <span className="text-base text-muted-foreground">{suffix}</span>}
        </p>
      )}
      <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
    </div>
  </button>
);

/** Company-wide view: KPI tiles, objectives due soon and a filterable table of all objectives. */
export const ObjectivesOverview: React.FC<ObjectivesOverviewProps> = ({ onSelectCrew, onOpenObjective }) => {
  const [filters, setFilters] = useState<ObjectiveFilters>(DEFAULT_OBJECTIVE_FILTERS);
  const { vessels } = useCompanyVessels();
  const company = useObjectives(filters);
  const due = useObjectiveDueItems(14);

  const kpis = useMemo(() => (company.isLoading ? null : computeObjectiveKpis(company.all)), [company.isLoading, company.all]);

  const owners = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of company.all) if (o.owner_profile_id && o.owner_name) map.set(o.owner_profile_id, o.owner_name);
    return Array.from(map.entries()).sort(([, a], [, b]) => a.localeCompare(b));
  }, [company.all]);

  const patch = (next: Partial<ObjectiveFilters>) => setFilters((prev) => ({ ...prev, ...next }));
  const isFilter = (next: Partial<ObjectiveFilters>) => (Object.keys(next) as (keyof ObjectiveFilters)[]).every((k) => filters[k] === next[k]);
  const dirty =
    filters.search || filters.status !== DEFAULT_OBJECTIVE_FILTERS.status || filters.category !== 'all' || filters.vesselId !== 'all' || filters.ownerId !== 'all';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile icon={Target} label="Open objectives" value={kpis?.open ?? null} active={isFilter({ status: 'open' })} onClick={() => patch({ status: 'open', category: 'all' })} />
        <KpiTile
          icon={CalendarClock}
          label="Due within 14 days"
          value={kpis?.dueSoon ?? null}
          tone="warning"
          onClick={() => document.getElementById('hris-objectives-due')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
        <KpiTile icon={AlertTriangle} label="Overdue" value={kpis?.overdue ?? null} tone="critical" active={isFilter({ status: 'overdue' })} onClick={() => patch({ status: 'overdue' })} />
        <KpiTile
          icon={Trophy}
          label="Achieved this year"
          value={kpis?.achievedThisYear ?? null}
          tone="success"
          active={isFilter({ status: 'achieved' })}
          onClick={() => patch({ status: 'achieved' })}
        />
        <KpiTile
          icon={Gauge}
          label="Average PDP completion"
          value={kpis ? kpis.avgPdpCompletion ?? 0 : null}
          suffix="%"
          onClick={() => patch({ status: 'all' })}
        />
      </div>

      <div id="hris-objectives-due">
        <ObjectivesDueTable items={due.items} isLoading={due.isLoading} onSelectCrew={onSelectCrew} />
      </div>

      <Card className="bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All objectives</CardTitle>
          <CardDescription>Every objective in the company. Click a row to open it, or the crew name to open their PDP.</CardDescription>
          <div className="flex flex-col gap-2 pt-2 md:flex-row md:flex-wrap md:items-center">
            <div className="relative md:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search objective, crew, owner…" value={filters.search} onChange={(e) => patch({ search: e.target.value })} />
            </div>
            <Select value={filters.status} onValueChange={(v) => patch({ status: v as ObjectiveFilters['status'] })}>
              <SelectTrigger className="md:w-40"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="all">All statuses</SelectItem>
                {OBJECTIVE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{statusLabel({ status: s, target_date: null })}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filters.category} onValueChange={(v) => patch({ category: v as ObjectiveCategory | 'all' })}>
              <SelectTrigger className="md:w-40"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {OBJECTIVE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>)}
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
            <Select value={filters.ownerId} onValueChange={(v) => patch({ ownerId: v })}>
              <SelectTrigger className="md:w-44"><SelectValue placeholder="Owner" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any owner</SelectItem>
                {owners.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
            {dirty && <Button variant="ghost" size="sm" onClick={() => setFilters(DEFAULT_OBJECTIVE_FILTERS)}>Clear</Button>}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {company.isLoading ? (
            <div className="space-y-2 px-6 pb-6"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-3/4" /></div>
          ) : company.objectives.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              {company.all.length === 0 ? 'No objectives recorded yet. Select a crew member to create one.' : 'No objectives match these filters.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Crew</TableHead>
                    <TableHead>Objective</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead className="min-w-[140px]">Progress</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[1%]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {company.objectives.map((o) => (
                    <TableRow key={o.id} className="cursor-pointer" onClick={() => onOpenObjective(o.id)}>
                      <TableCell className="font-medium">
                        <button
                          type="button"
                          className="text-left hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectCrew(o.profile_id);
                          }}
                        >
                          {o.crew_name}
                        </button>
                        {o.crew_rank && <span className="block text-xs font-normal text-muted-foreground">{o.crew_rank}</span>}
                      </TableCell>
                      <TableCell className="max-w-[280px]">
                        <span className="block truncate">{o.title}</span>
                        {o.measure && <span className="block truncate text-xs text-muted-foreground">{o.measure}</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('text-[10px]', CATEGORY_CLASS[isObjectiveCategory(o.category) ? o.category : 'performance'])}>
                          {isObjectiveCategory(o.category) ? CATEGORY_LABEL[o.category] : o.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{o.owner_name ?? '—'}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(o.target_date)}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <Progress value={o.progress_pct} className="h-2 w-20" />
                          <span className="text-xs tabular-nums text-muted-foreground">{o.progress_pct}%</span>
                        </span>
                      </TableCell>
                      <TableCell><ObjectiveStatusBadge objective={o} /></TableCell>
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

export default ObjectivesOverview;

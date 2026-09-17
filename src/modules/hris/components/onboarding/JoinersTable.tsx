import React, { useMemo, useState } from 'react';
import { ChevronRight, Search, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCompanyVessels } from '@/modules/hris/hooks/useCrewContracts';
import { useHrCrewDirectory } from '@/modules/hris/hooks/useHrCrewDirectory';
import { formatDate } from '@/modules/hris/lib/format';
import { DEFAULT_JOINER_FILTERS, STATUS_LABELS, ONBOARDING_STATUSES, filterJoiners, type JoinerFilters, type JoinerRow } from '@/modules/hris/lib/onboarding';
import { OnboardingStatusBadge } from './badges';

interface JoinersTableProps {
  joiners: JoinerRow[];
  isLoading: boolean;
  onSelect: (profileId: string) => void;
  /** Initial filter set by a KPI tile. */
  initialFilters?: Partial<JoinerFilters>;
}

const startLabel = (days: number): string => {
  if (days === 0) return 'Today';
  if (days > 0) return `In ${days}d`;
  return `${Math.abs(days)}d ago`;
};

/** Crew with a start date in the window, whatever the source, with onboarding progress. */
export const JoinersTable: React.FC<JoinersTableProps> = ({ joiners, isLoading, onSelect, initialFilters }) => {
  const [filters, setFilters] = useState<JoinerFilters>({ ...DEFAULT_JOINER_FILTERS, ...initialFilters });
  const { vessels } = useCompanyVessels();
  const directory = useHrCrewDirectory({ includeInactive: true });
  const buddyName = useMemo(() => new Map(directory.all.map((e) => [e.id, e.displayName])), [directory.all]);

  const rows = useMemo(() => filterJoiners(joiners, filters), [joiners, filters]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} placeholder="Search joiners…" className="pl-8" />
        </div>
        <Select value={filters.status} onValueChange={(v) => setFilters((f) => ({ ...f, status: v as JoinerFilters['status'] }))}>
          <SelectTrigger className="md:w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="none">Not started (no record)</SelectItem>
            {ONBOARDING_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.vesselId} onValueChange={(v) => setFilters((f) => ({ ...f, vesselId: v }))}>
          <SelectTrigger className="md:w-[180px]"><SelectValue placeholder="Vessel" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All vessels</SelectItem>
            {vessels.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Crew</TableHead>
              <TableHead>Vessel</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[180px]">Completion</TableHead>
              <TableHead>Buddy</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  <UserRound className="mx-auto mb-2 h-6 w-6 opacity-50" />
                  No joiners in this window. Start dates come from contracts, vessel assignments and onboarding records.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.profileId} className="cursor-pointer" onClick={() => onSelect(r.profileId)}>
                  <TableCell>
                    <div className="font-medium text-foreground">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{[r.rank, r.department].filter(Boolean).join(' · ') || '—'}</div>
                  </TableCell>
                  <TableCell className="text-sm">{r.vesselName ?? '—'}</TableCell>
                  <TableCell>
                    <div className="text-sm">{formatDate(r.startDate)}</div>
                    <div className={cn('text-xs', r.daysUntilStart < 0 ? 'text-muted-foreground' : r.daysUntilStart <= 7 ? 'text-orange-600 dark:text-orange-400' : 'text-muted-foreground')}>{startLabel(r.daysUntilStart)}</div>
                  </TableCell>
                  <TableCell><OnboardingStatusBadge status={r.status} /></TableCell>
                  <TableCell>
                    {r.record ? (
                      <div className="flex items-center gap-2">
                        <Progress value={r.completionPct ?? 0} className="h-2" />
                        <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{r.completionPct ?? 0}%</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">No checklist yet</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{r.buddyProfileId ? buddyName.get(r.buddyProfileId) ?? '—' : '—'}</TableCell>
                  <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default JoinersTable;

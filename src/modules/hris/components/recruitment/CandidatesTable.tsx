import React, { useMemo, useState } from 'react';
import { ChevronRight, Search, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RANKS } from '@/modules/crew/constants';
import { LEAVE_DEPARTMENTS } from '@/modules/crew/leaveConstants';
import { useCandidates } from '@/modules/hris/hooks/useRecruitment';
import { formatDate, humanise } from '@/modules/hris/lib/format';
import {
  CANDIDATE_SOURCES,
  CANDIDATE_STATUSES,
  DEFAULT_CANDIDATE_FILTERS,
  candidateName,
  type CandidateFilters,
  type CandidateSource,
  type CandidateStatus,
} from '@/modules/hris/lib/recruitment';
import { CandidateStatusBadge, RatingStars } from './RecruitmentBadges';

interface CandidatesTableProps {
  onSelectCandidate: (candidateId: string) => void;
  canEdit: boolean;
  onCreate: () => void;
}

const DEPARTMENTS = LEAVE_DEPARTMENTS.filter((d) => d !== 'All');

/** Filterable candidate pool. Click a row to open the candidate. */
export const CandidatesTable: React.FC<CandidatesTableProps> = ({ onSelectCandidate, canEdit, onCreate }) => {
  const [filters, setFilters] = useState<CandidateFilters>(DEFAULT_CANDIDATE_FILTERS);
  const { all, candidates, isLoading } = useCandidates(filters);

  const patch = (next: Partial<CandidateFilters>) => setFilters((prev) => ({ ...prev, ...next }));
  const dirty = filters.search || filters.status !== DEFAULT_CANDIDATE_FILTERS.status || filters.rank !== 'all' || filters.department !== 'all' || filters.source !== 'all';

  // Ranks actually present in the pool come first so the list is useful without scrolling.
  const rankOptions = useMemo(() => {
    const present = new Set(all.map((c) => c.rank).filter((r): r is string => Boolean(r)));
    const known = RANKS.filter((r) => present.has(r));
    const extra = [...present].filter((r) => !(RANKS as readonly string[]).includes(r)).sort();
    return [...known, ...extra];
  }, [all]);

  const summary = useMemo(() => {
    const active = all.filter((c) => c.status === 'active').length;
    const inProcess = all.filter((c) => c.active_applications > 0).length;
    return { active, inProcess };
  }, [all]);

  return (
    <Card className="bg-card">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">Candidate pool</CardTitle>
            <CardDescription>
              {isLoading ? 'Loading…' : `${summary.active} active candidates · ${summary.inProcess} in a live process`}
            </CardDescription>
          </div>
          {canEdit && (
            <Button size="sm" onClick={onCreate}>
              <UserPlus className="mr-2 h-4 w-4" /> New candidate
            </Button>
          )}
        </div>
        <div className="flex flex-col gap-2 pt-2 md:flex-row md:flex-wrap md:items-center">
          <div className="relative md:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search name, email, certificate…" value={filters.search} onChange={(e) => patch({ search: e.target.value })} />
          </div>
          <Select value={filters.status} onValueChange={(v) => patch({ status: v as CandidateStatus | 'all' })}>
            <SelectTrigger className="md:w-40"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {CANDIDATE_STATUSES.map((s) => <SelectItem key={s} value={s}>{humanise(s)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.rank} onValueChange={(v) => patch({ rank: v })}>
            <SelectTrigger className="md:w-44"><SelectValue placeholder="Rank" /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">All ranks</SelectItem>
              {rankOptions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.department} onValueChange={(v) => patch({ department: v })}>
            <SelectTrigger className="md:w-40"><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.source} onValueChange={(v) => patch({ source: v as CandidateSource | 'all' })}>
            <SelectTrigger className="md:w-36"><SelectValue placeholder="Source" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any source</SelectItem>
              {CANDIDATE_SOURCES.map((s) => <SelectItem key={s} value={s}>{humanise(s)}</SelectItem>)}
            </SelectContent>
          </Select>
          {dirty && <Button variant="ghost" size="sm" onClick={() => setFilters(DEFAULT_CANDIDATE_FILTERS)}>Clear</Button>}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 px-6 pb-6"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-3/4" /></div>
        ) : candidates.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            {all.length === 0 ? `No candidates yet.${canEdit ? ' Add one to start building the pool.' : ''}` : 'No candidates match these filters.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Rank / dept</TableHead>
                  <TableHead>Nationality</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Available</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Applications</TableHead>
                  <TableHead className="w-[1%]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => onSelectCandidate(c.id)}>
                    <TableCell className="font-medium">
                      {candidateName(c)}
                      <span className="block text-xs font-normal text-muted-foreground">{c.email ?? c.phone ?? '—'}</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {c.rank ?? '—'}
                      {c.department && <span className="block text-xs text-muted-foreground">{c.department}</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{c.nationality ?? '—'}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {humanise(c.source)}
                      {c.agency_name && <span className="block text-xs text-muted-foreground">{c.agency_name}</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(c.available_from)}</TableCell>
                    <TableCell><RatingStars value={c.rating} /></TableCell>
                    <TableCell><CandidateStatusBadge status={c.status} /></TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.applications_count}
                      {c.active_applications > 0 && <span className="ml-1 text-xs text-muted-foreground">({c.active_applications} live)</span>}
                    </TableCell>
                    <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CandidatesTable;

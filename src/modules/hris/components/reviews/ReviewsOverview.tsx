import React, { useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronRight, ClipboardList, Search, Star, UserCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useCompanyVessels } from '@/modules/hris/hooks/useCrewContracts';
import { useCompanyReviews, useDueItems, useReviewCycles, type DueItemRow } from '@/modules/hris/hooks/usePerformanceReviews';
import { daysUntil, expiryLabel, expiryTone, formatDate, toneClass } from '@/modules/hris/lib/format';
import {
  DEFAULT_REVIEW_FILTERS,
  NO_VESSEL_FILTER,
  REVIEW_STATUSES,
  STATUS_LABEL,
  computeReviewKpis,
  filterReviews,
  isTerminalStatus,
  reviewTypeLabel,
  type ReviewFilters,
  type ReviewStatus,
  type ReviewType,
} from '@/modules/hris/lib/reviews';
import { ReviewStatusBadge } from './ReviewStatusBadge';
import { ReviewsTable } from './ReviewsTable';

interface ReviewsOverviewProps {
  /** Type filter owned by the page toolbar. */
  type: ReviewType | 'all';
  onOpenReview: (reviewId: string) => void;
  onSelectCrew: (profileId: string) => void;
}

interface KpiTileProps {
  icon: LucideIcon;
  label: string;
  value: number | string | null;
  tone?: 'default' | 'warning' | 'critical' | 'success';
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
        tone === 'critical'
          ? 'bg-destructive/10 text-destructive'
          : tone === 'warning'
            ? 'bg-yellow-500/10 text-yellow-600'
            : tone === 'success'
              ? 'bg-green-500/10 text-green-600'
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

type View = 'all' | 'dueSoon' | 'overdue' | 'awaitingAck' | 'awaitingMe' | 'completedYear';

const VIEW_TITLE: Record<View, string> = {
  all: 'All reviews',
  dueSoon: 'Due within 14 days',
  overdue: 'Overdue reviews',
  awaitingAck: 'Awaiting crew acknowledgement',
  awaitingMe: 'Reviews awaiting me',
  completedYear: 'Completed this year',
};

interface DueTableProps {
  items: DueItemRow[];
  isLoading: boolean;
  vesselName: (id: string | null | undefined) => string | null;
  onOpenReview: (reviewId: string) => void;
}

/** Upcoming review due dates from `hr_performance_due_items`. */
const DueTable: React.FC<DueTableProps> = ({ items, isLoading, vesselName, onOpenReview }) => (
  <Card className="bg-card">
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-base">
        <CalendarClock className="h-4 w-4 text-muted-foreground" /> Due soon
      </CardTitle>
      <CardDescription>Reviews due within 30 days or overdue, soonest first. Click a row to open the review.</CardDescription>
    </CardHeader>
    <CardContent className="p-0">
      {isLoading ? (
        <div className="space-y-2 px-6 pb-6"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-2/3" /></div>
      ) : items.length === 0 ? (
        <p className="px-6 pb-6 text-sm text-muted-foreground">Nothing is due in this window.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Crew</TableHead>
                <TableHead>Vessel</TableHead>
                <TableHead>Review</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Remaining</TableHead>
                <TableHead className="w-[1%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const tone = expiryTone(item.due_date);
                return (
                  <TableRow
                    key={item.record_id ?? `${item.profile_id}-${item.due_date}`}
                    className="cursor-pointer"
                    tabIndex={0}
                    onClick={() => item.record_id && onOpenReview(item.record_id)}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ' ') && item.record_id) {
                        e.preventDefault();
                        onOpenReview(item.record_id);
                      }
                    }}
                  >
                    <TableCell className="font-medium">{item.crew_name ?? '—'}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{vesselName(item.vessel_id) ?? '—'}</TableCell>
                    <TableCell className="whitespace-nowrap">{reviewTypeLabel(item.label)}</TableCell>
                    <TableCell><ReviewStatusBadge status={item.status} /></TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(item.due_date)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('whitespace-nowrap', toneClass[tone])}>{expiryLabel(item.due_date)}</Badge>
                    </TableCell>
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
);

/** Company-wide view: KPI tiles, upcoming due dates and a filterable review table. */
export const ReviewsOverview: React.FC<ReviewsOverviewProps> = ({ type, onOpenReview, onSelectCrew }) => {
  const { profile } = useAuth();
  const myProfileId = profile?.id ?? null;
  const [filters, setFilters] = useState<Omit<ReviewFilters, 'type'>>({ ...DEFAULT_REVIEW_FILTERS, status: 'open' });
  const [view, setView] = useState<View>('all');

  const company = useCompanyReviews();
  const { vessels, vesselName } = useCompanyVessels();
  const { cycles } = useReviewCycles();
  const due = useDueItems({ itemTypes: ['review'], withinDays: 30 });

  const typed = useMemo(() => (type === 'all' ? company.all : company.all.filter((r) => r.review_type === type)), [company.all, type]);
  const kpis = useMemo(() => (company.isLoading ? null : computeReviewKpis(typed, myProfileId)), [company.isLoading, typed, myProfileId]);

  const rows = useMemo(() => {
    const base = filterReviews(typed, { ...filters, type: 'all' });
    const year = new Date().getFullYear();
    switch (view) {
      case 'dueSoon':
        return base.filter((r) => {
          const d = daysUntil(r.due_date);
          return !isTerminalStatus(r.status) && d !== null && d >= 0 && d <= 14;
        });
      case 'overdue':
        return base.filter((r) => {
          const d = daysUntil(r.due_date);
          return !isTerminalStatus(r.status) && d !== null && d < 0;
        });
      case 'awaitingAck':
        return base.filter((r) => r.status === 'awaiting_acknowledgement');
      case 'awaitingMe':
        return base.filter((r) => r.reviewer_profile_id === myProfileId && (r.status === 'draft' || r.status === 'in_review'));
      case 'completedYear':
        return base.filter((r) => r.status === 'completed' && r.completed_at && new Date(r.completed_at).getFullYear() === year);
      default:
        return base;
    }
  }, [typed, filters, view, myProfileId]);

  const dueItems = useMemo(
    () => (type === 'all' ? due.items : due.items.filter((i) => i.label === type)),
    [due.items, type],
  );

  const pick = (next: View) => {
    setView(next);
    setFilters((prev) => ({ ...prev, status: next === 'completedYear' ? 'completed' : next === 'all' ? prev.status : 'open' }));
  };
  const patch = (next: Partial<Omit<ReviewFilters, 'type'>>) => {
    setView('all');
    setFilters((prev) => ({ ...prev, ...next }));
  };
  const filtersDirty = filters.search || filters.status !== 'open' || filters.vesselId !== 'all' || filters.cycleId !== 'all';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile icon={CalendarClock} label="Due within 14 days" value={kpis?.dueSoon ?? null} tone="warning" active={view === 'dueSoon'} onClick={() => pick('dueSoon')} />
        <KpiTile icon={AlertTriangle} label="Overdue" value={kpis?.overdue ?? null} tone={kpis && kpis.overdue > 0 ? 'critical' : 'default'} active={view === 'overdue'} onClick={() => pick('overdue')} />
        <KpiTile icon={UserCheck} label="Awaiting crew acknowledgement" value={kpis?.awaitingAcknowledgement ?? null} active={view === 'awaitingAck'} onClick={() => pick('awaitingAck')} />
        <KpiTile icon={ClipboardList} label="Awaiting me" value={kpis?.awaitingMe ?? null} tone={kpis && kpis.awaitingMe > 0 ? 'warning' : 'default'} active={view === 'awaitingMe'} onClick={() => pick('awaitingMe')} />
        <KpiTile icon={CheckCircle2} label="Completed this year" value={kpis?.completedThisYear ?? null} tone="success" active={view === 'completedYear'} onClick={() => pick('completedYear')} />
        <KpiTile icon={Star} label="Average overall rating" value={kpis ? (kpis.averageOverall === null ? '—' : kpis.averageOverall.toFixed(1)) : null} onClick={() => pick('completedYear')} />
      </div>

      <DueTable items={dueItems} isLoading={due.isLoading} vesselName={vesselName} onOpenReview={onOpenReview} />

      <Card className="bg-card">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">{VIEW_TITLE[view]}</CardTitle>
              <CardDescription>Click a row to open the review, or use the crew picker above to see one person's history.</CardDescription>
            </div>
            {view !== 'all' && <Button variant="outline" size="sm" onClick={() => pick('all')}>Show all</Button>}
          </div>
          <div className="flex flex-col gap-2 pt-2 md:flex-row md:items-center">
            <div className="relative md:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search crew, reviewer, vessel…" value={filters.search} onChange={(e) => patch({ search: e.target.value })} />
            </div>
            <Select value={filters.status} onValueChange={(v) => patch({ status: v as ReviewStatus | 'all' | 'open' })}>
              <SelectTrigger className="md:w-52"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open (not completed)</SelectItem>
                <SelectItem value="all">All statuses</SelectItem>
                {REVIEW_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.vesselId} onValueChange={(v) => patch({ vesselId: v })}>
              <SelectTrigger className="md:w-44"><SelectValue placeholder="Vessel" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All vessels</SelectItem>
                <SelectItem value={NO_VESSEL_FILTER}>Unassigned</SelectItem>
                {vessels.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.cycleId} onValueChange={(v) => patch({ cycleId: v })}>
              <SelectTrigger className="md:w-52"><SelectValue placeholder="Cycle" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cycles</SelectItem>
                {cycles.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {filtersDirty && (
              <Button variant="ghost" size="sm" onClick={() => setFilters({ ...DEFAULT_REVIEW_FILTERS, status: 'open' })}>Clear</Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ReviewsTable
            reviews={rows}
            isLoading={company.isLoading}
            onOpen={onOpenReview}
            emptyMessage={company.all.length === 0 ? 'No reviews yet. Create a cycle or select a crew member to start one.' : 'No reviews match these filters.'}
            rowAction={(r) => (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onSelectCrew(r.profile_id)}>
                History
              </Button>
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default ReviewsOverview;

/**
 * The legacy vessel overview of hours of rest: one row per crew member, the
 * rest hours of each day of the month and a compliance word.
 *
 * Since X1-08 it is the board's documented fallback (D-01): while
 * work_rest_vessel_board is missing, HoursOfRestBoardPage shows this body
 * (WorkRestOverviewBody) under an info strip. Membership is anyone assigned
 * to the vessel on any day of the month, ended and transferred-out people
 * included (T-144; listVesselMonthMatrix). Reads through React Query with
 * the vessel and month in the key; an error says so with Try again. The
 * old export buttons that did nothing are gone.
 *
 * The default export is the page the legacy /crew/work-rest/overview route
 * still renders (src/routes/index.tsx), on the selected vessel.
 */
import React, { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, Users, UserRound, XCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import PageHeader from '@/shared/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { KpiTile } from '@/shared/components/data/KpiTile';
import { PageEmpty, PageError, PageLoading } from '@/shared/components/states';
import { StatusPill } from '@/shared/components/status';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { useScopedPath, useVesselScope } from '@/app/router/scopes';
import { cn } from '@/lib/utils';
import { listVesselMonthMatrix, type VesselMonthCrewRow } from '../services/workRestService';
import { workRestKeys } from '../hooks/workRestKeys';
import { MonthNav } from '../components/hor-board/MonthNav';
import { monthLabel, monthParam, parseMonthParam, type YearMonth } from '../lib/horBoard';

const DEPT_ORDER = ['DECK', 'BRIDGE', 'ENGINEERING', 'INTERIOR', 'OTHER'];

/** The legacy matrix of a vessel's month (its keys sit under the vessel's, so the board's writes refresh it). */
const overviewKey = (vesselId: string, year: number, month: number) => [...workRestKeys.vessel(vesselId), 'overview', year, month] as const;

const STATUS_WORD: Readonly<Record<VesselMonthCrewRow['status'], string>> = {
  compliant: 'compliant',
  review: 'warning',
  non_compliant: 'non_compliant',
  no_data: 'no_data',
};

export interface WorkRestOverviewBodyProps {
  vesselId: string;
  year: number;
  month: number;
}

/** The overview's figures and matrix for one vessel and month. */
export const WorkRestOverviewBody: React.FC<WorkRestOverviewBodyProps> = ({ vesselId, year, month }) => {
  const inVesselScope = useVesselScope() !== null;
  const scoped = useScopedPath();
  const query = useQuery({
    queryKey: overviewKey(vesselId, year, month),
    queryFn: () => listVesselMonthMatrix({ vesselId, year, month }),
    staleTime: 30_000,
  });
  const rows = useMemo(() => query.data ?? [], [query.data]);
  const param = monthParam({ year, month });
  // A crew member's month, in this vessel's scope (gap/00 B4); the profile page resolves the login id.
  const crewMonthPath = (crewId: string) =>
    inVesselScope ? `${scoped(`crew/people/${crewId}/hours-of-rest`)}?month=${param}` : `/crew/work-rest/${crewId}?month=${param}`;

  const lastDay = new Date(year, month, 0).getDate();
  const days = useMemo(() => Array.from({ length: lastDay }, (_, i) => i + 1), [lastDay]);

  const grouped = useMemo(() => {
    const map = new Map<string, VesselMonthCrewRow[]>();
    for (const r of rows) {
      const k = r.department || 'OTHER';
      map.set(k, [...(map.get(k) ?? []), r]);
    }
    const ordered: [string, VesselMonthCrewRow[]][] = [];
    for (const d of DEPT_ORDER) {
      const list = map.get(d);
      if (list) ordered.push([d, list]);
    }
    for (const [k, v] of map) if (!DEPT_ORDER.includes(k)) ordered.push([k, v]);
    return ordered;
  }, [rows]);

  const stats = useMemo(() => {
    const total = rows.length;
    return {
      total,
      compliant: rows.filter((r) => r.status === 'compliant').length,
      review: rows.filter((r) => r.status === 'review' || r.status === 'no_data').length,
      nonCompliant: rows.filter((r) => r.status === 'non_compliant').length,
    };
  }, [rows]);

  if (query.isLoading) return <PageLoading variant="list" rows={6} label="Loading the month" />;
  if (query.error) return <PageError error={query.error} title="The month could not load" onRetry={() => void query.refetch()} headingLevel={2} />;
  if (!rows.length) {
    return <PageEmpty icon={Users} title="Nobody on board this month" body={`No one was assigned to this vessel in ${monthLabel({ year, month })}.`} headingLevel={2} bordered />;
  }

  return (
    <div className="min-w-0 space-y-4" data-hor-overview="">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile label="Crew" icon={Users} value={stats.total} />
        {/* A good count: none compliant is not a clean bill, so zero reads neutral. */}
        <KpiTile
          label="Compliant"
          icon={CheckCircle2}
          value={stats.compliant}
          tone={stats.compliant > 0 ? 'ok' : undefined}
          sub={stats.compliant > 0 && stats.total ? `${Math.round((stats.compliant / stats.total) * 100)}% of crew` : undefined}
          zeroTone="neutral"
          zeroLabel="No one compliant yet"
        />
        <KpiTile label="Needs review" icon={AlertTriangle} value={stats.review} tone="warn" />
        <KpiTile label="Non-compliant" icon={XCircle} value={stats.nonCompliant} tone="danger" />
      </div>
      <p className="type-caption text-muted-foreground">Open a crew member to see their month.</p>
      {/* `relative`: the scroller is the containing block of the breach cells' sr-only spans, so they scroll inside it, not the page. */}
      <div className="relative overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full border-collapse type-caption">
          <caption className="sr-only">Rest hours by day, {monthLabel({ year, month })}</caption>
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th scope="col" className="sticky left-0 z-10 min-w-[180px] bg-muted/40 px-3 py-2 text-left">
                Crew member
              </th>
              <th scope="col" className="min-w-[110px] px-2 py-2 text-left">
                Compliance
              </th>
              {days.map((d) => (
                <th key={d} scope="col" className="min-w-[28px] px-1 py-2 text-center font-medium text-muted-foreground">
                  {d}
                </th>
              ))}
              <th scope="col" className="min-w-[64px] px-2 py-2 text-right">
                Avg rest
              </th>
              <th scope="col" className="min-w-[60px] px-2 py-2 text-right">
                Logged
              </th>
            </tr>
          </thead>
          <tbody>
            {grouped.map(([dept, deptRows]) => (
              <React.Fragment key={dept}>
                <tr className="border-b border-border bg-muted/20">
                  <th scope="rowgroup" colSpan={days.length + 4} className="px-3 py-1.5 text-left type-eyebrow text-muted-foreground">
                    {dept}
                  </th>
                </tr>
                {deptRows.map((r) => (
                  <tr key={r.crew_id} className="border-b border-border transition-colors hover:bg-muted/30">
                    <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-normal">
                      <Link to={crewMonthPath(r.crew_id)} className="focus-ring block rounded-sm">
                        <span className="block font-medium text-foreground hover:text-primary">{r.crew_name}</span>
                        <span className="block text-muted-foreground">{r.rank}</span>
                      </Link>
                    </th>
                    <td className="px-2 py-2">
                      <StatusPill domain="work_rest_compliance" status={STATUS_WORD[r.status]} label={r.status === 'review' ? 'Review' : undefined} />
                    </td>
                    {days.map((d) => (
                      <td key={d} className="p-0.5 text-center">
                        <DayCell hours={r.rest_by_day[d]} compliant={r.compliant_by_day[d]} />
                      </td>
                    ))}
                    <td className="px-2 py-2 text-right font-medium tabular-nums">{r.avg_rest != null ? `${r.avg_rest.toFixed(1)} h` : '–'}</td>
                    <td
                      className={cn(
                        'px-2 py-2 text-right font-medium tabular-nums',
                        r.logged_pct >= 80 ? 'text-success' : r.logged_pct >= 40 ? 'text-warning' : 'text-muted-foreground',
                      )}
                    >
                      {r.logged_pct}%
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const DayCell: React.FC<{ hours: number | null | undefined; compliant: boolean | null | undefined }> = ({ hours, compliant }) => {
  if (hours == null) return <span className="block text-muted-foreground/60">–</span>;
  const formatted = hours % 1 === 0 ? hours.toFixed(0) : hours.toFixed(1);
  if (compliant === false) {
    return (
      <span className="inline-flex h-6 min-w-[26px] items-center justify-center rounded-sm bg-critical font-semibold tabular-nums text-critical-foreground" title="Breach">
        {formatted}
        <span className="sr-only"> h, breach</span>
      </span>
    );
  }
  return <span className="inline-flex h-6 min-w-[26px] items-center justify-center tabular-nums text-foreground">{formatted}</span>;
};

/** The legacy page (/crew/work-rest/overview): the selected vessel's month. */
const WorkRestOverview: React.FC = () => {
  const { selectedVessel } = useVessel();
  const [searchParams, setSearchParams] = useSearchParams();
  const now = new Date();
  const current: YearMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };
  const place = parseMonthParam(searchParams.get('month'), searchParams.get('year')) ?? current;
  const setPlace = (next: YearMonth) => {
    const params = new URLSearchParams(searchParams);
    params.delete('year');
    params.set('month', monthParam(next));
    setSearchParams(params);
  };

  return (
    <DashboardLayout>
      <div className="min-w-0 space-y-4">
        <PageHeader
          eyebrow={selectedVessel?.name ?? 'No vessel selected'}
          title="Hours of rest"
          description="Rest hours by day for everyone on board in the month."
          actions={
            <Button asChild variant="outline" size="sm">
              <Link to="/me/hours-of-rest">
                <UserRound aria-hidden="true" /> My hours
              </Link>
            </Button>
          }
        />
        <MonthNav value={place} current={current} onChange={setPlace} />
        {selectedVessel?.id ? (
          <WorkRestOverviewBody vesselId={selectedVessel.id} year={place.year} month={place.month} />
        ) : (
          <PageEmpty title="Choose a vessel" body="Hours of rest belong to a vessel. Pick one in the vessel switcher." headingLevel={2} />
        )}
      </div>
    </DashboardLayout>
  );
};

export default WorkRestOverview;

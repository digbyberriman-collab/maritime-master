import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import PageHeader from '@/shared/components/layout/PageHeader';
import { PageEmpty } from '@/shared/components/states';
import { useMinWidth } from '@/shared/components/data';
import { useCapability } from '@/lib/permissions/useCan';
import { useVessel, type Vessel } from '@/modules/vessels/contexts/VesselContext';
import { vesselPath } from '@/modules/vessels/lib/vesselCode';
import { CREW_CAPS } from '@/modules/crew/paths';
import { Segmented } from '@/modules/crew/components/compliance/Segmented';
import { daysBetween, daysInclusive, localToday } from '../../lib/duration';
import { leaveTypeByKey, type LeaveType } from '../../lib/leaveTypes';
import { usePlannerPeriods } from '../../hooks/usePlannerPeriods';
import { useLeaveTypes } from '../../hooks/useLeaveTypes';
import { LeaveLegend, LegendToggle } from './LeaveLegend';
import { PeriodBar } from './TimelineTab';
import {
  ZOOM_PX,
  buildPlannerRows,
  dayColumns,
  monthLabel,
  monthSegments,
  readStoredZoom,
  shiftAnchor,
  storeZoom,
  timelineWindow,
  type PlannerZoom,
} from './plannerModel';

const COARSE = '[@media(pointer:coarse)]:h-11';
const ROW_H = 36;

/** The tabs of /fleet/planner (DECISIONS R2): Crew (gap/04) and Season (gap/07, X4; hidden until it is built). */
export const FLEET_PLANNER_TABS = ['crew'] as const;

const browserStorage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

/**
 * The fleet planner (/fleet/planner?tab=crew; DECISIONS R2; gap/04 C47,
 * X1-09B): the reachable vessels' planners stacked, one lane per vessel
 * with its crew's periods, on one shared timeline (Month or Year zoom,
 * remembered). Each lane is one planner_vessel_periods read (gate
 * crew_scheduling.view on that vessel), fetched side by side, never one
 * per person. Bars are read only here; a lane links to its vessel's
 * planner to change them. The Season tab (gap/07) is X4's and stays hidden.
 *
 * Per lane: the gate loading shows a skeleton, a denied vessel says so,
 * the planner not applied (D-01) points to the vessel's planner (its legacy
 * fallback), an error offers Retry.
 */
export const FleetPlanner: React.FC = () => {
  const [search, setSearch] = useSearchParams();
  const { vessels, getVesselCodeById, loading } = useVessel();
  const today = localToday();
  const [zoom, setZoomState] = React.useState<PlannerZoom>(() => readStoredZoom(browserStorage()));
  const [anchor, setAnchor] = React.useState(today);
  const wide = useMinWidth(640);
  const [legendChoice, setLegendChoice] = React.useState<boolean | null>(null);
  const showLegend = legendChoice ?? wide;
  const labelWidth = wide ? 220 : 136;
  const view = timelineWindow(anchor, zoom);
  const px = ZOOM_PX[zoom];
  const width = daysInclusive(view.from, view.to) * px;
  const columns = dayColumns(view.from, view.to, today);
  const months = monthSegments(view.from, view.to);
  const todayOffset = daysBetween(view.from, today);
  const companyId = vessels[0]?.company_id ?? null;
  const leaveTypes = useLeaveTypes(companyId);
  const types: readonly LeaveType[] = leaveTypes.status === 'ready' || leaveTypes.status === 'not_set_up' ? leaveTypes.types : [];
  const scroller = React.useRef<HTMLDivElement>(null);

  // Only the Crew tab exists in wave 1: an unknown or Season tab lands on Crew (the URL is kept honest).
  const tab = search.get('tab');
  React.useEffect(() => {
    if (tab !== 'crew') {
      setSearch(
        (current) => {
          const next = new URLSearchParams(current);
          next.set('tab', 'crew');
          return next;
        },
        { replace: true },
      );
    }
  }, [tab, setSearch]);

  React.useEffect(() => {
    const el = scroller.current;
    if (el && todayOffset >= 0) el.scrollLeft = Math.max(0, todayOffset * px - 3 * px);
  }, [todayOffset, px, vessels.length]);

  const setZoom = (z: PlannerZoom) => {
    setZoomState(z);
    storeZoom(browserStorage(), z);
  };

  const shown = vessels.filter((v) => v.lifecycle_status !== 'archived');

  return (
    <div className="min-w-0 space-y-4" data-fleet-planner="crew">
      <PageHeader eyebrow="Fleet" title="Planner" description="Every vessel's crew rotation and leave on one timeline. Open a vessel to change its plan." />
      <nav aria-label="Planner sections" className="min-w-0">
        <ul className="flex h-11 items-stretch gap-1 shadow-[inset_0_-1px_0_0_hsl(var(--border))]">
          <li className="flex">
            <Link
              to="?tab=crew"
              aria-current="page"
              className="relative inline-flex h-full items-center px-3 type-body font-medium text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              Crew
            </Link>
          </li>
        </ul>
      </nav>

      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Fleet planner">
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="icon" className="size-9 [@media(pointer:coarse)]:size-11" aria-label="Back" onClick={() => setAnchor(shiftAnchor(anchor, zoom, -1))}>
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button type="button" variant="outline" size="sm" className={`h-9 ${COARSE}`} onClick={() => setAnchor(today)}>
            <CalendarDays aria-hidden="true" />
            Today
          </Button>
          <Button type="button" variant="outline" size="icon" className="size-9 [@media(pointer:coarse)]:size-11" aria-label="Forward" onClick={() => setAnchor(shiftAnchor(anchor, zoom, 1))}>
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
        <span className="type-body-sm text-muted-foreground" aria-live="polite">
          {monthLabel(view.from)} – {monthLabel(view.to)}
        </span>
        <Segmented
          label="Zoom"
          value={zoom}
          onChange={setZoom}
          options={[
            { value: 'month', label: 'Month' },
            { value: 'year', label: 'Year' },
          ]}
        />
        {types.length > 0 ? <LegendToggle open={showLegend} onToggle={() => setLegendChoice(!showLegend)} /> : null}
      </div>
      {types.length > 0 && showLegend ? <LeaveLegend types={types} /> : null}

      {loading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading the vessels">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <PageEmpty title="No vessels to plan" body="The fleet planner shows the vessels you can reach. Ask your fleet manager for access to a vessel." />
      ) : (
        <div ref={scroller} className="relative max-h-[75vh] overflow-auto overscroll-x-contain rounded-lg border border-border bg-card" data-planner-scroll="">
          <div className="relative" style={{ width: labelWidth + width }}>
            <div className="sticky top-0 z-20 flex border-b border-border bg-card">
              <div className="sticky left-0 z-30 flex shrink-0 items-end border-r border-border bg-card px-3 pb-1 type-caption font-medium text-muted-foreground" style={{ width: labelWidth }}>
                Vessel and crew
              </div>
              <div className="relative h-6 shrink-0" style={{ width }}>
                {months.map((m) => (
                  <div key={m.start} className="absolute inset-y-0 overflow-clip whitespace-nowrap border-l border-border type-caption font-medium leading-6 text-foreground" style={{ left: m.offset * px, width: m.days * px }}>
                    <span className="sticky inline-block px-1.5" style={{ left: labelWidth }}>
                      {m.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div aria-hidden="true" className="pointer-events-none absolute bottom-0 top-0 z-0" style={{ left: labelWidth, width }}>
              {zoom === 'month' ? columns.map((c, i) => (c.weekend ? <div key={c.date} className="absolute inset-y-0 bg-weekend/50" style={{ left: i * px, width: px }} /> : null)) : null}
              {todayOffset >= 0 && todayOffset < columns.length ? <div className="absolute inset-y-0 w-0.5 bg-today" style={{ left: todayOffset * px + px / 2 - 1 }} /> : null}
            </div>
            {shown.map((v) => (
              <VesselLane
                key={v.id}
                vessel={v}
                code={getVesselCodeById(v.id)}
                from={view.from}
                to={view.to}
                px={px}
                width={width}
                labelWidth={labelWidth}
                types={types}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const noop = () => undefined;

const VesselLane: React.FC<{
  vessel: Vessel;
  code: string | null;
  from: string;
  to: string;
  px: number;
  width: number;
  labelWidth: number;
  types: readonly LeaveType[];
}> = ({ vessel, code, from, to, px, width, labelWidth, types }) => {
  const gate = useCapability(CREW_CAPS.schedulingView, { vesselId: vessel.id });
  const periods = usePlannerPeriods({ id: vessel.id, companyId: vessel.company_id }, from, to, { enabled: gate.allowed });
  const suppress = React.useRef(false);
  const link = code ? vesselPath(code, 'crew/planner/timeline') : null;
  const header = (
    <div className="relative z-10 flex border-b border-border bg-muted/60" style={{ height: 36 }} data-fleet-lane={vessel.id}>
      <div className="sticky left-0 z-10 flex shrink-0 items-center gap-2 bg-muted px-3" style={{ width: labelWidth }}>
        <span className="truncate type-body-sm font-semibold text-foreground">{vessel.name}</span>
        {link && gate.allowed ? (
          <Link to={link} className="focus-ring ml-auto inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:size-11" aria-label={`Open the planner of ${vessel.name}`}>
            <ExternalLink aria-hidden="true" className="size-4" />
          </Link>
        ) : null}
      </div>
      <div className="relative shrink-0" style={{ width }}>
        <LaneNote>{laneNote(gate.status, gate.allowed, periods.status, vessel.name)}</LaneNote>
        {periods.status === 'error' ? (
          <button type="button" className="absolute left-2 top-2 type-caption font-medium text-primary underline-offset-4 hover:underline" onClick={periods.retry}>
            Could not load. Try again
          </button>
        ) : null}
      </div>
    </div>
  );
  if (gate.status === 'loading' || (gate.allowed && (periods.status === 'loading' || periods.status === 'idle'))) {
    return (
      <div>
        {header}
        <div className="flex border-b border-border" style={{ height: ROW_H }}>
          <div className="sticky left-0 z-10 shrink-0 bg-card px-3 py-2" style={{ width: labelWidth }}>
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </div>
    );
  }
  if (!gate.allowed || periods.status !== 'ready') return header;
  const groups = buildPlannerRows([], periods.periods, null);
  const rows = groups.flatMap((g) => g.rows);
  return (
    <div>
      {header}
      {rows.length === 0 ? (
        <div className="flex border-b border-border" style={{ height: ROW_H }}>
          <div className="sticky left-0 z-10 flex shrink-0 items-center bg-card px-3 type-caption text-muted-foreground" style={{ width: labelWidth + Math.min(width, 360) }}>
            No periods in these months.
          </div>
        </div>
      ) : (
        rows.map((row) => (
          <div key={row.profileId} className="relative z-10 flex border-b border-border" style={{ height: ROW_H }}>
            <div className="sticky left-0 z-10 flex shrink-0 items-center border-r border-border bg-card px-3" style={{ width: labelWidth }}>
              <span className="truncate type-body-sm text-foreground">{row.name}</span>
            </div>
            <div className={cn('relative shrink-0')} style={{ width }}>
              {row.periods.map((p) => (
                <PeriodBar
                  key={p.id}
                  period={p}
                  type={leaveTypeByKey(p.leaveTypeKey, types)}
                  personName={row.name}
                  from={from}
                  to={to}
                  px={px}
                  draggable={false}
                  drag={null}
                  onPointerDown={noop}
                  onOpen={noop}
                  suppressClick={suppress}
                  stickyLeft={labelWidth}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
};

const LaneNote: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  children ? <span className="absolute left-2 top-2.5 truncate type-caption text-muted-foreground">{children}</span> : null;

/** What a lane says instead of bars (null: it shows them). */
function laneNote(gateStatus: string, allowed: boolean, periodsStatus: string, name: string): string | null {
  if (gateStatus === 'loading') return null;
  if (!allowed) return `You don't see the planner of ${name}.`;
  if (periodsStatus === 'not_set_up') return "The new planner isn't set up yet: open the vessel's planner.";
  return null;
}

export default FleetPlanner;

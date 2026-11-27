import React, { Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Info, Plus, Redo2, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PageError, PageLoading } from '@/shared/components/states';
import { useMinWidth } from '@/shared/components/data';
import { notify } from '@/shared/lib/notify';
import { supabase } from '@/integrations/supabase/client';
import { Segmented } from '@/modules/crew/components/compliance/Segmented';
import { daysBetween, daysInclusive, periodBarLabel } from '../../lib/duration';
import { LEAVE_TONE_CLASSES, leaveTypeByKey, type LeaveType } from '../../lib/leaveTypes';
import { PLANNER_NOT_SET_UP_NOTICE, PlannerRefusalError, type PlannerPeriod } from '../../lib/periods';
import { plannerKeys } from '../../hooks/plannerKeys';
import { usePlannerHistory } from '../../hooks/usePlannerHistory';
import { usePlannerPeriodMutations, usePlannerPeriods, type PeriodUpsertInput } from '../../hooks/usePlannerPeriods';
import { useManningByDay } from '../../hooks/useManningByDay';
import { LeaveLegend, LegendToggle } from './LeaveLegend';
import { LegacyRotationPlanner } from './legacyBodies';
import { PeriodDialog } from './PeriodDialog';
import type { PeriodEditValues } from './plannerSchemas';
import {
  OTHER_GROUP,
  ZOOM_PX,
  barSpan,
  buildPlannerRows,
  dayColumns,
  dayLabel,
  departmentOptions,
  draggedRange,
  manningGapRows,
  monthLabel,
  monthSegments,
  periodLockReason,
  readStoredZoom,
  shiftAnchor,
  shownEnd,
  storeZoom,
  timelineWindow,
  type DragMode,
  type PlannerRow,
  type PlannerZoom,
} from './plannerModel';
import type { PlannerAccess, PlannerCrewState, PlannerVessel } from './usePlannerContext';

const AddLeaveDialog = React.lazy(() => import('./AddLeaveDialog'));

const COARSE = '[@media(pointer:coarse)]:h-11';
const ROW_H = 40;
const ALL_DEPARTMENTS = '__all';

const browserStorage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------- vessel movements (frp_vessel_locations, until voyages land)

interface VesselMovement {
  id: string;
  start: string;
  end: string;
  name: string;
  status: 'confirmed' | 'estimated' | 'tbc';
}

function useVesselMovements(vessel: PlannerVessel, from: string, to: string) {
  return useQuery({
    queryKey: [...plannerKeys.vessel(vessel.companyId, vessel.id), 'movements', from, to] as const,
    queryFn: async (): Promise<VesselMovement[]> => {
      const { data, error } = await supabase
        .from('frp_vessel_locations')
        .select('id, start_date, end_date, location_name, location_status')
        .eq('vessel_id', vessel.id)
        .lte('start_date', to)
        .gte('end_date', from)
        .order('start_date');
      if (error) throw error;
      return (data ?? []).map((r) => ({ id: r.id, start: r.start_date, end: r.end_date, name: r.location_name, status: r.location_status }));
    },
    retry: 1,
    staleTime: 5 * 60_000,
  });
}

const MOVEMENT_TONE: Readonly<Record<VesselMovement['status'], string>> = {
  confirmed: 'border-info bg-info-muted text-foreground',
  estimated: 'border-dashed border-info bg-info-muted/60 text-foreground',
  tbc: 'border-dashed border-border bg-muted text-muted-foreground',
};

// ---------------------------------------------------------------- bars

export interface DragState {
  periodId: string;
  mode: DragMode;
  startX: number;
  delta: number;
  moved: boolean;
}

const barStatusText = (p: PlannerPeriod): string | null =>
  p.status === 'pending_approval' ? 'awaiting approval' : p.status === 'draft' ? 'draft' : null;

export interface PeriodBarProps {
  period: PlannerPeriod;
  type: LeaveType | null;
  personName: string;
  from: string;
  to: string;
  px: number;
  draggable: boolean;
  drag: DragState | null;
  onPointerDown: (event: React.PointerEvent, period: PlannerPeriod, mode: DragMode) => void;
  onOpen: (period: PlannerPeriod) => void;
  suppressClick: React.MutableRefObject<boolean>;
  /** The width of the sticky name column: the label stays in view while the bar's start is scrolled under it. */
  stickyLeft?: number;
}

export const PeriodBar: React.FC<PeriodBarProps> = ({ period, type, personName, from, to, px, draggable, drag, onPointerDown, onOpen, suppressClick, stickyLeft = 0 }) => {
  const end = shownEnd(period, to);
  const ghost = drag && drag.periodId === period.id && drag.moved ? draggedRange({ start: period.start, end: period.endUnknown ? null : period.end }, drag.mode, drag.delta) : null;
  const start = ghost?.start ?? period.start;
  const shown = ghost ? (ghost.end ?? end) : end;
  const span = barSpan(start, shown, from, to);
  if (!span) return null;
  const tone = type ? LEAVE_TONE_CLASSES[type.toneKey].bar : 'border-border bg-muted text-muted-foreground';
  const label = periodBarLabel(type?.label ?? 'No leave type', { start: period.start, end: period.endUnknown ? null : period.end, endUnknown: period.endUnknown });
  const status = barStatusText(period);
  const width = span.length * px;
  const name = `${personName}: ${label}, ${dayLabel(period.start)}${period.endUnknown ? ', end unknown' : ` to ${dayLabel(period.end)}`}${status ? `, ${status}` : ''}`;
  return (
    <button
      type="button"
      data-period-bar={period.id}
      data-leave-type={period.leaveTypeKey ?? ''}
      aria-label={name}
      title={name}
      className={cn(
        'focus-ring absolute top-1.5 flex h-7 items-center overflow-clip rounded-sm border text-left text-xs font-medium',
        tone,
        period.status !== 'confirmed' && period.status !== 'complete' && 'border-dashed opacity-80',
        span.cutStart ? 'rounded-l-none border-l-0' : '',
        span.cutEnd || period.endUnknown ? 'rounded-r-none' : '',
        ghost && 'ring-2 ring-primary',
        draggable && 'cursor-grab active:cursor-grabbing',
      )}
      style={{ left: span.offset * px, width: Math.max(width, 4), touchAction: draggable ? 'none' : undefined }}
      onPointerDown={(e) => draggable && onPointerDown(e, period, 'move')}
      onClick={(e) => {
        e.stopPropagation();
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        onOpen(period);
      }}
    >
      {draggable && !span.cutStart ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize [@media(pointer:coarse)]:hidden"
          onPointerDown={(e) => {
            e.stopPropagation();
            onPointerDown(e, period, 'start');
          }}
        />
      ) : null}
      {width > 56 ? (
        <span className="sticky truncate px-2" style={{ left: stickyLeft }}>
          {label}
          {status ? ` (${status})` : ''}
        </span>
      ) : null}
      {period.endUnknown ? <ChevronRight aria-hidden="true" className="ml-auto mr-0.5 size-3 shrink-0 opacity-70" /> : null}
      {draggable && !span.cutEnd && !period.endUnknown ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize [@media(pointer:coarse)]:hidden"
          onPointerDown={(e) => {
            e.stopPropagation();
            onPointerDown(e, period, 'end');
          }}
        />
      ) : null}
    </button>
  );
};

// ---------------------------------------------------------------- the tab

export interface TimelineTabProps {
  vessel: PlannerVessel;
  access: PlannerAccess;
  crew: PlannerCrewState;
  types: readonly LeaveType[];
  today: string;
  viewerProfileId: string | null;
}

type DialogState =
  | { kind: 'edit'; period: PlannerPeriod; person: { profileId: string; name: string } }
  | { kind: 'new'; person: { profileId: string; name: string }; start: string; end: string }
  | null;

/**
 * The planner timeline (gap/04 C47, W7; X1-09B): one row per crew member
 * in department groups (the vessel's rank order), each period a bar
 * labelled with its type and length ("Rotation leave · 5w 6d"), coloured by
 * its leave type. Above the crew: the vessel movements lane (collapsible)
 * and the manning gaps (each position short of its minimum, as "Captain
 * needs 1 on board, short by 1"). Month and Year zoom (remembered in this
 * browser), Back / Today / Forward, a department filter, the legend.
 *
 * With crew_scheduling.edit: drag a bar to move it, its edges to change its
 * dates, click a bar to change or remove it, click an empty day to add a
 * period; every write goes through planner_period_upsert / _delete, with
 * Undo and Redo. Add leave (several periods, approved or requested) opens
 * from the toolbar.
 *
 * D-01: while planner_vessel_periods is missing the legacy lane planner
 * shows, locked to the vessel, under a notice. Any other error: PageError
 * with Retry.
 */
export const TimelineTab: React.FC<TimelineTabProps> = ({ vessel, access, crew, types, today, viewerProfileId }) => {
  const [search, setSearch] = useSearchParams();
  const [zoom, setZoomState] = React.useState<PlannerZoom>(() => readStoredZoom(browserStorage()));
  const [anchor, setAnchor] = React.useState(today);
  const [legendChoice, setLegendChoice] = React.useState<boolean | null>(null);
  const [movementsOpen, setMovementsOpen] = React.useState(true);
  const [dialog, setDialog] = React.useState<DialogState>(null);
  const [addLeaveOpen, setAddLeaveOpen] = React.useState(false);
  const [drag, setDrag] = React.useState<DragState | null>(null);
  const suppressClick = React.useRef(false);
  const scroller = React.useRef<HTMLDivElement>(null);
  const versions = React.useRef(new Map<string, number>());
  const wide = useMinWidth(640);
  const labelWidth = wide ? 220 : 136;
  const showLegend = legendChoice ?? wide;

  const department = search.get('dept');
  const highlight = search.get('crew');
  const view = timelineWindow(anchor, zoom);
  const px = ZOOM_PX[zoom];
  const days = daysInclusive(view.from, view.to);
  const width = days * px;

  const periods = usePlannerPeriods(vessel, view.from, view.to);
  const manning = useManningByDay(vessel, view.from, view.to, { enabled: periods.status === 'ready' || periods.status === 'loading' });
  const movements = useVesselMovements(vessel, view.from, view.to);
  const mutations = usePlannerPeriodMutations(vessel);
  const history = usePlannerHistory();

  const setZoom = (z: PlannerZoom) => {
    setZoomState(z);
    storeZoom(browserStorage(), z);
  };
  const setDepartment = (key: string | null) =>
    setSearch(
      (current) => {
        const next = new URLSearchParams(current);
        if (key) next.set('dept', key);
        else next.delete('dept');
        return next;
      },
      { replace: true },
    );

  // Keep today in view when the window or zoom changes (scroll inside the card, never the page).
  React.useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const offset = daysBetween(view.from, today);
    if (offset >= 0 && offset < days) el.scrollLeft = Math.max(0, offset * px - 3 * px);
  }, [view.from, today, days, px, periods.status]);

  // ?crew=<profileId> (the profile's Rotation schedule link): bring the person's row into view.
  React.useEffect(() => {
    if (!highlight || periods.status !== 'ready') return;
    const rows = scroller.current?.querySelectorAll<HTMLElement>('[data-planner-row]') ?? [];
    const row = Array.from(rows).find((el) => el.dataset.plannerRow === highlight);
    row?.scrollIntoView?.({ block: 'center' });
  }, [highlight, periods.status]);

  if (periods.status === 'not_set_up') {
    return (
      <div className="space-y-3" data-planner-fallback="timeline">
        <Alert variant="info">
          <Info aria-hidden="true" className="size-4" />
          <AlertDescription>{PLANNER_NOT_SET_UP_NOTICE}</AlertDescription>
        </Alert>
        <Suspense fallback={<PageLoading variant="list" rows={6} label="Loading the planner" />}>
          <LegacyRotationPlanner lockedVesselId={vessel.id} />
        </Suspense>
      </div>
    );
  }
  if (periods.status === 'error') {
    return <PageError error={periods.error} onRetry={periods.retry} title="The planner could not load" treatMissingAsOff={false} headingLevel={2} />;
  }

  const members = crew.status === 'ready' ? crew.members : [];
  const list = periods.status === 'ready' ? periods.periods : [];
  for (const p of list) if (!versions.current.has(p.id) || (versions.current.get(p.id) ?? 0) < p.version) versions.current.set(p.id, p.version);
  const groups = buildPlannerRows(members, list, department);
  const departments = departmentOptions(members);
  const gapRows = manning.status === 'ready' ? manningGapRows(manning.gaps, department) : [];
  const columns = dayColumns(view.from, view.to, today);
  const months = monthSegments(view.from, view.to);
  const todayOffset = daysBetween(view.from, today);
  const canAddLeave = access.canEdit || access.canApproveLeave;

  // ---------- writes (each one an undoable command)

  const upsertInput = (period: PlannerPeriod, next: { start: string; end: string | null }, profileId: string): PeriodUpsertInput => ({
    id: period.id,
    profileId,
    leaveTypeKey: period.leaveTypeKey as string,
    start: next.start,
    end: next.end,
    endUnknown: period.endUnknown,
    notes: period.notes,
    expectedVersion: versions.current.get(period.id) ?? period.version,
  });
  const saveRow = async (input: PeriodUpsertInput) => {
    const row = await mutations.upsert.mutateAsync(input);
    versions.current.set(row.id, row.version);
    return row;
  };

  const runChange = async (period: PlannerPeriod, profileId: string, next: { start: string; end: string | null }, label: string) => {
    const before = { start: period.start, end: period.endUnknown ? null : period.end };
    await history.run({
      label,
      apply: async () => void (await saveRow(upsertInput(period, next, profileId))),
      revert: async () => void (await saveRow(upsertInput(period, before, profileId))),
    });
  };

  const runCreate = async (profileId: string, values: PeriodEditValues, label: string) => {
    const box: { id: string | null } = { id: null };
    const input = (): PeriodUpsertInput => ({
      id: null,
      profileId,
      leaveTypeKey: values.leaveTypeKey,
      start: values.start,
      end: values.endUnknown ? null : values.end,
      endUnknown: values.endUnknown,
      notes: values.notes || null,
      replace: values.replace,
    });
    await history.run({
      label,
      apply: async () => {
        const row = await saveRow(input());
        box.id = row.id;
      },
      revert: async () => {
        if (box.id) await mutations.remove.mutateAsync(box.id);
        box.id = null;
      },
    });
  };

  const runEdit = async (period: PlannerPeriod, profileId: string, values: PeriodEditValues) => {
    const before: PeriodUpsertInput = {
      id: period.id,
      profileId,
      leaveTypeKey: period.leaveTypeKey as string,
      start: period.start,
      end: period.endUnknown ? null : period.end,
      endUnknown: period.endUnknown,
      notes: period.notes,
    };
    const after: PeriodUpsertInput = {
      id: period.id,
      profileId,
      leaveTypeKey: values.leaveTypeKey,
      start: values.start,
      end: values.endUnknown ? null : values.end,
      endUnknown: values.endUnknown,
      notes: values.notes || null,
      replace: values.replace,
    };
    await history.run({
      label: 'Change a period',
      apply: async () => void (await saveRow({ ...after, expectedVersion: versions.current.get(period.id) ?? period.version })),
      revert: async () => void (await saveRow({ ...before, expectedVersion: versions.current.get(period.id) ?? period.version })),
    });
  };

  const runDelete = async (period: PlannerPeriod, profileId: string) => {
    const box: { id: string | null } = { id: period.id };
    await history.run({
      label: 'Remove a period',
      apply: async () => {
        if (box.id) await mutations.remove.mutateAsync(box.id);
      },
      revert: async () => {
        const row = await saveRow({
          id: null,
          profileId,
          leaveTypeKey: period.leaveTypeKey as string,
          start: period.start,
          end: period.endUnknown ? null : period.end,
          endUnknown: period.endUnknown,
          notes: period.notes,
        });
        box.id = row.id;
      },
    });
  };

  const undoRedo = async (which: 'undo' | 'redo') => {
    try {
      const label = which === 'undo' ? await history.undo() : await history.redo();
      if (label) notify.info(which === 'undo' ? `Undone: ${label}` : `Redone: ${label}`);
    } catch (error) {
      notify.error(error, { title: which === 'undo' ? 'Could not undo' : 'Could not redo' });
    }
  };

  // ---------- dragging (pointer; the dialog is the keyboard path)

  const rowOf = (periodId: string): PlannerRow | null => {
    for (const g of groups) for (const r of g.rows) if (r.periods.some((p) => p.id === periodId)) return r;
    return null;
  };
  const isEditable = (p: PlannerPeriod): boolean => Boolean(p.profileId) && periodLockReason(p, types, access.canEdit, access.canApproveLeave) === null;

  const onPointerDown = (event: React.PointerEvent, period: PlannerPeriod, mode: DragMode) => {
    if (event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    setDrag({ periodId: period.id, mode, startX: event.clientX, delta: 0, moved: false });
  };
  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const moved = drag.moved || Math.abs(dx) > 4;
    const delta = Math.round(dx / px);
    if (moved !== drag.moved || delta !== drag.delta) setDrag({ ...drag, moved, delta });
  };
  const onPointerUp = () => {
    const d = drag;
    setDrag(null);
    if (!d || !d.moved) return;
    suppressClick.current = true;
    if (d.delta === 0) return;
    const period = list.find((p) => p.id === d.periodId);
    const row = rowOf(d.periodId);
    if (!period || !row) return;
    const next = draggedRange({ start: period.start, end: period.endUnknown ? null : period.end }, d.mode, d.delta);
    const type = leaveTypeByKey(period.leaveTypeKey, types);
    const verb = d.mode === 'move' ? 'Move' : 'Change';
    runChange(period, row.profileId, next, `${verb} ${type?.label ?? 'period'} for ${row.name}`).catch((error) =>
      notify.error(error, { title: error instanceof PlannerRefusalError ? 'The planner refused this change' : 'The period could not be saved' }),
    );
  };

  const onRowClick = (row: PlannerRow, event: React.MouseEvent<HTMLDivElement>) => {
    if (!access.canEdit || !row.onList) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const offset = Math.floor((event.clientX - rect.left) / px);
    const start = columns[Math.min(Math.max(offset, 0), columns.length - 1)]?.date;
    if (!start) return;
    setDialog({ kind: 'new', person: { profileId: row.profileId, name: row.name }, start, end: columns[Math.min(offset + 6, columns.length - 1)]?.date ?? start });
  };

  const rangeLabel = `${monthLabel(view.from)} – ${monthLabel(view.to)}`;
  const empty = periods.status === 'ready' && groups.length === 0;

  return (
    <div className="min-w-0 space-y-3" data-planner-tab="timeline" data-planner-zoom={zoom}>
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Timeline">
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
          {rangeLabel}
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
        <Select value={department ?? ALL_DEPARTMENTS} onValueChange={(v) => setDepartment(v === ALL_DEPARTMENTS ? null : v)}>
          <SelectTrigger className={`h-9 w-[11rem] ${COARSE}`} aria-label="Department">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_DEPARTMENTS}>All departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.key} value={d.key}>
                {d.label}
              </SelectItem>
            ))}
            <SelectItem value={OTHER_GROUP}>Not on the crew list today</SelectItem>
          </SelectContent>
        </Select>
        <LegendToggle open={showLegend} onToggle={() => setLegendChoice(!showLegend)} />
        <div className="ml-auto flex items-center gap-1">
          {access.canEdit ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 [@media(pointer:coarse)]:size-11"
                disabled={!history.canUndo || history.busy}
                aria-label={history.undoLabel ? `Undo: ${history.undoLabel}` : 'Nothing to undo'}
                title={history.undoLabel ? `Undo: ${history.undoLabel}` : 'Nothing to undo'}
                onClick={() => void undoRedo('undo')}
              >
                <Undo2 aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 [@media(pointer:coarse)]:size-11"
                disabled={!history.canRedo || history.busy}
                aria-label={history.redoLabel ? `Redo: ${history.redoLabel}` : 'Nothing to redo'}
                title={history.redoLabel ? `Redo: ${history.redoLabel}` : 'Nothing to redo'}
                onClick={() => void undoRedo('redo')}
              >
                <Redo2 aria-hidden="true" />
              </Button>
            </>
          ) : null}
          {canAddLeave ? (
            <Button type="button" size="sm" className={`h-9 ${COARSE}`} onClick={() => setAddLeaveOpen(true)}>
              <Plus aria-hidden="true" />
              Add leave
            </Button>
          ) : null}
        </div>
      </div>

      {showLegend ? <LeaveLegend types={types} /> : null}

      {crew.status === 'unavailable' && crew.reason === 'error' ? (
        <Alert variant="warning">
          <AlertTriangle aria-hidden="true" className="size-4" />
          <AlertDescription className="flex flex-wrap items-center gap-2">
            The crew list could not load, so only crew with periods are shown.
            {crew.retry ? (
              <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={crew.retry}>
                Try again
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {periods.status === 'loading' || periods.status === 'idle' ? (
        <div className="space-y-2 rounded-lg border border-border p-3" aria-busy="true" aria-label="Loading the timeline">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : (
        <div
          ref={scroller}
          className="relative max-h-[70vh] overflow-auto overscroll-x-contain rounded-lg border border-border bg-card"
          data-planner-scroll=""
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setDrag(null)}
        >
          <div className="relative" style={{ width: labelWidth + width }}>
            {/* Header: months, and the days at Month zoom. */}
            <div className="sticky top-0 z-20 flex border-b border-border bg-card">
              <div className="sticky left-0 z-30 flex shrink-0 items-end border-r border-border bg-card px-3 pb-1 type-caption font-medium text-muted-foreground" style={{ width: labelWidth }}>
                Crew
              </div>
              <div className="relative shrink-0" style={{ width }}>
                <div className="relative h-6">
                  {months.map((m) => (
                    <div key={m.start} className="absolute inset-y-0 overflow-clip whitespace-nowrap border-l border-border type-caption font-medium leading-6 text-foreground" style={{ left: m.offset * px, width: m.days * px }}>
                      <span className="sticky inline-block px-1.5" style={{ left: labelWidth }}>
                        {m.label}
                      </span>
                    </div>
                  ))}
                </div>
                {zoom === 'month' ? (
                  <div className="relative h-6" aria-hidden="true">
                    {columns.map((c, i) => (
                      <div
                        key={c.date}
                        className={cn(
                          'absolute inset-y-0 flex items-center justify-center text-[10px] tabular-nums',
                          c.weekend ? 'bg-weekend/50 text-muted-foreground' : 'text-muted-foreground',
                          c.today && 'font-semibold text-today',
                        )}
                        style={{ left: i * px, width: px }}
                      >
                        {c.dayOfMonth}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Weekend stripes and the today line behind the rows. */}
            <div aria-hidden="true" className="pointer-events-none absolute bottom-0 top-0 z-0" style={{ left: labelWidth, width }}>
              {zoom === 'month'
                ? columns.map((c, i) => (c.weekend ? <div key={c.date} className="absolute inset-y-0 bg-weekend/50" style={{ left: i * px, width: px }} /> : null))
                : null}
              {todayOffset >= 0 && todayOffset < days ? <div className="absolute inset-y-0 w-0.5 bg-today" style={{ left: todayOffset * px + px / 2 - 1 }} data-planner-today="" /> : null}
            </div>

            {/* Vessel movements. */}
            <div className="relative z-10 flex border-b border-border" style={{ minHeight: movementsOpen ? ROW_H : 32 }} data-planner-lane="movements">
              <div className="sticky left-0 z-10 flex shrink-0 items-center border-r border-border bg-card px-2" style={{ width: labelWidth }}>
                <button
                  type="button"
                  className="focus-ring inline-flex min-h-8 items-center gap-1 rounded-sm px-1 type-caption font-medium text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:min-h-11"
                  aria-expanded={movementsOpen}
                  onClick={() => setMovementsOpen((v) => !v)}
                >
                  {movementsOpen ? <ChevronUp aria-hidden="true" className="size-3.5" /> : <ChevronDown aria-hidden="true" className="size-3.5" />}
                  Vessel movements
                </button>
              </div>
              {movementsOpen ? (
                <div className="relative shrink-0" style={{ width }}>
                  {movements.isError ? (
                    <span className="absolute left-2 top-2 type-caption text-muted-foreground">Vessel movements could not load.</span>
                  ) : (movements.data ?? []).length === 0 && !movements.isLoading ? (
                    <span className="absolute left-2 top-2.5 type-caption text-muted-foreground">No vessel movements recorded for these months.</span>
                  ) : (
                    (movements.data ?? []).map((m) => {
                      const span = barSpan(m.start, m.end, view.from, view.to);
                      if (!span) return null;
                      return (
                        <div
                          key={m.id}
                          className={cn('absolute top-1.5 flex h-7 items-center overflow-clip rounded-sm border text-xs', MOVEMENT_TONE[m.status])}
                          style={{ left: span.offset * px, width: Math.max(span.length * px, 4) }}
                          title={`${m.name}: ${dayLabel(m.start)} to ${dayLabel(m.end)} (${m.status === 'tbc' ? 'to be confirmed' : m.status})`}
                        >
                          {span.length * px > 48 ? (
                            <span className="sticky truncate px-2" style={{ left: labelWidth }}>
                              {m.name}
                            </span>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              ) : null}
            </div>

            {/* Manning gaps: each position below its minimum of qualified crew aboard. */}
            {gapRows.length > 0 ? (
              <div data-planner-lane="manning-gaps">
                <GroupHeader label="Manning gaps" labelWidth={labelWidth} width={width} tone="critical" />
                {gapRows.map((g) => (
                  <div key={g.key} className="relative z-10 flex border-b border-border" style={{ height: ROW_H }} data-manning-gap-row={g.key}>
                    <div className="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 border-r border-border bg-card px-3" style={{ width: labelWidth }}>
                      <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0 text-critical" />
                      <span className="truncate type-body-sm text-foreground">{g.positionName}</span>
                    </div>
                    <div className="relative shrink-0" style={{ width }}>
                      {g.spans.map((s) => {
                        const span = barSpan(s.start, s.end, view.from, view.to);
                        if (!span) return null;
                        return (
                          <div
                            key={s.key}
                            role="note"
                            className="absolute top-1.5 flex h-7 items-center overflow-clip rounded-sm border border-critical bg-critical-muted text-xs font-medium text-foreground"
                            style={{ left: span.offset * px, width: Math.max(span.length * px, 4) }}
                            title={`${s.reason}, ${dayLabel(s.start)} to ${dayLabel(s.end)}`}
                            aria-label={`${s.reason}, ${dayLabel(s.start)} to ${dayLabel(s.end)}`}
                          >
                            {span.length * px > 120 ? (
                              <span className="sticky truncate px-2" style={{ left: labelWidth }}>
                                {s.reason}
                              </span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Crew, by department. */}
            {groups.map((g) => (
              <div key={g.key} data-planner-group={g.key}>
                <GroupHeader label={g.label} labelWidth={labelWidth} width={width} count={g.rows.length} />
                {g.rows.map((row) => (
                  <div
                    key={row.profileId}
                    className={cn('relative z-10 flex border-b border-border', highlight === row.profileId && 'bg-signal-muted/40')}
                    style={{ height: ROW_H }}
                    data-planner-row={row.profileId}
                  >
                    <div className="sticky left-0 z-10 flex shrink-0 flex-col justify-center border-r border-border bg-card px-3" style={{ width: labelWidth }}>
                      <span className="truncate type-body-sm font-medium text-foreground">{row.name}</span>
                      {row.positionLabel ? <span className="truncate type-caption text-muted-foreground">{row.positionLabel}</span> : null}
                    </div>
                    <div
                      className={cn('relative shrink-0', access.canEdit && row.onList && 'cursor-cell')}
                      style={{ width }}
                      onClick={(e) => onRowClick(row, e)}
                      data-planner-track=""
                    >
                      {row.periods.map((p) => (
                        <PeriodBar
                          key={p.id}
                          period={p}
                          type={leaveTypeByKey(p.leaveTypeKey, types)}
                          personName={row.name}
                          from={view.from}
                          to={view.to}
                          px={px}
                          draggable={isEditable(p)}
                          drag={drag}
                          onPointerDown={onPointerDown}
                          onOpen={(period) => setDialog({ kind: 'edit', period, person: { profileId: row.profileId, name: row.name } })}
                          suppressClick={suppressClick}
                          stickyLeft={labelWidth}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {empty ? (
              <div className="sticky left-0 p-6 text-center type-body text-muted-foreground" style={{ width: Math.min(labelWidth + width, 640) }}>
                {department ? 'Nobody in this department has periods in these months.' : 'No crew or periods for these months yet.'}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {manning.status === 'error' ? (
        <p className="type-caption text-muted-foreground" data-planner-manning="error">
          Manning gaps could not load.{' '}
          <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={manning.retry}>
            Try again
          </button>
        </p>
      ) : null}
      {access.canEdit ? (
        <p className="type-caption text-muted-foreground">Drag a bar to move it, drag its edge to change a date, or click an empty day to add a period.</p>
      ) : null}

      {dialog ? (
        <PeriodDialog
          key={dialog.kind === 'edit' ? dialog.period.id : `${dialog.person.profileId}:${dialog.start}`}
          open
          onOpenChange={(open) => !open && setDialog(null)}
          person={dialog.person}
          period={dialog.kind === 'edit' ? dialog.period : null}
          initial={dialog.kind === 'new' ? { start: dialog.start, end: dialog.end } : undefined}
          types={types}
          canEdit={access.canEdit}
          canApproveLeave={access.canApproveLeave}
          today={today}
          onSave={(values) =>
            dialog.kind === 'edit'
              ? runEdit(dialog.period, dialog.person.profileId, values)
              : runCreate(dialog.person.profileId, values, `Add ${leaveTypeByKey(values.leaveTypeKey, types)?.label ?? 'a period'} for ${dialog.person.name}`)
          }
          onDelete={dialog.kind === 'edit' ? () => runDelete(dialog.period, dialog.person.profileId) : undefined}
        />
      ) : null}

      {addLeaveOpen ? (
        <Suspense fallback={null}>
          <AddLeaveDialog
            open
            onOpenChange={setAddLeaveOpen}
            vessel={vessel}
            mode="add"
            people={members.map((m) => ({ profileId: m.profileId, name: m.name, positionLabel: m.positionLabel, hasLogin: Boolean(m.userId) }))}
            initialProfileId={highlight}
            viewerProfileId={viewerProfileId}
            canApproveLeave={access.canApproveLeave}
            types={types}
            today={today}
          />
        </Suspense>
      ) : null}
    </div>
  );
};

export const GroupHeader: React.FC<{ label: string; labelWidth: number; width: number; count?: number; tone?: 'critical' }> = ({ label, labelWidth, width, count, tone }) => (
  <div className="relative z-10 flex border-b border-border bg-muted/60" style={{ height: 28 }}>
    <div className="sticky left-0 z-10 flex shrink-0 items-center gap-2 bg-muted px-3" style={{ width: labelWidth }}>
      <span className={cn('truncate type-eyebrow', tone === 'critical' ? 'text-critical' : 'text-muted-foreground')}>{label}</span>
      {count !== undefined ? <span className="type-caption text-muted-foreground">{count}</span> : null}
    </div>
    <div className="shrink-0" style={{ width }} />
  </div>
);

export default TimelineTab;

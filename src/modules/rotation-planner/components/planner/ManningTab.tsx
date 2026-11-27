import React, { Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Info, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PageError, PageLoading } from '@/shared/components/states';
import { StatusPill, statusLabel } from '@/shared/components/status';
import { useMinWidth } from '@/shared/components/data';
import { notify } from '@/shared/lib/notify';
import { LEAVE_TONE_CLASSES, leaveTypeByKey, type LeaveType } from '../../lib/leaveTypes';
import { MANNING_BANDS, type ManningBand, type ManningDayRow, type ManningDayTotal } from '../../lib/manning';
import { PLANNER_NOT_SET_UP_NOTICE, type PlannerPeriod } from '../../lib/periods';
import { usePlannerPeriodMutations, usePlannerPeriods } from '../../hooks/usePlannerPeriods';
import { useManningByDay } from '../../hooks/useManningByDay';
import { LeaveLegend, LegendToggle } from './LeaveLegend';
import { LegacyLeavePlanner } from './legacyBodies';
import { PeriodDialog } from './PeriodDialog';
import type { PeriodEditValues } from './plannerSchemas';
import {
  OTHER_GROUP,
  addMonths,
  buildPlannerRows,
  dayColumns,
  dayLabel,
  dayTypes,
  departmentOptions,
  monthEnd,
  monthLongLabel,
  monthStart,
  paintRange,
  type PlannerRow,
} from './plannerModel';
import type { PlannerAccess, PlannerCrewState, PlannerVessel } from './usePlannerContext';

const COARSE = '[@media(pointer:coarse)]:h-11';
const CELL = 30;
const ALL_DEPARTMENTS = '__all';

/** The tone of a manning band in a cell (colour plus the figures in words, never colour alone). */
const BAND_CELL: Readonly<Record<ManningBand, string>> = {
  critical: 'bg-critical-muted text-foreground',
  at_minimum: 'bg-warning-muted text-foreground',
  normal: '',
  overmanned: 'bg-info-muted text-foreground',
};

interface PositionRow {
  key: string;
  positionName: string;
  departmentKey: string | null;
  sortOrder: number | null;
  min: number;
  max: number | null;
  byDay: Map<string, ManningDayRow>;
}

/** One row per position of the month's manning answer, in the vessel's rank order. */
function positionRows(rows: readonly ManningDayRow[]): PositionRow[] {
  const map = new Map<string, PositionRow>();
  for (const r of rows) {
    const key = r.positionId ?? 'unmatched';
    let p = map.get(key);
    if (!p) {
      p = { key, positionName: r.positionName ?? 'Unmatched titles', departmentKey: r.departmentKey, sortOrder: r.sortOrder, min: r.min, max: r.max, byDay: new Map() };
      map.set(key, p);
    }
    p.byDay.set(r.day, r);
    p.min = Math.max(p.min, r.min);
  }
  return [...map.values()].sort((a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER) || a.positionName.localeCompare(b.positionName));
}

type Paint = { profileId: string; anchor: string; current: string } | null;
type DialogState =
  | { kind: 'edit'; period: PlannerPeriod; person: { profileId: string; name: string } }
  | { kind: 'new'; person: { profileId: string; name: string }; start: string; end: string }
  | null;

export interface ManningTabProps {
  vessel: PlannerVessel;
  access: PlannerAccess;
  crew: PlannerCrewState;
  types: readonly LeaveType[];
  today: string;
}

/**
 * The manning grid (gap/04 C48, W7; X1-09B): one month, a grid per
 * department with a row per crew member and a column per day, each day in
 * its leave type's tone and code; under the crew, each position's
 * "qualified / aboard" by day; at the top the vessel's On board total,
 * banded Below minimum / At minimum / Within range / Above maximum
 * (vessel_manning_by_day: qualified uses today's crew compliance). Today,
 * Back / Forward and Refresh.
 *
 * Painting (crew_scheduling.edit): drag across a person's days (or Shift +
 * click to extend) and choose the type: it writes a period
 * (planner_period_upsert), never a day code; the period store writes the
 * codes. Clicking a day that a period covers opens that period.
 *
 * D-01: while the planner RPCs are missing the legacy day-code grid shows
 * under a notice. Any other error: PageError with Retry.
 */
export const ManningTab: React.FC<ManningTabProps> = ({ vessel, access, crew, types, today }) => {
  const [search, setSearch] = useSearchParams();
  const [month, setMonth] = React.useState(() => monthStart(today));
  const [paint, setPaint] = React.useState<Paint>(null);
  const [dialog, setDialog] = React.useState<DialogState>(null);
  const shiftAnchor = React.useRef<{ profileId: string; day: string } | null>(null);
  const wide = useMinWidth(640);
  const [legendChoice, setLegendChoice] = React.useState<boolean | null>(null);
  const showLegend = legendChoice ?? wide;
  const labelWidth = wide ? 200 : 132;
  const from = month;
  const to = monthEnd(month);
  const department = search.get('dept');

  const periods = usePlannerPeriods(vessel, from, to);
  const manning = useManningByDay(vessel, from, to, { enabled: periods.status !== 'not_set_up' });
  const mutations = usePlannerPeriodMutations(vessel);

  if (periods.status === 'not_set_up') {
    return (
      <div className="space-y-3" data-planner-fallback="manning">
        <Alert variant="info">
          <Info aria-hidden="true" className="size-4" />
          <AlertDescription>{PLANNER_NOT_SET_UP_NOTICE}</AlertDescription>
        </Alert>
        <Suspense fallback={<PageLoading variant="list" rows={6} label="Loading the leave grid" />}>
          <LegacyLeavePlanner embedded />
        </Suspense>
      </div>
    );
  }
  if (periods.status === 'error') {
    return <PageError error={periods.error} onRetry={periods.retry} title="The manning grid could not load" treatMissingAsOff={false} headingLevel={2} />;
  }

  const members = crew.status === 'ready' ? crew.members : [];
  const list = periods.status === 'ready' ? periods.periods : [];
  const groups = buildPlannerRows(members, list, department);
  const departments = departmentOptions(members);
  const departmentLabel = new Map(departments.map((d) => [d.key, d.label]));
  const columns = dayColumns(from, to, today);
  const days = columns.map((c) => c.date);
  const manningRows = manning.status === 'ready' ? manning.rows : [];
  const totals = new Map<string, ManningDayTotal>(manning.status === 'ready' ? manning.totals.map((t) => [t.day, t]) : []);
  const positions = positionRows(manningRows);
  const width = labelWidth + days.length * CELL;

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

  const refresh = () => {
    if (periods.status === 'ready') periods.refetch();
    if (manning.status === 'ready') manning.refetch();
    else if (manning.status === 'error') manning.retry();
  };

  // ---------- painting

  const openForCell = (row: PlannerRow, day: string, covering: PlannerPeriod | null, range: { start: string; end: string } | null) => {
    const person = { profileId: row.profileId, name: row.name };
    if (!range && covering) {
      setDialog({ kind: 'edit', period: covering, person });
      return;
    }
    if (!access.canEdit || !row.onList) {
      if (covering) setDialog({ kind: 'edit', period: covering, person });
      return;
    }
    const r = range ?? { start: day, end: day };
    setDialog({ kind: 'new', person, start: r.start, end: r.end });
  };

  const onCellPointerDown = (row: PlannerRow, day: string, event: React.PointerEvent) => {
    if (!access.canEdit || !row.onList || event.button !== 0 || event.pointerType === 'touch') return;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
    setPaint({ profileId: row.profileId, anchor: day, current: day });
  };
  const onCellEnter = (row: PlannerRow, day: string) => {
    if (paint && paint.profileId === row.profileId && paint.current !== day) setPaint({ ...paint, current: day });
  };
  const finishPaint = (row: PlannerRow, covering: PlannerPeriod | null, day: string) => {
    const p = paint;
    setPaint(null);
    if (p && p.profileId === row.profileId && p.anchor !== p.current) {
      openForCell(row, day, covering, paintRange(p.anchor, p.current));
      return true;
    }
    return false;
  };
  const onCellClick = (row: PlannerRow, day: string, covering: PlannerPeriod | null, event: React.MouseEvent) => {
    if (finishPaint(row, covering, day)) return;
    const anchor = shiftAnchor.current;
    if (event.shiftKey && anchor && anchor.profileId === row.profileId && anchor.day !== day && access.canEdit && row.onList) {
      shiftAnchor.current = null;
      openForCell(row, day, null, paintRange(anchor.day, day));
      return;
    }
    shiftAnchor.current = { profileId: row.profileId, day };
    openForCell(row, day, covering, null);
  };

  const saveNew = async (person: { profileId: string; name: string }, values: PeriodEditValues) => {
    await mutations.upsert.mutateAsync({
      id: null,
      profileId: person.profileId,
      leaveTypeKey: values.leaveTypeKey,
      start: values.start,
      end: values.endUnknown ? null : values.end,
      endUnknown: values.endUnknown,
      notes: values.notes || null,
      replace: values.replace,
    });
    notify.success(`${leaveTypeByKey(values.leaveTypeKey, types)?.label ?? 'Period'} added for ${person.name}`);
  };
  const saveEdit = async (period: PlannerPeriod, person: { profileId: string; name: string }, values: PeriodEditValues) => {
    await mutations.upsert.mutateAsync({
      id: period.id,
      profileId: person.profileId,
      leaveTypeKey: values.leaveTypeKey,
      start: values.start,
      end: values.endUnknown ? null : values.end,
      endUnknown: values.endUnknown,
      notes: values.notes || null,
      replace: values.replace,
      expectedVersion: period.version,
    });
    notify.success(`Period changed for ${person.name}`);
  };
  const remove = async (period: PlannerPeriod, person: { name: string }) => {
    await mutations.remove.mutateAsync(period.id);
    notify.success(`Period removed for ${person.name}`);
  };

  const inPaint = (profileId: string, day: string) => {
    if (!paint || paint.profileId !== profileId) return false;
    const r = paintRange(paint.anchor, paint.current);
    return day >= r.start && day <= r.end;
  };

  const positionsByDepartment = (key: string) => positions.filter((p) => (p.departmentKey ?? OTHER_GROUP) === key);
  const placedDepartments = new Set(groups.map((g) => g.key));
  const extraPositionGroups = [...new Set(positions.map((p) => p.departmentKey ?? OTHER_GROUP))].filter(
    (k) => !placedDepartments.has(k) && (!department || department === k),
  );

  return (
    <div className="min-w-0 space-y-3" data-planner-tab="manning" onPointerUp={() => paint && setPaint(null)}>
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Manning">
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="icon" className="size-9 [@media(pointer:coarse)]:size-11" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button type="button" variant="outline" size="sm" className={`h-9 ${COARSE}`} onClick={() => setMonth(monthStart(today))}>
            <CalendarDays aria-hidden="true" />
            Today
          </Button>
          <Button type="button" variant="outline" size="icon" className="size-9 [@media(pointer:coarse)]:size-11" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
        <h2 className="type-subtitle text-foreground" aria-live="polite">
          {monthLongLabel(month)}
        </h2>
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
          </SelectContent>
        </Select>
        <LegendToggle open={showLegend} onToggle={() => setLegendChoice(!showLegend)} />
        <Button type="button" variant="ghost" size="sm" className={`ml-auto h-9 ${COARSE}`} onClick={refresh} disabled={periods.status !== 'ready'}>
          <RefreshCw aria-hidden="true" className={cn((periods.status === 'ready' && periods.refreshing) || (manning.status === 'ready' && manning.refreshing) ? 'animate-spin' : '')} />
          Refresh
        </Button>
      </div>

      {showLegend ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <LeaveLegend types={types} />
          <ul aria-label="Manning bands" className="flex flex-wrap gap-2">
            {MANNING_BANDS.map((b) => (
              <li key={b}>
                <StatusPill domain="manning_band" status={b} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {manning.status === 'not_set_up' ? (
        <p className="type-caption text-muted-foreground">Manning totals appear once the planner update is applied.</p>
      ) : manning.status === 'error' ? (
        <Alert variant="warning">
          <AlertTriangle aria-hidden="true" className="size-4" />
          <AlertDescription className="flex flex-wrap items-center gap-2">
            Manning totals could not load.
            <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={manning.retry}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {periods.status === 'loading' || periods.status === 'idle' ? (
        <div className="space-y-2 rounded-lg border border-border p-3" aria-busy="true" aria-label="Loading the manning grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
      ) : (
        <div className="max-h-[70vh] overflow-auto overscroll-x-contain rounded-lg border border-border bg-card" data-planner-scroll="">
          <table className="border-separate border-spacing-0 text-xs" style={{ width }} aria-label={`Manning, ${monthLongLabel(month)}`}>
            <thead className="sticky top-0 z-20 bg-card">
              <tr>
                <th scope="col" className="sticky left-0 z-30 border-b border-r border-border bg-card px-3 py-1.5 text-left type-caption font-medium text-muted-foreground" style={{ width: labelWidth, minWidth: labelWidth }}>
                  Crew
                </th>
                {columns.map((c) => (
                  <th
                    key={c.date}
                    scope="col"
                    className={cn('border-b border-border px-0 py-1 text-center font-normal tabular-nums', c.weekend && 'bg-weekend/50', c.today && 'text-today')}
                    style={{ width: CELL, minWidth: CELL }}
                    aria-label={dayLabel(c.date)}
                  >
                    <span className={cn('block text-[10px] text-muted-foreground', c.today && 'font-semibold text-today')}>{c.weekday.slice(0, 1)}</span>
                    <span className={cn('block', c.today ? 'font-semibold text-today' : 'text-foreground')}>{c.dayOfMonth}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {manning.status === 'ready' ? (
                <tr data-manning-total="">
                  <th scope="row" className="sticky left-0 z-10 border-b border-r border-border bg-card px-3 py-1.5 text-left type-body-sm font-semibold text-foreground">
                    On board
                  </th>
                  {columns.map((c) => {
                    const t = totals.get(c.date);
                    const text = t ? `${dayLabel(c.date)}: ${t.aboard} on board, ${t.qualified} qualified, minimum ${t.min}${t.max !== null ? `, maximum ${t.max}` : ''}. ${statusLabel('manning_band', t.band)}` : `${dayLabel(c.date)}: no manning answer`;
                    return (
                      <td key={c.date} className={cn('border-b border-border text-center font-semibold tabular-nums', t ? BAND_CELL[t.band] : '', c.weekend && !t?.band && 'bg-weekend/50')} title={text} aria-label={text} data-band={t?.band}>
                        {t ? t.aboard : '–'}
                      </td>
                    );
                  })}
                </tr>
              ) : null}

              {groups.map((g) => (
                <React.Fragment key={g.key}>
                  <tr>
                    <th colSpan={days.length + 1} scope="colgroup" className="border-b border-border bg-muted/60 px-3 py-1 text-left">
                      <span className="sticky left-3 type-eyebrow text-muted-foreground">{g.label}</span>
                    </th>
                  </tr>
                  {g.rows.map((row) => {
                    const cells = dayTypes(row.periods, days);
                    const byId = new Map(row.periods.map((p) => [p.id, p]));
                    return (
                      <tr key={row.profileId} data-manning-row={row.profileId}>
                        <th scope="row" className="sticky left-0 z-10 border-b border-r border-border bg-card px-3 py-1 text-left font-normal">
                          <span className="block truncate type-body-sm font-medium text-foreground" style={{ maxWidth: labelWidth - 24 }}>
                            {row.name}
                          </span>
                          {row.positionLabel ? (
                            <span className="block truncate type-caption text-muted-foreground" style={{ maxWidth: labelWidth - 24 }}>
                              {row.positionLabel}
                            </span>
                          ) : null}
                        </th>
                        {cells.map((cell, i) => {
                          const type = leaveTypeByKey(cell.typeKey, types);
                          const covering = cell.periodId ? byId.get(cell.periodId) ?? null : null;
                          const col = columns[i];
                          const painted = inPaint(row.profileId, cell.day);
                          const label = `${row.name}, ${dayLabel(cell.day)}: ${type ? type.label : 'no period'}`;
                          return (
                            <td key={cell.day} className={cn('border-b border-border p-0', col.weekend && !type && 'bg-weekend/50')}>
                              <button
                                type="button"
                                aria-label={label}
                                title={label}
                                className={cn(
                                  'focus-ring flex h-8 w-full items-center justify-center text-[10px] font-semibold',
                                  type ? LEAVE_TONE_CLASSES[type.toneKey].bar : 'text-muted-foreground',
                                  type && 'border-y-0 border-l-0',
                                  painted && 'ring-2 ring-inset ring-primary',
                                  col.today && 'outline outline-1 -outline-offset-1 outline-today',
                                  access.canEdit && row.onList ? 'cursor-cell' : '',
                                )}
                                onPointerDown={(e) => onCellPointerDown(row, cell.day, e)}
                                onPointerEnter={() => onCellEnter(row, cell.day)}
                                onClick={(e) => onCellClick(row, cell.day, covering, e)}
                              >
                                {type ? type.dayCode : ''}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {positionsByDepartment(g.key).map((p) => (
                    <PositionManningRow key={p.key} position={p} columns={columns} />
                  ))}
                </React.Fragment>
              ))}

              {extraPositionGroups.map((key) => (
                <React.Fragment key={`positions:${key}`}>
                  <tr>
                    <th colSpan={days.length + 1} scope="colgroup" className="border-b border-border bg-muted/60 px-3 py-1 text-left">
                      <span className="sticky left-3 type-eyebrow text-muted-foreground">{key === OTHER_GROUP ? 'Unmatched titles' : departmentLabel.get(key) ?? key.replace(/_/g, ' ')}</span>
                    </th>
                  </tr>
                  {positionsByDepartment(key).map((p) => (
                    <PositionManningRow key={p.key} position={p} columns={columns} />
                  ))}
                </React.Fragment>
              ))}

              {groups.length === 0 && positions.length === 0 ? (
                <tr>
                  <td colSpan={days.length + 1} className="p-6 text-center type-body text-muted-foreground">
                    {department ? 'Nobody in this department this month.' : 'No crew or manning for this month yet.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      {access.canEdit ? <p className="type-caption text-muted-foreground">Drag across a crew member&rsquo;s days, or click a day and Shift + click another, to add a period. Click a coloured day to change its period.</p> : null}

      {dialog ? (
        <PeriodDialog
          key={dialog.kind === 'edit' ? dialog.period.id : `${dialog.person.profileId}:${dialog.start}:${dialog.end}`}
          open
          onOpenChange={(open) => !open && setDialog(null)}
          person={dialog.person}
          period={dialog.kind === 'edit' ? dialog.period : null}
          initial={dialog.kind === 'new' ? { start: dialog.start, end: dialog.end } : undefined}
          types={types}
          canEdit={access.canEdit}
          canApproveLeave={access.canApproveLeave}
          today={today}
          onSave={(values) => (dialog.kind === 'edit' ? saveEdit(dialog.period, dialog.person, values) : saveNew(dialog.person, values))}
          onDelete={dialog.kind === 'edit' ? () => remove(dialog.period, dialog.person) : undefined}
        />
      ) : null}
    </div>
  );
};

/** A position's "qualified / aboard" by day, banded (gap/04 C48). */
const PositionManningRow: React.FC<{ position: PositionRow; columns: ReturnType<typeof dayColumns> }> = ({ position, columns }) => (
  <tr data-manning-position={position.key}>
    <th scope="row" className="sticky left-0 z-10 border-b border-r border-border bg-card px-3 py-1 text-left font-normal">
      <span className="block truncate type-caption font-medium text-foreground">{position.positionName}</span>
      <span className="block truncate type-caption text-muted-foreground">
        Qualified / aboard · min {position.min}
        {position.max !== null ? `, max ${position.max}` : ''}
      </span>
    </th>
    {columns.map((c) => {
      const r = position.byDay.get(c.date);
      const text = r
        ? `${position.positionName}, ${dayLabel(c.date)}: ${r.qualified} qualified of ${r.aboard} aboard, minimum ${r.min}${r.shortBy > 0 ? `, short by ${r.shortBy}` : ''}. ${statusLabel('manning_band', r.band)}`
        : `${position.positionName}, ${dayLabel(c.date)}: no answer`;
      return (
        <td key={c.date} className={cn('border-b border-border text-center tabular-nums', r ? BAND_CELL[r.band] : '', c.weekend && (!r || r.band === 'normal') && 'bg-weekend/50')} title={text} aria-label={text} data-band={r?.band}>
          {r ? `${r.qualified}/${r.aboard}` : ''}
        </td>
      );
    })}
  </tr>
);

export default ManningTab;

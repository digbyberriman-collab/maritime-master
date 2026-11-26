/**
 * Hours of rest: one person's month on one vessel (gap/04 C37, C38, C39;
 * W6; T-143, T-148; DECISIONS D-X1-20, D-X1-21, D-01).
 *
 * Two places render it:
 * - this page, the person's own month at /me/hours-of-rest (and the legacy
 *   /crew/work-rest, /crew/work-rest/:crewId, which render it in place when
 *   the user has no vessel to land on);
 * - the crew profile's Hours of rest tab (crew/people/:profileId/hours-of-rest,
 *   components HoursOfRestTab), through the exported HorMonthView.
 *
 * The month opens on the month view (T-143): a calendar of day states
 * (lib/horDay.ts) with the rest hours, the breach and near-limit overlays,
 * and a legend. Week shows the week's timelines, Day the day editor with
 * its periods list, keyboard entry and Rest still needed today. The URL
 * keeps the place: ?month=2026-11, &view=week, &day=2026-11-21 (the old
 * ?year=&month= links still open the right month).
 *
 * A person with assignments on two vessels in a month has one month per
 * vessel (D-X1-20): the page asks which, and keeps the answer in ?vessel=.
 * The month closes with its vessel's Crew or Hours of Rest module
 * (PersonalHorGate, D-X1-21).
 *
 * Edits stay on screen until Save, which goes through the engine
 * (work_rest_save_day), or the legacy path while the engine is missing
 * (D-01; useMonthlyWorkRest). Breaches and near-limit days are computed in
 * the browser with the engine's own rules, so the screen reads the same on
 * both paths. Sign-off is SignOffPanel's. Reads that fail show the error
 * with Retry; a permission refusal shows AccessDenied.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Loader2,
  MoreHorizontal,
  Save,
  Ship,
  SquareKanban,
  Undo2,
} from 'lucide-react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import PageHeader from '@/shared/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { KpiTile } from '@/shared/components/data/KpiTile';
import { StatusPill } from '@/shared/components/status';
import { AccessDenied, PageEmpty, PageError, PageLoading } from '@/shared/components/states';
import { cn } from '@/lib/utils';
import { notify } from '@/shared/lib/notify';
import { supabase } from '@/integrations/supabase/client';
import { isMissingRelation } from '@/integrations/supabase/pending';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { useVesselModuleSettings } from '@/modules/vessels/hooks/useVesselModuleSettings';
import { localIsoDate } from '@/modules/vessels/lib/moduleSettings';
import { vesselPath } from '@/modules/vessels/lib/vesselCode';
import { useCan, useCapability } from '@/lib/permissions/useCan';
import { logClientExport } from '@/lib/records/services/exports';
import { EXPORT_COPY, exportFileName } from '@/lib/export';
import { isLegacyUnloggedExport } from '@/lib/export/legacy';
import { CREW_CAPS } from '@/modules/crew/paths';
import { crewRefusalMessage, normaliseOffice } from '@/modules/crew/lib/crewUpdateErrors';

import { loadMonthlyWorkRest, monthRange, useMonthlyWorkRest } from '../hooks/useMonthlyWorkRest';
import { workRestKeys } from '../hooks/workRestKeys';
import { horDayState, horStartFrom, missingDays as countMissing, monthDays, type HorAssignmentSpan, type HorDay } from '../lib/horDay';
import { MONTH_REFUSAL_TEXT, normaliseMonthStatus } from '../lib/horMonth';
import { WorkRestRefusal } from '../services/workRestService';
import { workRestDb } from '../types/db.pending';
import type { DailyRecord, HodStep, WorkRestBlock } from '../types';
import { PersonalHorGate } from '../components/PersonalHorGate';
import { MonthCalendar, type MonthCalendarDay } from '../components/MonthCalendar';
import { WeekView, type WeekViewDay } from '../components/WeekView';
import { DayTimeline } from '../components/DayTimeline';
import { FillDaysDialog, type FillDay } from '../components/FillDaysDialog';
import { RestNeededChip } from '../components/RestNeededChip';
import { SignOffPanel } from '../components/SignOffPanel';
import { NonConformityList } from '../components/NonConformityList';
import { AuditLogPanel } from '../components/AuditLogPanel';

// ---------------------------------------------------------------- dates and URL state

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const pad2 = (n: number) => String(n).padStart(2, '0');
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const weekdayOf = (date: string): number => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
const shiftDay = (date: string, days: number): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
/** "Saturday 21 November". */
const longDay = (date: string) => `${WEEKDAYS[weekdayOf(date)]} ${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
/** "Sat 21 Nov". */
const shortDay = (date: string) => `${WEEKDAYS[weekdayOf(date)].slice(0, 3)} ${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1].slice(0, 3)}`;
const monthKey = (year: number, month: number) => `${year}-${pad2(month)}`;
const monthTitle = (year: number, month: number) => `${MONTHS[month - 1]} ${year}`;

/** Today on the vessel's clock (vessel_work_rest_settings.timezone), else the browser's. */
function todayIn(timezone: string | null | undefined): string {
  if (timezone) {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    } catch {
      // An unknown zone name: the browser's day.
    }
  }
  return localIsoDate();
}

type View = 'month' | 'week' | 'day';

interface MonthPlace {
  year: number;
  month: number;
  view: View;
  /** The day the week or day view shows; null on the month view. */
  day: string | null;
}

/** ?month=2026-11 (or the old ?year=2026&month=11), &view=week, &day=2026-11-21. */
function placeFrom(params: URLSearchParams, today: string): MonthPlace {
  let year = Number(today.slice(0, 4));
  let month = Number(today.slice(5, 7));
  const m = params.get('month') ?? '';
  const legacyYear = Number(params.get('year'));
  const dayParam = params.get('day');
  if (/^\d{4}-\d{2}$/.test(m) && Number(m.slice(5)) >= 1 && Number(m.slice(5)) <= 12) {
    year = Number(m.slice(0, 4));
    month = Number(m.slice(5));
  } else if (Number.isInteger(legacyYear) && legacyYear >= 2000 && legacyYear <= 2100 && /^\d{1,2}$/.test(m) && Number(m) >= 1 && Number(m) <= 12) {
    year = legacyYear;
    month = Number(m);
  } else if (dayParam && ISO_DAY.test(dayParam)) {
    year = Number(dayParam.slice(0, 4));
    month = Number(dayParam.slice(5, 7));
  }
  const inMonth = dayParam && ISO_DAY.test(dayParam) && dayParam.startsWith(monthKey(year, month)) ? dayParam : null;
  const viewParam = params.get('view');
  const view: View = viewParam === 'week' ? 'week' : inMonth ? 'day' : viewParam === 'day' ? 'day' : 'month';
  const fallbackDay = today.startsWith(monthKey(year, month)) ? today : `${monthKey(year, month)}-01`;
  return { year, month, view, day: view === 'month' ? null : inMonth ?? fallbackDay };
}

/** The search string for a place, keeping the other parameters (vessel). */
function searchFor(params: URLSearchParams, place: MonthPlace): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete('year');
  next.set('month', monthKey(place.year, place.month));
  if (place.view === 'week') next.set('view', 'week');
  else next.delete('view');
  if (place.view !== 'month' && place.day) next.set('day', place.day);
  else next.delete('day');
  return next;
}

const spanOf = (a: { join_date: string | null; start_date: string | null; leave_date: string | null; end_date: string | null }): HorAssignmentSpan => ({
  from: a.join_date ?? a.start_date,
  to: a.leave_date ?? a.end_date,
});

/** An assignment overlaps a month. */
const overlaps = (span: HorAssignmentSpan, from: string, to: string) =>
  (!span.from || span.from.slice(0, 10) <= to) && (!span.to || span.to.slice(0, 10) >= from) && Boolean(span.from || span.to);

const isPermissionError = (error: unknown) => !!error && typeof error === 'object' && (error as { code?: unknown }).code === '42501';

/** One sentence for a refused save: the server's where it gave one. */
function refusalText(error: unknown): string {
  if (error instanceof WorkRestRefusal) {
    const known = (MONTH_REFUSAL_TEXT as Readonly<Record<string, string>>)[error.refusal];
    const sentence = error.message !== error.refusal ? error.message : known ?? error.message;
    return crewRefusalMessage({ code: error.code, details: sentence, message: sentence });
  }
  return crewRefusalMessage(error);
}

const hoursText = (minutes: number) => {
  const h = minutes / 60;
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
};

// ---------------------------------------------------------------- reads around the month

type AssignmentRow = {
  id: string;
  vessel_id: string;
  department: string | null;
  position: string;
  join_date: string;
  start_date: string | null;
  leave_date: string | null;
  end_date: string | null;
  is_current: boolean | null;
};
const ASSIGNMENT_COLUMNS = 'id, vessel_id, department, position, join_date, start_date, leave_date, end_date, is_current';

interface MonthContext {
  /** The crew member's assignments to this vessel. */
  assignments: AssignmentRow[];
  /** The viewer's department on the vessel today (null when unknown). */
  viewerDepartment: string | null;
  /** crew_leave_entries.status_code by day, for the month. */
  leave: Map<string, string>;
  hodStep: HodStep;
  timezone: string | null;
}

async function fetchMonthContext(vesselId: string, crewId: string, viewerId: string, isOwn: boolean, from: string, to: string): Promise<MonthContext> {
  const assignments = await supabase.from('crew_assignments').select(ASSIGNMENT_COLUMNS).eq('user_id', crewId).eq('vessel_id', vesselId);
  if (assignments.error) throw assignments.error;

  let viewerDepartment: string | null = null;
  if (!isOwn && viewerId) {
    const mine = await supabase.from('crew_assignments').select(ASSIGNMENT_COLUMNS).eq('user_id', viewerId).eq('vessel_id', vesselId);
    if (mine.error) throw mine.error;
    const current = (mine.data ?? []).find((a) => a.is_current) ?? (mine.data ?? [])[0];
    viewerDepartment = current?.department ?? null;
  }

  const leave = new Map<string, string>();
  const leaveRows = await supabase.from('crew_leave_entries').select('date, status_code').eq('crew_id', crewId).gte('date', from).lte('date', to);
  if (leaveRows.error && !isMissingRelation(leaveRows.error)) throw leaveRows.error;
  for (const row of leaveRows.data ?? []) leave.set(row.date, row.status_code);

  // hod_step is a 060700 column (D-01): while it is missing the engine's default, nudge, applies.
  let hodStep: HodStep = 'nudge';
  let timezone: string | null = null;
  const settings = await workRestDb.from('vessel_work_rest_settings').select('hod_step, timezone').eq('vessel_id', vesselId).maybeSingle();
  if (!settings.error) {
    const step = settings.data?.hod_step;
    if (step === 'off' || step === 'nudge' || step === 'required') hodStep = step;
    timezone = settings.data?.timezone ?? null;
  } else if (isMissingRelation(settings.error)) {
    const legacy = await workRestDb.from('vessel_work_rest_settings').select('timezone').eq('vessel_id', vesselId).maybeSingle();
    if (legacy.error && !isMissingRelation(legacy.error)) throw legacy.error;
    timezone = legacy.data?.timezone ?? null;
  } else {
    throw settings.error;
  }
  return { assignments: assignments.data ?? [], viewerDepartment, leave, hodStep, timezone };
}

// ---------------------------------------------------------------- the month view (page and profile tab)

export interface HorMonthSubject {
  /** The crew member's login: hours of rest key on it. */
  userId: string;
  firstName: string;
  lastName: string;
  /** "Demo Bosun". */
  name: string;
  /** Position and department, for the header ("Bosun · Deck"). */
  detail: string | null;
}

export interface HorMonthViewProps {
  /** `personal`: the page's own header (h1). `profile`: a tab body under the profile header (h2). */
  scope: 'personal' | 'profile';
  vessel: { id: string; name: string; code: string | null };
  subject: HorMonthSubject;
  isOwn: boolean;
  /** Shown under the header (the vessel choice for a month on two vessels). */
  headerExtra?: React.ReactNode;
}

/**
 * One person's month on one vessel: the calendar, week and day views, the
 * fill, the save bar, the sign-off and the breaches. The caller has gated
 * the vessel (PersonalHorGate, or the vessel route gate for the profile).
 */
export const HorMonthView: React.FC<HorMonthViewProps> = (props) => {
  const [resetKey, setResetKey] = useState(0);
  return <HorMonthBody key={`${props.vessel.id}:${props.subject.userId}:${resetKey}`} {...props} onDiscard={() => setResetKey((k) => k + 1)} />;
};

const HorMonthBody: React.FC<HorMonthViewProps & { onDiscard: () => void }> = ({ scope, vessel, subject, isOwn, headerExtra, onDiscard }) => {
  const { user } = useAuth();
  const actorId = user?.id ?? '';
  const { vessels } = useVessel();
  const [params, setParams] = useSearchParams();
  const ctxCaps = { vesselId: vessel.id };
  const canCreate = useCan(CREW_CAPS.horCreate, ctxCaps);
  const canEdit = useCan(CREW_CAPS.horEdit, ctxCaps);
  const canApprove = useCan(CREW_CAPS.horApprove, ctxCaps);
  const canFinalApprove = useCan(CREW_CAPS.horFinalApprove, ctxCaps);
  const canExportOthers = useCan(CREW_CAPS.horExport, ctxCaps);

  // The place first on the browser's clock; the vessel's clock once its settings are read.
  const browserToday = localIsoDate();
  const roughPlace = placeFrom(params, browserToday);
  const { from, to } = monthRange(roughPlace.year, roughPlace.month);

  const context = useQuery({
    queryKey: [...workRestKeys.person(vessel.id, subject.userId), 'context', roughPlace.year, roughPlace.month, actorId],
    queryFn: () => fetchMonthContext(vessel.id, subject.userId, actorId, isOwn, from, to),
    enabled: Boolean(vessel.id && subject.userId),
    staleTime: 60_000,
    retry: 1,
  });
  const today = todayIn(context.data?.timezone);
  const place = placeFrom(params, today);
  const { year, month } = place;
  const settings = useVesselModuleSettings(vessel.id);

  const wr = useMonthlyWorkRest({ crewId: subject.userId, vesselId: vessel.id, year, month, actorId, actorRole: null });
  // The same query the hook runs (one request): its six context days feed Rest still needed today.
  const monthData = useQuery({
    queryKey: workRestKeys.month(vessel.id, subject.userId, year, month),
    queryFn: () => loadMonthlyWorkRest({ crewId: subject.userId, vesselId: vessel.id, year, month }),
    enabled: Boolean(vessel.id && subject.userId),
  });

  const [fillOpen, setFillOpen] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);

  const go = useCallback((next: MonthPlace, replace = false) => setParams(searchFor(params, next), { replace }), [params, setParams]);
  /** Leaves the month only after asking, when days are not saved. */
  const guarded = (fn: () => void) => (wr.isDirty ? setPending(() => fn) : fn());

  // Unsaved days survive neither a reload nor a closed tab: the browser asks first.
  useEffect(() => {
    if (!wr.isDirty) return undefined;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [wr.isDirty]);

  const title = monthTitle(year, month);
  const ctx = context.data;
  const submission = wr.submission;
  const records = wr.records;

  const model = useMemo(() => {
    const spans = (ctx?.assignments ?? []).map(spanOf);
    const start = horStartFrom(settings.state);
    const byDate = new Map(records.map((r) => [r.record_date, r]));
    const summaries = new Map(wr.compliance.daily_summary.map((d) => [d.date, d]));
    const subjectAssignment =
      (ctx?.assignments ?? []).find((a) => a.is_current && overlaps(spanOf(a), from, to)) ??
      (ctx?.assignments ?? []).find((a) => overlaps(spanOf(a), from, to)) ??
      null;
    const sameDepartment = Boolean(
      subjectAssignment?.department && ctx?.viewerDepartment && normaliseOffice(subjectAssignment.department) === normaliseOffice(ctx.viewerDepartment),
    );
    const mayEditPerson = isOwn ? canCreate : canEdit && (sameDepartment || canFinalApprove);
    const monthOpen = wr.isOpen;
    const statusLabel = submission ? normaliseMonthStatus(submission.status) ?? 'draft' : 'draft';

    const days = monthDays(year, month).map((date) => {
      const record = byDate.get(date);
      const summary = summaries.get(date);
      const otherVessel = record && record.vessel_id && record.vessel_id !== vessel.id ? record.vessel_id : null;
      const day: HorDay = horDayState({
        date,
        today,
        start,
        assignments: spans,
        leaveCode: ctx?.leave.get(date) ?? null,
        hasRecord: Boolean(record),
        monthStatus: submission?.status ?? null,
        breach: summary?.breach,
        warning: summary?.warning,
      });
      const reasonText = day.reason ? NOT_EXPECTED_TEXT[day.reason] : null;
      let lockedReason: string | null = null;
      if (otherVessel) lockedReason = `Recorded on ${vessels.find((v) => v.id === otherVessel)?.name ?? 'another vessel'}.`;
      else if (day.state === 'not_expected') lockedReason = reasonText;
      else if (!monthOpen) lockedReason = `The month is ${statusWord(statusLabel)}. It must be reopened before a day changes.`;
      else if (!mayEditPerson) lockedReason = isOwn ? "You can't enter hours of rest on this vessel." : 'Days of crew members outside your department are changed by their head of department or the Master.';
      return {
        date,
        label: longDay(date),
        short: shortDay(date),
        day,
        reasonText,
        restMinutes: record ? summary?.rest_minutes ?? 1440 : null,
        dirty: wr.isDirty && isEdited(record, monthData.data?.records),
        blocks: record?.blocks ?? [],
        editable: lockedReason === null,
        lockedReason,
        summary,
      };
    });
    return {
      days,
      sameDepartment,
      inMonth: spans.some((s) => overlaps(s, from, to)),
      stillAboard: spans.some((s) => (!s.from || s.from.slice(0, 10) <= today) && (!s.to || s.to.slice(0, 10) >= today) && Boolean(s.from || s.to)),
      mayEditPerson,
      monthOpen,
    };
  }, [ctx, settings.state, records, wr.compliance, wr.isOpen, wr.isDirty, submission, isOwn, canCreate, canEdit, canFinalApprove, year, month, from, to, today, vessel.id, vessels, monthData.data?.records]);

  const unsaved = model.days.filter((d) => d.dirty).length;
  const missing = countMissing(model.days.map((d) => d.day));

  // ---------------------------------------------------------------- states

  if (context.error || wr.error || monthData.error) {
    const error = context.error ?? wr.error ?? monthData.error;
    if (isPermissionError(error)) {
      return (
        <AccessDenied
          title="You can't see this month"
          detail="Hours of rest of others need hours of rest access on this vessel. Ask your fleet manager for it."
          headingLevel={scope === 'personal' ? 1 : 2}
        />
      );
    }
    return (
      <PageError
        title="This month could not load"
        error={error}
        onRetry={() => {
          void context.refetch();
          void wr.refresh();
        }}
        treatMissingAsOff={false}
        headingLevel={scope === 'personal' ? 1 : 2}
      />
    );
  }
  if (context.isPending || wr.loading || !submission || settings.state.status === 'loading') {
    return <PageLoading variant="detail" label="Loading hours…" />;
  }

  // ---------------------------------------------------------------- actions

  const openDay = (date: string) => go({ year, month, view: 'day', day: date });
  const setView = (view: View) => go({ year, month, view, day: view === 'month' ? null : place.day ?? (today.startsWith(monthKey(year, month)) ? today : `${monthKey(year, month)}-01`) });
  const shiftMonth = (delta: number) =>
    guarded(() => {
      const d = new Date(Date.UTC(year, month - 1 + delta, 1));
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth() + 1;
      go({ year: y, month: m, view: place.view, day: place.view === 'month' ? null : `${monthKey(y, m)}-01` });
    });
  const shiftWeek = (delta: number) => {
    const anchor = place.day ?? `${monthKey(year, month)}-01`;
    const next = shiftDay(anchor, delta * 7 - weekdayOf(anchor));
    const target = delta < 0 ? shiftDay(next, 6) : next;
    if (target.startsWith(monthKey(year, month))) go({ year, month, view: 'week', day: target });
    else guarded(() => go({ year: Number(target.slice(0, 4)), month: Number(target.slice(5, 7)), view: 'week', day: target }));
  };
  const shiftDayBy = (delta: number) => {
    const target = shiftDay(place.day ?? `${monthKey(year, month)}-01`, delta);
    if (target.startsWith(monthKey(year, month))) go({ year, month, view: 'day', day: target });
    else guarded(() => go({ year: Number(target.slice(0, 4)), month: Number(target.slice(5, 7)), view: 'day', day: target }));
  };
  const changeDay = (date: string, blocks: WorkRestBlock[]) => wr.setDayBlocks(date, blocks);

  const save = async (): Promise<boolean> => {
    const count = unsaved;
    try {
      await wr.save();
      notify.success(count === 1 ? 'Day saved' : `${count} days saved`);
      return true;
    } catch (error) {
      notify.error(new Error(refusalText(error)), { title: 'Not all days were saved' });
      return false;
    }
  };

  // Leave days stay out of a fill (they can still be entered one by one).
  const fillDays: FillDay[] = model.days.map((d) => ({ date: d.date, label: d.short, entered: d.restMinutes !== null, editable: d.editable && d.day.state !== 'leave' }));
  const editableDays = model.days.filter((d) => d.editable && d.day.state !== 'leave');
  const blocksOn = (date: string): WorkRestBlock[] | null => {
    const r = records.find((x) => x.record_date === date) ?? monthData.data?.context.find((x) => x.record_date === date);
    return r ? r.blocks.filter((b) => b.block_type === 'work').map((b) => ({ block_type: 'work', start_minute: b.start_minute, end_minute: b.end_minute, category: b.category ?? null, notes: b.notes ?? null })) : null;
  };
  const onFill = (targets: string[], blocks: WorkRestBlock[], sourceText: string) => {
    for (const date of targets) wr.setDayBlocks(date, blocks.map((b) => ({ ...b })));
    notify.success(`${targets.length} ${targets.length === 1 ? 'day' : 'days'} filled${sourceText ? ` from ${sourceText}` : ''}`, {
      description: 'Save to keep them.',
    });
  };

  const canExport = isOwn || canExportOthers;
  const exportMonth = async (format: 'pdf' | 'csv') => {
    const sourceKey = 'work_rest.hor_month';
    try {
      const log = await logClientExport({
        kind: format === 'pdf' ? 'register_pdf' : 'csv',
        sourceKey,
        params: { year, month },
        containsPersonalData: true,
        rowCount: records.length,
        vesselId: vessel.id,
      });
      if (log.status === 'refused') {
        notify.error(new Error(log.code === 'impersonating' ? EXPORT_COPY.impersonating : EXPORT_COPY.invalid), { title: 'Not exported' });
        return;
      }
      if (log.status === 'missing' && !isLegacyUnloggedExport(sourceKey)) {
        notify.error(new Error(EXPORT_COPY.logMissingPersonal), { title: 'Not exported' });
        return;
      }
    } catch (error) {
      notify.error(new Error(isPermissionError(error) ? EXPORT_COPY.accessDenied : EXPORT_COPY.logFailed), { title: 'Not exported' });
      return;
    }
    try {
      const builders = await import('../reports/exports');
      const meta = vessels.find((v) => v.id === vessel.id);
      const data = {
        crew: { first_name: subject.firstName, last_name: subject.lastName, rank: subject.detail },
        vessel: { name: vessel.name, imo_number: meta?.imo_number ?? null, flag: meta?.flag_state ?? null },
        year,
        month,
        records,
        compliance: wr.compliance,
        ruleSet: wr.ruleSet,
        signatures: wr.signatures,
      };
      const fileName = exportFileName({ vesselCode: vessel.code, kind: 'Hours of rest', range: { from, to }, ext: format });
      if (format === 'pdf') builders.downloadPDF(builders.exportMonthlyPDF(data), fileName);
      else builders.downloadCSV(builders.exportMonthlyCSV(data), fileName);
    } catch {
      notify.error(new Error(EXPORT_COPY.buildFailed), { title: 'Not exported' });
    }
  };

  const boardPath = (canApprove || canFinalApprove) && vessel.code ? vesselPath(vessel.code, `crew/hours-of-rest?month=${monthKey(year, month)}`) : null;
  const ownMonthPath = scope === 'profile' && isOwn ? `/me/hours-of-rest?month=${monthKey(year, month)}${vessel.code ? `&vessel=${vessel.code.toLowerCase()}` : ''}` : null;

  // ---------------------------------------------------------------- figures

  const monthSummaries = model.days.map((d) => d.summary).filter((s): s is NonNullable<typeof s> => Boolean(s));
  const restTotal = monthSummaries.reduce((sum, s) => sum + s.rest_minutes, 0);
  // Leave days need no entry (W6): they count once someone enters them.
  const expected = model.days.filter((d) => d.day.state !== 'not_expected' && d.day.state !== 'leave').length;
  const entered = model.days.filter((d) => d.restMinutes !== null && d.day.state !== 'not_expected').length;
  const breaches = wr.compliance.non_conformities;
  const serious = breaches.filter((b) => b.is_serious).length;
  const nearLimit = model.days.filter((d) => d.day.warning).length;
  const todayInMonth = today.startsWith(monthKey(year, month));
  const restRecords: DailyRecord[] = [...(monthData.data?.context ?? []), ...records];

  const selectedDay = place.day ? model.days.find((d) => d.date === place.day) ?? null : null;

  const monthNav = (
    <div className="flex items-center gap-1" role="group" aria-label="Month">
      <Button type="button" variant="outline" size="icon" onClick={() => shiftMonth(-1)} aria-label="Previous month">
        <ChevronLeft aria-hidden="true" />
      </Button>
      <span className="min-w-[9.5rem] text-center type-body font-medium tabular-nums" aria-live="polite">
        {title}
      </span>
      <Button type="button" variant="outline" size="icon" onClick={() => shiftMonth(1)} aria-label="Next month">
        <ChevronRight aria-hidden="true" />
      </Button>
    </div>
  );
  const moreMenu =
    canExport || boardPath || ownMonthPath ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" aria-label="More">
            <MoreHorizontal aria-hidden="true" />
            <span className="hidden sm:inline">More</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canExport ? (
            <>
              <DropdownMenuItem onSelect={() => void exportMonth('pdf')}>
                <FileText aria-hidden="true" className="mr-2 h-4 w-4" />
                Download PDF
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void exportMonth('csv')}>
                <Download aria-hidden="true" className="mr-2 h-4 w-4" />
                Download CSV
              </DropdownMenuItem>
            </>
          ) : null}
          {boardPath ? (
            <DropdownMenuItem asChild>
              <Link to={boardPath}>
                <SquareKanban aria-hidden="true" className="mr-2 h-4 w-4" />
                Vessel hours of rest
              </Link>
            </DropdownMenuItem>
          ) : null}
          {ownMonthPath ? (
            <DropdownMenuItem asChild>
              <Link to={ownMonthPath}>
                <CalendarDays aria-hidden="true" className="mr-2 h-4 w-4" />
                Open in My hours of rest
              </Link>
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

  const actions = (
    <div className="flex flex-wrap items-center gap-2" data-hor-toolbar="">
      {monthNav}
      {moreMenu}
    </div>
  );
  const description = [subject.detail, vessel.name].filter(Boolean).join(' · ');

  return (
    // On phones the month comes before the figures (T-143: the month is what the page opens on).
    <div className="flex min-w-0 flex-col gap-4" data-hor-month={monthKey(year, month)} data-hor-scope={scope}>
      {scope === 'personal' ? (
        <PageHeader title="Hours of rest" description={`${subject.name}${description ? ` · ${description}` : ''}`} actions={actions} className="mb-0" />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 className="type-title text-foreground">Hours of rest</h2>
          {actions}
        </div>
      )}
      {headerExtra}

      <div className="flex flex-wrap items-center gap-2">
        <StatusPill domain="work_rest_submission" status={submission.status} size="md" />
        {todayInMonth && model.days.some((d) => d.date === today && d.day.state !== 'not_expected') ? (
          <RestNeededChip records={restRecords} today={today} ruleSet={wr.ruleSet} />
        ) : null}
      </div>

      {!model.inMonth ? (
        <PageEmpty
          bordered
          title={`No assignment to ${vessel.name} in ${title}`}
          body={isOwn ? 'Days are expected only while you are assigned to the vessel. Hours of rest for another vessel are kept on that vessel.' : 'Days are expected only while the crew member is assigned to the vessel.'}
        />
      ) : null}

      <div className="order-1 grid grid-cols-2 gap-3 lg:order-none lg:grid-cols-4" data-hor-kpis="">
        <KpiTile label="Rest this month" icon={CalendarDays} value={entered ? hoursText(restTotal) : null} unit="h" sub={`${entered} ${entered === 1 ? 'day' : 'days'} entered`} />
        <KpiTile
          label="Days entered"
          icon={CalendarRange}
          value={`${entered} of ${expected}`}
          textValue
          tone={missing > 0 ? 'warn' : undefined}
          sub={missing > 0 ? `${missing} expected ${missing === 1 ? 'day has' : 'days have'} no entry` : 'Every expected day so far'}
        />
        <KpiTile
          label="Breaches"
          value={breaches.length}
          tone={serious > 0 ? 'danger' : breaches.length ? 'orange' : undefined}
          sub={breaches.length ? `${serious} serious` : undefined}
          zeroLabel="No breaches"
        />
        <KpiTile label="Near the limit" value={nearLimit} tone={nearLimit ? 'warn' : undefined} sub={nearLimit ? 'Days within the warning margin' : undefined} zeroLabel="No days near the limit" />
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
            <ViewToggle value={place.view} onChange={setView} />
            {editableDays.length ? (
              <Button type="button" variant="outline" onClick={() => setFillOpen(true)} data-hor-fill="">
                <Copy aria-hidden="true" />
                Fill days
              </Button>
            ) : null}
          </CardHeader>
          {wr.isDirty ? (
            <div
              role="region"
              aria-label="Unsaved changes"
              className="mx-4 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/40 bg-signal-muted px-3 py-2 sm:mx-6"
              data-hor-save-bar=""
            >
              <span className="type-body-sm text-foreground">
                {unsaved ? `${unsaved} ${unsaved === 1 ? 'day' : 'days'} changed, not saved yet` : 'Changes not saved yet'}
              </span>
              <span className="flex items-center gap-2">
                <Button type="button" variant="ghost" onClick={onDiscard} disabled={wr.saving}>
                  <Undo2 aria-hidden="true" />
                  Discard
                </Button>
                <Button type="button" onClick={() => void save()} disabled={wr.saving}>
                  {wr.saving ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Save aria-hidden="true" />}
                  Save
                </Button>
              </span>
            </div>
          ) : null}
          <CardContent className="min-w-0">
            {place.view === 'month' ? (
              <MonthCalendar title={title} days={model.days as MonthCalendarDay[]} today={today} selected={null} onOpenDay={openDay} />
            ) : place.view === 'week' ? (
              <WeekView
                title={`Week of ${shortDay(shiftDay(place.day ?? from, -weekdayOf(place.day ?? from)))}`}
                days={weekOf(model.days, place.day ?? from) as WeekViewDay[]}
                onChangeDay={changeDay}
                onOpenDay={openDay}
                onPrevWeek={() => shiftWeek(-1)}
                onNextWeek={() => shiftWeek(1)}
                today={today}
              />
            ) : selectedDay ? (
              <DayEditor
                day={selectedDay}
                today={today}
                breaches={breaches.filter((b) => b.breach_day === selectedDay.date)}
                restNeeded={selectedDay.date === today ? <RestNeededChip records={restRecords} today={today} ruleSet={wr.ruleSet} /> : null}
                onChange={(blocks) => changeDay(selectedDay.date, blocks)}
                onPrev={() => shiftDayBy(-1)}
                onNext={() => shiftDayBy(1)}
              />
            ) : null}
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-4">
          <SignOffPanel
            vesselId={vessel.id}
            vesselName={vessel.name}
            crewUserId={subject.userId}
            crewName={subject.name}
            year={year}
            month={month}
            monthLabel={title}
            submission={submission}
            signatures={wr.signatures}
            nonConformities={wr.nonConformities}
            actorId={actorId}
            isOwn={isOwn}
            sameDepartment={model.sameDepartment}
            inMonth={model.inMonth}
            stillAboard={model.stillAboard}
            hodStep={ctx?.hodStep ?? 'nudge'}
            missingDays={missing}
            unsavedDays={unsaved}
            onChanged={() => wr.refresh()}
          />
          <NonConformityList
            ncs={wr.nonConformities}
            onRefresh={() => void wr.refresh()}
            canReview={!isOwn && (canFinalApprove || (canApprove && model.sameDepartment))}
            actorId={actorId}
            actorRole={null}
          />
          <AuditLogPanel submissionId={submission.id} />
        </div>
      </div>


      {fillOpen ? (
        <FillDaysDialog
          open
          onOpenChange={setFillOpen}
          days={fillDays}
          blocksOn={blocksOn}
          defaultFrom={
            place.day && editableDays.some((d) => d.date === place.day)
              ? place.day
              : (editableDays.find((d) => d.restMinutes === null) ?? editableDays[0])?.date ?? from
          }
          defaultTo={todayInMonth && editableDays.some((d) => d.date === today) ? today : editableDays[editableDays.length - 1]?.date ?? to}
          onFill={onFill}
        />
      ) : null}

      <AlertDialog open={pending !== null} onOpenChange={(open) => (open ? undefined : setPending(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save the changed days?</AlertDialogTitle>
            <AlertDialogDescription>
              {unsaved} {unsaved === 1 ? 'day' : 'days'} of {title} {unsaved === 1 ? 'is' : 'are'} not saved yet. Leaving the month drops them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const next = pending;
                setPending(null);
                next?.();
              }}
            >
              Leave without saving
            </Button>
            <AlertDialogAction
              onClick={async (e) => {
                e.preventDefault();
                const next = pending;
                if (await save()) {
                  setPending(null);
                  next?.();
                }
              }}
            >
              Save and go on
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

/** Why a day is not expected, in words. */
const NOT_EXPECTED_TEXT = {
  hor_off: 'Hours of rest is off on this vessel.',
  before_start: 'Before hours of rest started on this vessel.',
  not_assigned: 'Not assigned to this vessel that day.',
  future: 'Still to come.',
} as const;

const STATUS_WORD: Readonly<Record<string, string>> = {
  submitted: 'submitted',
  hod_signed: 'signed by the head of department',
  approved: 'approved',
  locked: 'locked',
};
const statusWord = (s: string) => STATUS_WORD[s] ?? s;

/** A day on screen differs from what is saved. */
function isEdited(onScreen: DailyRecord | undefined, saved: readonly DailyRecord[] | undefined): boolean {
  if (!onScreen) return false;
  const stored = saved?.find((r) => r.record_date === onScreen.record_date);
  if (!stored) return true;
  const key = (blocks: readonly WorkRestBlock[]) =>
    blocks
      .filter((b) => b.block_type === 'work')
      .map((b) => `${b.start_minute}-${b.end_minute}-${b.category ?? ''}-${b.notes ?? ''}`)
      .sort()
      .join('|');
  return key(onScreen.blocks) !== key(stored.blocks) || (onScreen.notes ?? null) !== (stored.notes ?? null);
}

/** The days of the month in the week (Monday to Sunday) of `anchor`. */
function weekOf<T extends { date: string }>(days: readonly T[], anchor: string): T[] {
  const monday = shiftDay(anchor, -weekdayOf(anchor));
  const sunday = shiftDay(monday, 6);
  return days.filter((d) => d.date >= monday && d.date <= sunday);
}

const ViewToggle: React.FC<{ value: View; onChange: (view: View) => void }> = ({ value, onChange }) => (
  <div role="group" aria-label="View" className="inline-flex shrink-0 rounded-md border border-input bg-card p-0.5">
    {(
      [
        ['month', 'Month'],
        ['week', 'Week'],
        ['day', 'Day'],
      ] as const
    ).map(([v, label]) => (
      <button
        key={v}
        type="button"
        aria-pressed={value === v}
        onClick={() => onChange(v)}
        className={cn(
          'focus-ring inline-flex h-8 items-center whitespace-nowrap rounded-sm px-3 text-xs font-medium transition-colors duration-quick [@media(pointer:coarse)]:h-11',
          value === v ? 'bg-signal-muted text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )}
      >
        {label}
      </button>
    ))}
  </div>
);

type EditorDay = WeekViewDay & { summary?: { rest_period_count: number; longest_rest_minutes: number } };

const DayEditor: React.FC<{
  day: EditorDay;
  today: string;
  breaches: ReadonlyArray<{ rule_description: string; severity: string; is_serious?: boolean; deficit_hours?: number | null }>;
  restNeeded: React.ReactNode;
  onChange: (blocks: WorkRestBlock[]) => void;
  onPrev: () => void;
  onNext: () => void;
}> = ({ day, breaches, restNeeded, onChange, onPrev, onNext }) => (
  <section aria-label={day.label} className="min-w-0 space-y-4" data-day-editor={day.date}>
    <div className="flex items-center gap-2">
      <h3 className="min-w-0 flex-1 truncate type-subtitle text-foreground">{day.label}</h3>
      <span className="flex shrink-0 items-center gap-1">
        <Button type="button" variant="outline" size="icon" onClick={onPrev} aria-label="Previous day">
          <ChevronLeft aria-hidden="true" />
        </Button>
        <Button type="button" variant="outline" size="icon" onClick={onNext} aria-label="Next day">
          <ChevronRight aria-hidden="true" />
        </Button>
      </span>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <StatusPill domain="hor_day" status={day.day.state} />
      {day.day.breach ? <StatusPill domain="hor_day" status="breach" /> : day.day.warning ? <StatusPill domain="hor_day" status="warning" /> : null}
      {day.dirty ? <StatusPill tone="signal">Not saved yet</StatusPill> : null}
      {day.summary && day.restMinutes !== null ? (
        <span className="type-body-sm text-muted-foreground">
          {day.summary.rest_period_count} rest {day.summary.rest_period_count === 1 ? 'period' : 'periods'} · longest {hoursText(day.summary.longest_rest_minutes)} h
        </span>
      ) : null}
      {restNeeded}
    </div>
    <DayTimeline
      date={day.date}
      label={day.label}
      blocks={day.blocks}
      onChange={onChange}
      disabled={!day.editable}
      disabledReason={day.lockedReason}
      showPeriods
      showHelp={day.editable}
    />
    {breaches.length ? (
      <div className="space-y-1.5" aria-label="Breaches on this day">
        {breaches.map((b, i) => (
          <p key={i} className="flex items-start gap-2 rounded-md border border-critical/40 bg-critical-muted px-3 py-2 type-body-sm text-foreground">
            <StatusPill tone={b.is_serious ? 'danger' : 'orange'}>{b.is_serious ? 'Serious' : b.severity === 'low' ? 'Minor' : 'Breach'}</StatusPill>
            <span>
              {b.rule_description}
              {b.deficit_hours ? ` Short by ${hoursText(Math.round(b.deficit_hours * 60))} h.` : ''}
            </span>
          </p>
        ))}
      </div>
    ) : null}
  </section>
);

// ---------------------------------------------------------------- the personal page

type ProfileRow = { id: string; user_id: string | null; first_name: string | null; last_name: string | null; preferred_name: string | null; position: string | null; rank: string | null; department: string | null };

/** Which vessel the month is for (D-X1-20): the one asked for, the one selected, the current one, else the latest. */
function chooseVessel(
  assignments: readonly AssignmentRow[],
  from: string,
  to: string,
  opts: { asked: string | null; selected: string | null; codeOf: (id: string) => string | null },
): { vesselId: string | null; candidates: string[] } {
  const inMonth = assignments.filter((a) => overlaps(spanOf(a), from, to)).sort((a, b) => (b.join_date ?? '').localeCompare(a.join_date ?? ''));
  const candidates = Array.from(new Set(inMonth.map((a) => a.vessel_id)));
  const asked = opts.asked ? candidates.find((id) => (opts.codeOf(id) ?? '').toLowerCase() === opts.asked?.toLowerCase() || id === opts.asked) : undefined;
  if (asked) return { vesselId: asked, candidates };
  if (opts.selected && candidates.includes(opts.selected)) return { vesselId: opts.selected, candidates };
  const current = assignments.find((a) => a.is_current)?.vessel_id ?? null;
  if (current && candidates.includes(current)) return { vesselId: current, candidates };
  if (candidates[0]) return { vesselId: candidates[0], candidates };
  return { vesselId: opts.selected ?? current, candidates };
}

const PersonalMonth: React.FC<{ subjectId: string; isOwn: boolean }> = ({ subjectId, isOwn }) => {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { selectedVessel, vessels, getVesselCodeById } = useVessel();
  const [params, setParams] = useSearchParams();
  const others = useCapability(CREW_CAPS.horView);
  const place = placeFrom(params, localIsoDate());
  const { from, to } = monthRange(place.year, place.month);

  const person = useQuery({
    queryKey: [...workRestKeys.all, 'company', companyId, 'person', subjectId],
    queryFn: async () => {
      const [p, a] = await Promise.all([
        supabase.from('profiles').select('id, user_id, first_name, last_name, preferred_name, position, rank, department').eq('user_id', subjectId).maybeSingle(),
        supabase.from('crew_assignments').select(ASSIGNMENT_COLUMNS).eq('user_id', subjectId),
      ]);
      if (p.error) throw p.error;
      if (a.error) throw a.error;
      return { profile: (p.data ?? null) as ProfileRow | null, assignments: (a.data ?? []) as AssignmentRow[] };
    },
    enabled: Boolean(subjectId) && (isOwn || others.allowed),
    staleTime: 60_000,
    retry: 1,
  });

  if (!isOwn) {
    if (others.status === 'loading') return <PageLoading variant="detail" label="Loading hours…" />;
    if (!others.allowed) {
      return (
        <AccessDenied
          title="You can't see this month"
          detail="Hours of rest of others need hours of rest access on their vessel. Ask your fleet manager for it."
          backTo={{ to: '/me/hours-of-rest', label: 'My hours of rest' }}
        />
      );
    }
  }
  if (person.error) {
    return <PageError title="Your hours of rest could not load" error={person.error} onRetry={() => void person.refetch()} treatMissingAsOff={false} headingLevel={1} />;
  }
  if (!person.data) return <PageLoading variant="detail" label="Loading hours…" />;

  const choice = chooseVessel(person.data.assignments, from, to, {
    asked: params.get('vessel'),
    selected: selectedVessel?.id ?? null,
    codeOf: (id) => getVesselCodeById(id),
  });
  const nameOf = (id: string) => vessels.find((v) => v.id === id)?.name ?? 'Vessel';

  if (!choice.vesselId) {
    return (
      <div className="min-w-0">
        <PageHeader title="Hours of rest" />
        <PageEmpty
          bordered
          title="No vessel to log hours against"
          body="Hours of rest are kept per vessel. Once you are assigned to a vessel, or choose one in the top bar, your month opens here."
        />
      </div>
    );
  }

  const p = person.data.profile;
  const first = (p?.preferred_name ?? '').trim() || (p?.first_name ?? '').trim();
  const subject: HorMonthSubject = {
    userId: subjectId,
    firstName: p?.first_name ?? '',
    lastName: p?.last_name ?? '',
    name: [first, (p?.last_name ?? '').trim()].filter(Boolean).join(' ') || (isOwn ? 'You' : 'Crew member'),
    detail: [((p?.position ?? '').trim() || (p?.rank ?? '').trim()) || null, (p?.department ?? '').trim() || null].filter(Boolean).join(' · ') || null,
  };
  const vesselId = choice.vesselId;
  const vessel = { id: vesselId, name: nameOf(vesselId), code: getVesselCodeById(vesselId) };

  const picker =
    choice.candidates.length > 1 ? (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border bg-card px-3 py-2" data-hor-vessel-choice="">
        <Ship aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
        <span className="type-body-sm text-foreground">
          {isOwn ? 'You were' : 'They were'} on {choice.candidates.length} vessels in {monthTitle(place.year, place.month)}. Each vessel keeps its own month.
        </span>
        <div role="group" aria-label="Vessel" className="inline-flex rounded-md border border-input p-0.5">
          {choice.candidates.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={id === vesselId}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('vessel', (getVesselCodeById(id) ?? id).toLowerCase());
                setParams(next);
              }}
              className={cn(
                'focus-ring inline-flex h-8 items-center rounded-sm px-3 text-xs font-medium [@media(pointer:coarse)]:h-11',
                id === vesselId ? 'bg-signal-muted text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {nameOf(id)}
            </button>
          ))}
        </div>
      </div>
    ) : null;

  return (
    <PersonalHorGate vesselId={vesselId} vesselName={vessel.name}>
      <HorMonthView scope="personal" vessel={vessel} subject={subject} isOwn={isOwn} headerExtra={picker} />
    </PersonalHorGate>
  );
};

/**
 * The page: the signed-in person's month at /me/hours-of-rest (the legacy
 * /crew/work-rest and /crew/work-rest/:crewId render it in place when there
 * is no vessel to land on, so it keeps its idempotent DashboardLayout).
 */
const MyWorkRestMonth: React.FC = () => {
  const { user, loading } = useAuth();
  const params = useParams<{ crewId?: string }>();
  const subjectId = params.crewId || user?.id || '';
  const isOwn = !params.crewId || params.crewId === user?.id;

  return (
    <DashboardLayout>
      {loading ? (
        <PageLoading variant="detail" label="Loading hours…" />
      ) : !user || !subjectId ? (
        <PageEmpty title="Sign in to see your hours of rest" body="Hours of rest are kept against your STORM sign-in." />
      ) : (
        <PersonalMonth key={subjectId} subjectId={subjectId} isOwn={isOwn} />
      )}
    </DashboardLayout>
  );
};

export default MyWorkRestMonth;

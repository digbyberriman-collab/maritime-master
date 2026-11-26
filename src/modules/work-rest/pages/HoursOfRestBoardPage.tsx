/**
 * The vessel's hours-of-rest board (gap/04 C40-C43, C45; T-144; X1-08) at
 * crew/hours-of-rest: one card per person assigned to the vessel on any day
 * of the month (ended and transferred-out people included), for the people
 * who approve hours of rest on board.
 *
 * URL: `?month=YYYY-MM` (the legacy `?year=&month=` too; the vessel's
 * current month by default), `?dept=` (a department tab), `?queue=` (Ready
 * for you, Waiting on crew, Approved, On leave), `?all=1` (Show all
 * calendars) and `?breaches=open|all` (the breach review panel).
 *
 * Gate: vessel.crew.hours_of_rest.approve on the route vessel (the route
 * guard checks the key too). Nothing is read while it loads; without it the
 * page says the board is for approvers and links to the viewer's own month
 * (/me/hours-of-rest). The server gates every read and write again.
 *
 * D-01: while work_rest_vessel_board is missing, the legacy overview under
 * an info strip; any other error is an error with Try again (a 42501 from
 * the server reads as no access). A month wholly before the vessel's Hours
 * of Rest start date says "Hours of rest starts on <date>" (C45).
 */
import React, { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BellRing, CalendarClock, Info, ShieldAlert, UserRound, Users } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import PageHeader from '@/shared/components/layout/PageHeader';
import { AccessDenied, EmptyState, PageEmpty, PageError, PageLoading } from '@/shared/components/states';
import { notify } from '@/shared/lib/notify';
import { useCapability } from '@/lib/permissions/useCan';
import { useScope } from '@/app/router/scopeContext';
import { useScopedPath } from '@/app/router/scopes';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { CREW_CAPS, CREW_ROOT } from '@/modules/crew/paths';
import {
  boardStartNotice,
  departmentGroups,
  departmentTabs,
  filterMembers,
  isBoardQueue,
  longDate,
  monthLabel,
  monthOf,
  monthParam,
  parseBreachFilter,
  parseMonthParam,
  queueCounts,
  remindableWaiting,
  shiftMonth,
  type BoardMember,
  type BoardQueue,
  type BoardViewer,
  type BreachFilter,
  type VesselBoard,
  type YearMonth,
} from '../lib/horBoard';
import { boardErrorText, useRemindCrew, useVesselBoard } from '../hooks/useVesselBoard';
import { WorkRestRefusal } from '../services/workRestService';
import { WorkRestOverviewBody } from './WorkRestOverview';
import { MonthNav } from '../components/hor-board/MonthNav';
import { DepartmentTabs } from '../components/hor-board/DepartmentTabs';
import { QueueChips } from '../components/hor-board/QueueChips';
import { BoardLegend } from '../components/hor-board/BoardLegend';
import { CrewMonthCard } from '../components/hor-board/CrewMonthCard';
import { BreachReviewPanel } from '../components/hor-board/BreachReviewPanel';

const MY_HOURS = '/me/hours-of-rest';

const BoardDenied: React.FC<{ headingLevel?: 1 | 2 }> = ({ headingLevel = 1 }) => (
  <AccessDenied
    title="The hours of rest board is for approvers"
    detail="Signing and approving the crew's hours of rest on this vessel needs hours of rest approval. Your own month is in My hours of rest."
    backTo={{ to: MY_HOURS, label: 'Open my hours of rest' }}
    headingLevel={headingLevel}
  />
);

const HoursOfRestBoardPage: React.FC = () => {
  const scope = useScope();
  const vessel = scope.scope === 'vessel' ? scope.vessel ?? null : null;
  const gate = useCapability(CREW_CAPS.horApprove, { vesselId: vessel?.id ?? null });

  if (!vessel) return <PageEmpty title="Choose a vessel" body="Hours of rest belong to a vessel. Open the board from a vessel's Crew tab." />;
  if (gate.status === 'loading') return <PageLoading variant="cards" rows={6} label="Checking your access" />;
  if (!gate.allowed) return <BoardDenied />;
  return <BoardBody key={vessel.id} vesselId={vessel.id} vesselName={vessel.name} />;
};

const browserMonth = (): YearMonth => {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
};

const BoardBody: React.FC<{ vesselId: string; vesselName: string }> = ({ vesselId, vesselName }) => {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const viewer: BoardViewer = useMemo(() => ({ userId: user?.id ?? null }), [user?.id]);
  const requested = parseMonthParam(params.get('month'), params.get('year'));
  const place = requested ?? browserMonth();
  const query = useVesselBoard({ vesselId, year: place.year, month: place.month });
  const board = query.data?.applied ? query.data.data : null;
  const current = board ? monthOf(board.today) : browserMonth();
  // The month on screen is the one the server answered for (it echoes the month asked).
  const shown: YearMonth = board ? { year: board.year, month: board.month } : place;

  /** Sets or clears URL parameters, keeping the others; a month always goes as ?month=YYYY-MM. */
  const update = (patch: Readonly<Record<string, string | null>>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    if ('month' in patch) next.delete('year');
    setParams(next);
  };
  const goTo = (m: YearMonth) => update({ month: monthParam(m) });
  const breachCount = board ? board.members.reduce((n, m) => n + m.counts.unreviewed + m.counts.awaitingCorrection, 0) : 0;

  const header = (
    <PageHeader
      eyebrow={vesselName}
      title="Hours of rest"
      description="Each crew member's month on board: what is ready for you, who still has to submit, and the breaches to review."
      actions={
        <>
          {board ? (
            <Button type="button" variant="outline" size="sm" className="[@media(pointer:coarse)]:h-11" onClick={() => update({ breaches: 'open' })} data-open-breaches="">
              <ShieldAlert aria-hidden="true" />
              {breachCount > 0 ? `Breaches to review (${breachCount})` : 'Breaches'}
            </Button>
          ) : null}
          <Button asChild variant="outline" size="sm" className="[@media(pointer:coarse)]:h-11">
            <Link to={MY_HOURS}>
              <UserRound aria-hidden="true" />
              My hours
            </Link>
          </Button>
        </>
      }
    />
  );

  let content: React.ReactNode;
  if (query.isLoading) {
    content = <PageLoading variant="cards" rows={6} label="Loading the board" />;
  } else if (query.error) {
    const e = query.error;
    if (e instanceof WorkRestRefusal && e.code === '42501') content = <BoardDenied headingLevel={2} />;
    else if (e instanceof WorkRestRefusal && e.refusal === 'month_in_future') {
      content = (
        <PageEmpty
          icon={CalendarClock}
          title={`${monthLabel(place)} has not started on board yet`}
          body="The board shows months up to the vessel's current one."
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => goTo(shiftMonth(place, -1))}>
              Show {monthLabel(shiftMonth(place, -1))}
            </Button>
          }
          headingLevel={2}
        />
      );
    } else content = <PageError error={e} title="The board could not load" onRetry={() => void query.refetch()} headingLevel={2} />;
  } else if (query.data && !query.data.applied) {
    content = (
      <div className="space-y-4" data-hor-board-fallback="">
        <Alert variant="info">
          <Info aria-hidden="true" className="h-4 w-4" />
          <AlertDescription>
            The new hours of rest board is not set up on this database yet, so this is the earlier overview. Reminders, breach review and the month's
            sign-off from the board come with the update.
          </AlertDescription>
        </Alert>
        <WorkRestOverviewBody vesselId={vesselId} year={place.year} month={place.month} />
      </div>
    );
  } else if (board) {
    content = <Board board={board} viewer={viewer} vesselName={vesselName} params={params} update={update} goTo={goTo} />;
  }

  return (
    <div className="min-w-0 space-y-4" data-hor-board={board ? 'board' : query.data && !query.data.applied ? 'fallback' : 'loading'}>
      {header}
      <MonthNav value={shown} current={current} onChange={goTo} />
      {content}
      {board ? (
        <BreachReviewPanel
          vesselId={vesselId}
          vesselName={vesselName}
          year={board.year}
          month={board.month}
          from={board.firstDay}
          to={board.lastDay}
          filter={parseBreachFilter(params.get('breaches'))}
          onFilterChange={(f: BreachFilter | null) => update({ breaches: f })}
        />
      ) : null}
    </div>
  );
};

interface BoardProps {
  board: VesselBoard;
  viewer: BoardViewer;
  vesselName: string;
  params: URLSearchParams;
  update: (patch: Readonly<Record<string, string | null>>) => void;
  goTo: (m: YearMonth) => void;
}

const Board: React.FC<BoardProps> = ({ board, viewer, vesselName, params, update, goTo }) => {
  const scoped = useScopedPath();
  const remind = useRemindCrew(board.vesselId);
  const tabs = useMemo(() => departmentTabs(board.members), [board.members]);
  const deptParam = params.get('dept');
  const dept = tabs.some((t) => t.key === deptParam) ? (deptParam as string) : 'all';
  const queueParam = params.get('queue');
  const queue: BoardQueue | null = isBoardQueue(queueParam) ? queueParam : null;
  const showAll = params.get('all') === '1';
  const deptMembers = useMemo(() => filterMembers(board.members, { dept, queue: null }, board, viewer), [board, dept, viewer]);
  const counts = useMemo(() => queueCounts(deptMembers, board, viewer), [deptMembers, board, viewer]);
  const shown = useMemo(() => filterMembers(deptMembers, { dept: null, queue }, board, viewer), [deptMembers, queue, board, viewer]);
  const remindable = useMemo(() => remindableWaiting(deptMembers, board, viewer), [deptMembers, board, viewer]);
  const month = monthParam(board);
  const monthHref = (member: BoardMember, day?: string) =>
    `${scoped(`${CREW_ROOT}/people/${member.profileId}/hours-of-rest`)}?month=${month}${day ? `&day=${day}` : ''}`;

  const notice = boardStartNotice(board);
  if (notice?.kind === 'off') {
    return <EmptyState kind="not-enabled" icon={CalendarClock} title="Hours of rest is off on this vessel" body="An administrator can switch it on in the vessel's module settings." headingLevel={2} />;
  }
  if (notice?.kind === 'before_start') {
    const start = monthOf(notice.from);
    return (
      <EmptyState
        icon={CalendarClock}
        title={`Hours of rest starts on ${longDate(notice.from)}`}
        body="Days before that are not expected on this vessel, so there is nothing to enter or approve this month."
        action={
          <Button type="button" variant="outline" size="sm" onClick={() => goTo(start)}>
            Go to {monthLabel(start)}
          </Button>
        }
        headingLevel={2}
        data-hor-start={notice.from}
      />
    );
  }

  const remindAll = async () => {
    try {
      const out = await remind.mutateAsync({ crewIds: remindable.map((m) => m.userId), year: board.year, month: board.month });
      if (out.sent > 0) notify.success(out.sent === 1 ? 'Reminder sent to 1 crew member' : `Reminders sent to ${out.sent} crew members`);
      if (out.skipped.length) notify.info(`${out.skipped.length} not reminded: already reminded today or already submitted.`);
    } catch (e) {
      notify.error(boardErrorText(e), { title: 'The reminders were not sent' });
    }
  };

  const card = (m: BoardMember) => (
    <CrewMonthCard
      key={m.userId}
      member={m}
      board={board}
      viewer={viewer}
      vesselName={vesselName}
      showCalendar={showAll}
      monthHref={monthHref}
      onReviewBreaches={() => update({ breaches: 'open' })}
    />
  );
  const grid = 'grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3';
  const partialStart = board.hor.from && board.hor.from > board.firstDay ? board.hor.from : null;

  return (
    <div className="min-w-0 space-y-4" data-hor-board-body="">
      {partialStart ? (
        <Alert variant="info" data-hor-start={partialStart}>
          <CalendarClock aria-hidden="true" className="h-4 w-4" />
          <AlertDescription>Hours of rest starts on {longDate(partialStart)}. Days before it are not expected.</AlertDescription>
        </Alert>
      ) : null}
      {tabs.length > 2 ? <DepartmentTabs tabs={tabs} value={dept} onChange={(key) => update({ dept: key === 'all' ? null : key })} /> : null}
      <QueueChips counts={counts} value={queue} onChange={(q) => update({ queue: q })}>
        {queue === 'waiting' && remindable.length > 0 ? (
          <Button type="button" variant="outline" size="sm" className="[@media(pointer:coarse)]:h-11" disabled={remind.isPending} onClick={remindAll}>
            <BellRing aria-hidden="true" />
            {remind.isPending ? 'Sending…' : `Remind all waiting (${remindable.length})`}
          </Button>
        ) : null}
      </QueueChips>
      <BoardLegend showAll={showAll} onShowAllChange={(on) => update({ all: on ? '1' : null })} />
      {!board.members.length ? (
        <PageEmpty icon={Users} title="Nobody on board this month" body={`No one was assigned to ${vesselName} in ${monthLabel(board)}.`} headingLevel={2} bordered />
      ) : !shown.length ? (
        <PageEmpty filtered title="Nobody here" body="No month on the board matches this department and queue." onClearFilters={() => update({ queue: null, dept: null })} headingLevel={2} bordered />
      ) : dept === 'all' ? (
        departmentGroups(shown).map((g) => (
          <section key={g.key} aria-labelledby={`hor-dept-${g.key}`} className="min-w-0 space-y-2" data-dept-group={g.key}>
            <h2 id={`hor-dept-${g.key}`} className="type-eyebrow text-muted-foreground">
              {g.label} <span className="tabular-nums">({g.members.length})</span>
            </h2>
            <div className={grid}>{g.members.map(card)}</div>
          </section>
        ))
      ) : (
        <div className={grid}>{shown.map(card)}</div>
      )}
    </div>
  );
};

export default HoursOfRestBoardPage;

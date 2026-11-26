/**
 * One crew member's month on the vessel board (gap/04 C40, C41, C43; T-144).
 *
 * The card names the person (a link to their month on their profile),
 * their position and department, the month's status, and badges for what
 * needs attention: Former crew (no assignment today or to come), submitted
 * on their behalf, a serious breach still open, a correction requested.
 * Under them, the month in figures and the days: a one-line strip of the
 * month by default, the mini calendar (lib/horDay.ts states, each day a
 * link to that day) when the card is opened or "Show all calendars" is on.
 *
 * The status menu offers the month's sign-off steps the viewer could take
 * (lib/horBoard.ts menuItems: who-refusals hidden, blocked steps disabled
 * with their sentence); Remind sits in the footer with the last reminder,
 * or, for someone who has left with the month still open, "Has left the
 * vessel. Submit on their behalf" for the final approver. Someone on leave
 * every expected day is one collapsed line until opened.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, MoreHorizontal, TreePalm, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TONE_FILL, TONE_TEXT } from '@/components/ui/tones';
import { cn } from '@/lib/utils';
import { StatusPill } from '@/shared/components/status';
import { statusMeta } from '@/shared/components/status/statusTone';
import {
  canSubmitOnBehalf,
  displayName,
  memberDays,
  memberMonthState,
  memberQueue,
  menuItems,
  MONTH_NAMES,
  positionLabel,
  type BoardDay,
  type BoardMember,
  type BoardViewer,
  type VesselBoard,
} from '../../lib/horBoard';
import { DayIcon } from './BoardLegend';
import { MonthStepDialog, type BoardStep } from './OnBehalfDialog';
import { RemindButton } from './RemindButton';

export interface CrewMonthCardProps {
  member: BoardMember;
  board: VesselBoard;
  viewer: BoardViewer;
  vesselName: string;
  /** "Show all calendars" is on. */
  showCalendar: boolean;
  /** The person's month (or one day of it) on their profile. */
  monthHref: (member: BoardMember, day?: string) => string;
  /** Opens the breach review on this month. */
  onReviewBreaches?: () => void;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const weekdayIndex = (date: string): number => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
const dayName = (date: string) => `${WEEKDAY_NAMES[weekdayIndex(date)]} ${Number(date.slice(8, 10))} ${MONTH_NAMES[Number(date.slice(5, 7)) - 1]}`;
const plural = (n: number, one: string, other = `${one}s`) => `${n} ${n === 1 ? one : other}`;

/** The words of a day: its state and overlay. */
function dayWords(d: BoardDay): string {
  const parts = [statusMeta('hor_day', d.day.state).label];
  if (d.day.breach) parts.push('breach');
  else if (d.day.warning) parts.push('near the limit');
  return parts.join(', ');
}

/** The tone a day reads as: the overlay first. */
const dayTone = (d: BoardDay) => statusMeta('hor_day', d.day.breach ? 'breach' : d.day.warning ? 'warning' : d.day.state).tone;

/** The month as one line of days (decorative; the figures above say the same in words). */
const DayStrip: React.FC<{ days: readonly BoardDay[] }> = ({ days }) => (
  <div aria-hidden="true" className="flex h-2.5 w-full gap-px" data-day-strip="">
    {days.map((d) => (
      <span
        key={d.date}
        data-state={d.day.breach ? 'breach' : d.day.warning ? 'warning' : d.day.state}
        className={cn(
          'h-full min-w-0 flex-1 rounded-[2px]',
          d.day.state === 'not_expected' && !d.day.breach ? 'bg-muted' : TONE_FILL[dayTone(d)],
          d.day.state === 'not_entered' && !d.day.breach && !d.day.warning && 'opacity-60',
          d.day.state === 'leave' && 'opacity-40',
        )}
      />
    ))}
  </div>
);

/** The month as a small calendar, Monday first; each day opens that day of the person's month. */
const MiniCalendar: React.FC<{ days: readonly BoardDay[]; today: string; title: string; dayHref: (date: string) => string }> = ({ days, today, title, dayHref }) => {
  const lead = days.length ? weekdayIndex(days[0].date) : 0;
  return (
    <div className="space-y-1" data-mini-calendar="">
      <div aria-hidden="true" className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <span key={w} className="text-center type-caption text-muted-foreground">
            {w.slice(0, 1)}
          </span>
        ))}
      </div>
      <ol aria-label={title} className="grid grid-cols-7 gap-1">
        {Array.from({ length: lead }, (_, i) => (
          <li key={`lead-${i}`} aria-hidden="true" />
        ))}
        {days.map((d) => {
          const tone = dayTone(d);
          const isToday = d.date === today;
          return (
            <li key={d.date} className="min-w-0">
              <Link
                to={dayHref(d.date)}
                aria-label={`${dayName(d.date)}: ${dayWords(d)}`}
                aria-current={isToday ? 'date' : undefined}
                data-day={d.date}
                data-state={d.day.state}
                data-breach={d.day.breach || undefined}
                className={cn(
                  'focus-ring flex h-8 w-full min-w-0 items-center justify-between gap-0.5 rounded-sm border px-1 transition-colors duration-quick [@media(pointer:coarse)]:h-11',
                  d.day.state === 'not_expected' ? 'border-transparent bg-muted/40 text-muted-foreground' : 'border-border bg-card hover:bg-accent',
                  d.day.state === 'not_entered' && 'border-dashed border-warning/60',
                  d.day.state === 'leave' && 'bg-muted/60',
                  d.day.breach && 'border-critical/60 bg-critical-muted',
                  !d.day.breach && d.day.warning && 'border-warning/60 bg-warning-muted',
                )}
              >
                <span className={cn('type-caption tabular-nums', isToday && 'font-semibold text-primary')}>{Number(d.date.slice(8, 10))}</span>
                <DayIcon mark={d.day.breach ? 'breach' : d.day.warning ? 'warning' : d.day.state} className={cn('hidden h-3 w-3 shrink-0 min-[400px]:block', TONE_TEXT[tone])} />
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export const CrewMonthCard: React.FC<CrewMonthCardProps> = ({ member, board, viewer, vesselName, showCalendar, monthHref, onReviewBreaches }) => {
  const [open, setOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [step, setStep] = useState<BoardStep | null>(null);
  const name = displayName(member);
  const state = memberMonthState(member);
  const queue = memberQueue(member, board, viewer);
  const titleId = `hor-card-${member.userId}`;
  const items = menuItems(member, board, viewer);
  const onBehalf = canSubmitOnBehalf(member, board, viewer);
  const days = memberDays(member, board);
  const calendarOpen = showCalendar || open;
  const c = member.counts;
  const monthTitle = `${name}, ${MONTH_NAMES[board.month - 1]} ${board.year}`;
  const subtitle = [positionLabel(member), member.departmentLabel].filter(Boolean).join(' · ');

  const toggleCalendar = () => {
    // Someone on leave all month folds back to their one line.
    if (member.onLeaveAllMonth && open) setLeaveOpen(false);
    setOpen((o) => !o);
  };

  const dialog = step ? (
    <MonthStepDialog step={step} vesselId={board.vesselId} vesselName={vesselName} member={member} year={board.year} month={board.month} onClose={() => setStep(null)} />
  ) : null;

  if (member.onLeaveAllMonth && !leaveOpen) {
    return (
      <article
        aria-labelledby={titleId}
        className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2"
        data-member={member.userId}
        data-queue={queue}
        data-collapsed=""
      >
        <h3 id={titleId} className="min-w-0 truncate type-body font-medium text-foreground">
          {name}
        </h3>
        <span className="min-w-0 truncate type-caption text-muted-foreground">{subtitle}</span>
        <StatusPill domain="hor_day" status="leave" icon={TreePalm} label="On leave all month" className="ml-auto" />
        <Button type="button" variant="ghost" size="sm" className="[@media(pointer:coarse)]:h-11" onClick={() => setLeaveOpen(true)} aria-label={`Show ${name}'s month`}>
          Show
          <ChevronDown aria-hidden="true" />
        </Button>
      </article>
    );
  }

  const facts = [
    c.expected > 0 ? `${c.logged} of ${plural(c.expected, 'day')} logged` : 'No days expected',
    c.missing > 0 && (state === 'draft' || state === 'reopened') ? `${c.missing} not entered` : null,
    c.breachDays > 0 ? plural(c.breachDays, 'breach day') : null,
  ].filter((x): x is string => Boolean(x));

  return (
    <article
      aria-labelledby={titleId}
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-3 shadow-e1"
      data-member={member.userId}
      data-queue={queue}
    >
      <header className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="type-subtitle min-w-0 truncate">
            <Link to={monthHref(member)} className="focus-ring rounded-sm text-foreground hover:text-primary hover:underline">
              {name}
            </Link>
          </h3>
          <p className="min-w-0 truncate type-caption text-muted-foreground">{subtitle}</p>
        </div>
        <StatusPill domain="work_rest_submission" status={member.month.status ?? 'draft'} className="mt-0.5" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="-mr-1 -mt-1 shrink-0" aria-label={`Month actions for ${name}`}>
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72 max-w-[calc(100vw-2rem)]">
            <DropdownMenuLabel className="type-caption text-muted-foreground">{monthTitle}</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link to={monthHref(member)}>Open the month</Link>
            </DropdownMenuItem>
            {items.length ? <DropdownMenuSeparator /> : null}
            {items.map((item) => (
              <DropdownMenuItem
                key={item.action}
                disabled={item.disabledReason !== null}
                onSelect={() => setStep(item.action)}
                className="flex-col items-start gap-0.5"
                data-action={item.action}
              >
                <span>{item.label}</span>
                {item.disabledReason ? <span className="type-caption text-muted-foreground">{item.disabledReason}</span> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {member.formerCrew || member.month.onBehalf || c.seriousOpen > 0 || c.awaitingCorrection > 0 ? (
        <ul aria-label="Attention" className="flex flex-wrap gap-1.5">
          {member.formerCrew ? (
            <li>
              <StatusPill tone="neutral" data-badge="former">Former crew</StatusPill>
            </li>
          ) : null}
          {member.month.onBehalf ? (
            <li>
              <StatusPill tone="info" icon={UserCheck}>Submitted for them</StatusPill>
            </li>
          ) : null}
          {c.seriousOpen > 0 ? (
            <li>
              <StatusPill tone="danger" data-badge="serious">{c.seriousOpen === 1 ? 'Serious breach' : `${c.seriousOpen} serious breaches`}</StatusPill>
            </li>
          ) : null}
          {c.awaitingCorrection > 0 ? (
            <li>
              <StatusPill domain="work_rest_nc" status="correction_requested" />
            </li>
          ) : null}
        </ul>
      ) : null}

      <div className="space-y-2">
        <p className="type-body-sm text-muted-foreground">{facts.join(' · ')}</p>
        {calendarOpen ? (
          <MiniCalendar days={days} today={board.today} title={`Days of ${monthTitle}`} dayHref={(date) => monthHref(member, date)} />
        ) : (
          <DayStrip days={days} />
        )}
      </div>

      <footer className="mt-auto flex flex-wrap items-end justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-end gap-2">
          {onBehalf ? (
            <div className="flex min-w-0 flex-col items-start gap-1" data-on-behalf="">
              <span className="type-caption text-muted-foreground">Has left the vessel.</span>
              <Button type="button" variant="outline" size="sm" className="[@media(pointer:coarse)]:h-11" onClick={() => setStep('submit_on_behalf')}>
                <UserCheck aria-hidden="true" />
                Submit on their behalf
              </Button>
            </div>
          ) : (
            <RemindButton vesselId={board.vesselId} member={member} viewer={viewer} year={board.year} month={board.month} />
          )}
          {c.unreviewed > 0 && onReviewBreaches ? (
            <Button type="button" variant="ghost" size="sm" className="[@media(pointer:coarse)]:h-11" onClick={onReviewBreaches} data-review-breaches="">
              {c.unreviewed === 1 ? 'Review 1 breach' : `Review ${c.unreviewed} breaches`}
            </Button>
          ) : null}
        </div>
        {showCalendar ? null : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="[@media(pointer:coarse)]:h-11"
            aria-expanded={open}
            onClick={toggleCalendar}
          >
            {open ? 'Hide calendar' : 'Show calendar'}
            {open ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
          </Button>
        )}
      </footer>
      {dialog}
    </article>
  );
};

export default CrewMonthCard;

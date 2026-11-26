/**
 * The month at a glance (gap/04 C37, C38, W6; T-143: Hours of rest opens on
 * the month). One cell per day, Monday first, with the day's state from
 * lib/horDay.ts (the `hor_day` vocabulary of the status registry), its rest
 * hours, and the breach or near-limit overlay. Every state has its own icon
 * and is spelled out in the cell's accessible name and in the legend, so
 * nothing depends on colour. A cell opens the day.
 *
 * At phone width the cells keep the day, an icon and the rest hours; the
 * state's word shows from the small breakpoint up.
 */
import React from 'react';
import { AlertOctagon, AlertTriangle, Check, CheckCheck, CircleDashed, Minus, Send, TreePalm, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusPill } from '@/shared/components/status';
import { statusMeta } from '@/shared/components/status/statusTone';
import { TONE_TEXT } from '@/components/ui/tones';
import type { HorDay, HorDayState } from '../lib/horDay';

export interface MonthCalendarDay {
  /** YYYY-MM-DD */
  date: string;
  /** "Saturday 21 November". */
  label: string;
  day: HorDay;
  /** Why the day is not expected, in words; null when it is. */
  reasonText: string | null;
  /** Rest minutes of an entered day; null without an entry. */
  restMinutes: number | null;
  /** The day has changes not saved yet. */
  dirty?: boolean;
}

export interface MonthCalendarProps {
  /** "November 2026". */
  title: string;
  days: readonly MonthCalendarDay[];
  /** The vessel's today. */
  today: string;
  /** The day the editor shows, if any. */
  selected?: string | null;
  onOpenDay: (date: string) => void;
}

const STATE_ICON: Readonly<Record<HorDayState, LucideIcon>> = {
  not_expected: Minus,
  not_entered: CircleDashed,
  entered: Check,
  submitted: Send,
  approved: CheckCheck,
  leave: TreePalm,
};

const LEGEND_ORDER: readonly HorDayState[] = ['entered', 'submitted', 'approved', 'not_entered', 'leave', 'not_expected'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Monday = 0 … Sunday = 6, for a YYYY-MM-DD date. */
const weekdayIndex = (date: string): number => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

const hours = (minutes: number) => {
  const h = minutes / 60;
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
};

/** The cell's words: the state, why a day is not expected, the rest and the overlay. */
function describe(day: MonthCalendarDay): string {
  const parts = [statusMeta('hor_day', day.day.state).label];
  if (day.reasonText) parts.push(day.reasonText);
  if (day.restMinutes !== null) parts.push(`rest ${hours(day.restMinutes)} h`);
  if (day.day.breach) parts.push('breach');
  else if (day.day.warning) parts.push('near the limit');
  if (day.dirty) parts.push('not saved');
  return parts.join(', ');
}

export const MonthCalendar: React.FC<MonthCalendarProps> = ({ title, days, today, selected, onOpenDay }) => {
  const lead = days.length ? weekdayIndex(days[0].date) : 0;
  const states = new Set(days.map((d) => d.day.state));

  return (
    <div className="min-w-0 space-y-3" data-month-calendar="">
      <div aria-hidden="true" className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {WEEKDAYS.map((w) => (
          <span key={w} className="text-center type-eyebrow text-muted-foreground">
            {w}
          </span>
        ))}
      </div>
      <ol aria-label={title} className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {Array.from({ length: lead }, (_, i) => (
          <li key={`lead-${i}`} aria-hidden="true" />
        ))}
        {days.map((d) => {
          const { state } = d.day;
          const meta = statusMeta('hor_day', state);
          const Icon = d.day.breach ? AlertOctagon : d.day.warning ? AlertTriangle : STATE_ICON[state];
          const iconTone = d.day.breach ? TONE_TEXT.danger : d.day.warning ? TONE_TEXT.warn : TONE_TEXT[meta.tone];
          const word = d.day.breach ? 'Breach' : d.day.warning ? 'Near limit' : meta.label;
          const isToday = d.date === today;
          const isSelected = d.date === selected;
          return (
            <li key={d.date} className="min-w-0">
              <button
                type="button"
                onClick={() => onOpenDay(d.date)}
                aria-label={`${d.label}: ${describe(d)}`}
                aria-current={isToday ? 'date' : undefined}
                aria-pressed={isSelected || undefined}
                data-day={d.date}
                data-state={state}
                data-breach={d.day.breach || undefined}
                data-warning={d.day.warning || undefined}
                className={cn(
                  'focus-ring flex h-16 w-full min-w-0 flex-col justify-between rounded-md border p-1.5 text-left transition-colors duration-quick sm:h-[4.75rem] sm:p-2',
                  state === 'not_expected' ? 'border-transparent bg-muted/40 text-muted-foreground hover:bg-muted/70' : 'border-border bg-card hover:bg-accent',
                  state === 'not_entered' && 'border-dashed border-warning/60',
                  state === 'leave' && 'bg-muted/60',
                  d.day.breach && 'border-critical/60 bg-critical-muted',
                  !d.day.breach && d.day.warning && 'border-warning/60 bg-warning-muted',
                  isSelected && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
                )}
              >
                <span className="flex w-full items-start justify-between gap-1">
                  <span
                    className={cn(
                      'flex h-5 min-w-5 items-center justify-center type-body-sm font-semibold tabular-nums',
                      isToday && 'rounded-full bg-primary px-1 text-primary-foreground',
                    )}
                  >
                    {Number(d.date.slice(8, 10))}
                  </span>
                  <Icon aria-hidden="true" className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', iconTone)} />
                </span>
                <span className="flex w-full min-w-0 items-end justify-between gap-1">
                  <span className="min-w-0 truncate type-caption tabular-nums text-foreground">
                    {d.restMinutes !== null ? (
                      <>
                        {hours(d.restMinutes)}
                        <span className="hidden min-[420px]:inline"> h</span>
                      </>
                    ) : (
                      ' '
                    )}
                  </span>
                  {d.dirty ? <span aria-hidden="true" className="mb-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /> : null}
                </span>
                <span className="hidden w-full truncate type-caption text-muted-foreground sm:block">{word}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <ul aria-label="What the days show" className="flex flex-wrap gap-1.5">
        {LEGEND_ORDER.filter((s) => states.has(s)).map((s) => (
          <li key={s}>
            <StatusPill domain="hor_day" status={s} icon={STATE_ICON[s]} />
          </li>
        ))}
        {days.some((d) => d.day.breach) ? (
          <li>
            <StatusPill domain="hor_day" status="breach" />
          </li>
        ) : null}
        {days.some((d) => d.day.warning) ? (
          <li>
            <StatusPill domain="hor_day" status="warning" />
          </li>
        ) : null}
        {days.some((d) => d.dirty) ? (
          <li>
            <StatusPill tone="signal">Not saved yet</StatusPill>
          </li>
        ) : null}
        <li className="type-caption self-center text-muted-foreground">Hours are rest.</li>
      </ul>
    </div>
  );
};

export default MonthCalendar;

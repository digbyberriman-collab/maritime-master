/**
 * One week of the month, a timeline per day (gap/04 C37: the Day / Week
 * toggle). Each row shows the day, its state, its rest and a timeline that
 * can be edited in place (pointer or keyboard, as in the day editor) when
 * the day is open to the viewer; Open day goes to the day editor with its
 * periods list. Days outside the month are not shown: the week is the part
 * of it that falls in the month on screen.
 */
import React from 'react';
import { ChevronLeft, ChevronRight, PanelRightOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/shared/components/status';
import { cn } from '@/lib/utils';
import type { WorkRestBlock } from '../types';
import { DayTimeline } from './DayTimeline';
import type { MonthCalendarDay } from './MonthCalendar';

export interface WeekViewDay extends MonthCalendarDay {
  blocks: readonly WorkRestBlock[];
  /** The viewer may change the day now. */
  editable: boolean;
  /** Why not, when the day is shown read-only. */
  lockedReason: string | null;
}

export interface WeekViewProps {
  /** "Week of 16 November". */
  title: string;
  days: readonly WeekViewDay[];
  onChangeDay: (date: string, blocks: WorkRestBlock[]) => void;
  onOpenDay: (date: string) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  today: string;
}

export const WeekView: React.FC<WeekViewProps> = ({ title, days, onChangeDay, onOpenDay, onPrevWeek, onNextWeek, today }) => (
  <section aria-label={title} className="min-w-0 space-y-3" data-week-view="">
    <div className="flex items-center justify-between gap-2">
      <h3 className="type-subtitle text-foreground">{title}</h3>
      <div className="flex items-center gap-1">
        <Button type="button" variant="outline" size="icon" onClick={onPrevWeek} aria-label="Previous week">
          <ChevronLeft aria-hidden="true" />
        </Button>
        <Button type="button" variant="outline" size="icon" onClick={onNextWeek} aria-label="Next week">
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </div>
    <ol className="space-y-2">
      {days.map((d) => (
        <li
          key={d.date}
          className={cn(
            'rounded-md border bg-card p-3',
            d.day.breach ? 'border-critical/50' : d.day.warning ? 'border-warning/50' : 'border-border',
            d.date === today && 'ring-1 ring-primary/50',
          )}
          data-week-day={d.date}
        >
          <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="type-body font-semibold text-foreground">{d.label}</span>
            <StatusPill domain="hor_day" status={d.day.state} />
            {d.day.breach ? <StatusPill domain="hor_day" status="breach" /> : d.day.warning ? <StatusPill domain="hor_day" status="warning" /> : null}
            {d.dirty ? <StatusPill tone="signal">Not saved yet</StatusPill> : null}
            <Button type="button" variant="ghost" size="sm" className="ml-auto [@media(pointer:coarse)]:h-11" onClick={() => onOpenDay(d.date)} aria-label={`Open ${d.label}`}>
              <PanelRightOpen aria-hidden="true" />
              Open day
            </Button>
          </div>
          <DayTimeline
            date={d.date}
            label={d.label}
            blocks={d.blocks}
            size="sm"
            disabled={!d.editable}
            disabledReason={d.editable ? null : d.lockedReason ?? d.reasonText}
            onChange={(blocks) => onChangeDay(d.date, blocks)}
          />
        </li>
      ))}
    </ol>
  </section>
);

export default WeekView;

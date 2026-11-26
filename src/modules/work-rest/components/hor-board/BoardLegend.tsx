/**
 * What the board's calendars show (gap/04 C40, C38): one pill per day state
 * of the `hor_day` vocabulary, each with the icon the calendars use, so
 * nothing depends on colour; and the "Show all calendars" switch, which
 * opens every card's month at once (`?all=1`). The icons are shared with
 * the cards (DayIcon).
 */
import React, { useId } from 'react';
import { AlertOctagon, AlertTriangle, Check, CheckCheck, CircleDashed, Minus, Send, TreePalm, type LucideIcon } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { StatusPill } from '@/shared/components/status';
import type { HorDayState } from '../../lib/horDay';

type DayMark = HorDayState | 'breach' | 'warning';

/** The icon of each day state, and of the two overlays. */
const DAY_ICON: Readonly<Record<DayMark, LucideIcon>> = {
  not_expected: Minus,
  not_entered: CircleDashed,
  entered: Check,
  submitted: Send,
  approved: CheckCheck,
  leave: TreePalm,
  breach: AlertOctagon,
  warning: AlertTriangle,
};

/** A day state's icon, as the legend and the cards draw it (decorative: the words go alongside). */
export const DayIcon: React.FC<{ mark: DayMark; className?: string }> = ({ mark, className }) => {
  const Icon = DAY_ICON[mark];
  return <Icon aria-hidden="true" className={className} />;
};

const LEGEND: readonly DayMark[] = ['entered', 'submitted', 'approved', 'not_entered', 'leave', 'not_expected', 'breach', 'warning'];

export interface BoardLegendProps {
  showAll: boolean;
  onShowAllChange: (on: boolean) => void;
  className?: string;
}

export const BoardLegend: React.FC<BoardLegendProps> = ({ showAll, onShowAllChange, className }) => {
  const id = useId();
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-x-4 gap-y-2', className)} data-board-legend="">
      <ul aria-label="What the calendars show" className="flex min-w-0 flex-wrap gap-1.5">
        {LEGEND.map((s) => (
          <li key={s}>
            <StatusPill domain="hor_day" status={s} icon={DAY_ICON[s]} />
          </li>
        ))}
      </ul>
      <div className="flex shrink-0 items-center gap-2 [@media(pointer:coarse)]:min-h-11">
        <Switch id={`${id}-all`} checked={showAll} onCheckedChange={onShowAllChange} />
        <Label htmlFor={`${id}-all`} className="type-body-sm font-medium">
          Show all calendars
        </Label>
      </div>
    </div>
  );
};

export default BoardLegend;

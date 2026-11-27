import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LEAVE_TONE_CLASSES, leaveTypeLegend, type LeaveType } from '../../lib/leaveTypes';

/** The swatch of a leave type (its tone token, never a colour value). */
export const LeaveSwatch: React.FC<{ type: Pick<LeaveType, 'toneKey'>; className?: string }> = ({ type, className }) => (
  <span aria-hidden="true" className={cn('inline-block size-3 shrink-0 rounded-sm', LEAVE_TONE_CLASSES[type.toneKey].swatch, className)} />
);

/** "Holiday (annual leave)" with its day code, for a select or a legend. */
export const LeaveTypeLabel: React.FC<{ type: LeaveType }> = ({ type }) => (
  <span className="inline-flex min-w-0 items-center gap-2">
    <LeaveSwatch type={type} />
    <span className="truncate">{type.label}</span>
    <span className="type-caption text-muted-foreground">{type.dayCode}</span>
  </span>
);

const EFFECT_TEXT: Readonly<Record<LeaveType['balanceEffect'], string>> = {
  accrues: 'Accrues leave',
  deducts: 'Uses the allowance',
  neutral: 'Neutral',
  policy: 'Per leave policy',
};

/**
 * The leave types' legend (gap/04 C51, W7): one list with the dialog, so the
 * two always agree. `detailed` adds the day code, the balance effect and
 * whether the type needs an approver (the Configuration tab).
 */
export const LeaveLegend: React.FC<{ types: readonly LeaveType[]; detailed?: boolean; className?: string }> = ({ types, detailed = false, className }) => {
  const list = leaveTypeLegend(types);
  if (!detailed) {
    return (
      <ul aria-label="Leave types" className={cn('flex flex-wrap gap-x-4 gap-y-2 type-caption text-muted-foreground', className)} data-planner-legend="">
        {list.map((t) => (
          <li key={t.key} className="inline-flex items-center gap-1.5">
            <LeaveSwatch type={t} />
            <span className="text-foreground">{t.label}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul aria-label="Leave types" className={cn('divide-y divide-border rounded-md border border-border', className)} data-planner-legend="detailed">
      {list.map((t) => (
        <li key={t.key} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
          <span className="inline-flex min-w-[12rem] flex-1 items-center gap-2 type-body">
            <LeaveSwatch type={t} />
            <span className="text-foreground">{t.label}</span>
          </span>
          <span className="w-10 type-caption font-medium text-muted-foreground" aria-label={`Day code ${t.dayCode}`}>
            {t.dayCode}
          </span>
          <span className="w-36 type-caption text-muted-foreground">{EFFECT_TEXT[t.balanceEffect]}</span>
          <span className="type-caption text-muted-foreground">{t.needsApproval ? 'Needs a leave approver' : t.countsOnBoard ? 'Counts as on board' : 'Planner can add it'}</span>
        </li>
      ))}
    </ul>
  );
};

/**
 * Shows or hides a legend. The planner tabs open it by default on wide
 * screens and keep it closed on a phone, where it would push the grid below
 * the fold; the person's choice wins once made.
 */
export const LegendToggle: React.FC<{ open: boolean; onToggle: () => void; className?: string }> = ({ open, onToggle, className }) => (
  <Button type="button" variant="ghost" size="sm" className={cn('h-9 [@media(pointer:coarse)]:h-11', className)} aria-expanded={open} onClick={onToggle}>
    Legend
    {open ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
  </Button>
);

export default LeaveLegend;

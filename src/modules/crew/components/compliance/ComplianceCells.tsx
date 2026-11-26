import React from 'react';
import { Check, Minus, TriangleAlert } from 'lucide-react';
import { Portal as TooltipPortal } from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { StatusPill } from '@/shared/components/status';
import { TONE_SURFACE } from '@/components/ui/tones';
import type { ComplianceDot, ComplianceStatus } from '@/modules/crew/lib/compliance';
import type { CellState, RequirementCellWords, TabCell } from '@/modules/crew/lib/complianceModel';
import { monthText, ratioText } from '@/modules/crew/lib/complianceModel';
import { DOT_ICON, DOT_TONE, STATE_ICON, stateTone, tabCellSentence } from './cellLook';

/**
 * The cells of the crew compliance matrices (gap/04 C35, C5): each one an
 * icon and a word in its tone, and the sentence behind it in a tooltip that
 * a keyboard or touch reaches too. Never a colour alone (gap/10 A.8).
 */

const TRIGGER =
  'focus-ring mx-auto flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-sm px-0.5 py-0.5 text-center [@media(pointer:coarse)]:min-h-11';

/** A tooltip around a focusable trigger; portalled, because the matrices scroll inside their cards. */
export const CellTooltip: React.FC<{ content: React.ReactNode; children: React.ReactElement }> = ({ content, children }) => (
  <Tooltip>
    <TooltipTrigger asChild>{children}</TooltipTrigger>
    <TooltipPortal>
      <TooltipContent side="top" className="max-w-xs text-left">
        {content}
      </TooltipContent>
    </TooltipPortal>
  </Tooltip>
);

/** A requirement cell: the state as a pill with its icon, the expiry month under it, the sentence in the tooltip. */
export const RequirementCell: React.FC<{ words: RequirementCellWords; context: string }> = ({ words, context }) => {
  if (words.state === 'not_required') {
    return (
      <span className="flex justify-center text-muted-foreground" data-cell-state="not_required">
        <Minus aria-hidden="true" className="h-3.5 w-3.5" />
        <span className="sr-only">
          {context}: {words.sentence}
        </span>
      </span>
    );
  }
  const tone = stateTone(words.state, words.caution);
  const Icon = words.caution && words.state === 'met' ? TriangleAlert : STATE_ICON[words.state];
  return (
    <CellTooltip content={words.sentence}>
      <button type="button" className={TRIGGER} aria-label={`${context}: ${words.label}. ${words.sentence}`} data-cell-state={words.state} data-caution={words.caution ? '' : undefined}>
        <StatusPill tone={tone} icon={Icon}>
          {words.label}
        </StatusPill>
        {words.detail ? <span className="type-caption tabular-nums text-muted-foreground">{words.detail}</span> : null}
      </button>
    </CellTooltip>
  );
};

/** One tab of a person in the overview: "3/5" with the worst state's icon and tone, and the next expiry when asked. */
export const TabRatioCell: React.FC<{ cell: TabCell; context: string; showNext?: boolean }> = ({ cell, context, showNext = false }) => {
  const sentence = tabCellSentence(cell);
  if (cell.required === 0) {
    return (
      <span className="flex justify-center text-muted-foreground" data-cell-state="not_required">
        <Minus aria-hidden="true" className="h-3.5 w-3.5" />
        <span className="sr-only">
          {context}: {sentence}
        </span>
      </span>
    );
  }
  const state: CellState = cell.worst ?? 'met';
  const tone = stateTone(state, cell.caution);
  const Icon = cell.caution && state === 'met' ? TriangleAlert : STATE_ICON[state];
  const next = showNext && cell.next ? monthText(cell.next.date) : null;
  return (
    <CellTooltip content={sentence}>
      <button type="button" className={TRIGGER} aria-label={`${context}: ${sentence}`} data-cell-state={state} data-tab-cell={cell.tab}>
        <StatusPill tone={tone} icon={Icon} className="tabular-nums">
          {ratioText(cell.met, cell.required)}
        </StatusPill>
        {next ? <span className="type-caption tabular-nums text-muted-foreground">Next {next}</span> : null}
      </button>
    </CellTooltip>
  );
};

/** A person's overall status; "Nothing required" (neutral) when no requirement applies to them. */
export const ComplianceStatusPill: React.FC<{ status: ComplianceStatus; required: number; className?: string }> = ({ status, required, className }) =>
  required === 0 ? (
    <StatusPill tone="neutral" icon={null} className={className} data-status="nothing_required">
      Nothing required
    </StatusPill>
  ) : (
    <StatusPill domain="crew_compliance" status={status} icon={status === 'complete' ? Check : undefined} className={className} />
  );

// ---------------------------------------------------------------- the crew list's dots (C5)

/** One dot: a 20 px circle in its tone with its own icon (never the colour alone). */
export const Dot: React.FC<{ dot: ComplianceDot; className?: string }> = ({ dot, className }) => {
  const Icon = DOT_ICON[dot];
  return (
    <span
      aria-hidden="true"
      data-dot={dot}
      className={cn('inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border', TONE_SURFACE[DOT_TONE[dot]], className)}
    >
      <Icon className="h-3 w-3" strokeWidth={2.5} />
    </span>
  );
};

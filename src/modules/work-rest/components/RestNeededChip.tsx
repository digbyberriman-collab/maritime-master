/**
 * "Rest still needed today" (gap/04 C37, W6 computed values): the larger of
 * the 24-hour and the 7-day shortfall, from lib/restNeeded.ts over the
 * person's recorded days (the six days before the month included). The
 * figure follows the days being edited, saved or not. It is said in words
 * and with an icon, never by colour alone, and is announced politely as it
 * changes.
 *
 *   not known   today (or one of the last seven days) has no entry yet
 *   met         nothing more is needed today
 *   needed      the hours and minutes still needed, and which rule decides
 */
import React, { useMemo } from 'react';
import { BedDouble, CheckCircle2, CircleDashed } from 'lucide-react';
import { StatusPill } from '@/shared/components/status';
import { restNeeded } from '../lib/restNeeded';
import type { DailyRecord, RuleSet } from '../types';

export interface RestNeededChipProps {
  records: ReadonlyArray<Pick<DailyRecord, 'record_date' | 'blocks'>>;
  /** The vessel's today, YYYY-MM-DD. */
  today: string;
  ruleSet: Pick<RuleSet, 'min_rest_per_24h' | 'min_rest_per_7d'>;
  className?: string;
}

function hoursAndMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} h ${m} m`;
  return h ? `${h} h` : `${m} m`;
}

export const RestNeededChip: React.FC<RestNeededChipProps> = ({ records, today, ruleSet, className }) => {
  const result = useMemo(() => restNeeded(records, today, ruleSet), [records, today, ruleSet]);
  let content: React.ReactNode;
  if (result.neededMinutes === null) {
    content = (
      <StatusPill tone="neutral" icon={CircleDashed} size="md" data-rest-needed="unknown">
        Rest still needed today: enter today first
      </StatusPill>
    );
  } else if (result.neededMinutes === 0) {
    content = (
      <StatusPill tone="ok" icon={CheckCircle2} size="md" data-rest-needed="met">
        Rest needs met today
      </StatusPill>
    );
  } else {
    const basis = result.basis === '7d' ? `${ruleSet.min_rest_per_7d} h in 7 days` : `${ruleSet.min_rest_per_24h} h in 24 h`;
    content = (
      <StatusPill tone="warn" icon={BedDouble} size="md" data-rest-needed="needed" title={`To reach ${basis}`}>
        Rest still needed today: {hoursAndMinutes(result.neededMinutes)}
        <span className="font-normal text-muted-foreground"> · {basis}</span>
      </StatusPill>
    );
  }
  return (
    <span role="status" aria-live="polite" className={className}>
      {content}
    </span>
  );
};

export default RestNeededChip;

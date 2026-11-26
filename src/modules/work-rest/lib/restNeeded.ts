/**
 * Rest still needed today (gap/04 C37, W6 "computed values"): the larger of
 *   - the 24 h shortfall: max(0, 10 h - rest logged in the 24 h ending at the
 *     end of today, i.e. today's calendar day), and
 *   - the 7-day shortfall: max(0, 77 h - rest logged in the 7 days ending at
 *     the end of today).
 * Unmarked time of an entered day is rest, as everywhere in the engine. A
 * shortfall is null while its days are not all entered (today for the 24 h
 * figure; today and the six days before it for the 7-day figure): nothing
 * is assumed about a day nobody entered. Pure.
 */
import type { DailyRecord, RuleSet } from '../types';
import { DEFAULT_RULE_SET } from '../types';
import { engineDayOf } from './complianceEngine';

const DAY = 1440;

export interface RestNeeded {
  /** Minutes still needed against the 24 h minimum; null when today has no entry. */
  shortfall24hMinutes: number | null;
  /** Minutes still needed against the 7-day minimum; null unless all seven days have an entry. */
  shortfall7dMinutes: number | null;
  /** The larger of the two known shortfalls; null when neither is known. */
  neededMinutes: number | null;
  /** Which figure decides (`none` when nothing is needed or nothing is known). */
  basis: '24h' | '7d' | 'none';
}

const shiftDate = (date: string, days: number): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Rest minutes of an entered day: 1440 minus the union of its work blocks. */
export function restMinutesOf(record: Pick<DailyRecord, 'record_date' | 'blocks'>): number {
  const intervals = engineDayOf(record)
    .work.map(([s, e]) => [Math.max(0, Math.min(DAY, Math.round(s))), Math.max(0, Math.min(DAY, Math.round(e)))] as const)
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  let work = 0;
  let cursor = 0;
  for (const [s, e] of intervals) {
    const from = Math.max(s, cursor);
    if (e > from) work += e - from;
    cursor = Math.max(cursor, e);
  }
  return DAY - work;
}

export function restNeeded(
  records: ReadonlyArray<Pick<DailyRecord, 'record_date' | 'blocks'>>,
  today: string,
  ruleSet: Pick<RuleSet, 'min_rest_per_24h' | 'min_rest_per_7d'> = DEFAULT_RULE_SET,
): RestNeeded {
  const byDate = new Map<string, Pick<DailyRecord, 'record_date' | 'blocks'>>();
  for (const r of records) if (!byDate.has(r.record_date)) byDate.set(r.record_date, r);

  const min24 = Math.round(ruleSet.min_rest_per_24h * 600) / 10;
  const min7 = Math.round(ruleSet.min_rest_per_7d * 600) / 10;

  const todayRecord = byDate.get(today);
  const shortfall24hMinutes = todayRecord ? Math.max(0, Math.ceil(min24 - restMinutesOf(todayRecord))) : null;

  let shortfall7dMinutes: number | null = null;
  const week = Array.from({ length: 7 }, (_, i) => byDate.get(shiftDate(today, -i)));
  if (week.every(Boolean)) {
    const rest = week.reduce((sum, r) => sum + restMinutesOf(r as Pick<DailyRecord, 'record_date' | 'blocks'>), 0);
    shortfall7dMinutes = Math.max(0, Math.ceil(min7 - rest));
  }

  const known = [shortfall24hMinutes, shortfall7dMinutes].filter((v): v is number => v !== null);
  if (known.length === 0) return { shortfall24hMinutes, shortfall7dMinutes, neededMinutes: null, basis: 'none' };
  const neededMinutes = Math.max(...known);
  const basis: RestNeeded['basis'] =
    neededMinutes === 0 ? 'none' : shortfall7dMinutes !== null && shortfall7dMinutes > (shortfall24hMinutes ?? -1) ? '7d' : '24h';
  return { shortfall24hMinutes, shortfall7dMinutes, neededMinutes, basis };
}

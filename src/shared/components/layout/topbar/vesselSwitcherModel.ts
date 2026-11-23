/**
 * The vessel switcher's rows (gap/10 top bar element 3; spec §6.2), pure so
 * the grouping and the search are unit-tested apart from the popover.
 *
 * Groups, in order: Recent (the last three vessels opened, still in reach),
 * one group per fleet group that holds a reachable vessel (by name), then
 * "Other vessels" for the rest. With no fleet groups (none set up, still
 * loading, or an error) every vessel sits in one "Vessels" group. A vessel in
 * Recent also stays in its own group, so the full list is always complete.
 */
import type { Tone } from '@/components/ui/tones';
import type { AlertSeverity } from '@/modules/alerts/constants';
import type { FleetGroup } from './useFleetGroups';

/** The "All vessels — Fleet overview" row's value. */
export const ALL_VESSELS = 'all-vessels';

/** What a row stands for: a vessel, or the Fleet overview. */
export type SwitcherTarget = SwitcherVessel | typeof ALL_VESSELS;

export interface SwitcherVessel {
  id: string;
  name: string;
  /** Upper case (D-03). */
  code: string;
  imo: string | null;
  fleetGroupId: string | null;
}

export interface SwitcherGroup {
  id: string;
  heading: string;
  vessels: readonly SwitcherVessel[];
}

export interface SwitcherGroupsInput {
  vessels: readonly SwitcherVessel[];
  /** Newest first; ids outside `vessels` are ignored. */
  recentIds: readonly string[];
  /** Fleet groups, or an empty list when they are loading or failed. */
  groups: readonly FleetGroup[];
}

const byName = (a: SwitcherVessel, b: SwitcherVessel) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

export function buildSwitcherGroups({ vessels, recentIds, groups }: SwitcherGroupsInput): SwitcherGroup[] {
  const out: SwitcherGroup[] = [];
  const byId = new Map(vessels.map((v) => [v.id, v]));
  const recent = recentIds.map((id) => byId.get(id)).filter((v): v is SwitcherVessel => Boolean(v)).slice(0, 3);
  if (recent.length) out.push({ id: 'recent', heading: 'Recent', vessels: recent });

  const sorted = [...vessels].sort(byName);
  const placed = new Set<string>();
  const named = [...groups].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const grouped: SwitcherGroup[] = [];
  for (const group of named) {
    const members = sorted.filter((v) => v.fleetGroupId === group.id);
    if (!members.length) continue;
    members.forEach((v) => placed.add(v.id));
    grouped.push({ id: `group-${group.id}`, heading: group.name, vessels: members });
  }
  if (!grouped.length) {
    if (sorted.length) out.push({ id: 'all', heading: 'Vessels', vessels: sorted });
    return out;
  }
  out.push(...grouped);
  const rest = sorted.filter((v) => !placed.has(v.id));
  if (rest.length) out.push({ id: 'other', heading: 'Other vessels', vessels: rest });
  return out;
}

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * cmdk filter over a row's keywords (its value is only an id): every word of
 * the query must start a word of the keywords or appear in them. 1 = show.
 */
export function switcherFilter(_value: string, search: string, keywords: readonly string[] = []): number {
  const query = fold(search).trim();
  if (!query) return 1;
  const haystack = fold(keywords.join(' '));
  const words = haystack.split(/[\s/]+/).filter(Boolean);
  const compact = haystack.replace(/[\s/]+/g, '');
  return query.split(/\s+/).every((part) => words.some((w) => w.startsWith(part)) || compact.includes(part)) ? 1 : 0;
}

/** The status-pill tone for an alert severity (the D-57 tones, on the pill scale). */
export function severityTone(severity: AlertSeverity): Tone {
  switch (severity) {
    case 'RED':
      return 'danger';
    case 'ORANGE':
      return 'orange';
    case 'YELLOW':
      return 'warn';
    default:
      return 'ok';
  }
}

export const SEVERITY_LABEL: Readonly<Record<AlertSeverity, string>> = Object.freeze({
  RED: 'red',
  ORANGE: 'orange',
  YELLOW: 'yellow',
  GREEN: 'green',
});

/** "2 open alerts, worst red" (or "1000+ open alerts…" when the summary was cut). */
export function alertSummaryLabel(open: number, worst: AlertSeverity, truncated: boolean): string {
  const count = truncated ? `${open}+` : String(open);
  return `${count} open alert${open === 1 && !truncated ? '' : 's'}, worst ${SEVERITY_LABEL[worst]}`;
}

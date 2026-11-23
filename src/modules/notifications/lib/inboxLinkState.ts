/**
 * What an inbox row's link is, for the bell and /inbox: the resolver's answer
 * (../lib/deepLink.ts), "checking" while access loads (never an answer then,
 * D-04), or "reach unknown" while the vessel list is in error (D-119) or the
 * membership read failed before fleet reach was decided (D-165); and the
 * row's relative time. Pure.
 *
 * Only the reach answers turn into "reach unknown": `no_reach` (a vessel the
 * failed list may hold) and `no_fleet_reach` (fleet reach never decided).
 * `workspace_denied` stays: the workspace gate is the Apps entry's own gate
 * (workspace-scoped, not fleet reach), so a failed membership read does not
 * decide it.
 */
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import type { DeepLinkResult } from './deepLink';
import type { InboxItem } from '../services/inbox';

/** The link state a row shows: resolved, still checking access, or reach unknown (vessel list failed). */
export type InboxLinkState = DeepLinkResult | { kind: 'checking' } | { kind: 'reach-unknown' };

export function relativeTime(iso: string): string {
  try {
    return formatDistanceToNowStrict(parseISO(iso), { addSuffix: true });
  } catch {
    return '';
  }
}

/**
 * The row's link state from the resolver and the access state (fail closed
 * while loading, D-04). `reachUnknown`: the vessel list is in error
 * (`useInboxLinks().reachUnknown`); `fleetReachUnknown`: the membership read
 * failed, so fleet reach was never decided (`useInboxLinks().fleetReachUnknown`).
 */
export function linkStateFor(
  ready: boolean,
  reachUnknown: boolean,
  resolve: (item: InboxItem) => DeepLinkResult,
  item: InboxItem,
  fleetReachUnknown: boolean,
): InboxLinkState {
  if (!ready) return { kind: 'checking' };
  const result = resolve(item);
  if (result.kind !== 'unavailable') return result;
  // With the vessel list in error, "no reach" only means "not known".
  if (result.reason === 'no_reach' && reachUnknown) return { kind: 'reach-unknown' };
  // Fleet reach never decided (the membership read failed): not a denial.
  if (result.reason === 'no_fleet_reach' && fleetReachUnknown) return { kind: 'reach-unknown' };
  return result;
}

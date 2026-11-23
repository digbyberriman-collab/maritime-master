/**
 * What an inbox row's link is, for the bell and /inbox: the resolver's answer
 * (../lib/deepLink.ts), "checking" while access loads (never an answer then,
 * D-04), or "reach unknown" while the vessel list is in error (D-119); and
 * the row's relative time. Pure.
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

/** The row's link state from the resolver and the access state (fail closed while loading, D-04). */
export function linkStateFor(
  ready: boolean,
  reachUnknown: boolean,
  resolve: (item: InboxItem) => DeepLinkResult,
  item: InboxItem,
): InboxLinkState {
  if (!ready) return { kind: 'checking' };
  const result = resolve(item);
  // With the vessel list in error, "no reach" only means "not known".
  if (result.kind === 'unavailable' && result.reason === 'no_reach' && reachUnknown) return { kind: 'reach-unknown' };
  return result;
}

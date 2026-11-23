/**
 * linkStateFor (../../modules/notifications/lib/inboxLinkState.ts): the link
 * state a bell or /inbox row shows. "Checking" while access loads (D-04);
 * "reach unknown" for `no_reach` while the vessel list is in error (D-119)
 * and for `no_fleet_reach` while fleet reach was never decided because the
 * membership read failed (D-165). Every other answer passes through.
 */
import { describe, expect, it } from 'vitest';
import { linkStateFor } from '@/modules/notifications/lib/inboxLinkState';
import type { DeepLinkResult, DeepLinkUnavailable } from '@/modules/notifications/lib/deepLink';
import type { InboxItem } from '@/modules/notifications/services/inbox';

const item = { id: 'n-1' } as InboxItem;
const answer = (result: DeepLinkResult) => () => result;
const unavailable = (reason: DeepLinkUnavailable): DeepLinkResult => ({ kind: 'unavailable', reason });

describe('linkStateFor', () => {
  it('is "checking" until access is ready, whatever the resolver would say', () => {
    expect(linkStateFor(false, true, answer({ kind: 'link', href: '/fleet/dashboard' }), item, true)).toEqual({ kind: 'checking' });
  });

  it('no_fleet_reach while fleet reach is undecided (the membership read failed) is reach-unknown', () => {
    expect(linkStateFor(true, true, answer(unavailable('no_fleet_reach')), item, true)).toEqual({ kind: 'reach-unknown' });
  });

  it('no_fleet_reach stays a denial when fleet reach was decided, even with the vessel list in error', () => {
    expect(linkStateFor(true, true, answer(unavailable('no_fleet_reach')), item, false)).toEqual(unavailable('no_fleet_reach'));
    expect(linkStateFor(true, false, answer(unavailable('no_fleet_reach')), item, false)).toEqual(unavailable('no_fleet_reach'));
  });

  it('no_reach is reach-unknown while the vessel list is in error, a denial otherwise', () => {
    expect(linkStateFor(true, true, answer(unavailable('no_reach')), item, false)).toEqual({ kind: 'reach-unknown' });
    expect(linkStateFor(true, false, answer(unavailable('no_reach')), item, false)).toEqual(unavailable('no_reach'));
  });

  it('workspace, path and target answers are never turned into reach-unknown (the workspace gate is not fleet reach)', () => {
    for (const reason of ['workspace_denied', 'invalid_path', 'no_target'] as const) {
      expect(linkStateFor(true, true, answer(unavailable(reason)), item, true)).toEqual(unavailable(reason));
    }
  });

  it('a link passes through', () => {
    expect(linkStateFor(true, true, answer({ kind: 'link', href: '/v/dra' }), item, true)).toEqual({ kind: 'link', href: '/v/dra' });
  });
});

/**
 * The inbox services (Phase 2 spec §B.7; D-01, D-91, D-04): own rows by
 * user id, archived or not, filtered by scope, vessel and module, newest
 * first and limited; a missing table is "table-missing" (never an error, never
 * rows); any other failure is thrown; head counts are exact and never invented.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', async () => (await import('./inboxFake')).inboxFakeModule);

import {
  BELL_INBOX_LIMIT,
  fetchInbox,
  fetchInboxCounts,
  inboxKeys,
  markAllInboxRead,
  markInboxRead,
  setInboxArchived,
} from '@/modules/notifications/services/inbox';
import { MISSING_TABLE, OTHER_USER_ID, RLS_DENIED, SCHEMA_CACHE_MISS, USER_ID, HYDRA_ID, inboxFake, inboxRow, resetInboxFake } from './inboxFake';

beforeEach(() => resetInboxFake());

describe('fetchInbox', () => {
  it('reads the user’s unarchived rows, newest first, 20 by default', async () => {
    inboxFake.tables.notification_inbox = [
      ...Array.from({ length: 25 }, (_, i) => inboxRow({ minutesAgo: i + 1 })),
      inboxRow({ archived_at: '2026-11-22T10:00:00Z' }),
      inboxRow({ user_id: OTHER_USER_ID }),
    ];
    const list = await fetchInbox(USER_ID, { archived: false });
    expect(list.source).toBe('table');
    expect(list.items).toHaveLength(BELL_INBOX_LIMIT);
    const times = list.items.map((i) => i.created_at);
    expect([...times].sort().reverse()).toEqual(times);
    const call = inboxFake.calls[0];
    expect(call.filters).toEqual(expect.arrayContaining([['user_id', 'eq', USER_ID], ['archived_at', 'is', null]]));
    expect(call.order).toEqual(['created_at', false]);
    expect(call.limit).toBe(20);
    // Only the columns the UI needs (no payload, no user or outbox ids).
    expect(call.columns).not.toMatch(/payload|outbox_id|user_id|company_id/);
  });

  it('reads archived rows for the Archived tab', async () => {
    inboxFake.tables.notification_inbox = [inboxRow(), inboxRow({ archived_at: '2026-11-22T10:00:00Z', title: 'Old' })];
    const list = await fetchInbox(USER_ID, { archived: true, limit: 50 });
    expect(list.items.map((i) => i.title)).toEqual(['Old']);
    expect(inboxFake.calls[0].filters).toContainEqual(['archived_at', 'not_is', null]);
    expect(inboxFake.calls[0].limit).toBe(50);
  });

  it('filters by scope, vessel and module', async () => {
    inboxFake.tables.notification_inbox = [
      inboxRow({ title: 'match', link_scope: 'vessel', vessel_id: HYDRA_ID, module_key: 'crew' }),
      inboxRow({ title: 'other vessel', link_scope: 'vessel', module_key: 'crew' }),
      inboxRow({ title: 'other module', link_scope: 'vessel', vessel_id: HYDRA_ID, module_key: 'safety' }),
      inboxRow({ title: 'fleet', link_scope: 'fleet', vessel_id: null, module_key: 'crew' }),
    ];
    const list = await fetchInbox(USER_ID, { archived: false, scope: 'vessel', vesselId: HYDRA_ID, moduleKey: 'crew' });
    expect(list.items.map((i) => i.title)).toEqual(['match']);
    expect(inboxFake.calls[0].filters).toEqual(
      expect.arrayContaining([['link_scope', 'eq', 'vessel'], ['vessel_id', 'eq', HYDRA_ID], ['module_key', 'eq', 'crew']]),
    );
  });

  it.each([['42P01', MISSING_TABLE], ['PGRST205', SCHEMA_CACHE_MISS]])('a missing table (%s) is "table-missing" with no rows', async (_code, error) => {
    inboxFake.failures.notification_inbox = error;
    await expect(fetchInbox(USER_ID, { archived: false })).resolves.toEqual({ source: 'table-missing', items: [] });
  });

  it('any other error is thrown (never an empty inbox)', async () => {
    inboxFake.failures.notification_inbox = RLS_DENIED;
    await expect(fetchInbox(USER_ID, { archived: false })).rejects.toMatchObject({ code: '42501' });
    inboxFake.failures.notification_inbox = { code: '42703', message: 'column notification_inbox.record_ref does not exist' };
    await expect(fetchInbox(USER_ID, { archived: false })).rejects.toMatchObject({ code: '42703' });
    inboxFake.failures.notification_inbox = { message: 'Failed to fetch' };
    await expect(fetchInbox(USER_ID, { archived: false })).rejects.toMatchObject({ message: 'Failed to fetch' });
  });
});

describe('fetchInboxCounts', () => {
  it('counts unread, unarchived rows, and the critical ones, exactly', async () => {
    inboxFake.tables.notification_inbox = [
      inboxRow({ severity: 'critical' }),
      inboxRow({ severity: 'critical', read_at: '2026-11-23T09:00:00Z' }),
      inboxRow({ severity: 'critical', archived_at: '2026-11-23T09:00:00Z' }),
      inboxRow({ severity: 'warning' }),
      inboxRow({ severity: 'info' }),
      inboxRow({ severity: 'critical', user_id: OTHER_USER_ID }),
    ];
    await expect(fetchInboxCounts(USER_ID)).resolves.toEqual({ source: 'table', unread: 3, criticalUnread: 1 });
    for (const call of inboxFake.calls) {
      expect(call.head).toBe(true);
      expect(call.count).toBe('exact');
      expect(call.filters).toEqual(expect.arrayContaining([['user_id', 'eq', USER_ID], ['read_at', 'is', null], ['archived_at', 'is', null]]));
    }
  });

  it('a missing table is "table-missing"; any other error is thrown', async () => {
    inboxFake.failures.notification_inbox = MISSING_TABLE;
    await expect(fetchInboxCounts(USER_ID)).resolves.toEqual({ source: 'table-missing' });
    inboxFake.failures.notification_inbox = RLS_DENIED;
    await expect(fetchInboxCounts(USER_ID)).rejects.toMatchObject({ code: '42501' });
  });

  it('a count that comes back without a number is an error, never 0 (D-91)', async () => {
    inboxFake.tables.notification_inbox = [inboxRow()];
    inboxFake.nullCounts = true;
    await expect(fetchInboxCounts(USER_ID)).rejects.toThrow('The notification count was not returned.');
  });
});

describe('writes', () => {
  it('markInboxRead marks only unread rows of the given ids and returns how many changed', async () => {
    const a = inboxRow();
    const b = inboxRow({ read_at: '2026-11-23T08:00:00Z' });
    const c = inboxRow();
    inboxFake.tables.notification_inbox = [a, b, c];
    await expect(markInboxRead([a.id as string, b.id as string])).resolves.toBe(1);
    expect(a.read_at).toEqual(expect.any(String));
    expect(b.read_at).toBe('2026-11-23T08:00:00Z');
    expect(c.read_at).toBeNull();
    const update = inboxFake.calls.find((call) => call.op === 'update');
    expect(Object.keys(update?.payload ?? {})).toEqual(['read_at']);
    expect(update?.filters).toEqual(expect.arrayContaining([['read_at', 'is', null]]));
  });

  it('markInboxRead with no ids does not write', async () => {
    await expect(markInboxRead([])).resolves.toBe(0);
    expect(inboxFake.calls).toEqual([]);
  });

  it('a failed write is thrown', async () => {
    inboxFake.tables.notification_inbox = [inboxRow()];
    inboxFake.writeFailures.notification_inbox = RLS_DENIED;
    await expect(markInboxRead(['n-x'])).rejects.toMatchObject({ code: '42501' });
    await expect(setInboxArchived(['n-x'], true)).rejects.toMatchObject({ code: '42501' });
  });

  it('setInboxArchived sets and clears archived_at only', async () => {
    const a = inboxRow();
    inboxFake.tables.notification_inbox = [a];
    await expect(setInboxArchived([a.id as string], true)).resolves.toBe(1);
    expect(a.archived_at).toEqual(expect.any(String));
    await expect(setInboxArchived([a.id as string], false)).resolves.toBe(1);
    expect(a.archived_at).toBeNull();
    for (const call of inboxFake.calls) expect(Object.keys(call.payload ?? {})).toEqual(['archived_at']);
    await expect(setInboxArchived([], true)).resolves.toBe(0);
  });

  it('markAllInboxRead calls the RPC (with p_before when given) and returns its count', async () => {
    inboxFake.rpcs.notification_inbox_mark_all_read = () => ({ data: 4, error: null });
    await expect(markAllInboxRead()).resolves.toBe(4);
    await expect(markAllInboxRead('2026-11-23T11:59:00Z')).resolves.toBe(4);
    expect(inboxFake.rpcCalls).toEqual([
      { name: 'notification_inbox_mark_all_read', args: {} },
      { name: 'notification_inbox_mark_all_read', args: { p_before: '2026-11-23T11:59:00Z' } },
    ]);
  });

  it('markAllInboxRead fails on an error or an answer without a count', async () => {
    await expect(markAllInboxRead()).rejects.toMatchObject({ code: 'PGRST202' });
    inboxFake.rpcs.notification_inbox_mark_all_read = () => ({ data: null, error: null });
    await expect(markAllInboxRead()).rejects.toThrow(/did not say/);
  });
});

describe('inboxKeys', () => {
  it('every key starts with the user’s key, so one invalidation refreshes them all', () => {
    const user = inboxKeys.user(USER_ID);
    for (const key of [inboxKeys.counts(USER_ID), inboxKeys.list(USER_ID, { archived: false })]) {
      expect(key.slice(0, user.length)).toEqual([...user]);
    }
    expect(inboxKeys.user(OTHER_USER_ID)).not.toEqual(user);
  });
});

/**
 * The inbox hooks (Phase 2 spec §B.7): reads only for a signed-in user and
 * keyed by that user; writes refresh every inbox read of the user; an
 * archive that changed nothing is an error, never a silent success; the
 * realtime channel listens to the user's own rows only, refreshes the reads,
 * and is removed on unmount or when it is switched off.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/integrations/supabase/client', async () => (await import('./inboxFake')).inboxFakeModule);
const auth = vi.hoisted(() => ({ user: { id: '11111111-1111-4111-8111-111111111111' } as { id: string } | null }));
vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => ({ user: auth.user }) }));

import { useInbox, useInboxCounts, useInboxMutations, useInboxRealtime } from '@/modules/notifications/hooks/useInbox';
import { inboxKeys } from '@/modules/notifications/services/inbox';
import { MISSING_TABLE, USER_ID, fireInboxChange, inboxFake, inboxRow, resetInboxFake } from './inboxFake';

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  return { queryClient, wrapper };
}

beforeEach(() => {
  resetInboxFake();
  auth.user = { id: USER_ID };
});

describe('reads', () => {
  it('read nothing without a signed-in user', async () => {
    auth.user = null;
    const { wrapper } = setup();
    const list = renderHook(() => useInbox({ archived: false }), { wrapper });
    const counts = renderHook(() => useInboxCounts(), { wrapper });
    await act(async () => {});
    expect(list.result.current.fetchStatus).toBe('idle');
    expect(counts.result.current.fetchStatus).toBe('idle');
    expect(inboxFake.calls).toEqual([]);
  });

  it('are keyed by the user and return the source', async () => {
    inboxFake.tables.notification_inbox = [inboxRow(), inboxRow({ severity: 'critical' })];
    const { wrapper, queryClient } = setup();
    const list = renderHook(() => useInbox({ archived: false }), { wrapper });
    const counts = renderHook(() => useInboxCounts(), { wrapper });
    await waitFor(() => expect(counts.result.current.data).toEqual({ source: 'table', unread: 2, criticalUnread: 1 }));
    await waitFor(() => expect(list.result.current.data?.source).toBe('table'));
    expect(queryClient.getQueryData(inboxKeys.counts(USER_ID))).toBeDefined();
    expect(queryClient.getQueryData(inboxKeys.list(USER_ID, { archived: false }))).toBeDefined();
  });

  it('a missing table is data, not an error (D-01)', async () => {
    inboxFake.failures.notification_inbox = MISSING_TABLE;
    const { wrapper } = setup();
    const counts = renderHook(() => useInboxCounts(), { wrapper });
    await waitFor(() => expect(counts.result.current.data).toEqual({ source: 'table-missing' }));
    expect(counts.result.current.isError).toBe(false);
  });

  it('honours enabled: false', async () => {
    const { wrapper } = setup();
    renderHook(() => useInbox({ archived: true }, { enabled: false }), { wrapper });
    await act(async () => {});
    expect(inboxFake.calls).toEqual([]);
  });
});

describe('useInboxMutations', () => {
  it('mark read, mark all read and archive refresh every inbox read of the user', async () => {
    const a = inboxRow();
    inboxFake.tables.notification_inbox = [a, inboxRow()];
    inboxFake.rpcs.notification_inbox_mark_all_read = () => ({ data: 1, error: null });
    const { wrapper, queryClient } = setup();
    const counts = renderHook(() => useInboxCounts(), { wrapper });
    await waitFor(() => expect(counts.result.current.data).toEqual({ source: 'table', unread: 2, criticalUnread: 0 }));
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const m = renderHook(() => useInboxMutations(), { wrapper });

    await act(async () => {
      await m.result.current.markRead.mutateAsync([a.id as string]);
    });
    expect(invalidate).toHaveBeenLastCalledWith({ queryKey: inboxKeys.user(USER_ID) });
    await waitFor(() => expect(counts.result.current.data).toEqual({ source: 'table', unread: 1, criticalUnread: 0 }));

    await act(async () => {
      await m.result.current.markAllRead.mutateAsync('2026-11-23T12:00:00Z');
    });
    expect(inboxFake.rpcCalls.at(-1)).toEqual({ name: 'notification_inbox_mark_all_read', args: { p_before: '2026-11-23T12:00:00Z' } });

    await act(async () => {
      await m.result.current.setArchived.mutateAsync({ ids: [a.id as string], archived: true });
    });
    expect(a.archived_at).toEqual(expect.any(String));
    expect(invalidate).toHaveBeenCalledTimes(3);
  });

  it('an archive that changed no row is an error (RLS hid it, or it is gone)', async () => {
    inboxFake.tables.notification_inbox = [];
    const { wrapper } = setup();
    const m = renderHook(() => useInboxMutations(), { wrapper });
    await act(async () => {
      await expect(m.result.current.setArchived.mutateAsync({ ids: ['gone'], archived: true })).rejects.toThrow('That notification was not archived.');
    });
    await act(async () => {
      await expect(m.result.current.setArchived.mutateAsync({ ids: ['gone'], archived: false })).rejects.toThrow(/not moved back/);
    });
  });

  it('a failed write rejects (and still refreshes)', async () => {
    inboxFake.tables.notification_inbox = [inboxRow()];
    inboxFake.writeFailures.notification_inbox = { code: '42501', message: 'permission denied' };
    const { wrapper, queryClient } = setup();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const m = renderHook(() => useInboxMutations(), { wrapper });
    await act(async () => {
      await expect(m.result.current.markRead.mutateAsync(['n-1'])).rejects.toMatchObject({ code: '42501' });
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: inboxKeys.user(USER_ID) });
  });
});

describe('useInboxRealtime', () => {
  it('subscribes to the user’s own rows only, and refreshes their reads on a change', async () => {
    const { wrapper, queryClient } = setup();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const view = renderHook(() => useInboxRealtime(USER_ID, true), { wrapper });
    expect(inboxFake.channels).toHaveLength(1);
    const [channel] = inboxFake.channels;
    expect(channel.subscribed).toBe(true);
    expect(channel.bindings).toEqual([
      expect.objectContaining({ filter: { event: '*', schema: 'public', table: 'notification_inbox', filter: `user_id=eq.${USER_ID}` } }),
    ]);
    act(() => {
      expect(fireInboxChange()).toBe(1);
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: inboxKeys.user(USER_ID) });

    view.unmount();
    expect(channel.removed).toBe(true);
  });

  it('does not subscribe while switched off or signed out, and removes the channel when switched off', () => {
    const { wrapper } = setup();
    const off = renderHook(({ on, user }: { on: boolean; user: string | null }) => useInboxRealtime(user, on), {
      wrapper,
      initialProps: { on: false, user: USER_ID as string | null },
    });
    expect(inboxFake.channels).toHaveLength(0);
    off.rerender({ on: true, user: null });
    expect(inboxFake.channels).toHaveLength(0);
    off.rerender({ on: true, user: USER_ID });
    expect(inboxFake.channels).toHaveLength(1);
    off.rerender({ on: false, user: USER_ID });
    expect(inboxFake.channels[0].removed).toBe(true);
  });

  it('gives each caller its own channel (the bell and /inbox at once)', () => {
    const { wrapper } = setup();
    renderHook(() => useInboxRealtime(USER_ID, true), { wrapper });
    renderHook(() => useInboxRealtime(USER_ID, true), { wrapper });
    const names = inboxFake.channels.map((c) => c.name);
    expect(new Set(names).size).toBe(2);
    for (const name of names) expect(name.startsWith(`notification-inbox:${USER_ID}:`)).toBe(true);
  });
});

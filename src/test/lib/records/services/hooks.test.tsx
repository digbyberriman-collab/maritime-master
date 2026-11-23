/**
 * The record hooks (Phase 2 spec §B.6): query keys come from `recordKeys`
 * with the ids they were read for; `useExportJob` polls with
 * `exportPollInterval` while the server says requested / running and stops
 * at a terminal status (no timed fake completion); every mutation
 * invalidates `recordKeys.envelope(id)` when it settles, refused and failed
 * ones included.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Reply = { data: unknown; error: unknown };
const h = vi.hoisted(() => ({
  replies: new Map<string, Reply>(),
  /** Export job statuses served in turn (the last one repeats). */
  jobStatuses: [] as string[],
  jobReads: 0,
  rpcs: [] as { name: string; args: unknown }[],
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      is: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: () => builder,
      then: (resolve: (v: Reply) => unknown, reject: (e: unknown) => unknown) => {
        if (table === 'export_jobs') {
          const status = h.jobStatuses[Math.min(h.jobReads, h.jobStatuses.length - 1)];
          h.jobReads += 1;
          return Promise.resolve({ data: { id: 'j1', status }, error: null }).then(resolve, reject);
        }
        return Promise.resolve(h.replies.get(table) ?? { data: [], error: null }).then(resolve, reject);
      },
    };
    return builder;
  };
  const rpc = (name: string, args: unknown) => {
    h.rpcs.push({ name, args });
    return Promise.resolve(h.replies.get(name) ?? { data: { ok: true, value: {} }, error: null });
  };
  return { supabase: { from, rpc } };
});

import {
  EXPORT_POLL_MS,
  exportJobRefetchInterval,
  recordKeys,
  useEnvelope,
  useExportJob,
  useLinkRecords,
  useSignRecordSlot,
  useSlotStates,
  useThread,
  useTransitionRecord,
} from '@/lib/records/services';

let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  client.clear();
  h.replies.clear();
  h.jobStatuses = [];
  h.jobReads = 0;
  h.rpcs.length = 0;
  vi.useRealTimers();
});

describe('reads', () => {
  it('useEnvelope caches under recordKeys.envelope(id) and returns the ServiceResult', async () => {
    h.replies.set('record_envelopes', { data: { id: 'e1', status: 'open' }, error: null });
    const { result } = renderHook(() => useEnvelope('e1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ status: 'ok', value: { id: 'e1', status: 'open' } });
    expect(client.getQueryData(recordKeys.envelope('e1'))).toEqual(result.current.data);
  });

  it('a missing table is data (`missing`), not an error', async () => {
    h.replies.set('record_envelopes', { data: null, error: { code: '42P01', message: 'relation "public.record_envelopes" does not exist' } });
    const { result } = renderHook(() => useEnvelope('e1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ status: 'missing' });
  });

  it('a 500 is the query error (the page shows its error state with Retry)', async () => {
    const error = { code: '500', message: 'Internal Server Error' };
    h.replies.set('record_envelopes', { data: null, error });
    const { result } = renderHook(() => useEnvelope('e1'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(error);
  });

  it('no id: nothing is read', async () => {
    const { result } = renderHook(() => useEnvelope(null), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(client.getQueryCache().getAll()[0]?.state.dataUpdateCount ?? 0).toBe(0);
  });

  it('slot states and threads are keyed under their envelope (cycle and kind in the key)', async () => {
    renderHook(() => useSlotStates('e1', 2), { wrapper });
    renderHook(() => useThread('e1', 'company_review'), { wrapper });
    await waitFor(() => expect(client.getQueryData(recordKeys.slots('e1', 2))).toBeDefined());
    await waitFor(() => expect(client.getQueryData(recordKeys.thread('e1', 'company_review'))).toBeDefined());
  });
});

describe('useExportJob polls the real status', () => {
  it('the interval follows the server status', () => {
    expect(exportJobRefetchInterval({ status: 'ok', value: { status: 'requested' } })).toBe(EXPORT_POLL_MS);
    expect(exportJobRefetchInterval({ status: 'ok', value: { status: 'ready' } })).toBe(false);
    expect(exportJobRefetchInterval({ status: 'missing' })).toBe(false);
    expect(exportJobRefetchInterval({ status: 'ok', value: null })).toBe(false);
    expect(exportJobRefetchInterval(undefined)).toBe(false);
  });

  it('requested → running → ready: polls every 3 s, then stops', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    h.jobStatuses = ['requested', 'running', 'ready'];
    const { result } = renderHook(() => useExportJob('j1'), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual({ status: 'ok', value: { id: 'j1', status: 'requested' } }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(EXPORT_POLL_MS);
    });
    await waitFor(() => expect(result.current.data).toMatchObject({ value: { status: 'running' } }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(EXPORT_POLL_MS);
    });
    await waitFor(() => expect(result.current.data).toMatchObject({ value: { status: 'ready' } }));
    const reads = h.jobReads;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(EXPORT_POLL_MS * 5);
    });
    expect(h.jobReads).toBe(reads);
  });

  it('a job that stays requested keeps saying so (no timed completion)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    h.jobStatuses = ['requested'];
    const { result } = renderHook(() => useExportJob('j1'), { wrapper });
    await waitFor(() => expect(result.current.data).toMatchObject({ value: { status: 'requested' } }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(EXPORT_POLL_MS * 20);
    });
    expect(result.current.data).toMatchObject({ value: { status: 'requested' } });
    expect(h.jobReads).toBeGreaterThan(10);
  });
});

describe('mutations invalidate the envelope when they settle', () => {
  it('a transition names the action for this envelope and invalidates recordKeys.envelope(id)', async () => {
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useTransitionRecord('e1'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ action: 'acknowledge', expectedVersion: 3 });
    });
    expect(h.rpcs[0]).toEqual({ name: 'record_transition', args: { p_envelope_id: 'e1', p_action: 'acknowledge', p_payload: {}, p_expected_version: 3 } });
    expect(spy).toHaveBeenCalledWith({ queryKey: recordKeys.envelope('e1') });
  });

  it('a refused signature still invalidates (the server may have moved on)', async () => {
    h.replies.set('record_sign_slot', { data: { ok: false, error: { code: 'slot_waiting', message: 'Wait for the earlier slot.' } }, error: null });
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useSignRecordSlot('e1'), { wrapper });
    let answer: unknown;
    await act(async () => {
      answer = await result.current.mutateAsync({ signatureId: 's1', slotId: 'sl1', method: 'verified' });
    });
    expect(answer).toEqual({ status: 'refused', code: 'slot_waiting', message: 'Wait for the earlier slot.' });
    expect(spy).toHaveBeenCalledWith({ queryKey: recordKeys.envelope('e1') });
  });

  it('a thrown failure is the mutation error and still invalidates', async () => {
    h.replies.set('record_transition', { data: null, error: { code: '500', message: 'Internal Server Error' } });
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useTransitionRecord('e1'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ action: 'submit' }).catch(() => undefined);
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(spy).toHaveBeenCalledWith({ queryKey: recordKeys.envelope('e1') });
  });

  it('a link invalidates both envelopes', async () => {
    h.replies.set('link_records', { data: { id: 'l1' }, error: null });
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useLinkRecords('e1'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ toEnvelopeId: 'e2', kind: 'follow_up' });
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: recordKeys.envelope('e1') });
    expect(spy).toHaveBeenCalledWith({ queryKey: recordKeys.envelope('e2') });
  });
});

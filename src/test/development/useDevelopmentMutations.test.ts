/**
 * Training application writes (X5-07A, gap/02 TR4–TR6, W3; D-X5-20):
 *
 * - every status change calls development_transition(), and its answer is
 *   checked before anything says "done" (another application or an
 *   unknown status is "not confirmed", never success);
 * - a refusal from the definer is the refusal, in words: no fallback;
 * - only a missing RPC (the file not applied, D-01) takes the D-X5-20
 *   fallback, and only for the applicant's submit of a draft or returned
 *   application and cancel of a draft: today's direct writes, on their own
 *   row, from those statuses, with the affected row checked;
 * - every other action with the RPC missing is "not set up yet";
 * - a new application is inserted without a status (a draft);
 * - the hooks file writes `status:` only in the fallback.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Result = { data: unknown; error: unknown };

const h = vi.hoisted(() => ({
  rpcResult: { data: null, error: null } as Result,
  rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  writeResult: { data: [{ id: 'app-1' }], error: null } as Result,
  insertResult: { data: null, error: null } as Result,
  fromCalls: [] as string[],
  updates: [] as Array<Record<string, unknown>>,
  inserts: [] as Array<Record<string, unknown>>,
  filters: [] as Array<[string, string, unknown]>,
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    h.fromCalls.push(table);
    const chain: Record<string, unknown> = {};
    let mode: 'update' | 'insert' | 'select' = 'select';
    chain.update = (values: Record<string, unknown>) => {
      mode = 'update';
      h.updates.push(values);
      return chain;
    };
    chain.insert = (values: Record<string, unknown>) => {
      mode = 'insert';
      h.inserts.push(values);
      return chain;
    };
    chain.eq = (column: string, value: unknown) => {
      h.filters.push(['eq', column, value]);
      return chain;
    };
    chain.in = (column: string, value: unknown) => {
      h.filters.push(['in', column, value]);
      return chain;
    };
    chain.select = () => (mode === 'update' ? Promise.resolve(h.writeResult) : chain);
    chain.single = () => Promise.resolve(h.insertResult);
    return chain;
  };
  const rpc = (fn: string, args: Record<string, unknown>) => {
    h.rpcCalls.push({ fn, args });
    return Promise.resolve(h.rpcResult);
  };
  return { supabase: { from, rpc } };
});
vi.mock('@/shared/lib/notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/notify')>();
  return { ...actual, notify: { ...actual.notify, success: h.success, error: h.error } };
});
vi.mock('@/modules/auth/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, profile: { company_id: 'co-1' } }),
}));
vi.mock('@/modules/vessels/contexts/VesselContext', () => ({
  useVessel: () => ({ selectedVesselId: 'vessel-1', vessels: [] }),
}));

import {
  TransitionNotSetUpError,
  TransitionUnconfirmedError,
  runApplicationTransition,
  transitionErrorMessage,
  useApplicationTransition,
  useCreateApplication,
  useSubmitApplication,
} from '@/modules/development/hooks/useDevelopmentMutations';
import { ACTION_DONE, TRANSITION_NOT_SET_UP, TRANSITION_REFUSALS } from '@/modules/development/lib/applicationMachine';

const MISSING_RPC = { code: 'PGRST202', message: 'Could not find the function public.development_transition' };
const confirmed = (over: Record<string, unknown> = {}) => ({
  id: 'app-1',
  status: 'hod_review',
  from_status: 'draft',
  action: 'submit',
  actor_role: 'applicant',
  event_id: 'ev-1',
  updated_at: '2026-11-26T10:00:00Z',
  ...over,
});

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  h.rpcResult = { data: confirmed(), error: null };
  h.rpcCalls = [];
  h.writeResult = { data: [{ id: 'app-1' }], error: null };
  h.insertResult = { data: { id: 'app-9', application_number: 'CDA-20261126-0001', crew_member_id: 'user-1' }, error: null };
  h.fromCalls = [];
  h.updates = [];
  h.inserts = [];
  h.filters = [];
  h.success.mockReset();
  h.error.mockReset();
});

describe('runApplicationTransition: the RPC', () => {
  it('calls development_transition with the action, payload and last seen time, and writes nothing itself', async () => {
    const out = await runApplicationTransition(
      { applicationId: 'app-1', action: 'submit', expectedUpdatedAt: '2026-11-26T09:00:00Z', currentStatus: 'draft', actingAs: 'applicant' },
      'user-1',
    );
    expect(h.rpcCalls).toEqual([
      {
        fn: 'development_transition',
        args: { p_application_id: 'app-1', p_action: 'submit', p_payload: {}, p_expected_updated_at: '2026-11-26T09:00:00Z' },
      },
    ]);
    expect(h.fromCalls).toEqual([]);
    expect(out).toEqual({
      mode: 'rpc',
      result: { id: 'app-1', status: 'hod_review', fromStatus: 'draft', action: 'submit', actorRole: 'applicant', eventId: 'ev-1', updatedAt: '2026-11-26T10:00:00Z' },
    });
  });

  it('sends the payload of an approver action', async () => {
    h.rpcResult = { data: confirmed({ status: 'returned', from_status: 'hod_review', action: 'hod_return', actor_role: 'hod' }), error: null };
    await runApplicationTransition({ applicationId: 'app-1', action: 'hod_return', payload: { comment: 'Add the dates' } }, 'user-1');
    expect(h.rpcCalls[0].args).toMatchObject({ p_action: 'hod_return', p_payload: { comment: 'Add the dates' }, p_expected_updated_at: null });
  });

  it('does not take an answer for another application, or with an unknown status, as done', async () => {
    h.rpcResult = { data: confirmed({ id: 'app-2' }), error: null };
    await expect(runApplicationTransition({ applicationId: 'app-1', action: 'submit' }, 'user-1')).rejects.toBeInstanceOf(TransitionUnconfirmedError);
    h.rpcResult = { data: confirmed({ status: 'archived' }), error: null };
    await expect(runApplicationTransition({ applicationId: 'app-1', action: 'submit' }, 'user-1')).rejects.toBeInstanceOf(TransitionUnconfirmedError);
    h.rpcResult = { data: null, error: null };
    await expect(runApplicationTransition({ applicationId: 'app-1', action: 'submit' }, 'user-1')).rejects.toBeInstanceOf(TransitionUnconfirmedError);
    expect(h.fromCalls).toEqual([]);
  });

  it('passes a refusal through, in words, without falling back', async () => {
    h.rpcResult = { data: null, error: { code: '22023', message: 'stale_application' } };
    const run = runApplicationTransition({ applicationId: 'app-1', action: 'submit', currentStatus: 'draft', actingAs: 'applicant' }, 'user-1');
    await expect(run).rejects.toMatchObject({ code: '22023', message: 'stale_application' });
    expect(h.fromCalls).toEqual([]);
    expect(transitionErrorMessage({ code: '22023', message: 'stale_application' })).toBe(TRANSITION_REFUSALS.stale_application);
    h.rpcResult = { data: null, error: { code: '42501', message: 'not_permitted' } };
    await expect(runApplicationTransition({ applicationId: 'app-1', action: 'cancel', currentStatus: 'draft', actingAs: 'applicant' }, 'user-1')).rejects.toMatchObject({
      code: '42501',
    });
    expect(h.fromCalls).toEqual([]);
  });
});

describe('runApplicationTransition: the D-X5-20 fallback (RPC missing only)', () => {
  beforeEach(() => {
    h.rpcResult = { data: null, error: MISSING_RPC };
  });

  it("submits the applicant's own draft or returned application with today's write", async () => {
    const out = await runApplicationTransition({ applicationId: 'app-1', action: 'submit', currentStatus: 'returned', actingAs: 'applicant' }, 'user-1');
    expect(out).toEqual({ mode: 'fallback', applicationId: 'app-1', action: 'submit' });
    expect(h.updates).toHaveLength(1);
    expect(h.updates[0]).toMatchObject({ status: 'hod_review' });
    expect(Object.keys(h.updates[0]).sort()).toEqual(['status', 'submitted_at']);
    expect(h.filters).toEqual([
      ['eq', 'id', 'app-1'],
      ['eq', 'crew_member_id', 'user-1'],
      ['in', 'status', ['draft', 'returned']],
    ]);
  });

  it("cancels the applicant's own draft only", async () => {
    await runApplicationTransition({ applicationId: 'app-1', action: 'cancel', currentStatus: 'draft', actingAs: 'applicant' }, 'user-1');
    expect(h.updates).toEqual([{ status: 'cancelled' }]);
    expect(h.filters).toEqual([
      ['eq', 'id', 'app-1'],
      ['eq', 'crew_member_id', 'user-1'],
      ['eq', 'status', 'draft'],
    ]);
  });

  it('reports nothing done when the write changed no row', async () => {
    h.writeResult = { data: [], error: null };
    await expect(
      runApplicationTransition({ applicationId: 'app-1', action: 'submit', currentStatus: 'draft', actingAs: 'applicant' }, 'user-1'),
    ).rejects.toBeInstanceOf(TransitionUnconfirmedError);
    h.writeResult = { data: null, error: { code: '42501', message: 'permission denied' } };
    await expect(
      runApplicationTransition({ applicationId: 'app-1', action: 'submit', currentStatus: 'draft', actingAs: 'applicant' }, 'user-1'),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('says "not set up yet" for every other action, and writes nothing', async () => {
    const cases = [
      { action: 'hod_approve', currentStatus: 'hod_review', actingAs: 'hod' },
      { action: 'final_approve', currentStatus: 'captain_purser_review', actingAs: 'captain' },
      { action: 'reject', currentStatus: 'hod_review', actingAs: 'hod' },
      { action: 'cancel', currentStatus: 'hod_review', actingAs: 'applicant' },
      { action: 'cancel', currentStatus: 'approved', actingAs: 'captain' },
      { action: 'complete', currentStatus: 'enrolled', actingAs: 'applicant' },
      { action: 'void', currentStatus: 'approved', actingAs: 'training_admin' },
      { action: 'submit', currentStatus: 'draft', actingAs: null },
      { action: 'submit', currentStatus: 'hod_review', actingAs: 'applicant' },
    ] as const;
    for (const c of cases) {
      await expect(runApplicationTransition({ applicationId: 'app-1', ...c }, 'user-1'), JSON.stringify(c)).rejects.toBeInstanceOf(TransitionNotSetUpError);
    }
    expect(h.fromCalls).toEqual([]);
    expect(transitionErrorMessage(new TransitionNotSetUpError())).toBe(TRANSITION_NOT_SET_UP);
  });
});

describe('useApplicationTransition', () => {
  it('says done only once the server confirmed it', async () => {
    h.rpcResult = { data: confirmed({ status: 'captain_purser_review', from_status: 'hod_review', action: 'hod_approve', actor_role: 'hod' }), error: null };
    const { result } = renderHook(() => useApplicationTransition(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({ applicationId: 'app-1', action: 'hod_approve' });
    });
    expect(h.success).toHaveBeenCalledWith(ACTION_DONE.hod_approve);
    expect(h.error).not.toHaveBeenCalled();
  });

  it('reports an unconfirmed answer as an error, never as success', async () => {
    h.rpcResult = { data: confirmed({ id: 'someone-else' }), error: null };
    const { result } = renderHook(() => useApplicationTransition(), { wrapper: wrapper() });
    await act(async () => {
      await expect(result.current.mutateAsync({ applicationId: 'app-1', action: 'hod_approve' })).rejects.toBeInstanceOf(TransitionUnconfirmedError);
    });
    await waitFor(() => expect(h.error).toHaveBeenCalled());
    expect(h.success).not.toHaveBeenCalled();
    expect((h.error.mock.calls[0][0] as Error).message).toMatch(/did not confirm/);
  });

  it('reports "not set up yet" for an approval while the RPC is missing', async () => {
    h.rpcResult = { data: null, error: MISSING_RPC };
    const { result } = renderHook(() => useApplicationTransition(), { wrapper: wrapper() });
    await act(async () => {
      await expect(result.current.mutateAsync({ applicationId: 'app-1', action: 'final_approve', currentStatus: 'captain_purser_review', actingAs: 'captain' })).rejects.toBeInstanceOf(
        TransitionNotSetUpError,
      );
    });
    await waitFor(() => expect(h.error).toHaveBeenCalled());
    expect((h.error.mock.calls[0][0] as Error).message).toBe(TRANSITION_NOT_SET_UP);
    expect(h.success).not.toHaveBeenCalled();
  });

  it('submits as the applicant, from the status the page loaded', async () => {
    h.rpcResult = { data: null, error: MISSING_RPC };
    const { result } = renderHook(() => useSubmitApplication(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync('app-1', 'returned');
    });
    expect(h.updates[0]).toMatchObject({ status: 'hod_review' });
    expect(h.success).toHaveBeenCalledWith(ACTION_DONE.submit);
  });
});

describe('useCreateApplication', () => {
  it('inserts a draft without a status and checks the row came back as the caller', async () => {
    const { result } = renderHook(() => useCreateApplication({ quiet: true }), { wrapper: wrapper() });
    let created: unknown;
    await act(async () => {
      created = await result.current.mutateAsync({ course_name: 'Wine service', category: 'professional' });
    });
    expect(created).toEqual({ id: 'app-9', application_number: 'CDA-20261126-0001', crew_member_id: 'user-1' });
    expect(h.inserts).toEqual([{ course_name: 'Wine service', category: 'professional', crew_member_id: 'user-1', company_id: 'co-1', vessel_id: 'vessel-1' }]);
    expect(h.inserts[0]).not.toHaveProperty('status');
    expect(h.success).not.toHaveBeenCalled();
  });

  it('does not report a draft saved when the row did not come back', async () => {
    h.insertResult = { data: { id: 'app-9', application_number: 'x', crew_member_id: 'someone-else' }, error: null };
    const { result } = renderHook(() => useCreateApplication(), { wrapper: wrapper() });
    await act(async () => {
      await expect(result.current.mutateAsync({ course_name: 'Wine service', category: 'professional' })).rejects.toThrow(/not saved/);
    });
    expect(h.success).not.toHaveBeenCalled();
  });
});

describe('the hooks file', () => {
  it('writes a status only in the D-X5-20 fallback', () => {
    const source = readFileSync(join(process.cwd(), 'src/modules/development/hooks/useDevelopmentMutations.ts'), 'utf8');
    const lines = source.split('\n').filter((line) => /\bstatus:/.test(line));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("status: 'hod_review'");
    expect(lines[1]).toContain("status: 'cancelled'");
    const fallback = source.slice(source.indexOf('async function runLegacyFallback'), source.indexOf('/** Whether development_transition answered'));
    for (const line of lines) expect(fallback).toContain(line.trim());
  });
});

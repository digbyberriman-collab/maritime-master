/**
 * useCrewCount (Phase 1 round 3, D-103 follow-up): nothing is read until
 * the session and the profile have loaded; then an account with no company
 * is an error with reason `no-company` (no endless skeleton, no made-up 0,
 * no request), and a company counts its active profiles.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  auth: {} as Record<string, unknown>,
  from: vi.fn(),
  answer: { count: 7, error: null as unknown },
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (...args: unknown[]) => h.from(...args) } }));
vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => h.auth }));

import { CrewCountNoCompanyError, useCrewCount } from '@/modules/crew/hooks/useCrew';

let qc: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client: qc }, children);

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  h.from.mockReset();
  h.answer = { count: 7, error: null };
  h.from.mockImplementation(() => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(h.answer).then(resolve);
    return chain;
  });
});

describe('useCrewCount', () => {
  it('reads nothing while the session or the profile is still loading', async () => {
    h.auth = { user: { id: 'u-1' }, profile: null, loading: true, profileResolved: false };
    const { result } = renderHook(() => useCrewCount(), { wrapper });
    expect(result.current.isPending).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    expect(h.from).not.toHaveBeenCalled();
  });

  it('an account with no company is an error with reason no-company, never a skeleton or a 0, and nothing is read', async () => {
    h.auth = { user: { id: 'u-1' }, profile: { id: 'p-1', company_id: null }, loading: false, profileResolved: true };
    const { result } = renderHook(() => useCrewCount(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(CrewCountNoCompanyError);
    expect((result.current.error as CrewCountNoCompanyError).reason).toBe('no-company');
    expect(result.current.data).toBeUndefined();
    expect(h.from).not.toHaveBeenCalled();
  });

  it('a profile that could not be read (resolved, none) is the same error', async () => {
    h.auth = { user: { id: 'u-1' }, profile: null, loading: false, profileResolved: true };
    const { result } = renderHook(() => useCrewCount(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(CrewCountNoCompanyError);
  });

  it('counts the active profiles of the company', async () => {
    h.auth = { user: { id: 'u-1' }, profile: { id: 'p-1', company_id: 'c-1' }, loading: false, profileResolved: true };
    const { result } = renderHook(() => useCrewCount(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(7);
    expect(h.from).toHaveBeenCalledWith('profiles');
  });

  it('a failed read is an error (the tile offers Retry)', async () => {
    h.auth = { user: { id: 'u-1' }, profile: { id: 'p-1', company_id: 'c-1' }, loading: false, profileResolved: true };
    h.answer = { count: null as unknown as number, error: { code: '500', message: 'boom' } };
    const { result } = renderHook(() => useCrewCount(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).not.toBeInstanceOf(CrewCountNoCompanyError);
  });
});

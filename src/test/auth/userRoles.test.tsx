/**
 * Role writes from the browser (finding user-roles-write-cross-tenant-roles,
 * client honesty): the database no longer lets `authenticated` insert or
 * update `user_roles`. RLS answers a refused UPDATE with 0 rows and no
 * error, and a refused INSERT with 42501; both hooks say "refused", never
 * "Role revoked" / "Role assigned".
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  answer: { data: null as unknown, error: null as unknown },
  ops: [] as string[],
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  for (const op of ['insert', 'update', 'eq', 'select', 'single']) chain[op] = (..._args: unknown[]) => (h.ops.push(op), chain);
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(h.answer).then(resolve);
  return { supabase: { from: () => chain } };
});
vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u-admin' }, profile: { company_id: 'c-1' } }) }));
vi.mock('sonner', () => ({ toast: h.toast }));

import { RoleChangeRefusedError, useAssignRole, useRevokeRole } from '@/modules/auth/hooks/useUserRoles';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>{children}</QueryClientProvider>
);

beforeEach(() => {
  h.ops = [];
  h.toast.success.mockReset();
  h.toast.error.mockReset();
});

describe('useRevokeRole', () => {
  it('asks for the changed rows; 0 rows changed (RLS) is a refusal, never "Role revoked"', async () => {
    h.answer = { data: [], error: null };
    const { result } = renderHook(() => useRevokeRole(), { wrapper });
    let caught: unknown;
    await act(async () => {
      await result.current.mutateAsync('role-1').catch((e: unknown) => (caught = e));
    });
    expect(h.ops).toEqual(['update', 'eq', 'select']);
    expect(caught).toBeInstanceOf(RoleChangeRefusedError);
    expect(caught).toMatchObject({ code: 'role_change_refused' });
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith("You can't remove this role here. Roles are changed in Users & Access."));
    expect(h.toast.success).not.toHaveBeenCalled();
  });

  it('a changed row is a revoke', async () => {
    h.answer = { data: [{ id: 'role-1' }], error: null };
    const { result } = renderHook(() => useRevokeRole(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('role-1');
    });
    expect(h.toast.success).toHaveBeenCalledWith('Role revoked');
  });
});

describe('useAssignRole', () => {
  it('an INSERT refused by RLS (42501) is the refusal, not the Postgres text', async () => {
    h.answer = { data: null, error: { code: '42501', message: 'new row violates row-level security policy for table "user_roles"' } };
    const { result } = renderHook(() => useAssignRole(), { wrapper });
    let caught: unknown;
    await act(async () => {
      await result.current.mutateAsync({ targetUserId: 'u-1', role: 'captain' }).catch((e: unknown) => (caught = e));
    });
    expect(caught).toBeInstanceOf(RoleChangeRefusedError);
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith("You can't give this role here. Roles are given in Users & Access."));
    expect(h.toast.success).not.toHaveBeenCalled();
  });
});

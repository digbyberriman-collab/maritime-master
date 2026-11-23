/**
 * Users & Access detail: honest override writes and reads (findings
 * override-delete-fake-success and access-detail-swallows-read-errors).
 *
 * - RLS answers a DELETE it refuses with 0 rows and no error: the hooks
 *   count what was deleted against what was visible, refuse
 *   (`override_refused`) and insert nothing next to a surviving row; the
 *   page says "You can't change this person's access for <module>" and
 *   never "Permission updated".
 * - An INSERT refused by RLS (42501) is the same refusal.
 * - Your own access is read-only.
 * - A failed read of the assignment, the overrides or the roles is an error
 *   state with Retry, never "None" everywhere; several current assignments
 *   show the most recent; duplicate overrides show the highest.
 *
 * The Supabase client is an in-memory fake that applies eq / in / order /
 * limit and lets a test make deletes "RLS filtered" (rows stay, 0 returned).
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Row = Record<string, unknown>;
type Filter = ['eq' | 'in', string, unknown];

const h = vi.hoisted(() => ({
  db: {} as Record<string, Row[]>,
  readErrors: {} as Record<string, unknown>,
  /** RLS USING for DELETE: true keeps the row (0 rows deleted, no error). */
  deleteBlocked: ((_table: string, _row: Row) => false) as (table: string, row: Row) => boolean,
  insertError: null as unknown,
  rpc: vi.fn(),
  calls: [] as Array<{ table: string; op: string; filters: Filter[]; payload?: unknown }>,
  user: { id: 'u-admin' },
  notify: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    const q = { op: 'select', filters: [] as Filter[], payload: undefined as unknown, order: null as null | [string, boolean], limit: null as number | null, returning: false };
    const matches = (row: Row) => q.filters.every(([op, col, val]) => (op === 'eq' ? row[col] === val : (val as unknown[]).includes(row[col])));
    const run = (): { data: unknown; error: unknown } => {
      h.calls.push({ table, op: q.op, filters: q.filters, payload: q.payload });
      const rows = (h.db[table] ??= []);
      if (q.op === 'select') {
        if (h.readErrors[table]) return { data: null, error: h.readErrors[table] };
        let out = rows.filter(matches);
        if (q.order) {
          const [col, asc] = q.order;
          out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1));
        }
        if (q.limit !== null) out = out.slice(0, q.limit);
        return { data: out, error: null };
      }
      if (q.op === 'delete') {
        const victims = rows.filter(matches).filter((r) => !h.deleteBlocked(table, r));
        h.db[table] = rows.filter((r) => !victims.includes(r));
        return { data: q.returning ? victims : null, error: null };
      }
      if (h.insertError) return { data: null, error: h.insertError };
      const list = (Array.isArray(q.payload) ? q.payload : [q.payload]) as Row[];
      list.forEach((r, i) => rows.push({ id: `new-${rows.length + i}`, ...r }));
      return { data: null, error: null };
    };
    const chain: Record<string, unknown> = {
      select: () => {
        if (q.op !== 'select') q.returning = true;
        return chain;
      },
      delete: () => ((q.op = 'delete'), chain),
      insert: (payload: unknown) => ((q.op = 'insert'), (q.payload = payload), chain),
      eq: (col: string, val: unknown) => (q.filters.push(['eq', col, val]), chain),
      in: (col: string, val: unknown) => (q.filters.push(['in', col, val]), chain),
      order: (col: string, opts?: { ascending?: boolean }) => ((q.order = [col, opts?.ascending ?? true]), chain),
      limit: (n: number) => ((q.limit = n), chain),
      maybeSingle: () => {
        const res = run();
        if (res.error) return Promise.resolve(res);
        return Promise.resolve({ data: (res.data as Row[])[0] ?? null, error: null });
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
    };
    return chain;
  };
  return { supabase: { from, rpc: (...args: unknown[]) => h.rpc(...args), functions: { invoke: vi.fn() } } };
});
vi.mock('@/modules/auth/contexts/AuthContext', () => ({
  useAuth: () => ({ user: h.user, profile: { id: 'p-admin', company_id: 'c-1', role: 'dpa' } }),
}));
vi.mock('@/lib/permissions/useCan', () => ({ useCan: () => true }));
vi.mock('@/shared/components/layout/DashboardLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/shared/lib/notify', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/shared/lib/notify')>()), notify: h.notify }));
// Radix Select needs layout APIs jsdom lacks: a native <select> with the same contract (value, onValueChange, disabled, aria-label).
vi.mock('@/components/ui/select', () => {
  type Ctx = { value?: string; onValueChange?: (v: string) => void; disabled?: boolean; items: string[]; register: (v: string) => void };
  const SelectCtx = React.createContext<Ctx>({ items: [], register: () => undefined });
  const Select = ({ value, onValueChange, disabled, children }: { value?: string; onValueChange?: (v: string) => void; disabled?: boolean; children: React.ReactNode }) => {
    const [items, setItems] = React.useState<string[]>([]);
    const register = React.useCallback((v: string) => setItems((xs) => (xs.includes(v) ? xs : [...xs, v])), []);
    return <SelectCtx.Provider value={{ value, onValueChange, disabled, items, register }}>{children}</SelectCtx.Provider>;
  };
  const SelectTrigger = (props: { 'aria-label'?: string }) => {
    const c = React.useContext(SelectCtx);
    return (
      <select aria-label={props['aria-label']} value={c.value ?? ''} disabled={c.disabled} onChange={(e) => c.onValueChange?.(e.target.value)}>
        <option value="" />
        {c.items.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    );
  };
  const SelectItem = ({ value }: { value: string }) => {
    const { register } = React.useContext(SelectCtx);
    React.useEffect(() => register(value), [register, value]);
    return null;
  };
  const Passthrough = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  return { Select, SelectTrigger, SelectItem, SelectContent: Passthrough, SelectValue: () => null, SelectGroup: Passthrough, SelectLabel: Passthrough, SelectSeparator: () => null };
});

import UsersAccessDetailPage from '@/modules/users-access/pages/UsersAccessDetailPage';
import { useUserAccessDetail } from '@/modules/users-access/hooks/useUserAccessDetail';
import { isOverrideRefused, useApplyPreset, useSavePermissionOverride } from '@/modules/users-access/hooks/useSavePermissionOverride';

const override = (module_key: string, permission: string, patch: Row = {}): Row => ({
  id: `o-${module_key}-${permission}-${Math.random().toString(36).slice(2, 7)}`,
  user_id: 'u-1',
  module_key,
  permission,
  is_granted: true,
  restrictions: null,
  created_at: '2026-11-20T00:00:00Z',
  ...patch,
});

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}
const wrapper = (qc: QueryClient) => ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

function renderPage() {
  return render(
    <QueryClientProvider client={client()}>
      <MemoryRouter initialEntries={['/users-access/u-1']}>
        <Routes>
          <Route path="/users-access/:userId" element={<UsersAccessDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const writes = () => h.calls.filter((c) => c.op === 'insert' || c.op === 'delete');

beforeEach(() => {
  h.user = { id: 'u-admin' };
  h.readErrors = {};
  h.deleteBlocked = () => false;
  h.insertError = null;
  h.calls = [];
  h.rpc.mockReset();
  h.rpc.mockResolvedValue({ data: [{ role_display_name: 'Crew' }], error: null });
  Object.values(h.notify).forEach((fn) => fn.mockReset());
  h.db = {
    profiles: [{ id: 'p-1', company_id: 'c-1', account_status: 'active', user_id: 'u-1', first_name: 'Demo', last_name: 'Bosun', email: 'bosun@example.test' }],
    crew_assignments: [{ user_id: 'u-1', position: 'Bosun', is_current: true, join_date: '2026-01-01' }],
    user_permission_overrides: [override('vessel_certificates', 'edit')],
    modules: [{ key: 'vessel_certificates', name: 'Vessel certificates', sort_order: 1, is_active: true }],
    user_invitations: [],
  };
});

describe('useUserAccessDetail: a failed read is an error, never "no access"', () => {
  it.each([
    ['crew_assignments', { code: '500', message: 'boom' }],
    ['user_permission_overrides', { code: '500', message: 'internal error' }],
  ])('a failed %s read → isError', async (table, error) => {
    h.readErrors[table] = error;
    const { result } = renderHook(() => useUserAccessDetail('u-1'), { wrapper: wrapper(client()) });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('a failed get_user_roles_full → isError', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } });
    const { result } = renderHook(() => useUserAccessDetail('u-1'), { wrapper: wrapper(client()) });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('two current assignments (two vessels) → success with the most recent position', async () => {
    h.db.crew_assignments = [
      { user_id: 'u-1', position: 'Deckhand', is_current: true, join_date: '2025-03-01' },
      { user_id: 'u-1', position: 'Bosun', is_current: true, join_date: '2026-06-01' },
    ];
    const { result } = renderHook(() => useUserAccessDetail('u-1'), { wrapper: wrapper(client()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.position).toBe('Bosun');
    expect(result.current.data?.roleDisplayName).toBe('Crew');
  });

  it('duplicate overrides for a module → the highest wins, whatever the order', async () => {
    h.db.user_permission_overrides = [override('hr', 'admin'), override('hr', 'view'), override('ism', 'view'), override('ism', 'edit')];
    const { result } = renderHook(() => useUserAccessDetail('u-1'), { wrapper: wrapper(client()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.permissions).toEqual({ hr: 'admin', ism: 'edit' });
  });

  it('the page shows the error with Try again, not a matrix of "None"', async () => {
    h.readErrors.user_permission_overrides = { code: '500', message: 'internal error' };
    renderPage();
    expect(await screen.findByRole('button', { name: /Try again/ })).toBeInTheDocument();
    expect(screen.queryByText('Crew Module Access')).toBeNull();
  });
});

describe('override writes prove what they changed', () => {
  it('a 0-row DELETE (RLS) is a refusal: the hook rejects and inserts nothing', async () => {
    h.db.user_permission_overrides = [override('hr', 'admin')];
    h.deleteBlocked = () => true;
    const { result } = renderHook(() => useSavePermissionOverride(), { wrapper: wrapper(client()) });
    let caught: unknown;
    await act(async () => {
      await result.current.mutateAsync({ userId: 'u-1', moduleKey: 'hr', permission: 'view' }).catch((e: unknown) => (caught = e));
    });
    expect(isOverrideRefused(caught)).toBe(true);
    expect(caught).toMatchObject({ code: 'override_refused', moduleKeys: ['hr'], partial: false });
    expect(h.calls.filter((c) => c.op === 'insert')).toHaveLength(0);
    expect(h.db.user_permission_overrides).toHaveLength(1);
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('"None" with a 0-row delete is not a success either', async () => {
    h.db.user_permission_overrides = [override('hr', 'admin')];
    h.deleteBlocked = () => true;
    const { result } = renderHook(() => useSavePermissionOverride(), { wrapper: wrapper(client()) });
    await act(async () => {
      await result.current.mutateAsync({ userId: 'u-1', moduleKey: 'hr', permission: null }).catch(() => undefined);
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isSuccess).toBe(false);
  });

  it('an INSERT refused by RLS (42501) is the same refusal, not the Postgres message', async () => {
    h.insertError = { code: '42501', message: 'new row violates row-level security policy for table "user_permission_overrides"' };
    const { result } = renderHook(() => useSavePermissionOverride(), { wrapper: wrapper(client()) });
    let caught: unknown;
    await act(async () => {
      await result.current.mutateAsync({ userId: 'u-1', moduleKey: 'hr', permission: 'admin' }).catch((e: unknown) => (caught = e));
    });
    expect(isOverrideRefused(caught)).toBe(true);
    expect((caught as Error).message).not.toMatch(/row-level security/);
  });

  it('a preset with a surviving row inserts nothing next to it; the cleared modules get their level', async () => {
    h.db.user_permission_overrides = [override('hr', 'admin'), override('crew_roster', 'view')];
    h.deleteBlocked = (_t, row) => row.module_key === 'hr';
    const { result } = renderHook(() => useApplyPreset(), { wrapper: wrapper(client()) });
    let caught: unknown;
    await act(async () => {
      await result.current
        .mutateAsync({ userId: 'u-1', matrix: { crew_roster: 'edit', crew_certificates: 'edit', hr: 'view', training: 'edit' } })
        .catch((e: unknown) => (caught = e));
    });
    expect(caught).toMatchObject({ code: 'override_refused', moduleKeys: ['hr'], partial: true });
    const inserted = h.calls.filter((c) => c.op === 'insert').flatMap((c) => c.payload as Row[]);
    expect(inserted.map((r) => r.module_key).sort()).toEqual(['crew_certificates', 'crew_roster', 'training']);
    // hr keeps only its surviving admin row: no lower row beside it.
    expect(h.db.user_permission_overrides.filter((r) => r.module_key === 'hr').map((r) => r.permission)).toEqual(['admin']);
  });

  it('your own access is refused before anything is sent', async () => {
    h.user = { id: 'u-1' };
    const { result } = renderHook(() => useApplyPreset(), { wrapper: wrapper(client()) });
    let caught: unknown;
    await act(async () => {
      await result.current.mutateAsync({ userId: 'u-1', matrix: { hr: 'admin' } }).catch((e: unknown) => (caught = e));
    });
    expect(caught).toMatchObject({ code: 'override_refused', self: true });
    expect(writes()).toHaveLength(0);
  });
});

describe('UsersAccessDetailPage', () => {
  it('a module change whose DELETE RLS filtered shows the refusal toast and no success', async () => {
    h.deleteBlocked = () => true;
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Certificates/ }));
    fireEvent.change(await screen.findByRole('combobox', { name: 'Vessel certificates access' }), { target: { value: 'none' } });
    await waitFor(() => expect(h.notify.error).toHaveBeenCalled());
    expect(h.notify.success).not.toHaveBeenCalled();
    const [description, options] = h.notify.error.mock.calls[0] as [string, { title: string }];
    expect(options.title).toBe("You can't change this person's access for Vessel certificates");
    expect(description).toBe('Nothing was changed.');
    expect(h.calls.filter((c) => c.op === 'insert')).toHaveLength(0);
  });

  it('a module change that worked says "Permission updated"', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Certificates/ }));
    fireEvent.change(await screen.findByRole('combobox', { name: 'Vessel certificates access' }), { target: { value: 'view' } });
    await waitFor(() => expect(h.notify.success).toHaveBeenCalledWith('Permission updated', expect.anything()));
    expect(h.db.user_permission_overrides.filter((r) => r.module_key === 'vessel_certificates').map((r) => r.permission)).toEqual(['view']);
  });

  it('your own page is read-only, with the note', async () => {
    h.user = { id: 'u-1' };
    renderPage();
    const note = await screen.findByText("You can't change your own access.");
    expect(note.closest('[data-access-readonly]')).not.toBeNull();
    expect(screen.getByRole('combobox', { name: 'Access preset' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Set all modules to' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Certificates access' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Certificates/ }));
    expect(screen.getByRole('combobox', { name: 'Vessel certificates access' })).toBeDisabled();
    // The custom capabilities and the department scope are read-only too.
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThan(0);
    checkboxes.forEach((box) => expect(box).toBeDisabled());
    expect(writes()).toHaveLength(0);
  });

  it('someone else’s page is editable (no read-only note)', async () => {
    renderPage();
    const preset = await screen.findByRole('combobox', { name: 'Access preset' });
    expect(preset).not.toBeDisabled();
    expect(screen.queryByText("You can't change your own access.")).toBeNull();
    expect(within(document.body).getByText('Department Scope')).toBeInTheDocument();
  });
});

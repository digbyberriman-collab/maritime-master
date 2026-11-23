/**
 * Roles & Permissions and Settings → Permissions are read only (Phase 2
 * spec §A.8, proposed D-124): role definitions are global and frozen to the
 * service role by migration file 8, and `log_permission_change` becomes
 * service-only. Both screens show the "managed by STORM" notice, the matrix
 * as read-only marks, no save controls, no writes to `roles` /
 * `role_permissions`, and no `log_permission_change` call. A failed read
 * shows the error state, never an empty matrix.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readRepoFile } from '../design/cssTokens';

const h = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; op: string }>,
  rpc: vi.fn(),
  fail: null as string | null,
  role: 'dpa',
}));

const ROLES = [
  { id: 'r-captain', name: 'captain', display_name: 'Captain', description: 'Vessel command', default_scope: 'vessel', is_time_limited: false },
  { id: 'r-crew', name: 'crew', display_name: 'Crew', description: null, default_scope: 'self', is_time_limited: false },
];
const MODULES = [
  { id: 'm-1', key: 'crew_roster', name: 'Crew roster', parent_key: null, sort_order: 1, is_active: true },
  { id: 'm-2', key: 'documents', name: 'Documents', parent_key: null, sort_order: 2, is_active: true },
];
const PERMS = [
  { id: 'rp-1', role_id: 'r-captain', module_key: 'crew_roster', permission: 'edit' },
  { id: 'rp-2', role_id: 'r-captain', module_key: 'documents', permission: 'view' },
  { id: 'rp-3', role_id: 'r-crew', module_key: 'documents', permission: 'view' },
];

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    const record = (op: string) => () => (h.calls.push({ table, op }), chain);
    for (const op of ['select', 'eq', 'order', 'limit']) chain[op] = record(op);
    for (const op of ['insert', 'update', 'delete', 'upsert']) chain[op] = record(op);
    chain.then = (resolve: (v: unknown) => unknown) => {
      if (h.fail === table) return Promise.resolve({ data: null, error: { code: '42501', message: 'permission denied' } }).then(resolve);
      const data = table === 'roles' ? ROLES : table === 'modules' ? MODULES : table === 'role_permissions' ? PERMS : [];
      return Promise.resolve({ data, error: null }).then(resolve);
    };
    return chain;
  };
  return { supabase: { from, rpc: (...args: unknown[]) => h.rpc(...args) } };
});
vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => ({ profile: { id: 'p-1', company_id: 'c-1', role: h.role }, user: { id: 'u-1' } }) }));

import RolesPermissionsPage from '@/modules/settings/pages/RolesPermissionsPage';
import PermissionsSection from '@/modules/settings/components/sections/PermissionsSection';

function renderWith(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const WRITE_OPS = ['insert', 'update', 'delete', 'upsert'];

beforeEach(() => {
  h.calls = [];
  h.rpc.mockReset();
  h.fail = null;
  h.role = 'dpa';
});

describe('Roles & Permissions page', () => {
  it('shows the notice and the matrix as read-only marks, with no save controls', async () => {
    renderWith(<RolesPermissionsPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Roles & Permissions' })).toBeInTheDocument();
    expect(screen.getByText('Role definitions are managed by STORM')).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Permissions of Captain' });
    const crewRow = within(table).getByText('Crew roster').closest('tr') as HTMLElement;
    const marks = within(crewRow).getAllByText(/allowed/i).map((n) => n.textContent);
    expect(marks).toEqual(['Not allowed', 'Allowed', 'Not allowed']);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /save|grant|remove|create|delete/i })).toBeNull();
    expect(screen.getByRole('link', { name: 'Users & Access' })).toHaveAttribute('href', '/users-access');
  });

  it('switching roles only reads; nothing is written and log_permission_change is never called', async () => {
    renderWith(<RolesPermissionsPage />);
    await screen.findByRole('table', { name: 'Permissions of Captain' });
    fireEvent.click(screen.getByRole('button', { name: /Crew self scope/ }));
    expect(await screen.findByRole('table', { name: 'Permissions of Crew' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Crew self scope/ })).toHaveAttribute('aria-pressed', 'true');
    expect(h.calls.filter((c) => WRITE_OPS.includes(c.op))).toEqual([]);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('a failed read shows the error state with Retry, not an empty matrix', async () => {
    h.fail = 'role_permissions';
    renderWith(<RolesPermissionsPage />);
    expect(await screen.findByRole('button', { name: /retry|try again/i })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: /Permissions of/ })).toBeNull();
  });
});

describe('Settings → Permissions section', () => {
  it('a DPA sees the notice and the read-only matrix; no role editor, no redaction editor', async () => {
    renderWith(<PermissionsSection />);
    expect(screen.getByText('Role definitions are managed by STORM')).toBeInTheDocument();
    expect(await screen.findByRole('table', { name: 'Permissions of Captain' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Create Custom Role|Save Permissions|Reset/i })).toBeNull();
    expect(screen.queryByText(/Field-Level Redactions/i)).toBeNull();
    await waitFor(() => expect(h.calls.some((c) => c.table === 'role_permissions')).toBe(true));
    expect(h.calls.filter((c) => WRITE_OPS.includes(c.op))).toEqual([]);
  });

  it('anyone else sees why, and nothing is read', () => {
    h.role = 'crew';
    renderWith(<PermissionsSection />);
    expect(screen.getByText(/Only DPA and shore management users/)).toBeInTheDocument();
    expect(h.calls).toEqual([]);
  });
});

describe('the sources never write role definitions', () => {
  it.each([
    'src/modules/settings/pages/RolesPermissionsPage.tsx',
    'src/modules/settings/components/sections/PermissionsSection.tsx',
    'src/modules/auth/components/RoleDefinitionsMatrix.tsx',
    'src/modules/auth/hooks/useRoleDefinitions.ts',
  ])('%s', (file) => {
    const source = readRepoFile(file);
    expect(source).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    expect(source).not.toMatch(/rpc\(\s*['"]log_permission_change/);
  });
});

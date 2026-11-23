/**
 * Users & Access list (Phase 2 spec §B.3, §C.3): real account statuses,
 * the honest invitation column, and invite / resend / revoke through the
 * wrappers with toasts that only say "sent" after a 200 `status: 'sent'`.
 *
 * The page runs for real (DataTable, StatusPill, hooks) over a fake
 * Supabase client; the shell layout is a pass-through.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Answer = { data: unknown; error: unknown };

const h = vi.hoisted(() => ({
  tables: {} as Record<string, () => Answer>,
  reads: [] as Array<{ table: string; filters: Array<[string, string, unknown]> }>,
  rpc: vi.fn(),
  invoke: vi.fn(),
  can: { assign: true, admin: true },
  notify: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    const read = { table, filters: [] as Array<[string, string, unknown]> };
    h.reads.push(read);
    const chain: Record<string, unknown> = {};
    for (const op of ['select', 'order', 'limit']) chain[op] = () => chain;
    for (const op of ['eq', 'in', 'neq']) chain[op] = (column: string, value: unknown) => (read.filters.push([op, column, value]), chain);
    chain.maybeSingle = () => Promise.resolve(h.tables[table]?.() ?? { data: null, error: null });
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(h.tables[table]?.() ?? { data: [], error: null }).then(resolve, reject);
    return chain;
  };
  return { supabase: { from, rpc: (...args: unknown[]) => h.rpc(...args), functions: { invoke: (...args: unknown[]) => h.invoke(...args) } } };
});
vi.mock('@/modules/auth/contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'p-admin', company_id: 'c-1', role: 'dpa' }, user: { id: 'u-admin' } }),
}));
vi.mock('@/lib/permissions/useCan', () => ({
  useCan: (key: string) => (key === 'admin.access.users_access.assign' ? h.can.assign : key === 'admin.access.users_access.admin' ? h.can.admin : false),
}));
vi.mock('@/shared/components/layout/DashboardLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/shared/lib/notify', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/shared/lib/notify')>()), notify: h.notify }));

import UsersAccessListPage from '@/modules/users-access/pages/UsersAccessListPage';

const PROFILES = [
  { id: 'p-1', user_id: 'u-1', first_name: 'Demo', last_name: 'Master', email: 'master@demo-fleet.example', account_status: 'active' },
  { id: 'p-2', user_id: null, first_name: 'Demo', last_name: 'Deckhand', email: 'deckhand@demo-fleet.example', account_status: 'not_invited' },
  { id: 'p-3', user_id: 'u-3', first_name: 'Demo', last_name: 'Bosun', email: 'bosun@demo-fleet.example', account_status: 'invited' },
  { id: 'p-4', user_id: 'u-4', first_name: 'Demo', last_name: 'Stew', email: 'stew@demo-fleet.example', account_status: 'invited' },
  { id: 'p-5', user_id: 'u-5', first_name: 'Demo', last_name: 'Engineer', email: 'engineer@demo-fleet.example', account_status: 'Disabled' },
];
const inv = (profile_id: string, status: string, patch: Record<string, unknown> = {}) => ({
  id: `inv-${profile_id}`,
  profile_id,
  status,
  send_attempts: 1,
  last_attempt_at: '2026-11-22T12:00:00Z',
  last_sent_at: status === 'sent' ? '2026-11-22T12:00:00Z' : null,
  last_error_code: null,
  expires_at: '2099-01-01T00:00:00Z',
  accepted_at: null,
  revoked_at: null,
  created_at: '2026-11-22T12:00:00Z',
  ...patch,
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <UsersAccessListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const rowOf = async (name: string) => {
  const cell = await screen.findByText(name);
  const tr = cell.closest('tr');
  if (!tr) throw new Error(`no row for ${name}`);
  return within(tr);
};

// jsdom has no PointerEvent; Radix menus open on pointerdown (button 0), which needs one.
if (!('PointerEvent' in window)) Object.defineProperty(window, 'PointerEvent', { value: MouseEvent, configurable: true });

beforeEach(() => {
  h.reads = [];
  h.can = { assign: true, admin: true };
  h.rpc.mockReset();
  h.invoke.mockReset();
  Object.values(h.notify).forEach((fn) => fn.mockReset());
  h.tables = {
    profiles: () => ({ data: PROFILES, error: null }),
    crew_assignments: () => ({ data: [{ user_id: 'u-1', position: 'Master', is_current: true }], error: null }),
    user_permission_overrides: () => ({ data: [], error: null }),
    user_invitations: () => ({ data: [inv('p-3', 'send_failed', { last_error_code: 'provider_unavailable' }), inv('p-4', 'pending', { last_error_code: 'legacy_unverified' })], error: null }),
  };
});

describe('Users & Access list', () => {
  it('shows each person’s real account status and the honest invitation status', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Users & Access' })).toBeInTheDocument();
    // The invitation column says "Checking…" until its read answers.
    await waitFor(() => expect(screen.getAllByText('Send failed').length).toBeGreaterThan(0));
    const master = await rowOf('Demo Master');
    expect(master.getByText('Active')).toBeInTheDocument();
    expect(master.getAllByText('No invitation on record').length).toBeGreaterThan(0);
    const deckhand = await rowOf('Demo Deckhand');
    expect(deckhand.getAllByText('Not invited').length).toBeGreaterThan(0);
    const bosun = await rowOf('Demo Bosun');
    await waitFor(() => expect(bosun.getAllByText('Send failed').length).toBeGreaterThan(0));
    expect(bosun.getAllByText(/did not answer/).length).toBeGreaterThan(0);
    const stew = await rowOf('Demo Stew');
    expect(stew.getAllByText('Pending').length).toBeGreaterThan(0);
    expect(stew.getAllByText('Sent before delivery tracking — resend to confirm').length).toBeGreaterThan(0);
    const engineer = await rowOf('Demo Engineer');
    expect(engineer.getByText('Disabled')).toBeInTheDocument();
    // Nobody reads "Sent" without an invitation row that says so.
    expect(screen.queryByText('Sent')).toBeNull();
    // Invitations are read for this company's profiles only.
    const invitationRead = h.reads.find((r) => r.table === 'user_invitations');
    expect(invitationRead?.filters).toContainEqual(['eq', 'company_id', 'c-1']);
  });

  it('table missing (D-01): "Invited" from the profile, never "Sent", and a notice says tracking is not set up', async () => {
    h.tables.user_invitations = () => ({ data: null, error: { code: 'PGRST205', message: 'Could not find the table public.user_invitations' } });
    renderPage();
    const bosun = await rowOf('Demo Bosun');
    // The invitation falls back to the profile's "Invited" (column and phone copy); the account reads "Not joined"; nothing reads "Sent".
    await waitFor(() => expect(bosun.getAllByText('Invited').length).toBeGreaterThan(0));
    expect(bosun.getByText('Not joined')).toBeInTheDocument();
    expect(screen.queryByText('Sent')).toBeNull();
    expect(screen.getByText('Invitation delivery tracking is not set up yet')).toBeInTheDocument();
  });

  it('an invitation read error is not "no invitation": statuses unavailable, actions hidden, Retry offered', async () => {
    h.tables.user_invitations = () => ({ data: null, error: { code: 'XX000', message: 'boom' } });
    renderPage();
    expect(await screen.findByText('Invitation statuses could not be loaded')).toBeInTheDocument();
    const deckhand = await rowOf('Demo Deckhand');
    expect(deckhand.getAllByText('Status unavailable').length).toBeGreaterThan(0);
    expect(deckhand.queryByRole('button', { name: /Invite/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('Invite sends only the profile id and toasts "sent" only after a 200 status sent', async () => {
    h.invoke.mockResolvedValueOnce({ data: { ok: true, invitation: { status: 'sent', stored: false, id: null } }, error: null });
    renderPage();
    const deckhand = await rowOf('Demo Deckhand');
    fireEvent.click(await deckhand.findByRole('button', { name: 'Invite Demo Deckhand' }));
    await waitFor(() => expect(h.notify.success).toHaveBeenCalled());
    expect(h.invoke).toHaveBeenCalledWith('send-invitation', { body: { profileId: 'p-2' } });
    const [title, options] = h.notify.success.mock.calls[0] as [string, { description: string }];
    expect(title).toBe('Invitation sent');
    expect(options.description).toContain('deckhand@demo-fleet.example');
    expect(options.description).toContain('Delivery tracking is not set up yet.');
  });

  it('a failed send shows "The invitation email could not be sent" with Retry, never a success toast', async () => {
    const failed = () => ({
      data: null,
      error: {
        name: 'FunctionsHttpError',
        context: new Response(JSON.stringify({ error: { code: 'send_failed', message: 'x', details: { email_error: 'provider_unavailable' } }, invitation: { status: 'send_failed', stored: true, id: 'inv-p-3' } }), { status: 502 }),
      },
    });
    h.invoke.mockImplementationOnce(async () => failed()).mockImplementationOnce(async () => failed());
    renderPage();
    const bosun = await rowOf('Demo Bosun');
    fireEvent.click(await bosun.findByRole('button', { name: 'Resend the invitation to Demo Bosun' }));
    await waitFor(() => expect(h.notify.error).toHaveBeenCalled());
    expect(h.notify.success).not.toHaveBeenCalled();
    const [description, options] = h.notify.error.mock.calls[0] as [string, { title: string; action?: { label: string; onClick: () => void } }];
    expect(options.title).toBe('The invitation email could not be sent');
    expect(description).toMatch(/did not answer/);
    expect(options.action?.label).toBe('Retry');
    options.action?.onClick();
    await waitFor(() => expect(h.invoke).toHaveBeenCalledTimes(2));
  });

  const openRevoke = async (name: string) => {
    const row = await rowOf(name);
    const more = await row.findByRole('button', { name: `More actions for ${name}` });
    fireEvent.pointerDown(more, { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: /Revoke invitation/ }));
  };

  const edgeHttpError = (status: number, body: unknown) => ({
    data: null,
    error: { name: 'FunctionsHttpError', context: new Response(JSON.stringify(body), { status }) },
  });
  const REVOKED = { id: 'inv-p-3', status: 'revoked', profileId: 'p-3', revokedAt: '2026-11-23T10:00:00Z' };

  it('the revoke dialog never promises the link "stops working"', async () => {
    renderPage();
    await waitFor(() => expect(screen.getAllByText('Send failed').length).toBeGreaterThan(0));
    await openRevoke('Demo Bosun');
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/This marks the invitation to Demo Bosun as revoked and blocks the link where it can\./)).toBeInTheDocument();
    expect(dialog.textContent).not.toMatch(/stops working|no longer works/);
  });

  it('Revoke (in the row menu) asks first, then revokes through admin-actions; "can no longer use the link" only when the login is blocked', async () => {
    h.invoke.mockResolvedValueOnce({ data: { ok: true, invitation: REVOKED, loginBlocked: true, loginNote: 'banned' }, error: null });
    renderPage();
    await waitFor(() => expect(screen.getAllByText('Send failed').length).toBeGreaterThan(0));
    await openRevoke('Demo Bosun');
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke invitation' }));
    await waitFor(() => expect(h.invoke).toHaveBeenCalledWith('admin-actions', { body: { action: 'revoke_invitation', invitationId: 'inv-p-3' } }));
    await waitFor(() => expect(h.notify.success).toHaveBeenCalledWith('Invitation revoked', expect.objectContaining({ description: 'Demo Bosun can no longer use the invitation link.' })));
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('someone who signed in before: a warning to turn their access off, never a success', async () => {
    h.invoke.mockResolvedValueOnce({ data: { ok: true, invitation: REVOKED, loginBlocked: false, loginNote: 'signed_in_before' }, error: null });
    renderPage();
    await waitFor(() => expect(screen.getAllByText('Send failed').length).toBeGreaterThan(0));
    await openRevoke('Demo Bosun');
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke invitation' }));
    await waitFor(() => expect(h.notify.warning).toHaveBeenCalled());
    expect(h.notify.success).not.toHaveBeenCalled();
    const [, options] = h.notify.warning.mock.calls[0] as [string, { description: string }];
    expect(options.description).toBe('Demo Bosun has signed in before. To stop them signing in, turn their access off.');
  });

  it('a revoke whose sign-in block failed (502) says they may still sign in', async () => {
    h.invoke.mockResolvedValueOnce(edgeHttpError(502, { error: { code: 'partial_failure', message: 'x', details: { revoked: true, loginBlocked: false } }, invitation: REVOKED }));
    renderPage();
    await waitFor(() => expect(screen.getAllByText('Send failed').length).toBeGreaterThan(0));
    await openRevoke('Demo Bosun');
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke invitation' }));
    await waitFor(() => expect(h.notify.warning).toHaveBeenCalled());
    expect(h.notify.success).not.toHaveBeenCalled();
    const [, options] = h.notify.warning.mock.calls[0] as [string, { description: string }];
    expect(options.description).toBe('The invitation is marked revoked, but Demo Bosun may still be able to sign in. To stop that, turn their access off.');
  });

  it('an older admin-actions (400 unknown action): the database revoke runs, and the toast warns that sign-in may still work', async () => {
    h.invoke.mockResolvedValueOnce(edgeHttpError(400, { error: { code: 'invalid_request', message: 'Unknown action.', details: { field: 'action' } } }));
    h.rpc.mockResolvedValueOnce({ data: { ...inv('p-3', 'revoked'), company_id: 'c-1' }, error: null });
    renderPage();
    await waitFor(() => expect(screen.getAllByText('Send failed').length).toBeGreaterThan(0));
    await openRevoke('Demo Bosun');
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke invitation' }));
    await waitFor(() => expect(h.rpc).toHaveBeenCalledWith('revoke_invitation', { p_invitation_id: 'inv-p-3' }));
    await waitFor(() => expect(h.notify.warning).toHaveBeenCalled());
    expect(h.notify.success).not.toHaveBeenCalled();
  });

  it('invitations not live (501): says nothing was changed', async () => {
    h.invoke.mockResolvedValueOnce(edgeHttpError(501, { error: { code: 'not_supported', message: 'x', details: { reason: 'invitations_not_live' } } }));
    renderPage();
    await waitFor(() => expect(screen.getAllByText('Send failed').length).toBeGreaterThan(0));
    await openRevoke('Demo Bosun');
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke invitation' }));
    await waitFor(() => expect(h.notify.warning).toHaveBeenCalledWith('Not available yet', expect.anything()));
    expect(h.notify.success).not.toHaveBeenCalled();
  });

  it('without the capability there are no invite or revoke actions and no selection', async () => {
    h.can = { assign: false, admin: false };
    renderPage();
    await rowOf('Demo Deckhand');
    await waitFor(() => expect(screen.getAllByText('Send failed').length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: /^Invite / })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Resend / })).toBeNull();
    // No revoke menu either: active people only get their Edit link.
    expect(screen.queryByRole('button', { name: /^More actions/ })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('bulk invite reports "Sent n · Failed m" from the function’s rows', async () => {
    h.invoke.mockResolvedValueOnce({
      data: { ok: true, results: [{ profileId: 'p-2', status: 'sent', stored: true, invitationId: 'i-2' }, { profileId: 'p-3', status: 'send_failed', stored: true, invitationId: 'i-3', code: 'send_failed', emailError: 'provider_rejected' }], sent: 1, failed: 1, refused: 0 },
      error: null,
    });
    renderPage();
    await rowOf('Demo Deckhand');
    await waitFor(() => expect(screen.getAllByText('Send failed').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('checkbox', { name: /Select Demo Deckhand/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Select Demo Bosun/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Select Demo Master/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Invite selected (2)' }));
    await waitFor(() => expect(h.notify.warning).toHaveBeenCalled());
    expect(h.invoke).toHaveBeenCalledWith('bulk-invite', { body: { profileIds: expect.arrayContaining(['p-2', 'p-3']) } });
    expect((h.invoke.mock.calls[0][1] as { body: { profileIds: string[] } }).body.profileIds).not.toContain('p-1');
    expect(h.notify.warning.mock.calls[0][0]).toBe('Sent 1 · Failed 1');
  });
});

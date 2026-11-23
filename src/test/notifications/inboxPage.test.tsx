/**
 * /inbox (gap/03 C9; gap/10 IA15; D-62; Phase 2 spec §B.7): tabs All /
 * Attention / Archived in the URL; /inbox without a tab opens All, or
 * Attention while notification_inbox is missing (then All and Archived say
 * "not set up yet" and Attention works); filters by scope, vessel and module
 * from the URL (a vessel outside reach never widens the list); severity
 * pills; mark read, archive and unarchive with honest failures; loading,
 * empty and error states; unopenable links say "No longer available".
 */
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

vi.mock('@/integrations/supabase/client', async () => (await import('./inboxFake')).inboxFakeModule);

const h = vi.hoisted(() => ({
  accessReady: true,
  center: {
    data: undefined as unknown,
    isPending: false,
    isError: false,
    error: null as unknown,
  },
  centerRefetch: () => undefined as unknown,
}));

vi.mock('@/modules/auth/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: '11111111-1111-4111-8111-111111111111' }, profile: { user_id: '11111111-1111-4111-8111-111111111111', company_id: 'c1' } }),
}));
vi.mock('@/modules/vessels/contexts/VesselContext', () => {
  const vessels = [
    { id: 'v-dra', name: 'Draak' },
    { id: 'v-hyd', name: 'Hydra' },
  ];
  const codes: Record<string, string> = { 'v-dra': 'DRA', 'v-hyd': 'HYD' };
  return {
    useVessel: () => ({
      vessels,
      getVesselCodeById: (id: string | null | undefined) => (id ? codes[id] ?? null : null),
      findVesselByCode: (code: string | null | undefined) => vessels.find((v) => codes[v.id] === (code ?? '').trim().toUpperCase()),
    }),
  };
});
vi.mock('@/app/router/useScopeAccess', () => ({ useScopeAccess: () => ({ ready: h.accessReady, fleetReach: false, vesselsError: null }) }));
vi.mock('@/shared/components/layout/DashboardLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/modules/notifications/hooks/useInboxLinks', async () => {
  const { resolveInboxLink } = await import('@/modules/notifications/lib/deepLink');
  return {
    useInboxLinks: () => ({
      ready: true,
      reachUnknown: false,
      resolve: (row: Parameters<typeof resolveInboxLink>[0]) =>
        resolveInboxLink(row, { fleetReach: false, reachableVesselCodes: new Set(['DRA', 'HYD']), canOpenWorkspace: () => false }),
    }),
  };
});
vi.mock('@/modules/notifications/hooks/useNotificationCenter', () => ({
  useNotificationCenter: () => ({ ...h.center, refetch: h.centerRefetch }),
}));

import InboxPage from '@/modules/notifications/pages/InboxPage';
import { notify } from '@/shared/lib/notify';
import { MISSING_TABLE, RLS_DENIED, HYDRA_ID, inboxFake, inboxRow, resetInboxFake } from './inboxFake';

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
});

const CENTER_DATA = {
  pendingCompliance: [
    { id: 'al-1', title: 'ISM audit due', description: null, severity_color: 'ORANGE', status: 'OPEN', vessel_id: 'v-dra', due_at: null, created_at: '2026-11-23T10:00:00Z', source_module: 'audit', related_entity_type: 'audit', related_entity_id: 'a1', alert_type: null, vessel: { name: 'Draak' } },
  ],
  unreadMessages: [
    { id: 'al-2', title: 'Hot work permit open', description: null, severity_color: 'RED', status: 'OPEN', vessel_id: 'v-dra', due_at: null, created_at: '2026-11-23T10:00:00Z', source_module: 'safety', related_entity_type: null, related_entity_id: null, alert_type: null, vessel: { name: 'Draak' } },
  ],
  overdueTasks: [
    { id: 't-1', task_name: 'Lube main engine', task_number: 'MT-1', task_type: 'pms', priority: 'high', status: 'Overdue', due_date: '2026-11-01', work_description: null, equipment: { equipment_name: 'Main engine', vessel_id: 'v-dra', vessel: { name: 'Draak' } } },
  ],
};

beforeEach(() => {
  resetInboxFake();
  h.accessReady = true;
  h.center = { data: CENTER_DATA, isPending: false, isError: false, error: null };
  h.centerRefetch = () => undefined;
});
afterEach(() => vi.restoreAllMocks());

function Location() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderInbox(url = '/inbox') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="*" element={<p>Elsewhere</p>} />
        </Routes>
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

const location = () => screen.getByTestId('location').textContent ?? '';
const tab = (name: RegExp) => screen.getByRole('tab', { name });
const listCalls = () => inboxFake.calls.filter((c) => c.table === 'notification_inbox' && c.op === 'select' && !c.head);

describe('tabs', () => {
  it('without a tab, opens All once the inbox exists', async () => {
    inboxFake.tables.notification_inbox = [inboxRow({ title: 'Permit returned' })];
    renderInbox();
    expect(await screen.findByRole('heading', { level: 1, name: 'Inbox' })).toBeInTheDocument();
    await waitFor(() => expect(tab(/^All/)).toHaveAttribute('aria-selected', 'true'));
    expect(await screen.findByText('Permit returned')).toBeInTheDocument();
  });

  it('without a tab, opens Attention while notification_inbox is missing; All and Archived say it is not set up yet', async () => {
    inboxFake.failures.notification_inbox = MISSING_TABLE;
    renderInbox();
    await waitFor(() => expect(tab(/^Attention/)).toHaveAttribute('aria-selected', 'true'));
    expect(screen.getByText('ISM audit due')).toBeInTheDocument();

    fireEvent.mouseDown(tab(/^All/));
    await waitFor(() => expect(location()).toBe('/inbox?tab=all'));
    expect(await screen.findByRole('heading', { name: 'Your inbox is not set up yet' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Filter notifications' })).toBeNull();

    fireEvent.mouseDown(tab(/^Archived/));
    await waitFor(() => expect(location()).toBe('/inbox?tab=archived'));
    expect(await screen.findByRole('heading', { name: 'Your inbox is not set up yet' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open Attention' }));
    await waitFor(() => expect(location()).toBe('/inbox?tab=attention'));
    expect(screen.getByText('ISM audit due')).toBeInTheDocument();
  });

  it('shows nothing but a loader until it knows whether the inbox exists', async () => {
    inboxFake.delayMs = 40;
    inboxFake.failures.notification_inbox = MISSING_TABLE;
    renderInbox();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.getByText('Loading the inbox').closest('[role="status"]')).toHaveAttribute('aria-busy', 'true');
    await waitFor(() => expect(tab(/^Attention/)).toHaveAttribute('aria-selected', 'true'));
  });

  it('?tab=attention opens today’s Notification Center, with its views in ?view= (D-62)', async () => {
    inboxFake.tables.notification_inbox = [];
    renderInbox('/inbox?tab=attention');
    expect(tab(/^Attention/)).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Pending compliance/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('link', { name: 'Open ISM audit due' })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Overdue tasks/ }));
    await waitFor(() => expect(location()).toBe('/inbox?tab=attention&view=tasks'));
    expect(screen.getByRole('link', { name: 'Open overdue task Lube main engine' })).toBeInTheDocument();
    // Attention reads no inbox list.
    expect(listCalls()).toEqual([]);
  });

  it('old Notification Center tabs open their Attention view; tab=inbox is All', async () => {
    inboxFake.tables.notification_inbox = [];
    const first = renderInbox('/inbox?tab=messages');
    expect(tab(/^Attention/)).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Unacknowledged alerts/ })).toHaveAttribute('aria-selected', 'true');
    first.unmount();
    renderInbox('/inbox?tab=inbox');
    expect(tab(/^All/)).toHaveAttribute('aria-selected', 'true');
  });

  it('Attention says when it could not load, with Retry, never "no items"', async () => {
    const refetch = vi.fn();
    h.centerRefetch = refetch;
    h.center = { data: undefined, isPending: false, isError: true, error: new Error('timeout') };
    renderInbox('/inbox?tab=attention');
    expect(screen.getByText('Items that need your attention could not load')).toBeInTheDocument();
    expect(screen.queryByText('No pending compliance items')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('the All tab carries the unread count, and the tabs are keyboard reachable', async () => {
    inboxFake.tables.notification_inbox = [inboxRow(), inboxRow(), inboxRow({ read_at: '2026-11-23T09:00:00Z' })];
    renderInbox();
    await waitFor(() => expect(within(tab(/^All/)).getByLabelText('2 unread')).toBeInTheDocument());
    const list = screen.getByRole('tablist', { name: 'Inbox views' });
    expect(within(list).getAllByRole('tab')).toHaveLength(3);
    for (const t of within(list).getAllByRole('tab')) expect(t.className).toMatch(/min-h-11/);
  });
});

describe('All and Archived lists', () => {
  it('rows show severity, where they belong and when, with the deep link when it can be opened', async () => {
    inboxFake.tables.notification_inbox = [
      inboxRow({ minutesAgo: 1, title: 'Critical thing', severity: 'critical', body: 'Engine room hot work', record_ref: 'PTW-DRA-2026-061' }),
      inboxRow({ minutesAgo: 2, title: 'Fleet thing', link_scope: 'fleet', link_vessel_code: null, vessel_id: null, link_path: 'documents' }),
      inboxRow({ minutesAgo: 3, title: 'Done thing', severity: 'success', read_at: '2026-11-23T09:00:00Z', vessel_id: HYDRA_ID, link_vessel_code: 'HYD', link_path: 'crew/list?tab=onboard' }),
    ];
    renderInbox('/inbox?tab=all');
    const list = await screen.findByRole('list', { name: 'Notifications' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(3);

    expect(rows[0]).toHaveTextContent('Critical');
    expect(rows[0].querySelector('[data-tone="danger"]')).not.toBeNull();
    expect(rows[0]).toHaveTextContent('Engine room hot work');
    expect(rows[0]).toHaveTextContent('Draak');
    expect(rows[0]).toHaveTextContent('PTW-DRA-2026-061');
    expect(within(rows[0]).getByRole('link')).toHaveAttribute('href', '/v/dra/safety/permits/' + String(inboxFake.tables.notification_inbox[0].link_path).split('/').pop());
    expect(rows[0]).toHaveAttribute('data-unread', 'true');

    expect(rows[1]).toHaveTextContent('No longer available.');
    expect(within(rows[1]).queryByRole('link')).toBeNull();

    expect(rows[2]).toHaveTextContent('Success');
    expect(rows[2]).toHaveTextContent('Hydra');
    expect(within(rows[2]).getByRole('link')).toHaveAttribute('href', '/v/hyd/crew/list?tab=onboard');
    expect(rows[2]).not.toHaveAttribute('data-unread');
    expect(within(rows[2]).queryByRole('button', { name: /Mark .* read/ })).toBeNull();
  });

  it('opening a row marks it read', async () => {
    const row = inboxRow({ title: 'Open me' });
    inboxFake.tables.notification_inbox = [row];
    renderInbox('/inbox?tab=all');
    fireEvent.click(await screen.findByRole('link', { name: /Open me/ }));
    await waitFor(() => expect(inboxFake.calls.some((c) => c.op === 'update' && c.payload && 'read_at' in c.payload)).toBe(true));
    expect(location()).toBe(`/v/dra/${row.link_path}`);
  });

  it('mark read, archive (with Undo) and unarchive', async () => {
    const a = inboxRow({ title: 'Alpha', minutesAgo: 1 });
    const b = inboxRow({ title: 'Bravo', minutesAgo: 2, archived_at: '2026-11-22T10:00:00Z' });
    inboxFake.tables.notification_inbox = [a, b];
    const success = vi.spyOn(notify, 'success').mockImplementation(() => 'ok');
    renderInbox('/inbox?tab=all');
    fireEvent.click(await screen.findByRole('button', { name: 'Mark "Alpha" read' }));
    await waitFor(() => expect(a.read_at).toEqual(expect.any(String)));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Mark "Alpha" read' })).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Archive "Alpha"' }));
    await waitFor(() => expect(a.archived_at).toEqual(expect.any(String)));
    await waitFor(() => expect(screen.queryByText('Alpha')).toBeNull());
    expect(success).toHaveBeenCalledWith('Archived', expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) }));
    expect(await screen.findByRole('heading', { name: 'No notifications' })).toBeInTheDocument();

    // Undo puts it back.
    const undo = success.mock.calls[0][1]?.action?.onClick;
    act(() => undo?.());
    await waitFor(() => expect(a.archived_at).toBeNull());

    fireEvent.mouseDown(tab(/^Archived/));
    await waitFor(() => expect(location()).toBe('/inbox?tab=archived'));
    fireEvent.click(await screen.findByRole('button', { name: 'Move "Bravo" back to the inbox' }));
    await waitFor(() => expect(b.archived_at).toBeNull());
    expect(success).toHaveBeenCalledWith('Moved back to the inbox', expect.anything());
    expect(await screen.findByRole('heading', { name: 'Nothing archived' })).toBeInTheDocument();
  });

  it('an archive that fails, or changes nothing, says so (no fake success)', async () => {
    const a = inboxRow({ title: 'Alpha' });
    inboxFake.tables.notification_inbox = [a];
    const success = vi.spyOn(notify, 'success').mockImplementation(() => 'ok');
    const error = vi.spyOn(notify, 'error').mockImplementation(() => 'x');
    renderInbox('/inbox?tab=all');
    inboxFake.writeFailures.notification_inbox = RLS_DENIED;
    fireEvent.click(await screen.findByRole('button', { name: 'Archive "Alpha"' }));
    await waitFor(() => expect(error).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ title: 'Could not archive the notification' })));
    expect(success).not.toHaveBeenCalled();
    expect(a.archived_at).toBeNull();
    expect(screen.getByText('Alpha')).toBeInTheDocument();

    // RLS hid the row: no row changed, which is a failure too.
    inboxFake.writeFailures.notification_inbox = undefined;
    a.user_id = 'someone-else';
    a.id = 'moved';
    fireEvent.click(screen.getByRole('button', { name: 'Archive "Alpha"' }));
    await waitFor(() => expect(error).toHaveBeenCalledTimes(2));
    expect(success).not.toHaveBeenCalled();
  });

  it('"Mark all read" marks every unread notification', async () => {
    inboxFake.tables.notification_inbox = [inboxRow(), inboxRow()];
    inboxFake.rpcs.notification_inbox_mark_all_read = () => {
      for (const r of inboxFake.tables.notification_inbox) r.read_at = '2026-11-23T12:00:00Z';
      return { data: 2, error: null };
    };
    const success = vi.spyOn(notify, 'success').mockImplementation(() => 'ok');
    renderInbox('/inbox?tab=all');
    fireEvent.click(await screen.findByRole('button', { name: 'Mark all read' }));
    await waitFor(() => expect(success).toHaveBeenCalledWith('2 notifications marked read'));
    expect(inboxFake.rpcCalls).toEqual([{ name: 'notification_inbox_mark_all_read', args: {} }]);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Mark all read' })).toBeNull());
  });

  it('loading, then empty; an error is an error with Retry, never "No notifications"', async () => {
    inboxFake.delayMs = 30;
    inboxFake.tables.notification_inbox = [];
    const first = renderInbox('/inbox?tab=all');
    expect((await screen.findByText('Loading notifications')).closest('[role="status"]')).toHaveAttribute('aria-busy', 'true');
    expect(await screen.findByRole('heading', { name: 'No notifications' })).toBeInTheDocument();
    first.unmount();

    resetInboxFake();
    inboxFake.failures.notification_inbox = RLS_DENIED;
    renderInbox('/inbox?tab=all');
    expect(await screen.findByText('Notifications could not load')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'No notifications' })).toBeNull();
    inboxFake.failures.notification_inbox = undefined;
    inboxFake.tables.notification_inbox = [inboxRow({ title: 'Recovered' })];
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Recovered')).toBeInTheDocument();
  });

  it('"Show more" reads the next page', async () => {
    inboxFake.tables.notification_inbox = Array.from({ length: 60 }, (_, i) => inboxRow({ minutesAgo: i + 1, read_at: '2026-11-23T09:00:00Z' }));
    renderInbox('/inbox?tab=all');
    const list = await screen.findByRole('list', { name: 'Notifications' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(50);
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Notifications' })).getAllByRole('listitem')).toHaveLength(60));
    expect(listCalls().at(-1)?.limit).toBe(100);
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
  });
});

describe('filters', () => {
  it('scope, vessel (by code, any case) and module come from the URL and go to the read', async () => {
    inboxFake.tables.notification_inbox = [
      inboxRow({ title: 'Match', vessel_id: HYDRA_ID, module_key: 'crew' }),
      inboxRow({ title: 'Other', module_key: 'crew' }),
    ];
    renderInbox('/inbox?tab=all&scope=vessel&vessel=HyD&module=crew');
    expect(await screen.findByText('Match')).toBeInTheDocument();
    expect(screen.queryByText('Other')).toBeNull();
    expect(listCalls().at(-1)?.filters).toEqual(
      expect.arrayContaining([['link_scope', 'eq', 'vessel'], ['vessel_id', 'eq', HYDRA_ID], ['module_key', 'eq', 'crew']]),
    );
    const group = screen.getByRole('group', { name: 'Filter notifications' });
    expect(within(group).getByRole('combobox', { name: 'Scope' })).toHaveTextContent('Vessel');
    expect(within(group).getByRole('combobox', { name: 'Vessel' })).toHaveTextContent('Hydra');
    expect(within(group).getByRole('combobox', { name: 'Module' })).toHaveTextContent('Crew');
  });

  it('an empty filtered list offers "Clear filters", which keeps the tab', async () => {
    inboxFake.tables.notification_inbox = [inboxRow({ title: 'Safety one', module_key: 'safety' })];
    renderInbox('/inbox?tab=all&module=crew');
    expect(await screen.findByRole('heading', { name: 'Nothing matches these filters' })).toBeInTheDocument();
    const clear = screen.getAllByRole('button', { name: 'Clear filters' });
    fireEvent.click(clear[clear.length - 1]);
    await waitFor(() => expect(location()).toBe('/inbox?tab=all'));
    expect(await screen.findByText('Safety one')).toBeInTheDocument();
  });

  it('a vessel outside the viewer’s reach never widens the list (nothing is read)', async () => {
    inboxFake.tables.notification_inbox = [inboxRow({ title: 'Should not show' })];
    renderInbox('/inbox?tab=all&vessel=gam');
    expect(await screen.findByRole('heading', { name: 'That vessel is not one you can reach' })).toBeInTheDocument();
    expect(screen.queryByText('Should not show')).toBeNull();
    expect(listCalls()).toEqual([]);
  });

  it('a vessel filter waits for the vessel list before reading', async () => {
    h.accessReady = false;
    inboxFake.tables.notification_inbox = [inboxRow({ title: 'Later' })];
    renderInbox('/inbox?tab=all&vessel=dra');
    await act(async () => {});
    expect(listCalls()).toEqual([]);
    expect(screen.getByText('Loading notifications').closest('[role="status"]')).toHaveAttribute('aria-busy', 'true');
  });

  it('choosing a scope with the keyboard updates the URL', async () => {
    inboxFake.tables.notification_inbox = [inboxRow({ title: 'Any' })];
    renderInbox('/inbox?tab=all');
    await screen.findByText('Any');
    const scope = screen.getByRole('combobox', { name: 'Scope' });
    scope.focus();
    fireEvent.keyDown(scope, { key: 'Enter' });
    const option = await screen.findByRole('option', { name: 'Fleet' });
    fireEvent.keyDown(option, { key: 'Enter' });
    await waitFor(() => expect(location()).toBe('/inbox?tab=all&scope=fleet'));
    await waitFor(() => expect(listCalls().at(-1)?.filters).toContainEqual(['link_scope', 'eq', 'fleet']));
  });
});

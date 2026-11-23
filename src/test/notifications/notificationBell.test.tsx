/**
 * The top-bar bell on the inbox (gap/03 C9; gap/10 IA15; Phase 2 spec §B.7;
 * D-01, D-04, D-57, D-91):
 * - the badge is the exact unread head count, critical tone (and the only
 *   pulse, never under reduced motion) when a critical item is unread, named
 *   "n unread notifications"; none until a count is in; the list's unread
 *   rows only when the counts fail;
 * - the alerts bell ONLY when notification_inbox is missing; any other error
 *   is an error with Retry, never "No notifications";
 * - opening marks the shown items read; a click opens the deep link and marks
 *   it read; "Mark all read"; an unopenable link says "No longer available".
 */
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';

vi.mock('@/integrations/supabase/client', async () => (await import('./inboxFake')).inboxFakeModule);
const h = vi.hoisted(() => ({
  links: {
    ready: true,
    reachUnknown: false,
    fleetReachUnknown: false,
    reach: new Set(['DRA']),
  },
}));
vi.mock('@/modules/auth/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: '11111111-1111-4111-8111-111111111111' }, profile: { user_id: '11111111-1111-4111-8111-111111111111', company_id: 'c0000000-0000-4000-8000-000000000001' } }),
}));
vi.mock('@/modules/vessels/contexts/VesselContext', () => ({
  useVessel: () => ({ vessels: [{ id: 'v-dra', name: 'Draak' }], getVesselCodeById: () => 'DRA' }),
}));
vi.mock('@/modules/notifications/hooks/useInboxLinks', async () => {
  const { resolveInboxLink } = await import('@/modules/notifications/lib/deepLink');
  return {
    useInboxLinks: () => ({
      ready: h.links.ready,
      reachUnknown: h.links.reachUnknown,
      fleetReachUnknown: h.links.fleetReachUnknown,
      resolve: (row: Parameters<typeof resolveInboxLink>[0]) =>
        resolveInboxLink(row, { fleetReach: false, reachableVesselCodes: h.links.reach, canOpenWorkspace: () => false }),
    }),
  };
});
vi.mock('@/modules/notifications/hooks/useNotificationCenter', () => ({
  useAlertScope: () => ({
    ready: true,
    settled: true,
    companyId: 'c0000000-0000-4000-8000-000000000001',
    scope: { kind: 'company' },
    scopeKey: 'company',
    vesselName: null,
  }),
}));

import NotificationBell from '@/shared/components/layout/NotificationBell';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import { notify } from '@/shared/lib/notify';
import { COMPANY_ID, MISSING_TABLE, RLS_DENIED, USER_ID, inboxFake, inboxRow, resetInboxFake } from './inboxFake';

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
});

beforeEach(() => {
  resetInboxFake();
  h.links = { ready: true, reachUnknown: false, fleetReachUnknown: false, reach: new Set(['DRA']) };
  localStorage.setItem('storm_alert_helper_shown', 'true');
});
afterEach(() => vi.restoreAllMocks());

function Location() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function Harness({ initiallyOpen }: { initiallyOpen: boolean }) {
  const [open, setOpen] = React.useState(initiallyOpen);
  return (
    <>
      <NotificationBell open={open} onOpenChange={setOpen} />
      <output data-testid="open">{String(open)}</output>
    </>
  );
}

function renderBell({ open = false }: { open?: boolean } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/fleet/dashboard']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Harness initiallyOpen={open} />
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

const trigger = () => screen.getByTestId(SHELL_TEST_IDS.notificationsTrigger);
const badge = () => trigger().querySelector<HTMLElement>('[data-tone]');
const panel = () => screen.getByTestId(SHELL_TEST_IDS.notificationsPanel);
const settle = () => act(async () => {});

describe('badge', () => {
  it('shows nothing until a count is in', async () => {
    inboxFake.delayMs = 50;
    inboxFake.tables.notification_inbox = [inboxRow()];
    renderBell();
    await settle();
    expect(trigger()).toHaveAccessibleName('Notifications');
    expect(badge()).toBeNull();
    await waitFor(() => expect(trigger()).toHaveAccessibleName('Notifications, 1 unread notification'));
  });

  it('is the exact unread count in the critical tone, pulsing only with motion allowed, when a critical item is unread', async () => {
    inboxFake.tables.notification_inbox = [
      inboxRow({ severity: 'critical' }),
      inboxRow({ severity: 'warning' }),
      inboxRow(),
      inboxRow({ read_at: '2026-11-23T09:00:00Z', severity: 'critical' }),
      inboxRow({ archived_at: '2026-11-23T09:00:00Z' }),
    ];
    renderBell();
    await waitFor(() => expect(trigger()).toHaveAccessibleName('Notifications, 3 unread notifications, including critical'));
    expect(badge()).toHaveTextContent('3');
    expect(badge()).toHaveAttribute('data-tone', 'critical');
    expect(badge()).toHaveClass('bg-critical', 'text-critical-foreground', 'motion-safe:animate-pulse');
    expect(badge()?.className).not.toMatch(/(^|\s)animate-pulse/);
  });

  it('is Signal, without a pulse, when nothing unread is critical (a read critical does not count)', async () => {
    inboxFake.tables.notification_inbox = [inboxRow({ severity: 'warning' }), inboxRow({ severity: 'critical', read_at: '2026-11-23T09:00:00Z' })];
    renderBell();
    await waitFor(() => expect(trigger()).toHaveAccessibleName('Notifications, 1 unread notification'));
    expect(badge()).toHaveAttribute('data-tone', 'primary');
    expect(badge()).toHaveClass('bg-primary', 'text-primary-foreground');
    expect(badge()?.className).not.toMatch(/animate-pulse/);
  });

  it('draws 99+ above 99 but says the full count', async () => {
    inboxFake.tables.notification_inbox = Array.from({ length: 121 }, () => inboxRow());
    renderBell();
    await waitFor(() => expect(trigger()).toHaveAccessibleName('Notifications, 121 unread notifications'));
    expect(badge()).toHaveTextContent('99+');
  });

  it('no unread items: no badge', async () => {
    inboxFake.tables.notification_inbox = [inboxRow({ read_at: '2026-11-23T09:00:00Z' })];
    renderBell();
    await waitFor(() => expect(inboxFake.calls.filter((c) => c.head).length).toBe(2));
    await settle();
    expect(trigger()).toHaveAccessibleName('Notifications');
    expect(badge()).toBeNull();
  });

  describe('when only the counts fail (D-91)', () => {
    it('a list that is not full gives the exact unread count', async () => {
      inboxFake.countFailures.notification_inbox = { message: 'count failed' };
      inboxFake.tables.notification_inbox = [inboxRow({ severity: 'critical' }), inboxRow(), inboxRow({ read_at: '2026-11-23T09:00:00Z' })];
      renderBell();
      await waitFor(() => expect(trigger()).toHaveAccessibleName('Notifications, 2 unread notifications, including critical'));
    });

    it('a full list gives a floor (n+), and no badge when it holds no unread row', async () => {
      inboxFake.countFailures.notification_inbox = { message: 'count failed' };
      inboxFake.tables.notification_inbox = [
        inboxRow({ minutesAgo: 1 }),
        inboxRow({ minutesAgo: 2 }),
        ...Array.from({ length: 25 }, (_, i) => inboxRow({ minutesAgo: 10 + i, read_at: '2026-11-23T09:00:00Z' })),
      ];
      const first = renderBell();
      await waitFor(() => expect(trigger()).toHaveAccessibleName('Notifications, 2+ unread notifications'));
      expect(badge()).toHaveTextContent('2+');
      first.unmount();

      resetInboxFake();
      inboxFake.countFailures.notification_inbox = { message: 'count failed' };
      inboxFake.tables.notification_inbox = Array.from({ length: 25 }, (_, i) => inboxRow({ minutesAgo: i + 1, read_at: '2026-11-23T09:00:00Z' }));
      renderBell();
      await waitFor(() => expect(inboxFake.calls.some((c) => !c.head)).toBe(true));
      await settle();
      await settle();
      expect(trigger()).toHaveAccessibleName('Notifications');
      expect(badge()).toBeNull();
    });
  });
});

describe('the alerts fallback (D-01)', () => {
  it('is used only when notification_inbox is missing, and is named for what it counts', async () => {
    inboxFake.failures.notification_inbox = MISSING_TABLE;
    inboxFake.tables.alerts = [
      { id: 'a1', company_id: COMPANY_ID, title: 'Alert a1', description: null, severity_color: 'RED', status: 'OPEN', vessel_id: null, due_at: null, created_at: '2026-11-23T10:00:00Z', updated_at: '2026-11-23T10:00:00Z', related_entity_type: null, related_entity_id: null, source_module: null },
      { id: 'a2', company_id: COMPANY_ID, title: 'Alert a2', description: null, severity_color: 'YELLOW', status: 'ACKNOWLEDGED', vessel_id: null, due_at: null, created_at: '2026-11-23T09:00:00Z', updated_at: '2026-11-23T09:00:00Z', related_entity_type: null, related_entity_id: null, source_module: null },
    ];
    renderBell({ open: true });
    await waitFor(() => expect(panel()).toHaveAttribute('data-bell-source', 'alerts'));
    await waitFor(() => expect(trigger()).toHaveAccessibleName('Notifications, 1 unacknowledged alert, including critical'));
    expect(await within(panel()).findByText('Alert a1')).toBeInTheDocument();
    expect(within(panel()).getByText('1 unacknowledged')).toBeInTheDocument();
    // No realtime channel on the missing table.
    expect(inboxFake.channels.filter((c) => c.name.startsWith('notification-inbox'))).toEqual([]);
  });

  it('keeps the same trigger (and its focus) when the source turns out to be the fallback', async () => {
    inboxFake.delayMs = 30;
    inboxFake.failures.notification_inbox = MISSING_TABLE;
    inboxFake.tables.alerts = [
      { id: 'a1', company_id: COMPANY_ID, title: 'Alert a1', description: null, severity_color: 'ORANGE', status: 'OPEN', vessel_id: null, due_at: null, created_at: '2026-11-23T10:00:00Z', updated_at: '2026-11-23T10:00:00Z', related_entity_type: null, related_entity_id: null, source_module: null },
    ];
    renderBell();
    const before = trigger();
    act(() => before.focus());
    expect(before).toHaveAccessibleName('Notifications');
    await waitFor(() => expect(trigger()).toHaveAccessibleName('Notifications, 1 unacknowledged alert'));
    expect(trigger()).toBe(before);
    expect(document.activeElement).toBe(before);
  });

  it('is not used for any other inbox error: that is an error with Retry, never "No notifications"', async () => {
    inboxFake.failures.notification_inbox = RLS_DENIED;
    inboxFake.tables.alerts = [];
    const { queryClient } = renderBell({ open: true });
    expect(await within(panel()).findByText('Notifications could not load')).toBeInTheDocument();
    expect(panel()).toHaveAttribute('data-bell-source', 'inbox');
    expect(within(panel()).queryByText('No notifications')).toBeNull();
    expect(inboxFake.calls.some((c) => c.table === 'alerts')).toBe(false);
    expect(trigger()).toHaveAccessibleName('Notifications');

    // Retry reads again; once it answers, the list shows.
    inboxFake.failures.notification_inbox = undefined;
    inboxFake.tables.notification_inbox = [inboxRow({ title: 'Back again' })];
    fireEvent.click(within(panel()).getByRole('button', { name: 'Try again' }));
    expect(await within(panel()).findByText('Back again')).toBeInTheDocument();
    expect(queryClient.isFetching()).toBeGreaterThanOrEqual(0);
  });
});

describe('panel', () => {
  it('says when it is loading, and when there is nothing', async () => {
    inboxFake.delayMs = 30;
    inboxFake.tables.notification_inbox = [];
    renderBell({ open: true });
    expect(within(panel()).getByRole('status')).toHaveTextContent('Loading notifications…');
    expect(await within(panel()).findByText('No notifications')).toBeInTheDocument();
  });

  it('shows the latest 20 unarchived items, newest first, and subscribes to realtime', async () => {
    inboxFake.tables.notification_inbox = Array.from({ length: 24 }, (_, i) => inboxRow({ minutesAgo: i + 1, title: `Item ${i + 1}`, read_at: '2026-11-23T09:00:00Z' }));
    renderBell({ open: true });
    const list = await within(panel()).findByRole('list', { name: 'Notifications' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(20);
    expect(rows[0]).toHaveTextContent('Item 1');
    expect(rows[19]).toHaveTextContent('Item 20');
    await waitFor(() => expect(inboxFake.channels.some((c) => c.subscribed && c.bindings[0]?.filter.filter === `user_id=eq.${USER_ID}`)).toBe(true));
  });

  it('opening marks the shown unread items read; they keep their unread dot until it closes', async () => {
    const a = inboxRow({ title: 'Unread A', minutesAgo: 1 });
    const b = inboxRow({ title: 'Unread B', minutesAgo: 2 });
    const c = inboxRow({ title: 'Read C', minutesAgo: 3, read_at: '2026-11-23T09:00:00Z' });
    inboxFake.tables.notification_inbox = [a, b, c];
    renderBell({ open: true });
    await within(panel()).findByText('Unread A');
    await waitFor(() => expect(inboxFake.calls.some((call) => call.op === 'update')).toBe(true));
    const update = inboxFake.calls.find((call) => call.op === 'update');
    expect(update?.filters).toEqual(expect.arrayContaining([['id', 'in', [a.id, b.id]], ['read_at', 'is', null]]));
    expect(Object.keys(update?.payload ?? {})).toEqual(['read_at']);
    // The badge follows the server.
    await waitFor(() => expect(trigger()).toHaveAccessibleName('Notifications'));
    const rowA = within(panel()).getByText('Unread A').closest('li') as HTMLElement;
    expect(rowA.querySelector('[data-unread-dot]')).not.toBeNull();
    expect(within(panel()).getByText('Read C').closest('li')?.querySelector('[data-unread-dot]')).toBeNull();
    // One write per opening, not one per refetch.
    expect(inboxFake.calls.filter((call) => call.op === 'update')).toHaveLength(1);
  });

  it('a click opens the exact record in its scope and closes the panel', async () => {
    inboxFake.tables.notification_inbox = [inboxRow({ title: 'Permit returned', link_vessel_code: 'DRA', link_path: 'safety/permits/p-9?tab=signatures#slot-2' })];
    renderBell({ open: true });
    const link = await within(panel()).findByRole('link', { name: /Permit returned/ });
    expect(link).toHaveAttribute('href', '/v/dra/safety/permits/p-9?tab=signatures#slot-2');
    fireEvent.click(link);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/v/dra/safety/permits/p-9?tab=signatures'));
    expect(screen.getByTestId('open')).toHaveTextContent('false');
  });

  it('a link the viewer cannot open says "No longer available" and is not a link', async () => {
    inboxFake.tables.notification_inbox = [
      inboxRow({ title: 'Other vessel', link_vessel_code: 'GAM' }),
      inboxRow({ title: 'Bad path', link_path: '../fleet/admin' }),
      inboxRow({ title: 'Fleet thing', link_scope: 'fleet', link_vessel_code: null, link_path: 'documents' }),
    ];
    renderBell({ open: true });
    await within(panel()).findByText('Other vessel');
    expect(within(panel()).queryAllByRole('link')).toEqual([]);
    const rows = within(panel()).getAllByRole('listitem');
    for (const row of rows) expect(row).toHaveTextContent('No longer available.');
    expect(rows[0]).toHaveTextContent('You no longer have access to this vessel.');
    expect(rows[2]).toHaveTextContent('This opens in the Fleet view');
  });

  it('says "Checking access…" while access loads, and never links meanwhile (D-04)', async () => {
    h.links.ready = false;
    inboxFake.tables.notification_inbox = [inboxRow({ title: 'Pending check' })];
    renderBell({ open: true });
    expect(await within(panel()).findByText('Checking access…')).toBeInTheDocument();
    expect(within(panel()).queryAllByRole('link')).toEqual([]);
  });

  it('a vessel link while the vessel list is in error is "cannot be checked", not "no longer available"', async () => {
    h.links.reachUnknown = true;
    h.links.reach = new Set();
    inboxFake.tables.notification_inbox = [inboxRow({ title: 'Unknown reach' })];
    renderBell({ open: true });
    const row = (await within(panel()).findByText('Unknown reach')).closest('li') as HTMLElement;
    expect(row).toHaveTextContent('cannot be checked yet');
    expect(row).not.toHaveTextContent('No longer available');
  });

  it('a Fleet link while fleet reach is undecided (the membership read failed) is "cannot be checked" (D-165)', async () => {
    h.links.reachUnknown = true;
    h.links.fleetReachUnknown = true;
    h.links.reach = new Set();
    inboxFake.tables.notification_inbox = [
      inboxRow({ title: 'Fleet unknown', link_scope: 'fleet', link_vessel_code: null, vessel_id: null, link_path: 'documents' }),
    ];
    renderBell({ open: true });
    const row = (await within(panel()).findByText('Fleet unknown')).closest('li') as HTMLElement;
    expect(row).toHaveTextContent('cannot be checked yet');
    expect(row).not.toHaveTextContent('No longer available');
  });

  it('a Fleet link for a decided "no fleet reach" stays "no longer available", even with the vessel list in error', async () => {
    h.links.reachUnknown = true;
    h.links.reach = new Set();
    inboxFake.tables.notification_inbox = [
      inboxRow({ title: 'Fleet denied', link_scope: 'fleet', link_vessel_code: null, vessel_id: null, link_path: 'documents' }),
    ];
    renderBell({ open: true });
    const row = (await within(panel()).findByText('Fleet denied')).closest('li') as HTMLElement;
    expect(row).toHaveTextContent('No longer available');
    expect(row).not.toHaveTextContent('cannot be checked yet');
  });

  it('"Mark all read" marks everything up to the newest item shown, and says when it fails', async () => {
    const newest = inboxRow({ minutesAgo: 1 });
    inboxFake.tables.notification_inbox = [newest, ...Array.from({ length: 30 }, (_, i) => inboxRow({ minutesAgo: i + 2 }))];
    let calls = 0;
    inboxFake.rpcs.notification_inbox_mark_all_read = () => {
      calls += 1;
      return calls === 1 ? { data: null, error: { code: '40001', message: 'could not serialize access' } } : { data: 10, error: null };
    };
    const error = vi.spyOn(notify, 'error').mockImplementation(() => 'x');
    renderBell({ open: true });
    const button = await within(panel()).findByRole('button', { name: 'Mark all read' });
    fireEvent.click(button);
    await waitFor(() => expect(error).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ title: 'Could not mark all as read' })));
    expect(inboxFake.rpcCalls[0]).toEqual({ name: 'notification_inbox_mark_all_read', args: { p_before: newest.created_at } });
    fireEvent.click(within(panel()).getByRole('button', { name: 'Mark all read' }));
    await waitFor(() => expect(inboxFake.rpcCalls).toHaveLength(2));
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('"Open inbox" goes to /inbox and closes the panel', async () => {
    inboxFake.tables.notification_inbox = [];
    renderBell({ open: true });
    fireEvent.click(await within(panel()).findByRole('button', { name: 'Open inbox' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/inbox$/));
    expect(screen.getByTestId('open')).toHaveTextContent('false');
  });
});

/**
 * Honest states of the Red Room panel and the vessel home's Active alerts
 * (BUILD-PLAN Phase 1 open item: the fake "No Urgent Actions Required" on
 * an empty or failed read; X5-02B; D-04):
 *
 * - While the read runs: a skeleton, never the all-clear.
 * - A failed read: an error with Retry (which reads again), never "No
 *   urgent actions" / "No open alerts".
 * - The all-clear only after a successful read that returned nothing.
 * - Red Room: a profile without a company says so once it has resolved;
 *   items of another company / vessel read are never shown for this one.
 * - Active alerts: this vessel's only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';

const h = vi.hoisted(() => ({
  items: [] as unknown[],
  error: null as string | null,
  load: null as unknown as ReturnType<typeof vi.fn>,
  /** Resolves the pending load (when `hold` is set). */
  release: null as null | (() => void),
  hold: false,
  profile: { company_id: 'co-1' } as { company_id: string | null } | null,
  profileResolved: true,
  alerts: { data: [] as unknown[], error: null as null | { code?: string; message: string } },
  alertCalls: [] as unknown[],
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn((fn: string, args: unknown) => {
      if (fn !== 'get_dashboard_alerts') return Promise.resolve({ data: null, error: { message: `no answer for ${fn}` } });
      h.alertCalls.push(args);
      return Promise.resolve({ data: h.alerts.data, error: h.alerts.error });
    }),
  },
}));
vi.mock('@/modules/red-room/store/redRoomStore', () => ({
  useRedRoomStore: () => ({
    items: h.items,
    error: h.error,
    isLoading: false,
    canAssignTasks: false,
    loadRedRoomItems: h.load,
    checkPermissions: () => undefined,
    acknowledgeItem: async () => ({ success: true }),
    getViewUrl: () => '/alerts',
  }),
}));
vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => ({ profile: h.profile, profileResolved: h.profileResolved }) }));
vi.mock('@/shared/hooks/use-toast', () => ({ useToast: () => ({ toast: () => undefined }) }));

import { RedRoomPanel } from '@/modules/red-room/components/RedRoomPanel';
import { AlertsTriagePanel } from '@/modules/red-room/components/AlertsTriagePanel';

const ITEM = {
  id: 'rr-1',
  title: 'Fire drill overdue',
  severity: 'red',
  status: 'open',
  source_module: 'safety',
  vessel_id: 'v-dra',
  vessel_name: 'DRAAK',
  is_direct_assignment: false,
  snooze_count: 0,
  created_at: '2026-11-20T08:00:00.000Z',
  is_overdue: false,
  is_snoozed: false,
  source_type: 'urgent',
};

beforeEach(() => {
  h.items = [];
  h.error = null;
  h.hold = false;
  h.release = null;
  h.profile = { company_id: 'co-1' };
  h.profileResolved = true;
  h.load = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        if (h.hold) h.release = resolve;
        else resolve();
      }),
  );
  h.alerts = { data: [], error: null };
  h.alertCalls = [];
});

const settle = () =>
  act(async () => {
    for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 0));
  });

function renderPanel(vesselId?: string) {
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <RedRoomPanel vesselId={vesselId} />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

describe('Red Room panel', () => {
  it('shows a skeleton while the read runs, never the all-clear', async () => {
    h.hold = true;
    renderPanel();
    await settle();
    expect(screen.getByText('Loading the Red Room')).toBeInTheDocument();
    expect(screen.queryByText('No urgent actions')).toBeNull();
    expect(h.load).toHaveBeenCalledWith('co-1', undefined);
  });

  it('a failed read is an error with Retry, not the empty message', async () => {
    h.error = 'Failed to load items';
    renderPanel();
    await settle();
    expect(screen.getByText('The Red Room could not load')).toBeInTheDocument();
    expect(screen.queryByText('No urgent actions')).toBeNull();
    expect(screen.queryByTestId('red-room-empty')).toBeNull();
    // Retry reads again; a read that now succeeds with nothing is the all-clear.
    h.error = null;
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    await settle();
    expect(h.load).toHaveBeenCalledTimes(2);
    expect(screen.getByText('No urgent actions')).toBeInTheDocument();
  });

  it('says "No urgent actions" only after a successful empty read', async () => {
    renderPanel();
    await settle();
    expect(screen.getByTestId('red-room-empty')).toHaveTextContent('No urgent actions');
  });

  it('shows the items of a successful read', async () => {
    h.items = [ITEM];
    renderPanel('v-dra');
    await settle();
    expect(screen.getByText('Fire drill overdue')).toBeInTheDocument();
    expect(h.load).toHaveBeenCalledWith('co-1', 'v-dra');
  });

  it('never shows the items of an earlier read while this vessel\'s read runs', async () => {
    h.items = [ITEM];
    const view = renderPanel('v-dra');
    await settle();
    expect(screen.getByText('Fire drill overdue')).toBeInTheDocument();
    h.hold = true;
    view.rerender(
      <MemoryRouter>
        <TooltipProvider>
          <RedRoomPanel vesselId="v-hyd" />
        </TooltipProvider>
      </MemoryRouter>,
    );
    await settle();
    expect(screen.queryByText('Fire drill overdue')).toBeNull();
    expect(screen.getByText('Loading the Red Room')).toBeInTheDocument();
  });

  it('a profile with no company says so once it has resolved, and reads nothing', async () => {
    h.profile = { company_id: null };
    renderPanel();
    await settle();
    expect(screen.getByText('The Red Room could not load')).toBeInTheDocument();
    expect(screen.getByText(/not linked to a company/)).toBeInTheDocument();
    expect(h.load).not.toHaveBeenCalled();
  });

  it('while the profile is still loading it is a skeleton', async () => {
    h.profile = null;
    h.profileResolved = false;
    renderPanel();
    await settle();
    expect(screen.getByText('Loading the Red Room')).toBeInTheDocument();
  });

  it('uses tokens, not raw palette colours', async () => {
    h.items = [{ ...ITEM, assigned_by_name: 'Demo DPA', snooze_count: 1 }];
    const { container } = renderPanel();
    await settle();
    expect(container.innerHTML).not.toMatch(/(bg|text|border)-(amber|red|green|yellow|orange|gray|purple)-\d/);
    expect(container.innerHTML).not.toMatch(/\bdark:/);
  });
});

function renderAlerts() {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AlertsTriagePanel companyId="co-1" vesselId="v-hyd" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Active alerts (vessel home)', () => {
  it('shows a skeleton first, then this vessel\'s alerts only', async () => {
    h.alerts.data = [
      { id: 'a-1', title: 'Liferaft service due', severity: 'orange', source_module: 'maintenance', due_at: '2026-12-01T00:00:00Z', vessel_id: 'v-hyd', vessel_name: 'HYDRA', created_at: '2026-11-20T00:00:00Z', is_overdue: true },
      { id: 'a-2', title: 'Another vessel alert', severity: 'red', source_module: 'drills', due_at: null, vessel_id: 'v-dra', vessel_name: 'DRAAK', created_at: '2026-11-20T00:00:00Z', is_overdue: false },
    ];
    renderAlerts();
    expect(screen.getByText("Loading this vessel's alerts")).toBeInTheDocument();
    expect(await screen.findByText('Liferaft service due')).toBeInTheDocument();
    expect(screen.queryByText('Another vessel alert')).toBeNull();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(h.alertCalls[0]).toMatchObject({ p_company_id: 'co-1', p_vessel_id: 'v-hyd', p_all_vessels: false });
  });

  it('a failed read is an error with Retry, not "No open alerts"', async () => {
    h.alerts.error = { code: 'XX000', message: 'boom' };
    renderAlerts();
    expect(await screen.findByText("This vessel's alerts could not load", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByText('No open alerts')).toBeNull();
    h.alerts.error = null;
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(screen.getByTestId('alerts-empty')).toHaveTextContent('No open alerts'));
  });

  it('says "No open alerts" after a successful empty read', async () => {
    renderAlerts();
    await waitFor(() => expect(screen.getByTestId('alerts-empty')).toBeInTheDocument());
    expect(screen.queryByText(/All systems operational/)).toBeNull();
  });
});

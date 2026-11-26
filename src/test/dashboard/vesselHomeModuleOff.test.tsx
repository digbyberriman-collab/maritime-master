/**
 * The vessel home (`/v/:vesselCode`, pages/VesselDashboard.tsx; X5-02B;
 * gap/10 W4, S4; DECISIONS D-82, D-86, D-88; BUILD-PLAN Phase 1 deferred
 * "vessel home off-module tiles and actions" and open "Log Incident ignores
 * Safety off").
 *
 * - The indicators come from `fleet_dashboard_kpis([vesselId])`; a tile
 *   whose module is off for the vessel is not shown, and its lists are left
 *   out too.
 * - Module settings that fail to load put the switched tiles in an error
 *   with Retry (never "all on", D-86) and hide the switched actions.
 * - Quick actions follow the vessel's modules and the caller's
 *   capabilities: "Log incident" is gone with Safety off or without the
 *   incidents capability; links stay inside /v/<code>.
 * - No `?view=fleet` branch: the page is the vessel's home whatever the
 *   query; with no vessel it points to the fleet dashboard.
 * - One freshness stamp; alerts of another vessel never shown.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FleetDashboardKpisJson, FleetDashboardPanelsJson } from '@/modules/dashboard/types/db.pending';

type Answer = { data: unknown; error: { code?: string; message: string } | null };

const HYD = {
  id: 'v-hyd',
  company_id: 'co-1',
  name: 'HYDRA',
  imo_number: '9688037',
  flag_state: 'Malta',
  vessel_type: 'Motor Yacht',
  classification_society: 'DNV',
  gross_tonnage: 1190,
  build_year: 2023,
  status: 'Active',
  code: 'HYD',
};

const h = vi.hoisted(() => ({
  scope: null as null | { vessel: unknown; code: string },
  selection: { selectedVessel: null as unknown, isAllVessels: true },
  settings: { data: [] as unknown[], error: null as null | { code?: string; message: string } } as Answer & { data: unknown[] },
  settingsPending: false,
  rpc: {} as Record<string, Answer | (() => Promise<Answer>)>,
  denied: new Set<string>(),
  role: 'dpa',
  calls: [] as Array<{ fn: string; args: unknown }>,
}));

vi.mock('@/integrations/supabase/client', () => {
  const builder = () => {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.then = (resolve: (v: Answer) => unknown, reject?: (e: unknown) => unknown) =>
      (h.settingsPending ? new Promise<Answer>(() => undefined) : Promise.resolve({ data: h.settings.data, error: h.settings.error })).then(resolve, reject);
    return b;
  };
  return {
    supabase: {
      from: vi.fn(() => builder()),
      rpc: vi.fn((fn: string, args: unknown) => {
        h.calls.push({ fn, args });
        const answer = h.rpc[fn];
        if (typeof answer === 'function') return answer();
        return Promise.resolve(answer ?? { data: null, error: { code: 'XX000', message: `no answer for ${fn}` } });
      }),
    },
  };
});
vi.mock('@/shared/components/layout/DashboardLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/app/router/scopes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/router/scopes')>()),
  useVesselScope: () => h.scope,
}));
vi.mock('@/modules/vessels/contexts/VesselContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/vessels/contexts/VesselContext')>()),
  useVessel: () => ({ ...h.selection, getVesselCodeById: () => null }),
}));
vi.mock('@/modules/auth/contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { role: h.role, company_id: 'co-1' }, profileResolved: true }),
}));
vi.mock('@/lib/permissions/useCan', () => ({
  useAccessSnapshot: () => ({}),
  useCan: (key: string) => !h.denied.has(key),
  useCapability: (key: string) => ({ allowed: !h.denied.has(key), status: h.denied.has(key) ? 'denied' : 'granted', reason: '' }),
}));
vi.mock('@/lib/permissions/adaptor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/permissions/adaptor')>()),
  resolveCapability: (key: string) => ({ allowed: !h.denied.has(key), status: h.denied.has(key) ? 'denied' : 'granted', reason: '' }),
}));
vi.mock('@/modules/vessels/components/VesselProfileCard', () => ({ default: () => <div data-testid="vessel-profile" /> }));
vi.mock('@/modules/emergency/components/EmergencyContactsWidget', () => ({ EmergencyContactsWidget: () => <div data-testid="emergency-contacts" /> }));

import VesselDashboard from '@/modules/vessels/pages/VesselDashboard';

// jsdom has no PointerEvent; Radix menus open on pointerdown (button 0), which needs one.
if (!('PointerEvent' in window)) Object.defineProperty(window, 'PointerEvent', { value: MouseEvent, configurable: true });

function kpis(): FleetDashboardKpisJson {
  return {
    vessels: 1,
    today: '2026-11-26',
    tiles: {
      documents: {
        state: 'ok',
        value: 3,
        vessels: 1,
        parts: { expired_vessel_certificates: 1, expired_crew_documents: 0, expired_crew_qualifications: 0, endorsements_overdue: 0, expiring: 2 },
      },
      hours_of_rest: { state: 'ok', value: 2, breach_days: 2, near_threshold: 0, crew_without_entries: 0, vessels_logging: 1, vessels_off: 0 },
      safety: { state: 'ok', value: 2, vessels: 1, open_corrective_actions: 1, overdue_corrective_actions: 1, overdue_drills: 1 },
      technical: { state: 'ok', value: 1, vessels: 1, overdue_jobs: 1, pending_approval: 0, open_jobs: 3 },
      leave: { state: 'not_enabled' },
      finance: { state: 'hidden' },
    },
  };
}

function panels(): FleetDashboardPanelsJson {
  const vessel = { vessel_id: 'v-hyd', vessel_name: 'HYDRA', vessel_code: 'HYD' };
  return {
    vessels: 1,
    today: '2026-11-26',
    expiry: {
      state: 'ok',
      groups: {
        vessel_certificates: { total: 0, items: [] },
        crew_documents: { total: 0, items: [] },
        crew_qualifications: { total: 0, items: [] },
      },
    },
    corrective_actions: {
      state: 'ok',
      total: 1,
      overdue: 1,
      items: [{ ...vessel, id: 'ca-1', action_number: 'CA-9', description: 'Fit the guard', action_type: 'Corrective', status: 'Open', due_date: '2026-11-20', days_overdue: 6, source: 'incident', source_id: 'i-1' }],
    },
    overdue_drills: { state: 'ok', total: 0, items: [] },
    hess: { state: 'not_tracked' },
    insurance: { state: 'ok', total: 0, items: [] },
    surveys: { state: 'ok', total: 0, items: [] },
    work_list: { state: 'ok', vessels: [] },
  };
}

const ok = (data: unknown): Answer => ({ data, error: null });
const MISSING = (fn: string): Answer => ({ data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn} in the schema cache` } });
const off = (moduleKey: string) => ({ vessel_id: 'v-hyd', module_key: moduleKey, enabled: false, enabled_from: null, label_override: null });

function renderHome(path = '/v/hyd') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <VesselDashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const indicators = () => screen.getByRole('region', { name: 'Vessel indicators' });
function tile(label: string): HTMLElement | null {
  const el = within(indicators()).queryByText(label);
  return el ? el.closest<HTMLElement>('[data-state]') : null;
}

async function openQuickActions(): Promise<HTMLElement> {
  const trigger = await screen.findByRole('button', { name: /quick actions/i });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
  return screen.findByRole('menu');
}

beforeEach(() => {
  h.scope = { vessel: HYD, code: 'hyd' };
  h.selection = { selectedVessel: null, isAllVessels: true };
  h.settings = { data: [], error: null };
  h.settingsPending = false;
  h.denied = new Set();
  h.role = 'dpa';
  h.calls = [];
  h.rpc = {
    fleet_dashboard_kpis: ok(kpis()),
    fleet_dashboard_panels: ok(panels()),
    get_dashboard_alerts: ok([
      { id: 'a-1', title: 'Liferaft service due', severity: 'orange', source_module: 'maintenance', due_at: '2026-12-01T00:00:00Z', vessel_id: 'v-hyd', vessel_name: 'HYDRA', created_at: '2026-11-20T00:00:00Z', is_overdue: false },
      { id: 'a-2', title: 'Another vessel alert', severity: 'red', source_module: 'drills', due_at: null, vessel_id: 'v-dra', vessel_name: 'DRAAK', created_at: '2026-11-20T00:00:00Z', is_overdue: true },
    ]),
  };
});

describe('every module on', () => {
  it('shows the four indicators for this vessel only, with one freshness stamp', async () => {
    renderHome();
    await waitFor(() => expect(tile('Safety')).toHaveAttribute('data-state', 'ready'));
    for (const label of ['Document alerts', 'Hours of rest', 'Safety', 'Technical']) expect(tile(label), label).not.toBeNull();
    expect(screen.queryByText('Leave overdue')).toBeNull();
    // Sent as this vessel's id, never fleet-wide.
    expect(h.calls.find((c) => c.fn === 'fleet_dashboard_kpis')?.args).toMatchObject({ p_vessel_ids: ['v-hyd'] });
    expect(h.calls.find((c) => c.fn === 'fleet_dashboard_panels')?.args).toMatchObject({ p_vessel_ids: ['v-hyd'] });
    expect(screen.getAllByText(/^Updated \d{1,2} \w{3} \d{4}, \d{2}:\d{2} UTC$/)).toHaveLength(1);
    // The fleet sub-text "1 vessel logging" says nothing on one vessel.
    expect(tile('Hours of rest')).toHaveTextContent('2 breach days');
    expect(tile('Hours of rest')).not.toHaveTextContent('logging');
    expect(tile('Technical')?.closest('a')).toHaveAttribute('href', '/v/hyd/technical');
  });

  it('keeps the PageHeader with the vessel name and the IMO chip', async () => {
    renderHome();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('HYDRA');
    expect(screen.getByText('IMO 9688037')).toBeInTheDocument();
    expect(screen.getByText('Malta')).toBeInTheDocument();
  });

  it('offers Log incident with this vessel, and every action stays inside /v/hyd', async () => {
    renderHome();
    const menu = await openQuickActions();
    const log = within(menu).getByRole('menuitem', { name: /Log incident/ });
    expect(log).toHaveAttribute('href', '/incidents?new=true&vessel=v-hyd');
    expect(within(menu).getByRole('menuitem', { name: /Crew list/ })).toHaveAttribute('href', '/v/hyd/crew/list');
    expect(within(menu).getByRole('menuitem', { name: /Technical jobs/ })).toHaveAttribute('href', '/v/hyd/technical');
  });

  it('shows only this vessel\'s alerts', async () => {
    renderHome();
    expect(await screen.findByText('Liferaft service due')).toBeInTheDocument();
    expect(screen.queryByText('Another vessel alert')).toBeNull();
  });

  it('a ?view=fleet query still opens the vessel home (the fleet view is /fleet/dashboard)', async () => {
    renderHome('/v/hyd?view=fleet');
    await waitFor(() => expect(tile('Safety')).toHaveAttribute('data-state', 'ready'));
    expect(screen.queryByRole('button', { name: /^fleet$/i })).toBeNull();
    expect(screen.queryByText('Fleet dashboard')).toBeNull();
  });
});

describe('a module switched off for the vessel', () => {
  it('Safety off: no Safety tile, no safety lists, no Log incident', async () => {
    h.settings = { data: [off('safety')], error: null };
    renderHome();
    await waitFor(() => expect(tile('Technical')).toHaveAttribute('data-state', 'ready'));
    expect(tile('Safety')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Corrective actions' })).toBeNull();
    expect(screen.queryByText('Safety and compliance')).toBeNull();
    const menu = await openQuickActions();
    expect(within(menu).queryByRole('menuitem', { name: /Log incident/ })).toBeNull();
    expect(within(menu).queryByRole('menuitem', { name: /SMS form/ })).toBeNull();
    expect(within(menu).queryByRole('menuitem', { name: /drill/ })).toBeNull();
    expect(within(menu).getByRole('menuitem', { name: /Crew list/ })).toBeInTheDocument();
  });

  it('Technical off: no Technical tile and no Technical jobs action', async () => {
    h.settings = { data: [off('technical')], error: null };
    renderHome();
    await waitFor(() => expect(tile('Safety')).toHaveAttribute('data-state', 'ready'));
    expect(tile('Technical')).toBeNull();
    const menu = await openQuickActions();
    expect(within(menu).queryByRole('menuitem', { name: /Technical jobs/ })).toBeNull();
    expect(within(menu).getByRole('menuitem', { name: /Log incident/ })).toBeInTheDocument();
  });

  it('Hours of Rest off (crew_hor) hides its tile; Crew off hides it too', async () => {
    h.settings = { data: [off('crew_hor')], error: null };
    const { unmount } = renderHome();
    await waitFor(() => expect(tile('Safety')).toHaveAttribute('data-state', 'ready'));
    expect(tile('Hours of rest')).toBeNull();
    unmount();
    h.settings = { data: [off('crew')], error: null };
    renderHome();
    await waitFor(() => expect(tile('Safety')).toHaveAttribute('data-state', 'ready'));
    expect(tile('Hours of rest')).toBeNull();
  });

  it('the server\'s module_off also hides a tile', async () => {
    h.rpc.fleet_dashboard_kpis = ok({ ...kpis(), tiles: { ...kpis().tiles, technical: { state: 'module_off' } } });
    renderHome();
    await waitFor(() => expect(tile('Safety')).toHaveAttribute('data-state', 'ready'));
    expect(tile('Technical')).toBeNull();
  });
});

describe('module settings that cannot be read (D-86)', () => {
  it('puts the switched tiles in an error with Retry, never all on, and offers no switched action', async () => {
    h.settings = { data: [], error: { code: 'XX000', message: 'boom' } };
    renderHome();
    await waitFor(() => expect(tile('Safety')).toHaveAttribute('data-state', 'error'));
    for (const label of ['Hours of rest', 'Safety', 'Technical']) {
      expect(tile(label), label).toHaveAttribute('data-state', 'error');
      expect(tile(label)).toHaveTextContent("This vessel's modules could not load");
      expect(tile(label)).not.toHaveTextContent('2 breach days');
    }
    // Document alerts are not switched by a module.
    await waitFor(() => expect(tile('Document alerts')).toHaveAttribute('data-state', 'ready'));
    // Every action is switched by a module: no menu at all.
    expect(screen.queryByRole('button', { name: /quick actions/i })).toBeNull();
    // The lists follow the modules too: an error with Retry instead of lists.
    expect(screen.getByRole('heading', { name: "This vessel's modules could not load" })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Corrective actions' })).toBeNull();
    // Retry reads the settings again; once they load, the tiles come back.
    h.settings = { data: [], error: null };
    fireEvent.click(within(tile('Safety') as HTMLElement).getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(tile('Safety')).toHaveAttribute('data-state', 'ready'));
  });

  it('while the settings load, the switched tiles are skeletons and the actions wait', async () => {
    h.settingsPending = true;
    renderHome();
    await waitFor(() => expect(tile('Document alerts')).toHaveAttribute('data-state', 'ready'));
    expect(tile('Safety')).toHaveAttribute('data-state', 'loading');
    expect(screen.queryByRole('button', { name: /quick actions/i })).toBeNull();
  });

  it('a settings table that is not in the database yet means every module on (D-01)', async () => {
    h.settings = { data: [], error: { code: '42P01', message: 'relation "public.vessel_module_settings" does not exist' } };
    renderHome();
    await waitFor(() => expect(tile('Safety')).toHaveAttribute('data-state', 'ready'));
    const menu = await openQuickActions();
    expect(within(menu).getByRole('menuitem', { name: /Log incident/ })).toBeInTheDocument();
  });
});

describe('capabilities', () => {
  it('without the incidents capability there is no Log incident, Safety on or not', async () => {
    h.denied = new Set(['vessel.safety.incidents.create']);
    renderHome();
    const menu = await openQuickActions();
    expect(within(menu).queryByRole('menuitem', { name: /Log incident/ })).toBeNull();
    expect(within(menu).getByRole('menuitem', { name: /Plan a drill/ })).toBeInTheDocument();
  });

  it('a tile the caller cannot read is hidden', async () => {
    h.rpc.fleet_dashboard_kpis = ok({ ...kpis(), tiles: { ...kpis().tiles, documents: { state: 'no_access' } } });
    renderHome();
    await waitFor(() => expect(tile('Safety')).toHaveAttribute('data-state', 'ready'));
    expect(tile('Document alerts')).toBeNull();
  });
});

describe('the dashboard RPCs not set up yet (D-01)', () => {
  it('says "Not set up yet" on the tiles and for the lists, never zeros', async () => {
    h.rpc.fleet_dashboard_kpis = MISSING('fleet_dashboard_kpis');
    h.rpc.fleet_dashboard_panels = MISSING('fleet_dashboard_panels');
    renderHome();
    await waitFor(() => expect(tile('Safety')).toHaveAttribute('data-state', 'not-enabled'));
    for (const label of ['Document alerts', 'Hours of rest', 'Safety', 'Technical']) expect(tile(label)).toHaveTextContent('Not set up yet');
    expect(await screen.findByText('These lists are not set up yet')).toBeInTheDocument();
    expect(screen.queryByText(/^Updated /)).toBeNull();
  });

  it('a failed read is an error with Retry', async () => {
    h.rpc.fleet_dashboard_kpis = { data: null, error: { code: 'XX000', message: 'boom' } };
    renderHome();
    await waitFor(() => expect(tile('Safety')).toHaveAttribute('data-state', 'error'));
    expect(tile('Safety')).toHaveTextContent('Could not load');
    h.rpc.fleet_dashboard_kpis = ok(kpis());
    fireEvent.click(within(tile('Safety') as HTMLElement).getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(tile('Safety')).toHaveAttribute('data-state', 'ready'));
  });
});

describe('no vessel (legacy /vessels/dashboard in "All vessels")', () => {
  it('says to choose a vessel and links to the fleet dashboard, reading nothing', async () => {
    h.scope = null;
    renderHome('/vessels/dashboard?view=fleet');
    expect(screen.getByRole('heading', { name: 'Choose a vessel' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the fleet dashboard' })).toHaveAttribute('href', '/fleet/dashboard');
    expect(h.calls).toHaveLength(0);
  });

  it('on the legacy URL with one vessel selected, shows that vessel', async () => {
    h.scope = null;
    h.selection = { selectedVessel: HYD, isAllVessels: false };
    renderHome('/vessels/dashboard');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('HYDRA');
  });
});

describe('tokens', () => {
  it('uses no raw palette colours', async () => {
    const { container } = renderHome();
    await waitFor(() => expect(tile('Safety')).toHaveAttribute('data-state', 'ready'));
    expect(container.innerHTML).not.toMatch(/(bg|text|border)-(amber|sky|emerald|rose|slate|violet|red|green|yellow|blue|orange|gray|zinc|purple)-\d/);
    expect(container.innerHTML).not.toMatch(/\bdark:/);
  });
});

/**
 * The fleet dashboard's dedicated panels (X5-02B; gap/02 D9, D10, D12, D13,
 * D15, D2; DECISIONS D-01, D-38):
 *
 * - ExpiryPanels, SafetyPanels, InsuranceSurveysPanel, WorkListPanel on the
 *   `fleet_dashboard_panels` payload: "n of m", empty texts, hidden without
 *   access, "off on every vessel shown" (fleet) vs left out (vessel home),
 *   "Not tracked yet.", row links into the vessel scope, "View all" only
 *   where the page gives a target.
 * - VesselHealthMatrix on `fleet_vessel_comparison`: tones, "–" for a group
 *   that is not covered (never 0), worst vessels first, "Compare all
 *   vessels" only with a target, not set up / error with Retry / loading.
 * - FleetGroupMaps: one card per fleet group with a vessel shown plus
 *   Ungrouped, reported positions only ("No position yet", stale fixes
 *   flagged), "Open full tracker" per group, a failed read with Retry.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FleetDashboardPanelsJson } from '@/modules/dashboard/types/db.pending';
import type { FleetDashboardState, FleetVesselComparison } from '@/modules/dashboard/hooks/useFleetDashboard';
import type { ShownVessel } from '@/modules/fleet';

// jsdom has no SVG geometry; Leaflet checks for it when it loads.
vi.hoisted(() => {
  const proto = (globalThis as unknown as { SVGSVGElement?: { prototype: Record<string, unknown> } }).SVGSVGElement?.prototype;
  if (proto && !proto.createSVGRect) proto.createSVGRect = () => ({});
});

type Answer = { data: unknown; error: { code?: string; message: string } | null };

const h = vi.hoisted(() => ({
  groups: { data: [] as unknown[], error: null } as Answer,
  fixes: {} as Record<string, unknown>,
  fixesError: null as null | { code?: string; message: string },
}));

vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    let vesselId = '';
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'not', 'order', 'limit']) b[m] = () => b;
    b.eq = (col: string, value: string) => {
      if (col === 'vessel_id') vesselId = value;
      return b;
    };
    b.then = (resolve: (v: Answer) => unknown, reject?: (e: unknown) => unknown) => {
      const answer: Answer =
        table === 'fleet_groups'
          ? h.groups
          : h.fixesError
            ? { data: null, error: h.fixesError }
            : { data: h.fixes[vesselId] ? [h.fixes[vesselId]] : [], error: null };
      return Promise.resolve(answer).then(resolve, reject);
    };
    return b;
  };
  return { supabase: { from: vi.fn((table: string) => builder(table)), rpc: vi.fn() } };
});
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'dark' }) }));

import { ExpiryPanels } from '@/modules/dashboard/components/fleet/ExpiryPanels';
import { SafetyPanels } from '@/modules/dashboard/components/fleet/SafetyPanels';
import { InsuranceSurveysPanel } from '@/modules/dashboard/components/fleet/InsuranceSurveysPanel';
import { WorkListPanel } from '@/modules/dashboard/components/fleet/WorkListPanel';
import { VesselHealthMatrix } from '@/modules/dashboard/components/fleet/VesselHealthMatrix';
import { FleetGroupMaps } from '@/modules/dashboard/components/fleet/FleetGroupMaps';

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

const DRA = { vessel_id: 'v-dra', vessel_name: 'DRAAK', vessel_code: 'DRA' };

function panels(): FleetDashboardPanelsJson {
  return {
    vessels: 3,
    today: '2026-11-26',
    expiry: {
      state: 'ok',
      groups: {
        vessel_certificates: {
          total: 4,
          items: [
            {
              ...DRA,
              source_key: 'vessel_certificates',
              item_type: 'vessel_certificate',
              record_id: 'c-1',
              person_name: null,
              label: 'Safety Management Certificate',
              detail: 'Flag',
              expires_on: '2026-11-21',
              days_remaining: -5,
              bucket: 'expired',
              endorsement_due_on: null,
              endorsement_state: null,
              link_scope: 'vessel',
              link_rel: 'certificates',
            },
            {
              ...DRA,
              source_key: 'vessel_certificates',
              item_type: 'vessel_certificate',
              record_id: 'c-2',
              person_name: null,
              label: 'Load Line Certificate',
              detail: null,
              expires_on: '2027-01-10',
              days_remaining: 45,
              bucket: 'expiring',
              endorsement_due_on: '2026-11-01',
              endorsement_state: 'overdue',
              link_scope: 'vessel',
              link_rel: 'certificates',
            },
          ],
        },
        crew_documents: { total: 0, items: [] },
        crew_qualifications: {
          total: 1,
          items: [
            {
              ...DRA,
              source_key: 'training_records',
              item_type: 'crew_qualification',
              record_id: 't-1',
              person_name: 'Demo Bosun',
              label: 'Basic Safety Training',
              detail: null,
              expires_on: '2026-11-14',
              days_remaining: -12,
              bucket: 'something_new',
              endorsement_due_on: null,
              endorsement_state: null,
              link_scope: 'workspace',
              link_rel: 'crew',
            },
          ],
        },
      },
    },
    corrective_actions: {
      state: 'ok',
      total: 2,
      overdue: 1,
      items: [
        { ...DRA, id: 'ca-1', action_number: 'CA-1', description: 'Fix the rail', action_type: 'Corrective', status: 'Open', due_date: '2026-11-23', days_overdue: 3, source: 'incident', source_id: 'i-1' },
        { vessel_id: null, vessel_name: null, vessel_code: null, id: 'ca-2', action_number: 'CA-2', description: 'Update the SMS', action_type: 'Preventive', status: 'In Progress', due_date: '2026-12-06', days_overdue: 0, source: 'none', source_id: null },
      ],
    },
    overdue_drills: { state: 'ok', total: 1, items: [{ ...DRA, id: 'd-1', drill_number: 'DRL-1', drill_type: 'Abandon ship', scheduled_on: '2026-11-22', days_overdue: 4 }] },
    hess: { state: 'not_tracked' },
    insurance: { state: 'no_access' },
    surveys: { state: 'ok', total: 0, items: [] },
    work_list: {
      state: 'ok',
      vessels: [
        { vessel_id: 'v-dra', vessel_name: 'DRAAK', vessel_code: 'DRA', open: 3, overdue: 2, pending_approval: 1 },
        { vessel_id: 'v-hyd', vessel_name: 'HYDRA', vessel_code: 'HYD', open: 1, overdue: 0, pending_approval: 0 },
      ],
    },
  };
}

const wrap = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );

const region = (name: string) => screen.getByRole('region', { name });

describe('ExpiryPanels', () => {
  it('lists the most urgent items with "n of m", vessel links and the endorsement state', () => {
    wrap(<ExpiryPanels expiry={panels().expiry} scope="fleet" />);
    const certs = region('Vessel certificates');
    expect(within(certs).getByTestId('list-count')).toHaveTextContent('2 of 4');
    expect(within(certs).getByRole('link', { name: /Safety Management Certificate/ })).toHaveAttribute('href', '/v/dra/certificates');
    expect(within(certs).getByText(/Expired/)).toBeInTheDocument();
    expect(within(certs).getByText('Endorsement overdue')).toBeInTheDocument();
    expect(within(certs).getByText(/DRAAK · Flag/)).toBeInTheDocument();
  });

  it('says what is clear for an empty list, shows an unknown bucket as written, and links only vessel-scoped items', () => {
    wrap(<ExpiryPanels expiry={panels().expiry} scope="fleet" />);
    expect(region('Crew documents')).toHaveTextContent('No crew document expired or expiring.');
    const quals = region('Crew qualifications');
    expect(within(quals).getByText('something_new')).toBeInTheDocument();
    expect(within(quals).queryByRole('link')).toBeNull();
    expect(within(quals).getByTestId('list-count')).toHaveTextContent('1 item');
  });

  it('links "View all" only where the page gives a target', () => {
    wrap(<ExpiryPanels expiry={panels().expiry} scope="fleet" viewAllHref={(list) => (list === 'vessel_certificates' ? '/fleet/reports/fleet-certificates' : null)} />);
    expect(within(region('Vessel certificates')).getByRole('link', { name: 'View all vessel certificates' })).toHaveAttribute('href', '/fleet/reports/fleet-certificates');
    expect(within(region('Crew documents')).queryByRole('link', { name: /View all/ })).toBeNull();
  });

  it('renders nothing without access', () => {
    const { container } = wrap(<ExpiryPanels expiry={{ state: 'no_access' }} scope="fleet" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('on the vessel home: rows leave the vessel out, and a list of an off module is left out', () => {
    wrap(<ExpiryPanels expiry={panels().expiry} scope="vessel" isModuleOn={(key) => key !== 'crew'} />);
    expect(within(region('Vessel certificates')).getByText('Flag')).toBeInTheDocument();
    expect(within(region('Vessel certificates')).queryByText(/DRAAK/)).toBeNull();
    expect(screen.queryByRole('region', { name: 'Crew documents' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Crew qualifications' })).toBeNull();
  });
});

describe('SafetyPanels', () => {
  const props = () => {
    const p = panels();
    return { correctiveActions: p.corrective_actions, drills: p.overdue_drills, hess: p.hess, today: p.today };
  };

  it('ranks corrective actions with vessel, type, status and days overdue or to the due date', () => {
    wrap(<SafetyPanels {...props()} scope="fleet" />);
    const ca = region('Corrective actions');
    expect(ca).toHaveTextContent('1 overdue');
    expect(ca).toHaveTextContent('3 d overdue');
    expect(ca).toHaveTextContent('DRAAK · Corrective · Open · From an incident');
    // A fleet-level action (no vessel) says Fleet; due in 10 days from the server's today.
    expect(ca).toHaveTextContent('Fleet · Preventive · In Progress');
    expect(ca).toHaveTextContent('Due in 10 d');
  });

  it('links an overdue drill to the vessel\'s drills and says HESS is not tracked yet', () => {
    wrap(<SafetyPanels {...props()} scope="fleet" />);
    expect(within(region('Overdue drills')).getByRole('link', { name: /Abandon ship/ })).toHaveAttribute('href', '/v/dra/safety/drills');
    expect(region('HESS meetings')).toHaveTextContent('Not tracked yet.');
  });

  it('Safety off on every vessel shown says so on the fleet dashboard; the vessel home leaves the lists out', () => {
    const off = { correctiveActions: { state: 'module_off' as const }, drills: { state: 'module_off' as const }, hess: { state: 'module_off' as const }, today: '2026-11-26' };
    const { unmount } = wrap(<SafetyPanels {...off} scope="fleet" />);
    expect(region('Corrective actions')).toHaveTextContent('Safety is off on every vessel shown.');
    unmount();
    const { container } = wrap(<SafetyPanels {...off} scope="vessel" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('a list without access is not shown', () => {
    wrap(<SafetyPanels {...props()} correctiveActions={{ state: 'no_access' }} scope="fleet" />);
    expect(screen.queryByRole('region', { name: 'Corrective actions' })).toBeNull();
    expect(region('Overdue drills')).toBeInTheDocument();
  });
});

describe('InsuranceSurveysPanel', () => {
  it('hides insurance without access and says when no audit or survey is due', () => {
    const p = panels();
    wrap(<InsuranceSurveysPanel insurance={p.insurance} surveys={p.surveys} scope="fleet" />);
    expect(screen.queryByRole('region', { name: /Insurance/ })).toBeNull();
    expect(region('Audits and surveys')).toHaveTextContent('No audit or survey in the next 90 days.');
  });

  it('lists renewals with the vessel or Fleet and opens a certificate survey on the vessel', () => {
    wrap(
      <InsuranceSurveysPanel
        insurance={{
          state: 'ok',
          total: 1,
          items: [{ vessel_id: null, vessel_name: null, vessel_code: null, record_id: 'p-1', label: 'Protection & Indemnity', detail: 'Mutual club', expires_on: '2027-02-06', days_remaining: 72, bucket: 'expiring', link_scope: 'fleet', link_rel: 'insurance' }],
        }}
        surveys={{
          state: 'ok',
          total: 1,
          items: [{ ...DRA, kind: 'certificate_survey', id: 's-1', reference: 'LL-1', label: 'Load Line survey', status: null, due_on: '2026-12-20', days_remaining: 24 }],
        }}
        scope="fleet"
      />,
    );
    expect(region('Insurance renewals')).toHaveTextContent('Fleet · Mutual club');
    expect(within(region('Insurance renewals')).queryByRole('link')).toBeNull();
    expect(within(region('Audits and surveys')).getByRole('link', { name: /Load Line survey/ })).toHaveAttribute('href', '/v/dra/certificates');
    expect(region('Audits and surveys')).toHaveTextContent('Due in 24 d');
  });

  it('renders nothing when neither list is readable', () => {
    const { container } = wrap(<InsuranceSurveysPanel insurance={{ state: 'no_access' }} surveys={{ state: 'no_access' }} scope="fleet" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('WorkListPanel', () => {
  it('is a table of open, overdue and awaiting approval per vessel, names linking to the job list', () => {
    wrap(<WorkListPanel workList={panels().work_list} scope="fleet" />);
    const list = region('Work list');
    expect(within(list).getByTestId('list-count')).toHaveTextContent('2 vessels');
    const table = within(list).getByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('DRAAK');
    expect(rows[1]).toHaveTextContent('2 overdue');
    expect(rows[1]).toHaveTextContent('1 awaiting approval');
    expect(within(rows[1]).getByRole('link', { name: 'DRAAK' })).toHaveAttribute('href', '/v/dra/technical');
    expect(rows[2]).toHaveTextContent('0 overdue');
  });

  it('Technical off everywhere says so; without access nothing', () => {
    const { unmount } = wrap(<WorkListPanel workList={{ state: 'module_off' }} scope="fleet" />);
    expect(region('Work list')).toHaveTextContent('Technical is off on every vessel shown.');
    unmount();
    const { container } = wrap(<WorkListPanel workList={{ state: 'no_access' }} scope="fleet" />);
    expect(container).toBeEmptyDOMElement();
  });
});

// ─── Vessel health matrix ───────────────────────────────────────────────

const comparison = (): FleetVesselComparison[] => [
  {
    vessel_id: 'v-hyd',
    vessel_name: 'HYDRA',
    vessel_code: 'HYD',
    documents: { value: 0, expired: 0, endorsements_overdue: 0, expiring: 0 },
    safety: { open_corrective_actions: 0, overdue_corrective_actions: 0, overdue_drills: 0 },
    technical: { open_jobs: 0, overdue_jobs: 0, pending_approval: 0 },
    insurance: { expired: 0, expiring: 0 },
    hours_of_rest: null,
  },
  {
    vessel_id: 'v-dra',
    vessel_name: 'DRAAK',
    vessel_code: 'DRA',
    documents: { value: 4, expired: 1, endorsements_overdue: 0, expiring: 3 },
    safety: { open_corrective_actions: 2, overdue_corrective_actions: 1, overdue_drills: 1 },
    technical: { open_jobs: 3, overdue_jobs: 1, pending_approval: 0 },
    insurance: { expired: 0, expiring: 1 },
    hours_of_rest: { breach_days: 1, near_threshold: 0, crew_without_entries: 0 },
  },
];

const ready = (data: FleetVesselComparison[]): FleetDashboardState<FleetVesselComparison[]> => ({
  state: 'ready',
  data,
  refreshing: false,
  updatedAt: Date.now(),
  refresh: () => undefined,
});

describe('VesselHealthMatrix', () => {
  it('shows each vessel, worst first, with tone dots and "–" for a group not covered', () => {
    wrap(<VesselHealthMatrix state={ready(comparison())} compareHref={null} />);
    const grid = screen.getByRole('table', { name: 'Vessel health matrix' });
    const rows = within(grid).getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('DRAAK');
    expect(rows[1]).toHaveTextContent('HYDRA');
    expect(within(rows[0]).getByRole('link', { name: 'DRAAK' })).toHaveAttribute('href', '/v/dra');
    // Documents 4 (1 expired), Safety 3 (2 open + 1 drill), HoR 1 breach day.
    expect(rows[0]).toHaveTextContent('1 expired, 0 endorsements overdue, 3 expiring');
    expect(rows[0]).toHaveTextContent('2 open actions, 1 overdue actions, 1 overdue drills');
    // HYDRA's hours of rest are not covered: "–", never 0.
    expect(rows[1]).toHaveTextContent('HYDRA, Hours of rest breach days (30 days): not covered');
    expect(rows[1]).toHaveTextContent('–');
    expect(screen.queryByRole('link', { name: /Compare all vessels/ })).toBeNull();
  });

  it('links "Compare all vessels" to the report once the registry knows it', () => {
    wrap(<VesselHealthMatrix state={ready(comparison())} compareHref="/fleet/reports/vessel-comparison" />);
    expect(screen.getByRole('link', { name: /Compare all vessels/ })).toHaveAttribute('href', '/fleet/reports/vessel-comparison');
  });

  it('not set up, error with Retry, loading', () => {
    const retry = vi.fn();
    const { rerender } = wrap(<VesselHealthMatrix state={{ state: 'not_set_up' }} compareHref={null} />);
    expect(screen.getByText('The health matrix is not set up yet')).toBeInTheDocument();
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <VesselHealthMatrix state={{ state: 'error', error: new Error('boom'), retry }} compareHref={null} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(retry).toHaveBeenCalledTimes(1);
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <VesselHealthMatrix state={{ state: 'loading' }} compareHref={null} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText('Loading vessels')).toBeInTheDocument();
  });
});

// ─── Fleet group maps ───────────────────────────────────────────────────

const shown = (id: string, name: string, code: string, fleetGroupId: string | null): ShownVessel => ({
  id,
  name,
  code,
  counted: true,
  flagState: null,
  classificationSociety: null,
  fleetGroupId,
});

const VESSELS = [
  shown('v-dra', 'DRAAK', 'DRA', 'g-charter'),
  shown('v-hyd', 'HYDRA', 'HYD', 'g-charter'),
  shown('v-roc', 'ROCINANTE', 'ROC', 'g-private'),
  shown('v-lev', 'LEVIATHAN', 'LEV', null),
];

const fix = (vesselId: string, hoursAgo: number, navStatus: string | null = 'moored') => ({
  vessel_id: vesselId,
  latitude: 43.7,
  longitude: 7.4,
  sog: 0,
  cog: null,
  heading: 90,
  nav_status: navStatus,
  timestamp_utc: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(),
});

describe('FleetGroupMaps', () => {
  beforeEach(() => {
    h.groups = {
      data: [
        { id: 'g-charter', name: 'Charter fleet' },
        { id: 'g-private', name: 'Private fleet' },
        { id: 'g-empty', name: 'Empty group' },
      ],
      error: null,
    };
    h.fixes = { 'v-dra': fix('v-dra', 0.5), 'v-roc': fix('v-roc', 9, 'at_anchor'), 'v-lev': fix('v-lev', 1, null) };
    h.fixesError = null;
  });

  it('one card per group with a vessel shown, plus Ungrouped, each opening the tracker on its group', async () => {
    wrap(<FleetGroupMaps companyId="co-1" vessels={VESSELS} />);
    const maps = await screen.findByTestId('fleet-group-maps');
    const cards = within(maps).getAllByRole('region');
    expect(cards.map((c) => within(c).getByRole('heading').textContent)).toEqual(['Charter fleet', 'Private fleet', 'Ungrouped']);
    expect(within(cards[0]).getByRole('link', { name: 'Open the full tracker for Charter fleet' })).toHaveAttribute('href', '/fleet/tracker?group=g-charter');
    expect(within(cards[2]).getByRole('link', { name: /Open the full tracker/ })).toHaveAttribute('href', '/fleet/tracker?group=ungrouped');
  });

  it('reported positions only: no fix is "No position yet", an old or status-less fix is flagged', async () => {
    wrap(<FleetGroupMaps companyId="co-1" vessels={VESSELS} />);
    await screen.findByTestId('fleet-group-maps');
    const status = (name: string) => screen.getByRole('link', { name }).closest('li')?.querySelector('[data-position-status]') as HTMLElement;
    expect(status('DRAAK')).toHaveAttribute('data-position-status', 'fresh');
    expect(status('DRAAK')).toHaveTextContent(/^Moored · /);
    expect(status('HYDRA')).toHaveAttribute('data-position-status', 'none');
    expect(status('HYDRA')).toHaveTextContent('No position yet');
    expect(status('ROCINANTE')).toHaveAttribute('data-position-status', 'stale');
    expect(status('ROCINANTE')).toHaveTextContent(/^At anchor · last fix 9 hours ago/);
    expect(status('LEVIATHAN')).toHaveTextContent(/^Status unknown/);
    // The map says how many of the group's vessels it can place.
    expect(screen.getByRole('img', { name: 'Map of Charter fleet: 1 of 2 vessels with a reported position' })).toBeInTheDocument();
  });

  it('with no fleet group at all the one card is "Vessels"', async () => {
    h.groups = { data: [], error: null };
    wrap(<FleetGroupMaps companyId="co-1" vessels={VESSELS} />);
    const maps = await screen.findByTestId('fleet-group-maps');
    expect(within(maps).getAllByRole('heading').map((x) => x.textContent)).toEqual(['Vessels']);
  });

  it('a failed read of the groups is an error with Retry', async () => {
    h.groups = { data: null, error: { code: 'XX000', message: 'boom' } };
    wrap(<FleetGroupMaps companyId="co-1" vessels={VESSELS} />);
    expect(await screen.findByText('The fleet groups could not load')).toBeInTheDocument();
    h.groups = { data: [{ id: 'g-charter', name: 'Charter fleet' }], error: null };
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(screen.getByTestId('fleet-group-maps')).toBeInTheDocument());
  });

  it('a failed read of the positions is an error with Retry, never "No position yet"', async () => {
    h.fixesError = { code: 'XX000', message: 'boom' };
    wrap(<FleetGroupMaps companyId="co-1" vessels={VESSELS} />);
    expect(await screen.findByText('The vessel positions could not load')).toBeInTheDocument();
    expect(screen.queryByText('No position yet')).toBeNull();
  });

  it('the positions table not in the database yet reads as "No position yet" (D-01)', async () => {
    h.fixesError = { code: '42P01', message: 'relation "public.ais_snapshots" does not exist' };
    wrap(<FleetGroupMaps companyId="co-1" vessels={VESSELS} />);
    await screen.findByTestId('fleet-group-maps');
    expect(screen.getAllByText('No position yet').length).toBeGreaterThan(0);
  });
});

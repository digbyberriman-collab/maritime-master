/**
 * Fleet tracker (/fleet/tracker) shows only reported AIS positions
 * (gap/02 T1/T2, non-negotiable 9: no mock rows). It used to place every
 * vessel at a position, speed and crew count hashed from its id.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// jsdom has no SVG geometry; Leaflet checks for it when it loads.
vi.hoisted(() => {
  const proto = (globalThis as unknown as { SVGSVGElement?: { prototype: Record<string, unknown> } }).SVGSVGElement?.prototype;
  if (proto && !proto.createSVGRect) proto.createSVGRect = () => ({});
});

interface Fix {
  vessel_id: string;
  latitude: number | null;
  longitude: number | null;
  sog: number | null;
  cog: number | null;
  heading: number | null;
  nav_status: string | null;
  timestamp_utc: string;
}

const state = vi.hoisted(() => ({
  vessels: [] as Array<{ id: string; name: string; mmsi: string | null; status: string }>,
  fixes: {} as Record<string, unknown[]>,
  aisError: null as null | { code: string; message: string },
  aisCalls: [] as string[],
  codes: {} as Record<string, string>,
}));

vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'dark' }) }));
vi.mock('@/integrations/supabase/client', () => {
  const vessels = {
    select: () => vessels,
    eq: () => vessels,
    neq: () => vessels,
    order: () => Promise.resolve({ data: state.vessels, error: null }),
  };
  const ais = () => {
    let vesselId = '';
    const chain = {
      select: () => chain,
      eq: (_col: string, value: string) => {
        vesselId = value;
        state.aisCalls.push(value);
        return chain;
      },
      in: () => chain,
      not: () => chain,
      order: () => chain,
      limit: () =>
        Promise.resolve(
          state.aisError ? { data: null, error: state.aisError } : { data: state.fixes[vesselId] ?? [], error: null },
        ),
    };
    return chain;
  };
  return { supabase: { from: (table: string) => (table === 'ais_snapshots' ? ais() : vessels) } };
});
vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => ({ profile: { company_id: 'co-1' } }) }));
vi.mock('@/modules/vessels/hooks/useVesselFilter', () => ({ useVesselFilter: () => ({ vesselFilter: null }) }));
vi.mock('@/modules/vessels/contexts/VesselContext', () => ({
  // The selected vessel is Draak; links must still go to the vessel clicked.
  useVessel: () => ({
    selectedVesselId: 'v-draak',
    getVesselCodeById: (id: string | null | undefined) => (id ? state.codes[id] ?? null : null),
  }),
}));
vi.mock('@/shared/components/layout/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import FleetMap from '@/modules/dashboard/pages/FleetMap';
import { latestFixByVessel, navStateFromAis } from '@/modules/dashboard/hooks/useLatestVesselPositions';

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
const fix = (vessel_id: string, overrides: Partial<Fix> = {}): Fix => ({
  vessel_id,
  latitude: 43.7,
  longitude: 7.42,
  sog: 0.1,
  cog: 120,
  heading: 118,
  nav_status: '5',
  timestamp_utc: minutesAgo(20),
  ...overrides,
});

beforeEach(() => {
  state.vessels = [
    { id: 'v-draak', name: 'Draak', mmsi: '244000001', status: 'Active' },
    { id: 'v-hydra', name: 'Hydra', mmsi: '244000002', status: 'Active' },
    { id: 'v-orca', name: 'Orca', mmsi: null, status: 'Active' },
  ];
  state.fixes = { 'v-hydra': [fix('v-hydra')] };
  state.aisError = null;
  state.aisCalls = [];
  state.codes = { 'v-draak': 'DRA', 'v-hydra': 'HYD' };
});

const LocationProbe = () => <p data-testid="location">{useLocation().pathname}</p>;

const renderTracker = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/fleet/tracker']}>
        <Routes>
          <Route path="/fleet/tracker" element={<FleetMap />} />
          <Route path="/v/:vesselCode" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

const card = (id: string) => screen.getByTestId(`fleet-vessel-${id}`);

describe('Fleet tracker', () => {
  it('draws a marker only for a vessel with a reported fix and lists the others as "No position yet"', async () => {
    const { container } = renderTracker();
    await waitFor(() => expect(within(card('v-draak')).getByText('No position yet')).toBeInTheDocument());
    expect(within(card('v-orca')).getByText('No position yet')).toBeInTheDocument();

    expect(container.querySelectorAll('.storm-map-vessel')).toHaveLength(1);
    expect(container.querySelector('[title="Hydra"]')).not.toBeNull();
    expect(container.querySelector('[title="Draak"]')).toBeNull();
    expect(container.querySelector('[title="Orca"]')).toBeNull();

    const hydra = within(card('v-hydra'));
    expect(hydra.getByText(/^Updated .+ ago$/)).toBeInTheDocument();
    expect(hydra.getByText('Moored')).toBeInTheDocument();
    // The vessels without a fix show no speed, heading or status.
    expect(within(card('v-draak')).queryByText(/Speed|Heading|Moored|Under way/)).toBeNull();
  });

  it('shows no crew or captain fields and no "real-time" claim', async () => {
    renderTracker();
    await waitFor(() => expect(within(card('v-hydra')).getByText(/^Updated/)).toBeInTheDocument());
    fireEvent.click(card('v-hydra'));
    expect(screen.queryByText(/Crew/)).toBeNull();
    expect(screen.queryByText(/Captain/)).toBeNull();
    expect(screen.queryByText(/Real-time/i)).toBeNull();
    expect(screen.getByText('Last reported AIS positions')).toBeInTheDocument();
  });

  it('a missing ais_snapshots relation degrades to the empty state, not an error', async () => {
    state.aisError = { code: '42P01', message: 'relation "public.ais_snapshots" does not exist' };
    const { container } = renderTracker();
    expect(await screen.findByText('No positions reported yet')).toBeInTheDocument();
    for (const id of ['v-draak', 'v-hydra', 'v-orca']) {
      expect(within(card(id)).getByText('No position yet')).toBeInTheDocument();
    }
    expect(container.querySelectorAll('.storm-map-vessel')).toHaveLength(0);
    expect(screen.queryByText('Vessel positions could not load')).toBeNull();
  });

  it('any other positions error shows the error state', async () => {
    state.aisError = { code: '57014', message: 'canceling statement due to statement timeout' };
    renderTracker();
    expect(await screen.findByText('Vessel positions could not load')).toBeInTheDocument();
    expect(screen.queryByText('No positions reported yet')).toBeNull();
    // A failed read is not "no position".
    expect(within(card('v-hydra')).getByText('Position could not load')).toBeInTheDocument();
    expect(screen.queryByText('No position yet')).toBeNull();
  });

  it('the vessel button opens the clicked vessel, not the selected one', async () => {
    renderTracker();
    await waitFor(() => expect(within(card('v-hydra')).getByText(/^Updated/)).toBeInTheDocument());
    fireEvent.click(card('v-hydra'));
    const panel = within(screen.getByTestId('fleet-vessel-panel'));
    await act(async () => {
      fireEvent.click(panel.getByRole('button', { name: 'View Vessel Dashboard' }));
    });
    expect(screen.getByTestId('location')).toHaveTextContent('/v/hyd');
  });

  it('hides the vessel button when the vessel has no code the user can reach', async () => {
    renderTracker();
    await waitFor(() => expect(within(card('v-orca')).getByText('No position yet')).toBeInTheDocument());
    fireEvent.click(card('v-orca'));
    const panel = within(screen.getByTestId('fleet-vessel-panel'));
    expect(panel.getByText('Orca')).toBeInTheDocument();
    expect(panel.getByText('No position yet')).toBeInTheDocument();
    expect(panel.queryByRole('button', { name: 'View Vessel Dashboard' })).toBeNull();
  });

  it('asks ais_snapshots for each listed vessel', async () => {
    renderTracker();
    await waitFor(() => expect(state.aisCalls.sort()).toEqual(['v-draak', 'v-hydra', 'v-orca']));
  });
});

describe('latestFixByVessel', () => {
  it('keeps the newest positioned fix per vessel and drops rows without a position', () => {
    const out = latestFixByVessel([
      fix('a', { timestamp_utc: '2026-05-01T10:00:00Z', latitude: 1 }),
      fix('a', { timestamp_utc: '2026-05-01T12:00:00Z', latitude: 2 }),
      fix('a', { timestamp_utc: '2026-05-01T13:00:00Z', latitude: null }),
      fix('b', { latitude: 10, longitude: null }),
      fix('c', { latitude: 91, longitude: 181 }),
    ]);
    expect([...out.keys()]).toEqual(['a']);
    expect(out.get('a')).toMatchObject({ latitude: 2, timestampUtc: '2026-05-01T12:00:00Z' });
  });

  it('turns AIS "not available" readings into null instead of showing them', () => {
    const out = latestFixByVessel([fix('a', { heading: 511, cog: 360, sog: 102.3 })]);
    expect(out.get('a')).toMatchObject({ heading: null, cog: null, sog: null });
  });
});

describe('navStateFromAis', () => {
  it('maps AIS codes and text to marker states, anything else to unknown', () => {
    expect(navStateFromAis('0')).toBe('under_way');
    expect(navStateFromAis('8')).toBe('under_way');
    expect(navStateFromAis('1')).toBe('at_anchor');
    expect(navStateFromAis('5')).toBe('moored');
    expect(navStateFromAis('Under way using engine')).toBe('under_way');
    expect(navStateFromAis('At anchor')).toBe('at_anchor');
    expect(navStateFromAis('Moored')).toBe('moored');
    expect(navStateFromAis('15')).toBeNull();
    expect(navStateFromAis('Restricted manoeuvrability')).toBeNull();
    expect(navStateFromAis(null)).toBeNull();
  });
});

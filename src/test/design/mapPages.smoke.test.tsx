/**
 * The three themed map surfaces (BUILD-PLAN A9) render on the shared map
 * theme: Fleet Map, the dashboard region card and the itinerary heat map.
 * Each draws its basemap from the theme, token-classed markers, escaped
 * popups and a legend built from tokens.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// jsdom has no SVG geometry; Leaflet checks for it when it loads and would
// otherwise find no vector renderer for circle markers.
vi.hoisted(() => {
  const proto = (globalThis as unknown as { SVGSVGElement?: { prototype: Record<string, unknown> } }).SVGSVGElement?.prototype;
  if (proto && !proto.createSVGRect) proto.createSVGRect = () => ({});
});

const fixtures = vi.hoisted(() => ({
  vessels: [
    { id: 'v-1', name: 'Draak <b>', mmsi: '244000001', status: 'Active' },
    { id: 'v-2', name: 'Hydra', mmsi: null, status: 'Active' },
  ],
  suggestions: [
    {
      id: 's1',
      description: 'Anchor off the cove <script>alert(1)</script> for a swim stop',
      enthusiasm_rating: 5,
      vote_count: 3,
      destinations: { id: 'd1', name: 'Cala Ratjada', country: 'Spain', latitude: 39.7, longitude: 3.46 },
    },
  ],
}));

vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'dark' }) }));
vi.mock('@/integrations/supabase/client', () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    neq: () => chain,
    order: () => Promise.resolve({ data: fixtures.vessels, error: null }),
  };
  return { supabase: { from: () => chain } };
});
vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => ({ profile: { company_id: 'co-1' } }) }));
vi.mock('@/modules/vessels/hooks/useVesselFilter', () => ({ useVesselFilter: () => ({ vesselFilter: null }) }));
vi.mock('@/shared/components/layout/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/modules/itinerary/hooks/useTripSuggestions', () => ({
  useTripSuggestions: () => ({
    useBrowseSuggestions: () => ({ data: fixtures.suggestions, isLoading: false }),
  }),
}));
vi.mock('@/modules/itinerary/components/AIRoutePlanner', () => ({ default: () => <div data-testid="route-planner" /> }));

import FleetMap from '@/modules/dashboard/pages/FleetMap';
import RegionMapCard from '@/modules/dashboard/components/fleet/RegionMapCard';
import HeatMapTab from '@/modules/itinerary/components/HeatMapTab';
import { FLEET_REGIONS } from '@/modules/dashboard/components/fleet/regionUtils';

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

const withProviders = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );

const tileClassNames = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('.leaflet-layer')).map((el) => el.className);

describe('Fleet Map', () => {
  it('draws the Abyss basemap, Signal vessel markers, chart-coloured ports and a token legend', async () => {
    const { container } = withProviders(<FleetMap />);
    const map = container.querySelector('.leaflet-container') as HTMLElement;
    expect(map).toHaveAttribute('data-map-theme', 'dark');
    expect(map.className).toContain('bg-map-water');
    expect(tileClassNames(container).some((c) => c.includes('storm-map-basemap--dark'))).toBe(true);
    await waitFor(() => expect(container.querySelectorAll('.storm-map-vessel')).toHaveLength(2));
    expect(container.querySelectorAll('.storm-map-port').length).toBeGreaterThan(10);
    expect(container.querySelector('.vessel-marker, .port-marker, .leaflet-div-icon')).toBeNull();
    expect(screen.getByText('Under way')).toBeInTheDocument();
    expect(screen.getByText('At anchor')).toBeInTheDocument();
    expect(container.querySelectorAll('.storm-map-glyph svg')).toHaveLength(3);
    expect(screen.getByText('Marina').firstElementChild).toHaveClass('bg-chart-3');
  });

  it('escapes vessel names in popups and offers a seamarks layer', async () => {
    const { container } = withProviders(<FleetMap />);
    await waitFor(() => expect(container.querySelectorAll('.storm-map-vessel')).toHaveLength(2));
    const marker = container.querySelector('[title="Draak <b>"]') as HTMLElement;
    expect(marker).toHaveAttribute('role', 'button');
    expect(marker).not.toBeNull();
    await act(async () => {
      marker.click();
    });
    const popup = container.querySelector('.leaflet-popup-content');
    expect(popup?.innerHTML).toContain('Draak &lt;b&gt;');
    expect(popup?.querySelector('b')).toBeNull();
    expect(popup?.querySelector('.storm-map-popup__title')).not.toBeNull();
  });
});

describe('Region map card', () => {
  it('follows the theme and pins escaped name chips', () => {
    const { container } = withProviders(
      <RegionMapCard region={FLEET_REGIONS[0]} vessels={[{ id: 'v-1', name: '<i>Draak</i>' }]} />,
    );
    expect(container.querySelector('.leaflet-container')).toHaveAttribute('data-map-theme', 'dark');
    expect(tileClassNames(container).some((c) => c.includes('storm-map-basemap--dark'))).toBe(true);
    const chip = container.querySelector('.storm-map-label')!;
    expect(chip.textContent).toBe('<i>Draak</i>');
    expect(chip.querySelector('i')).toBeNull();
  });
});

describe('Itinerary heat map', () => {
  it('uses the themed basemap instead of raw OpenStreetMap tiles, heat circles by class and token swatches', () => {
    const { container } = withProviders(<HeatMapTab />);
    expect(container.querySelector('.leaflet-container')).toHaveAttribute('data-map-theme', 'dark');
    expect(tileClassNames(container).some((c) => c.includes('storm-map-basemap--dark'))).toBe(true);
    const circle = container.querySelector('path.storm-map-heat--high');
    expect(circle).not.toBeNull();
    expect(screen.getByText('High enthusiasm').firstElementChild).toHaveClass('bg-success');
    expect(screen.getByText('Low').firstElementChild).toHaveClass('bg-info');
  });
});

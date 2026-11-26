/**
 * The dashboard's mini maps render on the shared map theme (BUILD-PLAN A9;
 * gap/02 D2; DECISIONS D-38). Formerly the region-card smoke test (moved
 * from src/test/design/mapPages.smoke.test.tsx by platform-prep PP2);
 * rewritten by X5-02B for `FleetGroupMaps`, which replaced the region cards
 * (guessed regions, hashed coordinates) with one map per fleet group:
 *
 * - the basemap follows the theme (`data-map-theme`, the themed basemap
 *   class), in dark and in light;
 * - vessel names pinned on the map are escaped text, never HTML;
 * - only reported fixes get a marker (themed vessel marks, hollow when
 *   stale), and a group with none still draws its themed map.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ShownVessel } from '@/modules/fleet';

// jsdom has no SVG geometry; Leaflet checks for it when it loads and would
// otherwise find no vector renderer.
vi.hoisted(() => {
  const proto = (globalThis as unknown as { SVGSVGElement?: { prototype: Record<string, unknown> } }).SVGSVGElement?.prototype;
  if (proto && !proto.createSVGRect) proto.createSVGRect = () => ({});
});

const h = vi.hoisted(() => ({ theme: 'dark' as 'dark' | 'light', fixes: {} as Record<string, unknown> }));

vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: h.theme }) }));
vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    let vesselId = '';
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'not', 'order', 'limit']) b[m] = () => b;
    b.eq = (col: string, value: string) => {
      if (col === 'vessel_id') vesselId = value;
      return b;
    };
    b.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(
        table === 'fleet_groups'
          ? { data: [{ id: 'g-1', name: 'Charter fleet' }], error: null }
          : { data: h.fixes[vesselId] ? [h.fixes[vesselId]] : [], error: null },
      ).then(resolve);
    return b;
  };
  return { supabase: { from: (table: string) => builder(table) } };
});

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

beforeEach(() => {
  h.theme = 'dark';
  h.fixes = {
    'v-1': { vessel_id: 'v-1', latitude: 43.7, longitude: 7.4, sog: 0, cog: null, heading: 90, nav_status: 'moored', timestamp_utc: new Date().toISOString() },
    'v-2': { vessel_id: 'v-2', latitude: 36.1, longitude: -5.3, sog: 11, cog: 250, heading: 250, nav_status: 'under_way', timestamp_utc: new Date(Date.now() - 8 * 3_600_000).toISOString() },
  };
});

const vessel = (id: string, name: string, fleetGroupId: string | null): ShownVessel => ({
  id,
  name,
  code: name.slice(0, 3).toUpperCase(),
  counted: true,
  flagState: null,
  classificationSociety: null,
  fleetGroupId,
});

const withProviders = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );

const tileClassNames = (container: HTMLElement) => Array.from(container.querySelectorAll('.leaflet-layer')).map((el) => el.className);

describe('Fleet group mini maps', () => {
  it('follow the theme and pin escaped name chips, markers only for reported fixes', async () => {
    const { container } = withProviders(
      <FleetGroupMaps companyId="co-1" vessels={[vessel('v-1', '<i>Draak</i>', 'g-1'), vessel('v-2', 'Hydra', 'g-1'), vessel('v-3', 'Dagon', 'g-1')]} />,
    );
    await screen.findByTestId('fleet-group-maps');
    const map = container.querySelector('.leaflet-container');
    expect(map).toHaveAttribute('data-map-theme', 'dark');
    expect(tileClassNames(container).some((c) => c.includes('storm-map-basemap--dark'))).toBe(true);
    const chips = Array.from(container.querySelectorAll('.storm-map-label'));
    expect(chips.map((c) => c.textContent)).toEqual(['<i>Draak</i>', 'Hydra']);
    expect(chips[0].querySelector('i')).toBeNull();
    // Two fixes, two vessel marks; the 8 h old one is hollow. Dagon has no fix and no mark.
    expect(container.querySelectorAll('.storm-map-vessel')).toHaveLength(2);
    expect(container.querySelectorAll('.storm-map-vessel--stale')).toHaveLength(1);
  });

  it('draws the light basemap in Daylight', async () => {
    h.theme = 'light';
    const { container } = withProviders(<FleetGroupMaps companyId="co-1" vessels={[vessel('v-1', 'Draak', 'g-1')]} />);
    await screen.findByTestId('fleet-group-maps');
    expect(container.querySelector('.leaflet-container')).toHaveAttribute('data-map-theme', 'light');
    expect(tileClassNames(container).some((c) => c.includes('storm-map-basemap--light'))).toBe(true);
  });

  it('a group with no fix still draws its themed map and says so', async () => {
    h.fixes = {};
    const { container } = withProviders(<FleetGroupMaps companyId="co-1" vessels={[vessel('v-3', 'Dagon', 'g-1')]} />);
    await screen.findByTestId('fleet-group-maps');
    expect(container.querySelector('.leaflet-container')).toHaveAttribute('data-map-theme', 'dark');
    expect(container.querySelectorAll('.storm-map-vessel')).toHaveLength(0);
    expect(screen.getAllByText('No position yet').length).toBeGreaterThanOrEqual(1);
  });
});

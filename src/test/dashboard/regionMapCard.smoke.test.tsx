/**
 * The dashboard region card renders on the shared map theme (BUILD-PLAN A9):
 * basemap from the theme and escaped name chips. Moved unchanged from
 * src/test/design/mapPages.smoke.test.tsx by platform-prep PP2; the card is
 * the dashboard module's (X5, PR-15).
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// jsdom has no SVG geometry; Leaflet checks for it when it loads and would
// otherwise find no vector renderer for circle markers.
vi.hoisted(() => {
  const proto = (globalThis as unknown as { SVGSVGElement?: { prototype: Record<string, unknown> } }).SVGSVGElement?.prototype;
  if (proto && !proto.createSVGRect) proto.createSVGRect = () => ({});
});

vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'dark' }) }));

import RegionMapCard from '@/modules/dashboard/components/fleet/RegionMapCard';
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

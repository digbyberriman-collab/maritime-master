/**
 * Crew list (/v/:vesselCode/crew/list; Phase 1 S7): its own h1 becomes the
 * page's PageHeader, the counts are KpiTiles, status is the registry pill,
 * and below 768 px the register is a list of cards instead of a nine-column
 * table (usable at 390 px without page scroll).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const state = vi.hoisted(() => ({ width: 390, isLoading: false }));

const person = (id: string, first: string, last: string, extra: Record<string, unknown> = {}) => ({
  id,
  user_id: null,
  email: `${id}@example.invalid`,
  first_name: first,
  last_name: last,
  rank: 'Bosun',
  nationality: null,
  phone: null,
  status: 'Active',
  role: 'crew',
  created_at: '2026-01-01',
  personnel_type: 'crew',
  current_assignment: { vessel_id: 'v-1', vessel_name: 'DRAAK' },
  ...extra,
});

vi.mock('@/shared/components/layout/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/modules/crew/hooks/useCrew', () => ({
  useCrew: () => ({
    isLoading: state.isLoading,
    crew: state.isLoading
      ? []
      : [
          person('p-1', 'Deck', 'Officer', { status: 'On Leave', passport_expiry: '2000-01-01' }),
          person('p-2', 'Engine', 'Rating'),
        ],
  }),
}));
vi.mock('@/modules/vessels/contexts/VesselContext', () => ({
  useVessel: () => ({ vessels: [{ id: 'v-1', name: 'DRAAK' }], selectedVesselId: 'v-1' }),
}));
vi.mock('@/modules/crew/components/OfficialCrewListDialog', () => ({ default: () => null }));
vi.mock('@/modules/crew/components/PersonnelRecordDialog', () => ({ default: () => null }));

import CrewList from '@/modules/crew/pages/CrewList';

let original: typeof window.matchMedia;
beforeEach(() => {
  state.width = 390;
  state.isLoading = false;
  original = window.matchMedia;
  window.matchMedia = ((query: string) => {
    const m = /min-width:\s*(\d+)px/.exec(query);
    return {
      matches: m ? state.width >= Number(m[1]) : false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    } as MediaQueryList;
  }) as typeof window.matchMedia;
});
afterEach(() => {
  window.matchMedia = original;
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <CrewList />
    </MemoryRouter>,
  );

describe('crew list', () => {
  it('renders one PageHeader as its heading', () => {
    const { container } = renderPage();
    const headers = container.querySelectorAll('[data-page-heading]');
    expect(headers).toHaveLength(1);
    expect(within(headers[0] as HTMLElement).getByRole('heading', { level: 1 })).toHaveTextContent('Crew list');
    expect(container.querySelectorAll('h1')).toHaveLength(1);
  });

  it('shows the counts as KPI tiles, loading while the roster loads', () => {
    state.isLoading = true;
    const { container } = renderPage();
    const tiles = within(screen.getByRole('region', { name: 'Personnel counts' })).getAllByText(/personnel|crew|contractors|shoreside/i);
    expect(tiles.length).toBeGreaterThanOrEqual(4);
    expect(container.querySelectorAll('[data-state="loading"]')).toHaveLength(4);
  });

  it('lists people as cards below 768 px, with registry status pills and a labelled edit button', () => {
    renderPage();
    expect(screen.queryByRole('table')).toBeNull();
    const list = screen.getByRole('list', { name: 'Personnel' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText('On leave').closest('[data-tone]')).toHaveAttribute('data-tone', 'info');
    expect(within(list).getByRole('button', { name: 'Edit personnel record: Deck Officer' })).toBeInTheDocument();
    // An expired passport reads without colour: icon plus text.
    expect(within(list).getAllByText(/expires within six months/)).toHaveLength(1);
  });

  it('keeps the full table from 768 px', () => {
    state.width = 1024;
    renderPage();
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(3);
  });
});

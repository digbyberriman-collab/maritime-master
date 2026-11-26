/**
 * Crew list layout.
 *
 * - The vessel crew list (X1-02, /v/:vesselCode/crew/list): one PageHeader
 *   (the only h1) whose actions are at most three controls (Crew list
 *   report, Add crew, More), with Import CSV, Sync Airtable and Positions in
 *   the More menu: the roster header was 102 px too wide at 390 px. The
 *   register table scrolls inside its own card, the name column stays in
 *   view, and the page root never grows past the viewport (min-w-0).
 * - The legacy personnel list (CrewList, still served at /crew/list for
 *   people outside the vessel scope, Phase 1 S7): its own h1 becomes the
 *   page's PageHeader, the counts are KpiTiles, status is the registry pill,
 *   and below 768 px the register is a list of cards.
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
vi.mock('@/modules/crew/hooks/useCrew', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/crew/hooks/useCrew')>()),
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
import CrewListPage from '@/modules/crew/pages/CrewListPage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const rpcRows = vi.hoisted(() => [
  {
    profile_id: 'p-1', user_id: 'u-1', first_name: 'Demo', last_name: 'Bosun', preferred_name: null, avatar_url: null, email: null,
    position_id: 'pos-bosun', position_name: 'Bosun', position_text: 'Bosun', department_key: 'deck', department_label: 'Deck', rank_tier: 'officer',
    sort_order: 30201, assignment_id: 'a-1', placement_kind: 'assignment', join_date: '2026-10-01', leave_date: null, status: 'on_board',
    status_detail: null, transfer_vessel_id: null, leave_code: null, travel_today: false, login_state: 'active', account_status: 'active',
    invitation_id: null, invitation_status: null, invitation_expires_at: null, invitation_last_sent_at: null, invitation_last_error_code: null,
    nationality: null, is_master_office: false,
  },
]);
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: () => Promise.resolve({ data: rpcRows, error: null }),
    from: () => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'order', 'limit']) chain[m] = () => chain;
      chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
      return chain;
    },
    functions: { invoke: vi.fn() },
  },
}));
vi.mock('@/lib/permissions/useCan', () => ({
  useCapability: () => ({ allowed: true, status: 'granted', reason: 'test' }),
  useCan: () => true,
}));
vi.mock('@/app/router/scopeContext', () => ({
  useScope: () => ({ scope: 'vessel', vesselCode: 'DRA', vessel: { id: 'v-1', company_id: 'c-1', name: 'DRAAK' } }),
}));
vi.mock('@/app/router/scopes', () => ({ useScopedPath: () => (rel = '') => `/v/dra/${rel}` }));
vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u-admin' }, profile: { company_id: 'c-1' } }) }));
vi.mock('@/modules/auth/hooks/useAdminActions', () => ({ useAdminActions: () => ({ isConfirmed: () => false }) }));
vi.mock('@/modules/users-access/hooks/useInvitations', () => ({
  useInvitationActions: () => ({ inviteOne: vi.fn(), inviteMany: vi.fn(), invitingProfileId: null, bulkPending: false }),
}));

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

describe('vessel crew list at 390 px (X1-02)', () => {
  const renderVesselPage = () =>
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <CrewListPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

  it('one PageHeader, at most three header controls, the admin actions in the More menu', async () => {
    const { container } = renderVesselPage();
    await screen.findByText('Bosun, Demo');
    const headers = container.querySelectorAll('[data-page-heading]');
    expect(headers).toHaveLength(1);
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    const actions = within(headers[0] as HTMLElement).getAllByRole('button');
    expect(actions.map((b) => b.textContent?.trim() || b.getAttribute('aria-label'))).toEqual(['Crew list report', 'Add crew', 'More crew list actions']);
    expect(within(headers[0] as HTMLElement).queryByRole('button', { name: /Import CSV|Sync Airtable|Positions/ })).toBeNull();
  });

  it('the page root cannot grow past the viewport, the table scrolls inside its card, the name stays in view', async () => {
    const { container } = renderVesselPage();
    await screen.findByText('Bosun, Demo');
    const root = container.querySelector('[data-crew-list-source]') as HTMLElement;
    expect(root.className).toContain('min-w-0');
    const table = screen.getByRole('table', { name: 'Crew list' });
    const scroller = table.parentElement as HTMLElement;
    expect(scroller.className).toMatch(/overflow-auto/);
    const nameHeader = within(table).getAllByRole('columnheader').find((th) => /Name/.test(th.textContent ?? '')) as HTMLElement;
    expect(nameHeader.className).toMatch(/sticky/);
  });

  it('row actions are 44 px on touch and labelled with the person', async () => {
    renderVesselPage();
    await screen.findByText('Bosun, Demo');
    const more = screen.getByRole('button', { name: 'More actions for Bosun, Demo' });
    expect(more.className).toContain('[@media(pointer:coarse)]:size-11');
    expect(screen.getByRole('link', { name: 'Hours of rest: Bosun, Demo' }).className).toContain('[@media(pointer:coarse)]:size-11');
  });
});

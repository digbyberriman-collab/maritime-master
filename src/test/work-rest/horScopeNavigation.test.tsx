/**
 * Moving within the vessel scope never leaves it (D-13; gap/00 B4): the
 * Hours of Rest links keep the one shell and the month. Moved from
 * src/test/router/logbookScope.test.tsx by platform-prep PP2; the
 * hours-of-rest pages are the work-rest module's (X1).
 *
 * X1-07B: one crew member's month is the crew profile's Hours of rest tab
 * (crew/people/:profileId/hours-of-rest). The old links carry a login id
 * and ?year=&month= (the board, the crew list, the legacy
 * /crew/work-rest/:crewId redirect): they land on the profile's tab in the
 * scope, the id replaced by the profile's and the month kept.
 *
 * The real route tree (routeHarness), the real VesselScopeRoute, LegacyRoute
 * and DashboardLayout; auth, RBAC, capabilities and VesselContext are
 * in-memory fakes and the shell's heavy children are stubbed (as in
 * scopes.test.tsx). The pages are the real ones (the board, the crew
 * profile, the Hours of rest tab), with the month's data and panels stubbed.
 */
import React, { useMemo, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useRoutes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { assignVesselCodes, resolveVesselByCode } from '@/modules/vessels/lib/vesselCode';
import type { Vessel } from '@/modules/vessels/contexts/VesselContext';

const mocks = vi.hoisted(() => ({
  auth: {
    user: { id: 'a0000000-0000-4000-8000-0000000000a1' },
    profile: { id: 'b0000000-0000-4000-8000-0000000000a1', role: 'master', company_id: 'c1', user_id: 'a0000000-0000-4000-8000-0000000000a1', first_name: 'Me', last_name: 'Master' },
    loading: false,
    userRole: 'master',
    // Read by the nav filter (the vessel nav runs in the scope since S4).
    practitionerDisciplines: [] as string[],
    practitionerDisciplinesLoaded: true,
    canAccessModule: () => true,
  },
  // The capabilities the pages ask useCan for (granted keys).
  caps: new Set<string>(),
  perm: {
    isInitialized: true,
    isLoading: false,
    // Whose roles these are; the scope routes count them only for that user.
    loadedFor: 'a0000000-0000-4000-8000-0000000000a1' as string | null,
    hasFleetAccess: false,
    userRoles: [] as { role_name: string }[],
    setCurrentVessel: () => undefined,
    hasPermission: () => true,
    // Read by the shell's nav filter and RBAC Retry notice.
    permissions: [] as unknown[],
    error: null as string | null,
    loadPermissions: async () => undefined,
  },
  // Mounts of the shell (its footer renders once per shell, on every page).
  shellMounts: 0,
  vesselCtx: null as React.Context<unknown> | null,
}));

vi.mock('@/integrations/supabase/client', () => {
  type Row = Record<string, unknown>;
  const profiles: Row[] = [
    { id: 'b0000000-0000-4000-8000-0000000000a1', user_id: 'a0000000-0000-4000-8000-0000000000a1', first_name: 'Me', last_name: 'Master', preferred_name: null, avatar_url: null, position: 'Master', rank: 'Master', department: 'Deck', account_status: 'active' },
    { id: 'b0000000-0000-4000-8000-0000000000a2', user_id: 'a0000000-0000-4000-8000-0000000000a2', first_name: 'Ann', last_name: 'Deck', preferred_name: null, avatar_url: null, position: 'Bosun', rank: 'Bosun', department: 'Deck', account_status: 'active' },
  ];
  const assignment = (user: string, position: string): Row => ({
    id: `a-${user.slice(-2)}`, user_id: user, vessel_id: 'v-draak', is_current: true, department: 'Deck', position, rank: position,
    join_date: '2026-01-01', start_date: null, leave_date: null, end_date: null,
    profiles: profiles.find((p) => p.user_id === user),
  });
  const tables: Record<string, Row[]> = {
    crew_assignments: [assignment('a0000000-0000-4000-8000-0000000000a1', 'Master'), assignment('a0000000-0000-4000-8000-0000000000a2', 'Bosun')],
    profiles,
  };
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let single = false;
    const builder = {
      select: () => builder,
      order: () => builder,
      limit: () => builder,
      // The profile lookup by id or login id (D-01 fallback of crew_profile_resolve); kept as all rows.
      or: () => builder,
      gte: () => builder,
      lte: () => builder,
      in: () => builder,
      is: () => builder,
      eq: (k: string, v: unknown) => {
        filters.push((r) => r[k] === undefined || r[k] === v);
        return builder;
      },
      maybeSingle: () => {
        single = true;
        return builder;
      },
      single: () => {
        single = true;
        return builder;
      },
      then: (resolve: (v: unknown) => unknown) => {
        const rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
        return Promise.resolve({ data: single ? rows[0] ?? null : rows, error: null }).then(resolve);
      },
    };
    return builder;
  };
  // No crew or engine RPC is applied (D-01): every page takes its documented fallback.
  const rpc = async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function in the schema cache' } });
  return { supabase: { from, rpc } };
});
vi.mock('@/lib/permissions/useCan', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/permissions/useCan')>();
  return {
    ...actual,
    useCan: (key: string) => mocks.caps.has(key),
    useCapability: (key: string) => ({ allowed: mocks.caps.has(key), status: mocks.caps.has(key) ? 'granted' : 'denied', reason: 'test' }),
  };
});
// The vessel's module settings: the table is not live (D-01), so every module is on.
vi.mock('@/modules/vessels/hooks/useVesselModuleSettings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/vessels/hooks/useVesselModuleSettings')>();
  const { TABLE_MISSING_STATE } = await import('@/modules/vessels/lib/moduleSettings');
  return { ...actual, useVesselModuleSettings: () => ({ state: TABLE_MISSING_STATE, fetching: false, retry: () => undefined }) };
});
vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/modules/auth/store/permissionsStore', () => ({
  usePermissionsStore: (selector: (s: object) => unknown) => selector(mocks.perm),
}));
vi.mock('@/modules/vessels/contexts/VesselContext', async () => {
  const react = await import('react');
  if (!mocks.vesselCtx) mocks.vesselCtx = react.createContext<unknown>(null);
  const ctx = mocks.vesselCtx;
  return { useVessel: () => react.useContext(ctx) };
});

// The shell's heavy children, as in scopes.test.tsx.
vi.mock('@/shared/contexts/BrandingContext', () => ({
  useBrandingContext: () => ({ clientDisplayName: 'TEST', clientLogoUrl: null }),
}));
vi.mock('@/shared/components/layout/InkfishFooter', async () => {
  const react = await import('react');
  return {
    default: () => {
      react.useEffect(() => {
        mocks.shellMounts += 1;
      }, []);
      return null;
    },
  };
});
vi.mock('@/shared/components/InkfishWatermark', () => ({ default: () => null }));
// The top bar and its dialogs are covered by src/test/shell; here only the frame matters.
vi.mock('@/shared/components/layout/topbar/TopBar', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/ModuleTabBar', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/topbar/KeyboardShortcutsDialog', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/topbar/ShellShortcuts', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/PageLocationHeader', () => ({ default: () => null }));
vi.mock('@/modules/feedback/components/FeedbackPanel', () => ({ default: () => null }));
vi.mock('@/modules/feedback/components/FeedbackResolvedToast', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/SidebarNavigation', async () => {
  const react = await import('react');
  return {
    default: () => {
      return react.createElement('nav', { 'aria-label': 'Test sidebar' });
    },
  };
});

// Hours of rest: the month data stubbed (the views and the tab are real), the side panels stubbed.
vi.mock('@/modules/work-rest/hooks/useMonthlyWorkRest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/work-rest/hooks/useMonthlyWorkRest')>();
  const { calculateCompliance } = await import('@/modules/work-rest/lib/complianceEngine');
  const { DEFAULT_RULE_SET } = await import('@/modules/work-rest/types');
  const submission = (o: { crewId: string; vesselId: string; year: number; month: number }) => ({
    id: 'sub-1', crew_id: o.crewId, vessel_id: o.vesselId, period_year: o.year, period_month: o.month, status: 'draft',
  });
  return {
    ...actual,
    loadMonthlyWorkRest: async (o: { crewId: string; vesselId: string; year: number; month: number }) => ({
      submission: submission(o), ruleSet: DEFAULT_RULE_SET, records: [], context: [], nonConformities: [], signatures: [],
    }),
    useMonthlyWorkRest: (o: { crewId: string; vesselId: string; year: number; month: number }) => ({
      submission: submission(o), records: [], compliance: calculateCompliance([], DEFAULT_RULE_SET), ruleSet: DEFAULT_RULE_SET,
      nonConformities: [], signatures: [], loading: false, saving: false, error: null, isLocked: false, isOpen: true, isDirty: false,
      savePath: 'unknown', save: async () => undefined, refresh: async () => undefined, setDayBlocks: () => undefined,
    }),
  };
});
vi.mock('@/modules/work-rest/components/SignOffPanel', () => ({ SignOffPanel: () => null }));
vi.mock('@/modules/work-rest/components/NonConformityList', () => ({ NonConformityList: () => null }));
vi.mock('@/modules/work-rest/components/AuditLogPanel', () => ({ AuditLogPanel: () => null }));
vi.mock('@/modules/work-rest/services/workRestService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/work-rest/services/workRestService')>();
  return {
    ...actual,
    listVesselMonthMatrix: async () => [
      {
        crew_id: 'a0000000-0000-4000-8000-0000000000a2', crew_name: 'Ann Deck', rank: 'Bosun', department: 'DECK', rest_by_day: {}, compliant_by_day: {},
        avg_rest: null, logged_pct: 0, status: 'no_data',
      },
    ],
  };
});

import { appRouteObjects } from '@/test/router/routeHarness';

// ─── Fake VesselContext ───────────────────────────────────────────────────

const vessel = (id: string, name: string, created_at: string): Vessel => ({
  id, company_id: 'c1', name, imo_number: null, flag_state: null, vessel_type: null, classification_society: null,
  gross_tonnage: null, build_year: null, status: 'Active', created_at,
});
const DRAAK = vessel('v-draak', 'M/Y DRAAK', '2023-01-01T00:00:00Z');
const COMPANY = [DRAAK];

const FakeVesselProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedId, setSelectedId] = useState<string | null>(DRAAK.id);
  const codes = useMemo(() => assignVesselCodes(COMPANY), []);
  const selectedVessel = COMPANY.find((v) => v.id === selectedId) ?? null;
  const value = {
    selectedVessel,
    selectedVesselId: selectedVessel?.id ?? null,
    vessels: COMPANY,
    isAllVessels: false,
    setSelectedVessel: (v: Vessel | null) => setSelectedId(v?.id ?? null),
    setSelectedVesselById: (id: string | null) => setSelectedId(id),
    setAllVessels: () => undefined,
    loading: false,
    refreshVessels: async () => {},
    canAccessAllVessels: false,
    companyVessels: COMPANY,
    vesselCodes: codes,
    getVesselCodeById: (id: string | null | undefined) => (id ? codes.get(id) ?? null : null),
    findVesselByCode: (code: string | null | undefined) => resolveVesselByCode(code, COMPANY, COMPANY),
    loadedForUserId: 'a0000000-0000-4000-8000-0000000000a1',
  };
  const Ctx = mocks.vesselCtx;
  if (!Ctx) throw new Error('VesselContext mock not loaded');
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

// ─── App ──────────────────────────────────────────────────────────────────

const routes = appRouteObjects();
const AppTree: React.FC = () => useRoutes(routes);

const visited: string[] = [];
const LocationProbe: React.FC = () => {
  const l = useLocation();
  const here = `${l.pathname}${l.search}`;
  if (visited[visited.length - 1] !== here) visited.push(here);
  return <output aria-label="location">{here}</output>;
};

function renderApp(url: string) {
  // The app's query client sits above the routes (the vessel scope's vessel switch reads it).
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <FakeVesselProvider>
        <MemoryRouter initialEntries={[url]}>
          <AppTree />
          <LocationProbe />
        </MemoryRouter>
      </FakeVesselProvider>
    </QueryClientProvider>,
  );
}

const location = () => screen.getByLabelText('location').textContent;
// One shell root per shell; a page may have no sidebar (vessel home, pages outside a module, S3).
const shells = () => document.querySelectorAll('[data-shell-scope]').length;

beforeEach(() => {
  mocks.perm.userRoles = [];
  mocks.caps = new Set(['vessel.crew.crew_profiles.view', 'vessel.crew.hours_of_rest.view', 'vessel.crew.hours_of_rest.view_own', 'vessel.crew.hours_of_rest.create']);
  mocks.shellMounts = 0;
  visited.length = 0;
  sessionStorage.clear();
  localStorage.clear();
});

const params = () => new URLSearchParams(location().split('?')[1] ?? '');

describe("a crew member's month is the profile's Hours of rest tab", () => {
  it('an old link (login id, ?year=&month=) lands on the tab in the scope: the profile id in the URL, the month kept, one shell', async () => {
    renderApp('/v/dra/crew/people/a0000000-0000-4000-8000-0000000000a2/hours-of-rest?year=2026&month=11');
    await waitFor(() => expect(location()).toBe('/v/dra/crew/people/b0000000-0000-4000-8000-0000000000a2/hours-of-rest?year=2026&month=11'));
    expect(await screen.findByRole('link', { name: 'Hours of rest', current: 'page' })).toBeInTheDocument();
    expect(await screen.findByText('November 2026')).toBeInTheDocument();
    expect(document.querySelector('[data-hor-scope="profile"]')).not.toBeNull();
    expect(visited.filter((u) => u.startsWith('/crew/'))).toEqual([]);
    expect(mocks.shellMounts).toBe(1);
    expect(shells()).toBe(1);
  });

  it('moving to the next month stays on the tab, in the scope', async () => {
    renderApp('/v/dra/crew/people/b0000000-0000-4000-8000-0000000000a2/hours-of-rest?month=2026-11');
    const next = await screen.findByRole('button', { name: 'Next month' });
    act(() => {
      fireEvent.click(next);
    });
    await waitFor(() => expect(params().get('month')).toBe('2026-12'));
    expect(location().startsWith('/v/dra/crew/people/b0000000-0000-4000-8000-0000000000a2/hours-of-rest?')).toBe(true);
    expect(mocks.shellMounts).toBe(1);
  });

  it('without hours of rest view the tab is not offered, and the URL lands on Personal', async () => {
    mocks.caps.delete('vessel.crew.hours_of_rest.view');
    renderApp('/v/dra/crew/people/b0000000-0000-4000-8000-0000000000a2/hours-of-rest?month=2026-11');
    await waitFor(() => expect(location()).toBe('/v/dra/crew/people/b0000000-0000-4000-8000-0000000000a2/personal?month=2026-11'));
    expect(screen.queryByRole('link', { name: 'Hours of rest' })).toBeNull();
  });

  it('one’s own profile opens the tab without hours of rest view (view_own), and offers My hours of rest', async () => {
    mocks.caps.delete('vessel.crew.hours_of_rest.view');
    renderApp('/v/dra/crew/people/a0000000-0000-4000-8000-0000000000a1/hours-of-rest?month=2026-11');
    await waitFor(() => expect(location()).toBe('/v/dra/crew/people/b0000000-0000-4000-8000-0000000000a1/hours-of-rest?month=2026-11'));
    const more = await screen.findByRole('button', { name: 'More' });
    act(() => {
      more.focus();
      fireEvent.keyDown(more, { key: 'Enter' });
    });
    expect(await screen.findByRole('menuitem', { name: 'Open in My hours of rest' })).toHaveAttribute('href', '/me/hours-of-rest?month=2026-11&vessel=dra');
  });
});

describe('the Hours of Rest board and links', () => {
  it("an approver opens the vessel's board from a crew member's month, in the scope", async () => {
    mocks.caps.add('vessel.crew.hours_of_rest.approve');
    renderApp('/v/dra/crew/people/b0000000-0000-4000-8000-0000000000a2/hours-of-rest?month=2026-11');
    const more = await screen.findByRole('button', { name: 'More' });
    act(() => {
      more.focus();
      fireEvent.keyDown(more, { key: 'Enter' });
    });
    const board = await screen.findByRole('menuitem', { name: 'Vessel hours of rest' });
    expect(board).toHaveAttribute('href', '/v/dra/crew/hours-of-rest?month=2026-11');
    act(() => {
      fireEvent.click(board);
    });
    await waitFor(() => expect(location()).toBe('/v/dra/crew/hours-of-rest?month=2026-11'));
    expect(visited.filter((u) => u.startsWith('/crew/'))).toEqual([]);
    expect(mocks.shellMounts).toBe(1);
  });

  it('without the approve capability the board is not offered (nor, without export, the menu)', async () => {
    renderApp('/v/dra/crew/people/b0000000-0000-4000-8000-0000000000a2/hours-of-rest?month=2026-11');
    expect(await screen.findByText('November 2026')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Vessel hours of rest' })).toBeNull();
  });

  it("the board links one's own hours and each crew member's month, which opens on the profile tab in the scope", async () => {
    renderApp('/v/dra/crew/hours-of-rest?year=2026&month=11');
    expect(await screen.findByRole('link', { name: 'My hours' })).toHaveAttribute('href', '/me/hours-of-rest');
    const row = await screen.findByRole('link', { name: /Ann Deck/ });
    expect(row).toHaveAttribute('href', '/v/dra/crew/people/a0000000-0000-4000-8000-0000000000a2/hours-of-rest?year=2026&month=11');
    act(() => {
      fireEvent.click(row);
    });
    await waitFor(() => expect(location()).toBe('/v/dra/crew/people/b0000000-0000-4000-8000-0000000000a2/hours-of-rest?year=2026&month=11'));
    expect(await screen.findByText('November 2026')).toBeInTheDocument();
    expect(mocks.shellMounts).toBe(1);
  });
});

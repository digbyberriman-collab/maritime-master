/**
 * Moving within the vessel scope never leaves it (D-13; gap/00 B4): the
 * Hours of Rest crew switch, toolbar and board links keep the one shell and
 * the month. Moved unchanged from src/test/router/logbookScope.test.tsx by
 * platform-prep PP2; the hours-of-rest pages are the work-rest module's (X1).
 *
 * The real route tree (routeHarness), the real VesselScopeRoute, LegacyRoute
 * and DashboardLayout; auth, RBAC and VesselContext are in-memory fakes and
 * the shell's heavy children are stubbed (as in scopes.test.tsx). The
 * hours-of-rest pages are the real ones, with their data hooks and panels
 * stubbed.
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
    user: { id: 'u1' },
    profile: { id: 'p1', role: 'master', company_id: 'c1', user_id: 'u1', first_name: 'Me', last_name: 'Master' },
    loading: false,
    userRole: 'master',
    // Read by the nav filter (the vessel nav runs in the scope since S4).
    practitionerDisciplines: [] as string[],
    practitionerDisciplinesLoaded: true,
  },
  perm: {
    isInitialized: true,
    isLoading: false,
    // Whose roles these are; the scope routes count them only for that user.
    loadedFor: 'u1' as string | null,
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
  const crew: Row[] = [
    { user_id: 'u1', vessel_id: 'v-draak', is_current: true, profiles: { user_id: 'u1', first_name: 'Me', last_name: 'Master', rank: 'Master' } },
    { user_id: 'other', vessel_id: 'v-draak', is_current: true, profiles: { user_id: 'other', first_name: 'Ann', last_name: 'Deck', rank: 'Bosun' } },
  ];
  const tables: Record<string, Row[]> = {
    crew_assignments: crew,
    profiles: crew.map((r) => r.profiles as Row),
  };
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let single = false;
    const builder = {
      select: () => builder,
      order: () => builder,
      eq: (k: string, v: unknown) => {
        filters.push((r) => r[k] === undefined || r[k] === v);
        return builder;
      },
      maybeSingle: () => {
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
  return { supabase: { from } };
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

// A native select, so a test can pick from it.
vi.mock('@/components/ui/select', async () => {
  const react = await import('react');
  return {
    Select: ({ value, onValueChange, children }: { value?: string; onValueChange?: (v: string) => void; children: React.ReactNode }) =>
      react.createElement('select', { 'aria-label': 'Picker', value: value ?? '', onChange: (e: { target: { value: string } }) => onValueChange?.(e.target.value) }, children),
    SelectTrigger: () => null,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => react.createElement(react.Fragment, null, children),
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => react.createElement('option', { value }, children),
  };
});

// Hours of rest: the month data and its panels stubbed.
vi.mock('@/modules/work-rest/hooks/useMonthlyWorkRest', () => ({
  useMonthlyWorkRest: () => ({
    records: [], compliance: { is_compliant: true }, ruleSet: null, signatures: [], submission: null, isLocked: false,
    loading: false, saving: false, nonConformities: [], save: async () => undefined, refresh: () => undefined, setDayBlocks: () => undefined,
  }),
}));
vi.mock('@/modules/work-rest/components/CompliancePanel', () => ({ CompliancePanel: () => null }));
vi.mock('@/modules/work-rest/components/MonthCalendar', () => ({ MonthCalendar: () => null }));
vi.mock('@/modules/work-rest/components/NonConformityList', () => ({ NonConformityList: () => null }));
vi.mock('@/modules/work-rest/components/SignOffPanel', () => ({ SignOffPanel: () => null }));
vi.mock('@/modules/work-rest/components/AuditLogPanel', () => ({ AuditLogPanel: () => null }));
vi.mock('@/modules/auth/hooks/useUserRoles', () => ({ useActiveRoles: () => ({ roles: ['captain'], isLoading: false }) }));
vi.mock('@/modules/work-rest/services/workRestService', () => ({
  listVesselMonthMatrix: async () => [
    {
      crew_id: 'other', crew_name: 'Ann Deck', rank: 'Bosun', department: 'DECK', rest_by_day: {}, compliant_by_day: {},
      avg_rest: null, logged_pct: 0, status: 'no_data',
    },
  ],
}));

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
    loadedForUserId: 'u1',
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
  mocks.shellMounts = 0;
  visited.length = 0;
  sessionStorage.clear();
  localStorage.clear();
});

describe('the Hours of Rest crew switch inside the vessel scope', () => {
  it("opens another crew member's month in the scope, keeping the month, with the one shell", async () => {
    renderApp('/v/dra/crew/people/u1/hours-of-rest?year=2026&month=11');
    const picker = await screen.findByLabelText('Picker');
    await waitFor(() => expect(picker.querySelectorAll('option').length).toBe(2));
    act(() => {
      fireEvent.change(picker, { target: { value: 'other' } });
    });
    await waitFor(() => expect(location()).toBe('/v/dra/crew/people/other/hours-of-rest?year=2026&month=11'));
    expect(visited.filter((u) => u.startsWith('/crew/'))).toEqual([]);
    expect(mocks.shellMounts).toBe(1);
    expect(shells()).toBe(1);
  });

  it("goes to the personal area for one's own month", async () => {
    renderApp('/v/dra/crew/people/other/hours-of-rest?year=2026&month=11');
    const picker = await screen.findByLabelText('Picker');
    await waitFor(() => expect(picker.querySelectorAll('option').length).toBe(2));
    act(() => {
      fireEvent.change(picker, { target: { value: 'u1' } });
    });
    await waitFor(() => expect(location()).toBe('/me/hours-of-rest?year=2026&month=11'));
    expect(visited.filter((u) => u.startsWith('/crew/'))).toEqual([]);
  });
});

describe('the Hours of Rest toolbar and links', () => {
  it('wraps, keeps the month and Save in view, and moves the exports into More below md', async () => {
    renderApp('/v/dra/crew/people/u1/hours-of-rest?year=2026&month=11');
    const save = await screen.findByRole('button', { name: 'Save' });
    const row = save.parentElement as HTMLElement;
    expect(row.className).toContain('flex-wrap');
    expect(row).toContainElement(screen.getByRole('button', { name: 'Previous month' }));
    expect(row).toContainElement(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('button', { name: 'More' }).closest('.md\\:hidden')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'PDF' }).closest('.hidden')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'CSV' }).closest('.hidden')).not.toBeNull();
  });

  it('hides Fleet Overview from a user without fleet reach', async () => {
    renderApp('/v/dra/crew/people/u1/hours-of-rest?year=2026&month=11');
    await screen.findByRole('button', { name: 'Save' });
    expect(screen.queryByRole('button', { name: 'Fleet Overview' })).toBeNull();
  });

  it("opens the vessel's HoR board in the scope for a fleet user", async () => {
    mocks.perm.userRoles = [{ role_name: 'fleet_master' }];
    renderApp('/v/dra/crew/people/u1/hours-of-rest?year=2026&month=11');
    const overview = await screen.findByRole('button', { name: 'Fleet Overview' });
    act(() => {
      fireEvent.click(overview);
    });
    await waitFor(() => expect(location()).toBe('/v/dra/crew/hours-of-rest'));
    expect(visited.filter((u) => u.startsWith('/crew/'))).toEqual([]);
    expect(mocks.shellMounts).toBe(1);
  });

  it("the board links one's own hours and each crew member's month in the scope", async () => {
    renderApp('/v/dra/crew/hours-of-rest?year=2026&month=11');
    expect(await screen.findByRole('link', { name: 'My hours' })).toHaveAttribute('href', '/me/hours-of-rest');
    const row = await screen.findByRole('link', { name: /Ann Deck/ });
    expect(row).toHaveAttribute('href', '/v/dra/crew/people/other/hours-of-rest?year=2026&month=11');
    act(() => {
      fireEvent.click(row);
    });
    await waitFor(() => expect(location()).toBe('/v/dra/crew/people/other/hours-of-rest?year=2026&month=11'));
    expect(mocks.shellMounts).toBe(1);
  });
});

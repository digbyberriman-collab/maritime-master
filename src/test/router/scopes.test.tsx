/**
 * Scope layout routes (BUILD-PLAN B5, B6; gap/00 B2–B4; gap/01 F14, landing
 * rules; D-02, D-03, D-13).
 *
 * VesselContext, auth and the RBAC store are replaced by small in-memory
 * fakes; DashboardLayout is the real one (its heavy children are stubbed), so
 * the "one shell, no remount" checks run against the real ShellContext.
 */
import React, { useMemo, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { assignVesselCodes, resolveVesselByCode } from '@/modules/vessels/lib/vesselCode';
import type { Vessel } from '@/modules/vessels/contexts/VesselContext';

const mocks = vi.hoisted(() => ({
  auth: {
    user: { id: 'u1' } as { id: string } | null,
    profile: { id: 'p1', role: 'crew', company_id: 'c1', user_id: 'u1' } as { id: string; role: string; company_id: string; user_id: string } | null,
    loading: false,
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
    setCurrentVessel: vi.fn(),
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

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
// The vessel's module settings: the table is not live (D-01), so every module is
// on, for the scope's nav and for the vessel switch an in-page pick goes through.
vi.mock('@/modules/vessels/hooks/useVesselModuleSettings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/vessels/hooks/useVesselModuleSettings')>();
  const { TABLE_MISSING_STATE } = await import('@/modules/vessels/lib/moduleSettings');
  return {
    ...actual,
    useVesselModuleSettings: () => ({ state: TABLE_MISSING_STATE, fetching: false, retry: () => undefined }),
    vesselModuleSettingsQueryOptions: (vesselId: string) => ({
      queryKey: actual.vesselModuleSettingsKeys.vessel(vesselId),
      queryFn: async () => TABLE_MISSING_STATE,
    }),
  };
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

import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import {
  FleetScope,
  HomeRedirect,
  LegacyRoute,
  PersonalScope,
  ScopeNotFound,
  VesselScopeRoute,
  WorkspaceScope,
  useScopedPath,
  useVesselScope,
} from '@/app/router/scopes';
import { PROFILE_GRACE_MS } from '@/app/router/useScopeAccess';
import { useVesselFilter } from '@/modules/vessels/hooks/useVesselFilter';
import { parseVesselPath } from '@/modules/vessels/lib/vesselCode';
import { toNavPathname } from '@/app/router/legacyResolve';

// ─── Fake VesselContext ───────────────────────────────────────────────────

const vessel = (id: string, name: string, created_at: string, status = 'Active'): Vessel => ({
  id,
  company_id: 'c1',
  name,
  imo_number: null,
  flag_state: null,
  vessel_type: null,
  classification_society: null,
  gross_tonnage: null,
  build_year: null,
  status,
  created_at,
});

const DRAAK = vessel('v-draak', 'M/Y DRAAK', '2023-01-01T00:00:00Z');
const HYDRA = vessel('v-hydra', 'HYDRA', '2023-02-01T00:00:00Z');
const GAME = vessel('v-game', 'GAME CHANGER', '2023-03-01T00:00:00Z');
const OLD = vessel('v-old', 'LEVIATHAN', '2020-01-01T00:00:00Z', 'Sold');
const COMPANY = [DRAAK, HYDRA, GAME, OLD];

interface FakeVesselProps {
  reachable: Vessel[];
  selected?: string | null;
  allVessels?: boolean;
  canAccessAllVessels?: boolean;
  children: React.ReactNode;
}

let pickVessel: (id: string | null) => void = () => {};

const FakeVesselProvider: React.FC<FakeVesselProps> = ({ reachable, selected = null, allVessels = false, canAccessAllVessels = false, children }) => {
  const [selectedId, setSelectedId] = useState<string | null>(selected);
  const [isAll, setIsAll] = useState(allVessels);
  const codes = useMemo(() => assignVesselCodes(COMPANY), []);
  const selectedVessel = reachable.find((v) => v.id === selectedId) ?? null;
  pickVessel = (id) => {
    if (id === null) {
      setIsAll(true);
      setSelectedId(null);
    } else {
      setIsAll(false);
      setSelectedId(id);
    }
  };
  const value = {
    selectedVessel,
    selectedVesselId: selectedVessel?.id ?? null,
    vessels: reachable,
    isAllVessels: isAll,
    setSelectedVessel: (v: Vessel | null) => {
      setSelectedId(v?.id ?? null);
      setIsAll(false);
    },
    setSelectedVesselById: (id: string | null) => pickVessel(id),
    setAllVessels: () => pickVessel(null),
    loading: false,
    refreshVessels: async () => {},
    canAccessAllVessels,
    companyVessels: COMPANY,
    vesselCodes: codes,
    getVesselCodeById: (id: string | null | undefined) => (id ? codes.get(id) ?? null : null),
    findVesselByCode: (code: string | null | undefined) => resolveVesselByCode(code, reachable, COMPANY),
    // The lists are the signed-in user's own (see VesselContext).
    loadedForUserId: mocks.auth.user?.id ?? null,
  };
  const Ctx = mocks.vesselCtx;
  if (!Ctx) throw new Error('VesselContext mock not loaded');
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

// ─── Test pages ───────────────────────────────────────────────────────────

const LocationProbe: React.FC = () => {
  const location = useLocation();
  return (
    <>
      <output aria-label="location">{`${location.pathname}${location.search}${location.hash}`}</output>
      {/* 'default' until something navigates (a redirect replaces it). */}
      <output aria-label="location key">{location.key}</output>
      <output aria-label="location state">{JSON.stringify(location.state ?? null)}</output>
    </>
  );
};

/** A legacy-style page: renders DashboardLayout itself, like ~90 real pages. */
const PageA: React.FC = () => {
  const scoped = useScopedPath();
  const scope = useVesselScope();
  return (
    <DashboardLayout>
      <h1>Page A</h1>
      <p>Vessel in scope: {scope?.vessel.name ?? 'none'}</p>
      <Link to={scoped('b')}>to B</Link>
      <Link to="/fleet/dashboard">to the Fleet dashboard</Link>
      <button type="button" onClick={() => pickVessel(HYDRA.id)}>Pick HYDRA</button>
      <button type="button" onClick={() => pickVessel(null)}>Pick all vessels</button>
    </DashboardLayout>
  );
};
const PageB: React.FC = () => (
  <DashboardLayout>
    <h1>Page B</h1>
    <Link to="../a">to A</Link>
  </DashboardLayout>
);
const HrisOne: React.FC = () => (
  <DashboardLayout>
    <h1>HRIS one</h1>
    <Link to="/hris/two">to HRIS two</Link>
  </DashboardLayout>
);
const HrisTwo: React.FC = () => (
  <DashboardLayout>
    <h1>HRIS two</h1>
  </DashboardLayout>
);
const WidePage: React.FC = () => (
  <DashboardLayout collapseSidebar>
    <h1>Wide page</h1>
  </DashboardLayout>
);

/** A legacy fleet page: reads the global selection, as FleetMap and the roster do. */
const FleetPage: React.FC<{ title: string }> = ({ title }) => {
  const { isAllVessels, vesselFilter } = useVesselFilter();
  return (
    <>
      <h1>{title}</h1>
      <output aria-label="fleet selection">{`isAll=${isAllVessels} filter=${vesselFilter ?? 'none'}`}</output>
      <Link to="/v/dra/a">to DRAAK page A</Link>
      <Link to="/fleet/documents">to Fleet documents</Link>
      <button type="button" onClick={() => pickVessel(HYDRA.id)}>Pick HYDRA in the fleet view</button>
    </>
  );
};

type InitialEntry = NonNullable<React.ComponentProps<typeof MemoryRouter>['initialEntries']>[number];

function renderApp(url: InitialEntry, vessels: Omit<FakeVesselProps, 'children'>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <FakeVesselProvider {...vessels}>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/fleet" element={<FleetScope />}>
              <Route path="dashboard" element={<FleetPage title="Fleet dashboard" />} />
              <Route path="documents" element={<FleetPage title="Fleet documents" />} />
            </Route>
            <Route path="/v/:vesselCode" element={<VesselScopeRoute />}>
              <Route index element={<h1>Vessel home</h1>} />
              <Route path="a" element={<PageA />} />
              <Route path="b" element={<PageB />} />
              {/* Under a module with a sidebar (Crew), so there is a sidebar to keep off-canvas. */}
              <Route path="crew/wide" element={<WidePage />} />
              <Route path="crew/list" element={<h1>Scoped crew list</h1>} />
              <Route path="*" element={<ScopeNotFound />} />
            </Route>
            <Route element={<PersonalScope />}>
              <Route path="/me">
                <Route index element={<h1>My profile</h1>} />
                <Route path="hours-of-rest" element={<h1>My hours of rest</h1>} />
                <Route path="profile" element={<h1>Profile section</h1>} />
              </Route>
              <Route path="/inbox" element={<h1>Inbox</h1>} />
              <Route path="/help/support" element={<h1>Support</h1>} />
            </Route>
            <Route element={<WorkspaceScope workspace="hris" />}>
              <Route path="/hris/one" element={<HrisOne />} />
              <Route path="/hris/two" element={<HrisTwo />} />
              {/* An old URL the workspace redirects in: outside its tree root. */}
              <Route path="/hr/old" element={<h1>Old HR page</h1>} />
            </Route>
            <Route element={<WorkspaceScope workspace="legal" />}>
              <Route path="/departments/legal/dashboard" element={<h1>Legal dashboard</h1>} />
            </Route>
            <Route path="/crew/list" element={<LegacyRoute from="/crew/list"><h1>Legacy crew list</h1></LegacyRoute>} />
            <Route path="/documents" element={<LegacyRoute from="/documents"><h1>Legacy documents</h1></LegacyRoute>} />
            <Route path="/settings" element={<LegacyRoute from="/settings"><h1>Legacy settings</h1></LegacyRoute>} />
            <Route path="/auth" element={<h1>Sign in</h1>} />
          </Routes>
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
  localStorage.clear();
  mocks.shellMounts = 0;
  mocks.auth.user = { id: 'u1' };
  mocks.auth.profile = { id: 'p1', role: 'crew', company_id: 'c1', user_id: 'u1' };
  mocks.auth.loading = false;
  mocks.perm.isInitialized = true;
  mocks.perm.loadedFor = 'u1';
  mocks.perm.hasFleetAccess = false;
  mocks.perm.userRoles = [];
  mocks.perm.setCurrentVessel.mockClear();
});

// ─── VesselScopeRoute ─────────────────────────────────────────────────────

describe('VesselScopeRoute', () => {
  it('renders a 404 inside the shell for an unknown code', () => {
    renderApp('/v/zzz/a', { reachable: [DRAAK], selected: DRAAK.id });
    expect(screen.getByRole('heading', { name: 'Vessel not found' })).toBeInTheDocument();
    expect(screen.getByText('ZZZ')).toBeInTheDocument();
    expect(shells()).toBe(1);
    expect(screen.queryByRole('heading', { name: 'Page A' })).toBeNull();
  });

  it('renders a 404 inside the shell for a malformed percent-escape in the code', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      renderApp('/v/%zz/a', { reachable: [DRAAK], selected: DRAAK.id });
      expect(screen.getByRole('heading', { name: 'Vessel not found' })).toBeInTheDocument();
      expect(shells()).toBe(1);
      expect(screen.queryByRole('heading', { name: 'Something went wrong' })).toBeNull();
    } finally {
      warn.mockRestore();
    }
  });

  it('parses a malformed vessel URL without throwing', () => {
    expect(() => parseVesselPath('/v/%')).not.toThrow();
    expect(parseVesselPath('/v/%')).toEqual({ code: '%', rest: '' });
    expect(parseVesselPath('/v/%zz/crew')).toEqual({ code: '%ZZ', rest: 'crew' });
    expect(() => toNavPathname('/v/%E0%A4%A/crew/list')).not.toThrow();
    expect(toNavPathname('/v/%E0%A4%A/crew/list')).toBe('/v/:vesselCode/crew/list');
    // A well-formed escape is still decoded.
    expect(parseVesselPath('/v/dr%41/a')?.code).toBe('DRA');
  });

  it('renders AccessDenied for a vessel of the company outside the user\'s reach', () => {
    renderApp('/v/hyd/a', { reachable: [DRAAK], selected: DRAAK.id });
    expect(screen.getByRole('heading', { name: "You don't have access to this vessel" })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Page A' })).toBeNull();
    expect(mocks.perm.setCurrentVessel).not.toHaveBeenCalledWith(HYDRA.id);
  });

  it('renders the archived state for a sold vessel', () => {
    renderApp('/v/lev', { reachable: [DRAAK], selected: DRAAK.id });
    expect(screen.getByRole('heading', { name: 'LEVIATHAN is archived' })).toBeInTheDocument();
  });

  it('resolves the code without regard to case and selects the vessel', async () => {
    renderApp('/v/HYD/a', { reachable: [DRAAK, HYDRA], selected: DRAAK.id });
    expect(await screen.findByRole('heading', { name: 'Page A' })).toBeInTheDocument();
    expect(screen.getByText('Vessel in scope: HYDRA')).toBeInTheDocument();
    expect(mocks.perm.setCurrentVessel).toHaveBeenCalledWith(HYDRA.id);
    expect(shells()).toBe(1);
  });

  it('uses lower-case codes in the links it builds', async () => {
    renderApp('/v/DRA/a', { reachable: [DRAAK], selected: DRAAK.id });
    const link = await screen.findByRole('link', { name: 'to B' });
    expect(link).toHaveAttribute('href', '/v/dra/b');
  });

  it('does not remount the shell when moving between two pages of the scope', async () => {
    renderApp('/v/dra/a', { reachable: [DRAAK], selected: DRAAK.id });
    await screen.findByRole('heading', { name: 'Page A' });
    const aside = document.querySelector('[data-shell-scope]');
    expect(mocks.shellMounts).toBe(1);

    act(() => {
      fireEvent.click(screen.getByRole('link', { name: 'to B' }));
    });
    expect(await screen.findByRole('heading', { name: 'Page B' })).toBeInTheDocument();
    act(() => {
      fireEvent.click(screen.getByRole('link', { name: 'to A' }));
    });
    expect(await screen.findByRole('heading', { name: 'Page A' })).toBeInTheDocument();

    expect(mocks.shellMounts).toBe(1);
    expect(shells()).toBe(1);
    expect(document.querySelector('[data-shell-scope]')).toBe(aside);
  });

  it('moves to the same page on another vessel when the selection changes (IA23)', async () => {
    renderApp('/v/dra/a?tab=x', { reachable: [DRAAK, HYDRA], selected: DRAAK.id });
    await screen.findByRole('heading', { name: 'Page A' });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Pick HYDRA' }));
    });
    await waitFor(() => expect(location()).toBe('/v/hyd/a?tab=x'));
    expect(await screen.findByText('Vessel in scope: HYDRA')).toBeInTheDocument();
    expect(mocks.shellMounts).toBe(1);
  });

  it('goes to the fleet dashboard when a fleet user picks All vessels', async () => {
    renderApp('/v/dra/a', { reachable: [DRAAK, HYDRA], selected: DRAAK.id, canAccessAllVessels: true });
    await screen.findByRole('heading', { name: 'Page A' });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Pick all vessels' }));
    });
    await waitFor(() => expect(location()).toBe('/fleet/dashboard'));
  });

  it('takes a fleet user out of All vessels mode when they open a vessel link', async () => {
    renderApp('/v/hyd/a', { reachable: [DRAAK, HYDRA], allVessels: true, canAccessAllVessels: true });
    expect(await screen.findByText('Vessel in scope: HYDRA')).toBeInTheDocument();
    expect(location()).toBe('/v/hyd/a');
  });

  it('renders a page-not-found for an unknown path inside a known vessel', async () => {
    renderApp('/v/dra/nope', { reachable: [DRAAK], selected: DRAAK.id });
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('passes a nested page\'s collapseSidebar up to the one shell', async () => {
    // A desktop window: without the wide request the static column would show.
    const realMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: /min-width:\s*(768|1024)px/.test(query),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    try {
      const normal = renderApp('/v/dra/crew/list', { reachable: [DRAAK], selected: DRAAK.id });
      await screen.findByRole('heading', { name: 'Scoped crew list' });
      await waitFor(() => expect(document.querySelector('aside[aria-label="Main navigation"]')).not.toBeNull());
      normal.unmount();
      renderApp('/v/dra/crew/wide', { reachable: [DRAAK], selected: DRAAK.id });
      await screen.findByRole('heading', { name: 'Wide page' });
      // Wide mode: no static column; the sidebar is the drawer behind the menu button.
      await waitFor(() => expect(document.querySelector('aside[aria-label="Main navigation"]')).toBeNull());
      expect(shells()).toBe(1);
    } finally {
      window.matchMedia = realMatchMedia;
    }
  });

  it('clears the vessel from the permission store on leaving the scope', async () => {
    const { unmount } = renderApp('/v/dra/a', { reachable: [DRAAK], selected: DRAAK.id });
    await screen.findByRole('heading', { name: 'Page A' });
    unmount();
    expect(mocks.perm.setCurrentVessel).toHaveBeenLastCalledWith(null);
  });

  it('sends a signed-out visitor to sign in', () => {
    mocks.auth.user = null;
    mocks.auth.profile = null;
    renderApp('/v/dra/a', { reachable: [] });
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });
});

// ─── FleetScope, PersonalScope, WorkspaceScope ────────────────────────────

describe('the current-vessel link (/v/:vesselCode taken literally, B7)', () => {
  // The static nav tree links to the route pattern itself; the scope swaps in
  // the current vessel and keeps the page, query and hash.
  it('opens the same page on the selected vessel', async () => {
    renderApp('/v/:vesselCode/a?tab=x', { reachable: [DRAAK, HYDRA], selected: HYDRA.id });
    expect(await screen.findByRole('heading', { name: 'Page A' })).toBeInTheDocument();
    expect(location()).toBe('/v/hyd/a?tab=x');
    expect(screen.getByText('Vessel in scope: HYDRA')).toBeInTheDocument();
    expect(shells()).toBe(1);
  });

  it('opens the first reachable vessel when none is selected, and ignores the case of the param', async () => {
    renderApp('/v/:VESSELCODE/crew/list', { reachable: [DRAAK, HYDRA] });
    expect(await screen.findByRole('heading', { name: 'Scoped crew list' })).toBeInTheDocument();
    expect(location()).toBe('/v/dra/crew/list');
  });

  it('opens the vessel home for the bare pattern', async () => {
    renderApp('/v/:vesselCode', { reachable: [DRAAK], selected: DRAAK.id });
    expect(await screen.findByRole('heading', { name: 'Vessel home' })).toBeInTheDocument();
    expect(location()).toBe('/v/dra');
  });

  it('gives a fleet user in All vessels mode their first vessel', async () => {
    renderApp('/v/:vesselCode/a', { reachable: [DRAAK, HYDRA], allVessels: true, canAccessAllVessels: true });
    expect(await screen.findByText('Vessel in scope: M/Y DRAAK')).toBeInTheDocument();
    expect(location()).toBe('/v/dra/a');
  });

  it('says so, inside the shell, when the user has no vessel at all', async () => {
    renderApp('/v/:vesselCode/a', { reachable: [] });
    expect(await screen.findByRole('heading', { name: 'No vessel to open' })).toBeInTheDocument();
    expect(location()).toBe('/v/:vesselCode/a');
    expect(shells()).toBe(1);
    expect(mocks.perm.setCurrentVessel).not.toHaveBeenCalledWith(expect.any(String));
  });
});

describe('FleetScope', () => {
  it('denies a user without fleet reach, inside the shell', () => {
    renderApp('/fleet/dashboard', { reachable: [DRAAK], selected: DRAAK.id });
    expect(screen.getByRole('heading', { name: 'The Fleet view is not available to you' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to my start page' })).toHaveAttribute('href', '/v/dra');
    expect(screen.queryByRole('heading', { name: 'Fleet dashboard' })).toBeNull();
  });

  it('renders fleet pages for a legacy DPA / shore user', () => {
    renderApp('/fleet/dashboard', { reachable: [DRAAK], selected: DRAAK.id, canAccessAllVessels: true });
    expect(screen.getByRole('heading', { name: 'Fleet dashboard' })).toBeInTheDocument();
  });

  it('renders fleet pages for an RBAC fleet role', () => {
    mocks.perm.userRoles = [{ role_name: 'fleet_master' }];
    renderApp('/fleet/documents', { reachable: [DRAAK], selected: DRAAK.id });
    expect(screen.getByRole('heading', { name: 'Fleet documents' })).toBeInTheDocument();
  });

  it('goes back to All vessels on entering the Fleet view after a vessel visit', async () => {
    renderApp('/fleet/dashboard', { reachable: [DRAAK, HYDRA], allVessels: true, canAccessAllVessels: true });
    const selection = () => screen.getByLabelText('fleet selection').textContent;
    expect(selection()).toBe('isAll=true filter=none');

    act(() => {
      fireEvent.click(screen.getByRole('link', { name: 'to DRAAK page A' }));
    });
    expect(await screen.findByText('Vessel in scope: M/Y DRAAK')).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('link', { name: 'to the Fleet dashboard' }));
    });
    expect(await screen.findByRole('heading', { name: 'Fleet dashboard' })).toBeInTheDocument();
    await waitFor(() => expect(selection()).toBe('isAll=true filter=none'));
    // The vessel scope is gone, so its All-vessels redirect does not fire.
    expect(location()).toBe('/fleet/dashboard');

    // Opening a vessel again still takes the user to that vessel.
    act(() => {
      fireEvent.click(screen.getByRole('link', { name: 'to DRAAK page A' }));
    });
    expect(await screen.findByText('Vessel in scope: M/Y DRAAK')).toBeInTheDocument();
    expect(location()).toBe('/v/dra/a');
  });

  it('keeps a single vessel picked while in the Fleet view, across fleet pages', async () => {
    renderApp('/fleet/dashboard', { reachable: [DRAAK, HYDRA], allVessels: true, canAccessAllVessels: true });
    const selection = () => screen.getByLabelText('fleet selection').textContent;
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Pick HYDRA in the fleet view' }));
    });
    await waitFor(() => expect(selection()).toBe('isAll=false filter=v-hydra'));
    act(() => {
      fireEvent.click(screen.getByRole('link', { name: 'to Fleet documents' }));
    });
    expect(await screen.findByRole('heading', { name: 'Fleet documents' })).toBeInTheDocument();
    expect(selection()).toBe('isAll=false filter=v-hydra');
  });

  it('leaves the selection alone for a fleet user who cannot enter All vessels mode', async () => {
    mocks.perm.userRoles = [{ role_name: 'fleet_master' }];
    renderApp('/fleet/dashboard', { reachable: [DRAAK], selected: DRAAK.id });
    expect(screen.getByLabelText('fleet selection').textContent).toBe('isAll=false filter=v-draak');
  });

  it('fails closed while RBAC is still loading', () => {
    mocks.perm.isInitialized = false;
    mocks.perm.userRoles = [{ role_name: 'superadmin' }];
    renderApp('/fleet/dashboard', { reachable: [DRAAK], canAccessAllVessels: true });
    expect(screen.queryByRole('heading', { name: 'Fleet dashboard' })).toBeNull();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it("fails closed while the roles held are another user's (D-41)", () => {
    // Initialized and not loading, but the roles are the previous account's.
    mocks.perm.loadedFor = 'someone-else';
    mocks.perm.userRoles = [{ role_name: 'fleet_master' }];
    mocks.perm.hasFleetAccess = true;
    renderApp('/fleet/documents', { reachable: [DRAAK], selected: DRAAK.id });
    expect(screen.queryByRole('heading', { name: 'Fleet documents' })).toBeNull();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });
});

describe('PersonalScope and WorkspaceScope', () => {
  it('renders every /me page and the inbox inside one personal shell', () => {
    for (const [url, heading] of [
      ['/me', 'My profile'],
      ['/me/hours-of-rest', 'My hours of rest'],
      ['/inbox', 'Inbox'],
    ] as const) {
      const { unmount } = renderApp(url, { reachable: [] });
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
      expect(shells()).toBe(1);
      expect(document.querySelector('[data-shell-scope]')).toHaveAttribute('data-shell-scope', 'personal');
      unmount();
    }
  });

  it('a workspace keeps one shell across its pages', async () => {
    renderApp('/hris/one', { reachable: [DRAAK], selected: DRAAK.id });
    await screen.findByRole('heading', { name: 'HRIS one' });
    expect(mocks.shellMounts).toBe(1);
    act(() => {
      fireEvent.click(screen.getByRole('link', { name: 'to HRIS two' }));
    });
    expect(await screen.findByRole('heading', { name: 'HRIS two' })).toBeInTheDocument();
    expect(mocks.shellMounts).toBe(1);
    expect(shells()).toBe(1);
  });
});

// ─── Canonical scope prefixes (D-111) ─────────────────────────────────────

describe('canonical scope prefixes (D-111)', () => {
  const key = () => screen.getByLabelText('location key').textContent;
  const state = () => screen.getByLabelText('location state').textContent;

  it('lower-cases the vessel prefix, keeping the rest of the path', async () => {
    renderApp('/V/dra/crew/list', { reachable: [DRAAK], selected: DRAAK.id });
    expect(await screen.findByRole('heading', { name: 'Scoped crew list' })).toBeInTheDocument();
    expect(location()).toBe('/v/dra/crew/list');
    expect(shells()).toBe(1);
  });

  it('lower-cases the vessel code', async () => {
    renderApp('/v/DRA/crew/list', { reachable: [DRAAK], selected: DRAAK.id });
    expect(await screen.findByRole('heading', { name: 'Scoped crew list' })).toBeInTheDocument();
    expect(location()).toBe('/v/dra/crew/list');
  });

  it('only the prefix and the code change; the rest of the path is kept exactly', async () => {
    renderApp('/V/DRA/Nope/Thing/', { reachable: [DRAAK], selected: DRAAK.id });
    await waitFor(() => expect(location()).toBe('/v/dra/Nope/Thing/'));
  });

  it('keeps the query, the hash and the history state', async () => {
    renderApp(
      { pathname: '/FLEET/dashboard', search: '?x=1', hash: '#h', state: { from: 'bookmark' } },
      { reachable: [DRAAK], selected: DRAAK.id, canAccessAllVessels: true },
    );
    expect(await screen.findByRole('heading', { name: 'Fleet dashboard' })).toBeInTheDocument();
    expect(location()).toBe('/fleet/dashboard?x=1#h');
    expect(state()).toBe('{"from":"bookmark"}');
  });

  it('canonicalises before the gate: a user without fleet reach is denied on the canonical URL', async () => {
    renderApp('/Fleet/dashboard', { reachable: [DRAAK], selected: DRAAK.id });
    expect(await screen.findByRole('heading', { name: 'The Fleet view is not available to you' })).toBeInTheDocument();
    expect(location()).toBe('/fleet/dashboard');
  });

  it('lower-cases the personal roots: /me, /inbox and /help', async () => {
    for (const [url, canonical, heading] of [
      ['/ME/profile', '/me/profile', 'Profile section'],
      ['/Me', '/me', 'My profile'],
      ['/INBOX', '/inbox', 'Inbox'],
      ['/Help/support', '/help/support', 'Support'],
    ] as const) {
      const { unmount } = renderApp(url, { reachable: [] });
      expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
      expect(location()).toBe(canonical);
      unmount();
    }
  });

  it("lower-cases a workspace's tree root, the two-segment Legal root included", async () => {
    const hris = renderApp('/HRIS/one', { reachable: [DRAAK], selected: DRAAK.id });
    expect(await screen.findByRole('heading', { name: 'HRIS one' })).toBeInTheDocument();
    expect(location()).toBe('/hris/one');
    hris.unmount();
    renderApp('/Departments/LEGAL/dashboard', { reachable: [DRAAK], selected: DRAAK.id });
    expect(await screen.findByRole('heading', { name: 'Legal dashboard' })).toBeInTheDocument();
    expect(location()).toBe('/departments/legal/dashboard');
  });

  it("leaves a workspace's routes outside its tree root alone", () => {
    renderApp('/HR/old', { reachable: [DRAAK], selected: DRAAK.id });
    expect(screen.getByRole('heading', { name: 'Old HR page' })).toBeInTheDocument();
    expect(location()).toBe('/HR/old');
    expect(key()).toBe('default');
  });

  it('keeps a literal :vesselCode segment as written (only the prefix is lower-cased)', async () => {
    renderApp('/V/:VesselCode/a', { reachable: [] });
    expect(await screen.findByRole('heading', { name: 'No vessel to open' })).toBeInTheDocument();
    expect(location()).toBe('/v/:VesselCode/a');
  });

  it('does not rewrite the literal current-vessel link (the scope opens it on the current vessel)', async () => {
    renderApp('/v/:vesselCode/crew/list', { reachable: [] });
    expect(await screen.findByRole('heading', { name: 'No vessel to open' })).toBeInTheDocument();
    expect(location()).toBe('/v/:vesselCode/crew/list');
    expect(key()).toBe('default');
  });

  it('renders canonical paths with no redirect', () => {
    const cases: [string, string, Omit<FakeVesselProps, 'children'>][] = [
      ['/v/dra/crew/list', 'Scoped crew list', { reachable: [DRAAK], selected: DRAAK.id }],
      ['/fleet/dashboard', 'Fleet dashboard', { reachable: [DRAAK], selected: DRAAK.id, canAccessAllVessels: true }],
      ['/me/profile', 'Profile section', { reachable: [] }],
      ['/inbox', 'Inbox', { reachable: [] }],
      ['/hris/one', 'HRIS one', { reachable: [DRAAK], selected: DRAAK.id }],
      ['/departments/legal/dashboard', 'Legal dashboard', { reachable: [DRAAK], selected: DRAAK.id }],
    ];
    for (const [url, heading, vessels] of cases) {
      const { unmount } = renderApp(url, vessels);
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
      expect(location()).toBe(url);
      expect(key()).toBe('default');
      unmount();
    }
  });
});

// ─── Landing and legacy URLs ──────────────────────────────────────────────

describe('landing after sign-in', () => {
  it('sends fleet users to /fleet/dashboard', async () => {
    renderApp('/', { reachable: [DRAAK], canAccessAllVessels: true, allVessels: true });
    await waitFor(() => expect(location()).toBe('/fleet/dashboard'));
  });

  it('sends vessel-only users to their vessel', async () => {
    renderApp('/', { reachable: [DRAAK, HYDRA], selected: HYDRA.id });
    await waitFor(() => expect(location()).toBe('/v/hyd'));
    expect(await screen.findByRole('heading', { name: 'Vessel home' })).toBeInTheDocument();
  });

  it('sends a user with no vessel to /me', async () => {
    renderApp('/', { reachable: [] });
    await waitFor(() => expect(location()).toBe('/me'));
  });

  it('waits for the profile before choosing, then gives up on an unreadable one', () => {
    vi.useFakeTimers();
    try {
      mocks.auth.profile = null;
      renderApp('/', { reachable: [] });
      expect(location()).toBe('/');
      expect(screen.getByText('Loading…')).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(PROFILE_GRACE_MS);
      });
      expect(location()).toBe('/me');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('LegacyRoute', () => {
  it('redirects an old vessel URL into the vessel scope, keeping the query', async () => {
    renderApp('/crew/list?tab=x', { reachable: [DRAAK], selected: DRAAK.id });
    await waitFor(() => expect(location()).toBe('/v/dra/crew/list?tab=x'));
    expect(await screen.findByRole('heading', { name: 'Scoped crew list' })).toBeInTheDocument();
  });

  it("does not carry a workspace's ?module= into a scope, which picks its sidebar from the path", async () => {
    renderApp('/crew/list?module=hris&tab=x', { reachable: [DRAAK], selected: DRAAK.id });
    await waitFor(() => expect(location()).toBe('/v/dra/crew/list?tab=x'));
    expect(await screen.findByRole('heading', { name: 'Scoped crew list' })).toBeInTheDocument();
  });

  it('keeps ?module= on an old page that renders in place', () => {
    renderApp('/crew/list?module=hris', { reachable: [DRAAK], allVessels: true, canAccessAllVessels: true });
    expect(screen.getByRole('heading', { name: 'Legacy crew list' })).toBeInTheDocument();
    expect(location()).toBe('/crew/list?module=hris');
  });

  it('keeps the old page for a fleet user looking at All vessels', () => {
    renderApp('/crew/list', { reachable: [DRAAK], allVessels: true, canAccessAllVessels: true });
    expect(screen.getByRole('heading', { name: 'Legacy crew list' })).toBeInTheDocument();
    expect(location()).toBe('/crew/list');
  });

  it('keeps an old fleet page for a user without fleet reach', () => {
    renderApp('/documents', { reachable: [DRAAK], selected: DRAAK.id });
    expect(screen.getByRole('heading', { name: 'Legacy documents' })).toBeInTheDocument();
  });

  it('redirects an old fleet page for a fleet user', async () => {
    renderApp('/documents', { reachable: [DRAAK], canAccessAllVessels: true });
    await waitFor(() => expect(location()).toBe('/fleet/documents'));
  });

  it('redirects personal pages for everyone', async () => {
    renderApp('/settings', { reachable: [] });
    await waitFor(() => expect(location()).toBe('/me'));
  });

  it('leaves a signed-out visitor on the old page so its guard can send them to sign in', () => {
    mocks.auth.user = null;
    mocks.auth.profile = null;
    renderApp('/crew/list', { reachable: [] });
    expect(screen.getByRole('heading', { name: 'Legacy crew list' })).toBeInTheDocument();
  });
});

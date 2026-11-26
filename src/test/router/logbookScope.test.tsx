/**
 * Moving within a scope never leaves it (D-13; gap/00 B4): the Logbooks tab
 * and a book switch, and a planned workspace leaf opened from a workspace
 * page, keep the one shell and the query. (The Hours of Rest crew switch and
 * board links moved to src/test/work-rest/horScopeNavigation.test.tsx,
 * platform-prep PP2.)
 *
 * The real route tree (routeHarness), the real VesselScopeRoute,
 * WorkspaceScope, LegacyRoute and DashboardLayout; auth, RBAC and
 * VesselContext are in-memory fakes and the shell's heavy children are
 * stubbed (as in scopes.test.tsx). The logbook pages are the real ones,
 * with their data hooks and editing surfaces stubbed; the workspace page is
 * a stand-in for the Refit dashboard.
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

// Logbook workspace: data hooks and editing surfaces stubbed; BookStrip
// becomes one button per book.
vi.mock('@/modules/logbooks/hooks/useLogbookActor', () => ({
  useLogbookActor: () => ({
    userId: 'u1', companyId: 'c1', vesselId: 'v-draak', name: 'Me', roles: [], capacity: null, isMaster: false, readOnly: true,
    loading: false, canWrite: () => false,
  }),
}));
vi.mock('@/modules/logbooks/hooks/useLogbookWorkspace', () => {
  const mutation = { mutateAsync: async () => ({}), isPending: false };
  return {
    useLogbookWorkspace: () => ({
      volume: null, volumes: [], allVolumes: [], entries: [], pages: [], legacyEntries: [], correctedElsewhere: [], isLoading: false,
      save: mutation, discard: mutation, sign: mutation, seal: mutation, open: mutation, close: mutation,
    }),
  };
});
vi.mock('@/modules/logbooks/hooks/useBookCounts', () => ({ useBookCounts: () => ({ counts: {} }) }));
vi.mock('@/modules/logbooks/hooks/useLogbookRegistry', () => ({ useLogbookRegistry: () => ({ forProfile: () => null }) }));
vi.mock('@/modules/logbooks/hooks/useLogbookSamples', () => ({ useLogbookSamples: () => ({ samples: [], isLoading: false }) }));
vi.mock('@/modules/logbooks/hooks/useLogbookPreferences', () => ({
  useLogbookPreferences: () => ({ autoReadings: false, expanded: false, setExpanded: () => undefined, setAutoReadings: () => undefined }),
}));
vi.mock('@/modules/logbooks/hooks/useWorkingCopies', () => ({
  useWorkingCopies: () => ({ store: {}, list: [], get: () => undefined, put: () => undefined, update: () => undefined, remove: () => undefined, rekey: () => undefined }),
}));
vi.mock('@/modules/logbooks/lib/logbookApi', () => ({ fetchEntry: async () => null }));
vi.mock('@/modules/logbooks/components/BookStrip', async () => {
  const react = await import('react');
  return {
    default: ({ books, onSelect }: { books: { id: string; title: string }[]; onSelect: (b: unknown) => void }) =>
      react.createElement('div', null, books.slice(0, 3).map((b) => react.createElement('button', { key: b.id, type: 'button', onClick: () => onSelect(b) }, `Book ${b.title}`))),
  };
});
vi.mock('@/modules/logbooks/components/BookMasthead', () => ({ default: () => null }));
vi.mock('@/modules/logbooks/components/BookToolbar', () => ({ default: () => null }));
vi.mock('@/modules/logbooks/components/SectionTabs', () => ({ default: () => null }));
vi.mock('@/modules/logbooks/components/RuledSheet', () => ({ default: () => null }));
vi.mock('@/modules/logbooks/components/SheetEntries', () => ({ default: () => null }));
vi.mock('@/modules/logbooks/components/PageReviewFooter', () => ({ default: () => null }));
vi.mock('@/modules/logbooks/components/VolumeOpenDialog', () => ({ default: () => null }));
vi.mock('@/modules/logbooks/components/VolumeCoverDialog', () => ({ default: () => null }));
vi.mock('@/modules/logbooks/components/CloseVolumeDialog', () => ({ default: () => null }));
vi.mock('@/modules/logbooks/components/PrintBook', () => ({ default: () => null }));
vi.mock('@/modules/logbooks/components/LogbookExportDialog', () => ({ default: () => null }));

// A Yard workspace page: a stand-in for the Refit dashboard, linking a planned Refit leaf.
vi.mock('@/modules/refit/components/layout/RefitShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/modules/refit/pages/Dashboard', async () => {
  const router = await import('react-router-dom');
  const react = await import('react');
  return {
    default: () =>
      react.createElement(react.Fragment, null,
        react.createElement('h1', null, 'Refit dashboard'),
        react.createElement(router.Link, { to: '/yard/refit/projects/refit-periods?module=yard' }, 'Refit periods')),
  };
});

import { appRouteObjects } from './routeHarness';

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

describe('the Logbooks tab inside the vessel scope', () => {
  it('opens a book in the scope, keeping the query and the one shell', async () => {
    renderApp('/v/dra/logbooks?module=vessel');
    await waitFor(() => expect(location()).toBe('/v/dra/logbooks/official-log?module=vessel'));
    expect((await screen.findAllByRole('button', { name: /^Book / })).length).toBeGreaterThan(1);
    // Never through the legacy /vessel/logbooks URL, which leaves the scope.
    expect(visited.filter((u) => u.startsWith('/vessel/'))).toEqual([]);
    expect(mocks.shellMounts).toBe(1);
    expect(shells()).toBe(1);
  });

  it('switches book in the scope with the one shell', async () => {
    renderApp('/v/dra/logbooks/official-log');
    const books = await screen.findAllByRole('button', { name: /^Book / });
    const aside = document.querySelector('[data-shell-scope]');
    act(() => {
      fireEvent.click(books[1]);
    });
    await waitFor(() => expect(location()).toMatch(/^\/v\/dra\/logbooks\/(?!official-log)[a-z0-9-]+$/));
    expect(visited.filter((u) => u.startsWith('/vessel/'))).toEqual([]);
    expect(mocks.shellMounts).toBe(1);
    expect(document.querySelector('[data-shell-scope]')).toBe(aside);
  });
});

describe('a planned workspace leaf', () => {
  it('opens from a workspace page inside the same scope, with the one shell', async () => {
    renderApp('/yard/refit/overview/dashboard');
    expect(await screen.findByRole('heading', { name: 'Refit dashboard' })).toBeInTheDocument();
    const aside = document.querySelector('[data-shell-scope]');
    expect(mocks.shellMounts).toBe(1);
    act(() => {
      fireEvent.click(screen.getByRole('link', { name: 'Refit periods' }));
    });
    expect(await screen.findByRole('heading', { name: 'Refit Periods' })).toBeInTheDocument();
    expect(location()).toBe('/yard/refit/projects/refit-periods?module=yard');
    expect(mocks.shellMounts).toBe(1);
    expect(shells()).toBe(1);
    expect(document.querySelector('[data-shell-scope]')).toBe(aside);
  });
});

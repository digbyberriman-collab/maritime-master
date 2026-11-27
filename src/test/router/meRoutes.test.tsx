/**
 * The URL-routed personal area (spec §8; gap/10 "Personal and global";
 * gap/01 "Personal area"; deferred items 2 and 4).
 *
 * The real route tree (routeHarness), the real PersonalScope, Settings page,
 * redirects and shell frame (breadcrumb, sidebar); auth, RBAC and the vessel
 * list are in-memory fakes, the settings sections and the notification pages
 * are stand-ins, and the top bar is stubbed (src/test/shell covers it).
 *
 * - `/me` → `/me/profile`; each section renders at its own URL inside one
 *   personal shell, with the personal sidebar.
 * - `?tab=` / `?section=` and `/settings/<section>` land on `/me/<section>`;
 *   the static `/settings/branding` keeps its page.
 * - A company settings section is gated by the role: a crew member is told
 *   and sent to the profile; an admin whose profile arrives late waits on a
 *   loading state and then gets the section (no false denial).
 * - `/inbox` is the inbox page in the personal scope; planned
 *   personal leaves open Coming Soon inside it.
 * - Help (`/help/*`) is in the personal scope too: `/help` opens the
 *   guides, `/help/support` is the one Support page (seeded from
 *   `?subject=`), and `/me/support` and `?tab=support` redirect to it with
 *   the query kept.
 * - HRIS › Training & Development opens `/me/training` with the personal
 *   sidebar, not HRIS's (deferred item 2).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation, useRoutes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Vessel } from '@/modules/vessels/contexts/VesselContext';

const h = vi.hoisted(() => ({
  draak: {
    id: 'v-draak', company_id: 'c1', name: 'M/Y DRAAK', imo_number: null, flag_state: null, vessel_type: null,
    classification_society: null, gross_tonnage: null, build_year: null, status: 'Active', created_at: '2023-01-01T00:00:00Z',
  } as Vessel,
  /** A stand-in page module: the shell's DashboardLayout around one h1. */
  page: async (heading: string) => {
    const react = await import('react');
    const { default: DashboardLayout } = await import('@/shared/components/layout/DashboardLayout');
    return { default: () => react.createElement(DashboardLayout, null, react.createElement('h1', null, heading)) };
  },
}));

const mocks = vi.hoisted(() => ({
  auth: {
    user: { id: 'u1' } as { id: string } | null,
    profile: { id: 'p1', role: 'crew', company_id: 'c1', user_id: 'u1', first_name: 'Test', last_name: 'Officer' } as Record<string, unknown> | null,
    loading: false,
    userRole: 'crew',
    canAccessModule: (_id: string) => true,
    practitionerDisciplines: [] as string[],
    practitionerDisciplinesLoaded: true,
  },
  perm: {
    isInitialized: true,
    isLoading: false,
    loadedFor: 'u1' as string | null,
    hasFleetAccess: false,
    userRoles: [] as { role_name: string }[],
    setCurrentVessel: () => undefined,
    hasPermission: () => true,
    permissions: [] as unknown[],
    error: null as string | null,
    loadPermissions: async () => undefined,
  },
  warnings: [] as string[],
}));

vi.mock('@/integrations/supabase/client', () => {
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'is', 'order', 'limit', 'maybeSingle', 'single', 'upsert', 'insert', 'update', 'delete']) {
    builder[m] = () => builder;
  }
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
  return { supabase: { from: () => builder, rpc: () => builder, channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: () => undefined } };
});
vi.mock('@/modules/vessels/hooks/useVesselModuleSettings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/vessels/hooks/useVesselModuleSettings')>();
  const { TABLE_MISSING_STATE } = await import('@/modules/vessels/lib/moduleSettings');
  return {
    ...actual,
    useVesselModuleSettings: () => ({ state: TABLE_MISSING_STATE, fetching: false, retry: () => undefined }),
    // The personal tree reads the same settings through useQueries (D-109): served from the cache, so no read lands after a test.
    vesselModuleSettingsQueryOptions: (vesselId: string) => ({
      ...actual.vesselModuleSettingsQueryOptions(vesselId),
      initialData: TABLE_MISSING_STATE,
      staleTime: Infinity,
    }),
  };
});
vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/modules/auth/store/permissionsStore', () => ({
  usePermissionsStore: (selector: (s: object) => unknown) => selector(mocks.perm),
}));
vi.mock('@/shared/lib/notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/notify')>();
  return {
    ...actual,
    notify: {
      ...actual.notify,
      warning: (message: string) => {
        mocks.warnings.push(message);
        return 1;
      },
    },
  };
});

vi.mock('@/modules/vessels/contexts/VesselContext', async () => {
  const { assignVesselCodes, resolveVesselByCode } = await import('@/modules/vessels/lib/vesselCode');
  const DRAAK = h.draak;
  const codes = assignVesselCodes([DRAAK]);
  const value = {
    vessels: [DRAAK], companyVessels: [DRAAK], vesselCodes: codes, loading: false, selectedVesselId: DRAAK.id,
    selectedVessel: DRAAK, isAllVessels: false, canAccessAllVessels: false, loadedForUserId: 'u1',
    setSelectedVessel: () => undefined, setSelectedVesselById: () => undefined, setAllVessels: () => undefined,
    refreshVessels: async () => undefined,
    getVesselCodeById: (id: string | null | undefined) => (id ? codes.get(id) ?? null : null),
    findVesselByCode: (code: string | null | undefined) => resolveVesselByCode(code, [DRAAK]),
  };
  return { useVessel: () => value };
});

// The shell's heavy children.
vi.mock('@/shared/contexts/BrandingContext', () => ({ useBrandingContext: () => ({ clientDisplayName: 'TEST', clientLogoUrl: null }) }));
vi.mock('@/shared/components/InkfishWatermark', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/topbar/TopBar', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/topbar/KeyboardShortcutsDialog', () => ({ default: () => null }));
vi.mock('@/shared/components/layout/topbar/ShellShortcuts', () => ({ default: () => null }));
vi.mock('@/modules/feedback/components/FeedbackPanel', () => ({ default: () => null }));
vi.mock('@/modules/feedback/components/FeedbackResolvedToast', () => ({ default: () => null }));
vi.mock('@/shared/hooks/useSidebarBadgeCounts', () => ({ useSidebarBadgeCounts: () => ({ data: undefined }) }));

// Stand-ins for the pages (each heading as the real one starts).
vi.mock('@/modules/settings/components/sections', async () => {
  const react = await import('react');
  const section = (title: string) => () => react.createElement('h2', null, title);
  return {
    ProfileSection: section('My Profile'),
    SecuritySection: section('Security'),
    NotificationsSection: section('Notification channels'),
    AppearanceSection: section('Appearance'),
    DataExportsSection: section('Data & Exports'),
    SupportSection: section('Support'),
    PlaceholderSection: ({ title }: { title: string }) => react.createElement('h2', null, title),
    IntegrationsSection: section('Integrations & API Keys'),
    VesselAccessSection: section('Vessel Access'),
    PermissionsSection: section('Permissions'),
    AuditModeSection: section('Audit Visibility'),
    DataRetentionSection: section('Data Retention & GDPR Compliance'),
    InsuranceAuditModeSection: section('Insurance Audit Mode'),
    HRAuditAccessSection: section('HR Audit Access Controls'),
    GDPRRequestsSection: section('GDPR Data Subject Requests'),
    ShortcutsSection: section('Favourites'),
    SidebarLayoutSection: section('Sidebar layout'),
  };
});
vi.mock('@/modules/notifications/pages/InboxPage', () => h.page('Inbox'));
vi.mock('@/modules/notifications/pages/NotificationsPage', () => h.page('Notification preferences'));
vi.mock('@/modules/development/pages/MyDevelopment', () => h.page('My Development'));
vi.mock('@/modules/work-rest/pages/MyWorkRestMonth', () => h.page('My hours of rest'));
vi.mock('@/modules/settings/pages/BrandingSettings', () => h.page('Branding'));

import { appRouteObjects } from './routeHarness';
import { NavAccessContext, type NavAccess } from '@/app/nav/navAccess';
import { PROFILE_GRACE_MS } from '@/app/router/useScopeAccess';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';

const routes = appRouteObjects();
const AppTree: React.FC = () => useRoutes(routes);

const LocationProbe: React.FC = () => {
  const l = useLocation();
  return <output aria-label="location">{`${l.pathname}${l.search}${l.hash}`}</output>;
};

const ACCESS: NavAccess = { ready: true, legacyRole: 'crew', rbacRoles: [], can: () => false, fleetReach: false, vesselReach: true };

function renderApp(url: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <NavAccessContext.Provider value={ACCESS}>
        <MemoryRouter initialEntries={[url]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppTree />
          <LocationProbe />
        </MemoryRouter>
      </NavAccessContext.Provider>
    </QueryClientProvider>,
  );
}

const location = () => screen.getByLabelText('location').textContent;
const sidebar = () => screen.getByTestId(SHELL_TEST_IDS.sidebar);
const h1s = () => screen.queryAllByRole('heading', { level: 1 });

const realMatchMedia = window.matchMedia;
/** A desktop window, so the static sidebar renders. */
function desktop() {
  window.matchMedia = ((query: string) => ({
    matches: /min-width:\s*(640|768|1024|1280)px/.test(query),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

const asCrew = () => {
  mocks.auth.profile = { id: 'p1', role: 'crew', company_id: 'c1', user_id: 'u1', first_name: 'Test', last_name: 'Officer' };
  mocks.auth.userRole = 'crew';
};
const asAdmin = () => {
  mocks.auth.profile = { id: 'p1', role: 'dpa', company_id: 'c1', user_id: 'u1', first_name: 'Test', last_name: 'Officer' };
  mocks.auth.userRole = 'dpa';
};

beforeEach(() => {
  localStorage.clear();
  mocks.warnings.length = 0;
  mocks.auth.user = { id: 'u1' };
  mocks.auth.loading = false;
  asCrew();
  desktop();
});
afterEach(() => {
  window.matchMedia = realMatchMedia;
  vi.useRealTimers();
});

describe('/me sections', () => {
  it('/me opens the profile, inside the personal shell with its sidebar', async () => {
    renderApp('/me');
    await waitFor(() => expect(location()).toBe('/me/profile'));
    expect(await screen.findByRole('heading', { name: 'My Profile' })).toBeInTheDocument();
    expect(document.querySelector('[data-shell-scope]')).toHaveAttribute('data-shell-scope', 'personal');
    const nav = within(sidebar());
    expect(nav.getByRole('link', { name: /^Profile, current page/ })).toHaveAttribute('aria-current', 'page');
    expect(nav.getByRole('link', { name: /^Security$/ })).toHaveAttribute('href', '/me/security');
    expect(nav.getByRole('link', { name: /^Inbox$/ })).toHaveAttribute('href', '/inbox');
    // One h1 (the page's, named as the breadcrumb ends) and no settings chrome of its own.
    await waitFor(() => expect(h1s()).toHaveLength(1));
    expect(h1s()[0]).toHaveTextContent('Profile');
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Profile');
  });

  it.each([
    ['/me/security', 'Security'],
    ['/me/appearance', 'Appearance'],
    ['/me/shortcuts', 'Favourites'],
    ['/me/sidebar-layout', 'Sidebar layout'],
    ['/me/data-exports', 'Data & Exports'],
    ['/me/notifications/channels', 'Notification channels'],
  ])('%s renders its section', async (url, heading) => {
    renderApp(url);
    expect(await screen.findByRole('heading', { name: heading, level: 2 })).toBeInTheDocument();
    expect(location()).toBe(url);
    await waitFor(() => expect(h1s()).toHaveLength(1));
  });

  it('/me/notifications stays the in-app preferences page; hours of rest and training stay', async () => {
    const { unmount } = renderApp('/me/notifications');
    expect(await screen.findByRole('heading', { name: 'Notification preferences' })).toBeInTheDocument();
    unmount();
    const second = renderApp('/me/hours-of-rest');
    expect(await screen.findByRole('heading', { name: 'My hours of rest' })).toBeInTheDocument();
    second.unmount();
    renderApp('/me/training');
    expect(await screen.findByRole('heading', { name: 'My Development' })).toBeInTheDocument();
    expect(within(sidebar()).getByRole('link', { name: /^Training, current page/ })).toHaveAttribute('aria-current', 'page');
  });

  it.each([
    ['/me?tab=security', '/me/security'],
    ['/me?section=appearance&x=1#top', '/me/appearance?x=1#top'],
    ['/me?tab=notifications', '/me/notifications/channels'],
    ['/me?tab=nothing', '/me/profile?tab=nothing'],
  ])('%s → %s', async (from, to) => {
    renderApp(from);
    await waitFor(() => expect(location()).toBe(to));
  });

  it.each([
    ['/settings/security', '/me/security'],
    ['/settings/appearance?x=1', '/me/appearance?x=1'],
    ['/settings/nothing', '/me/profile'],
    ['/settings/a/b', '/me/profile'],
  ])('%s → %s', async (from, to) => {
    renderApp(from);
    await waitFor(() => expect(location()).toBe(to));
  });

  it('/settings/branding keeps its own page', async () => {
    renderApp('/settings/branding');
    expect(await screen.findByRole('heading', { name: 'Branding' })).toBeInTheDocument();
    expect(location()).toBe('/settings/branding');
  });
});

describe('company settings sections', () => {
  it('a crew member is told and sent to the profile; the sidebar never offers the section', async () => {
    renderApp('/me/permissions');
    await waitFor(() => expect(location()).toBe('/me/profile'));
    expect(mocks.warnings).toEqual(['You do not have access to that settings section']);
    expect(screen.queryByRole('heading', { name: 'Permissions' })).toBeNull();
    expect(within(sidebar()).queryByText('Company settings')).toBeNull();
    expect(within(sidebar()).queryByRole('link', { name: /^Permissions/ })).toBeNull();
  });

  it('an admin opens it, and the sidebar lists the company settings', async () => {
    asAdmin();
    renderApp('/me/permissions');
    expect(await screen.findByRole('heading', { name: 'Permissions', level: 2 })).toBeInTheDocument();
    expect(location()).toBe('/me/permissions');
    expect(within(sidebar()).getByText('Company settings')).toBeInTheDocument();
    expect(within(sidebar()).getByRole('link', { name: /^Permissions, current page/ })).toHaveAttribute('aria-current', 'page');
    // Placeholders stay hidden without Show roadmap.
    expect(within(sidebar()).queryByRole('link', { name: /^Billing/ })).toBeNull();
    expect(mocks.warnings).toEqual([]);
  });

  it('an admin deep link waits for a late profile instead of denying', async () => {
    mocks.auth.profile = null;
    const view = renderApp('/me/permissions');
    expect(await screen.findByText('Checking your access…')).toBeInTheDocument();
    expect(location()).toBe('/me/permissions');
    expect(mocks.warnings).toEqual([]);
    asAdmin();
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <NavAccessContext.Provider value={ACCESS}>
          <MemoryRouter initialEntries={['/me/permissions']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AppTree />
            <LocationProbe />
          </MemoryRouter>
        </NavAccessContext.Provider>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Permissions', level: 2 })).toBeInTheDocument();
    expect(location()).toBe('/me/permissions');
    expect(mocks.warnings).toEqual([]);
  });

  it('waits while the profile is missing, and decides once the grace period is over', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mocks.auth.profile = null;
    renderApp('/me/permissions');
    expect(await screen.findByText('Checking your access…')).toBeInTheDocument();
    expect(location()).toBe('/me/permissions');
    act(() => {
      vi.advanceTimersByTime(PROFILE_GRACE_MS + 10);
    });
    await waitFor(() => expect(location()).toBe('/me/profile'));
    expect(mocks.warnings).toEqual(['You do not have access to that settings section']);
  });

  it('neither opens nor denies while auth itself is loading', async () => {
    mocks.auth.loading = true;
    renderApp('/me/permissions');
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(location()).toBe('/me/permissions');
    expect(screen.queryByRole('heading', { name: 'Permissions' })).toBeNull();
    expect(mocks.warnings).toEqual([]);
  });
});

describe('the inbox and planned personal leaves', () => {
  it('/inbox is the inbox page in the personal scope', async () => {
    renderApp('/inbox');
    expect(await screen.findByRole('heading', { name: 'Inbox' })).toBeInTheDocument();
    expect(document.querySelector('[data-shell-scope]')).toHaveAttribute('data-shell-scope', 'personal');
    expect(within(sidebar()).getByRole('link', { name: /^Inbox, current page/ })).toHaveAttribute('aria-current', 'page');
  });

  it.each([
    ['/me/signature', 'Signature'],
    ['/me/leave', 'Leave'],
    ['/me/billing', 'Billing'],
  ])('%s opens Coming Soon inside the scope', async (url, title) => {
    renderApp(url);
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getAllByText(/coming soon/i).length).toBeGreaterThan(0);
    expect(document.querySelector('[data-shell-scope]')).toHaveAttribute('data-shell-scope', 'personal');
    expect(location()).toBe(url);
  });

  it('moving between /me and /inbox keeps one shell', async () => {
    renderApp('/me/profile');
    await screen.findByRole('heading', { name: 'My Profile' });
    const root = document.querySelector('[data-shell-scope]');
    act(() => {
      fireEvent.click(within(sidebar()).getByRole('link', { name: /^Inbox/ }));
    });
    expect(await screen.findByRole('heading', { name: 'Inbox' })).toBeInTheDocument();
    expect(document.querySelector('[data-shell-scope]')).toBe(root);
  });
});

describe('Help in the personal scope (gap/10 Target IA principle 1)', () => {
  it('/help/support?subject=… is the one Support page, inside the personal shell, with the subject seeded', async () => {
    renderApp('/help/support?subject=Request%3A%20Vessel%20Details');
    const field = (await screen.findByLabelText('Subject')) as HTMLInputElement;
    expect(field.value).toBe('Request: Vessel Details');
    expect(location()).toBe('/help/support?subject=Request%3A%20Vessel%20Details');
    expect(document.querySelector('[data-shell-scope]')).toHaveAttribute('data-shell-scope', 'personal');
    const nav = within(sidebar());
    expect(nav.getByRole('link', { name: /^Support, current page/ })).toHaveAttribute('aria-current', 'page');
    expect(nav.getByRole('link', { name: /^Support, current page/ })).toHaveAttribute('href', '/help/support');
    expect(nav.getByRole('link', { name: /^How-to guides$/ })).toHaveAttribute('href', '/help/how-to-guides');
    expect(nav.getByText('Data & help')).toBeInTheDocument();
    // The crumbs sit under the personal root; one h1, the page's.
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(crumbs).toHaveTextContent(/My account/);
    expect(crumbs).toHaveTextContent(/Support/);
    expect(crumbs).not.toHaveTextContent(/^Help/);
    await waitFor(() => expect(h1s()).toHaveLength(1));
  });

  it('/help/how-to-guides renders in the personal shell, How-to guides current', async () => {
    renderApp('/help/how-to-guides');
    expect(await screen.findByRole('heading', { level: 1, name: 'How-to Guides' })).toBeInTheDocument();
    expect(document.querySelector('[data-shell-scope]')).toHaveAttribute('data-shell-scope', 'personal');
    expect(within(sidebar()).getByRole('link', { name: /^How-to guides, current page/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent(/My account/);
    await waitFor(() => expect(h1s()).toHaveLength(1));
  });

  it.each([
    ['/help', '/help/how-to-guides'],
    ['/help?x=1#top', '/help/how-to-guides?x=1#top'],
    ['/me/support', '/help/support'],
    // The redirect re-encodes the query (a space as `+`); the value is the same.
    ['/me/support?subject=Request%3A%20Billing', '/help/support?subject=Request%3A+Billing'],
    ['/me?tab=support&subject=hello', '/help/support?subject=hello'],
    ['/settings/support?subject=hello', '/help/support?subject=hello'],
  ])('%s → %s', async (from, to) => {
    renderApp(from);
    await waitFor(() => expect(location()).toBe(to));
    expect(document.querySelector('[data-shell-scope]')).toHaveAttribute('data-shell-scope', 'personal');
  });

  // The in-scope 404 (D-96), as in the Fleet and vessel scopes: never a jump
  // to another scope's home.
  it.each(['/help/zzz', '/help/faqs', '/help/requests/new', '/inbox/zzz'])(
    '%s is Page not found inside the personal shell, the URL as written',
    async (url) => {
      renderApp(url);
      expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
      expect(location()).toBe(url);
      expect(document.querySelector('[data-shell-scope]')).toHaveAttribute('data-shell-scope', 'personal');
      expect(within(sidebar()).getByRole('link', { name: /^Inbox/ })).toHaveAttribute('href', '/inbox');
      expect(h1s()).toHaveLength(1);
    },
  );

  it('/HELP/zzz canonicalises to /help/zzz and is Page not found there (D-111)', async () => {
    renderApp('/HELP/zzz?x=1');
    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    await waitFor(() => expect(location()).toBe('/help/zzz?x=1'));
    expect(document.querySelector('[data-shell-scope]')).toHaveAttribute('data-shell-scope', 'personal');
  });

  it('/me/support seeds the Support page with the subject it carried', async () => {
    renderApp('/me/support?subject=hello%20there');
    const field = (await screen.findByLabelText('Subject')) as HTMLInputElement;
    expect(field.value).toBe('hello there');
    expect(location()).toBe('/help/support?subject=hello+there');
  });
});

describe('deferred item 2: HRIS › Training & Development', () => {
  it('opens /me/training without ?module= and with the personal sidebar', async () => {
    mocks.auth.canAccessModule = () => true;
    renderApp('/me/training');
    expect(await screen.findByRole('heading', { name: 'My Development' })).toBeInTheDocument();
    const nav = within(sidebar());
    expect(nav.getByText('My work')).toBeInTheDocument();
    expect(nav.queryByText('Employee Records')).toBeNull();
    // A stray ?module=hris does not bring the HRIS tree back.
    const again = renderApp('/me/training?module=hris');
    expect(await within(again.container).findByRole('heading', { name: 'My Development' })).toBeInTheDocument();
    expect(within(within(again.container).getByTestId(SHELL_TEST_IDS.sidebar)).getByText('My work')).toBeInTheDocument();
  });
});

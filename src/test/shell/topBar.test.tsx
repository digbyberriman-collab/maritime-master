/**
 * The top bar (gap/10 "Top bar", IA2, IA8, IA13–IA16; spec §6): what it
 * holds per scope, the search trigger and the command palette, Apps, the
 * favourite star, the bell and the account menu, and the impersonation bar.
 */
import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const spies = vi.hoisted(() => ({ preload: vi.fn() }));

vi.mock('@/integrations/supabase/client', async () => (await import('./fakeSupabase')).fakeSupabaseModule);
vi.mock('@/modules/auth/contexts/AuthContext', async () => {
  const { shellState } = await import('./shellFakes');
  return { useAuth: () => shellState.auth };
});
vi.mock('@/modules/vessels/contexts/VesselContext', async () => {
  const { shellState } = await import('./shellFakes');
  return { useVessel: () => shellState.vessel };
});
vi.mock('@/modules/auth/store/permissionsStore', async () => {
  const { shellState } = await import('./shellFakes');
  return { usePermissionsStore: (selector: (s: object) => unknown) => selector(shellState.perm) };
});
vi.mock('@/shared/contexts/BrandingContext', async () => {
  const { shellState } = await import('./shellFakes');
  return { useBrandingContext: () => shellState.branding };
});
vi.mock('@/modules/feedback/store/feedbackStore', async () => {
  const { shellState } = await import('./shellFakes');
  return { useFeedbackStore: (selector?: (s: object) => unknown) => (selector ? selector(shellState.feedback) : shellState.feedback) };
});
vi.mock('next-themes', async () => {
  const { shellState } = await import('./shellFakes');
  return { useTheme: () => ({ theme: shellState.theme.theme, setTheme: (t: string) => shellState.theme.setTheme(t) }) };
});
vi.mock('@/shared/components/command-palette/preload', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  preloadCommandPalette: spies.preload,
}));

import TopBar from '@/shared/components/layout/topbar/TopBar';
import SearchTrigger from '@/shared/components/layout/topbar/SearchTrigger';
import AppsMenu from '@/shared/components/layout/topbar/AppsMenu';
import FavouritesControl from '@/shared/components/layout/topbar/FavouritesControl';
import AccountMenu from '@/shared/components/layout/topbar/AccountMenu';
import HelpMenu from '@/shared/components/layout/topbar/HelpMenu';
import ImpersonationBar from '@/shared/components/layout/topbar/ImpersonationBar';
import TenantLogo from '@/shared/components/layout/topbar/TenantLogo';
import NotificationBell from '@/shared/components/layout/NotificationBell';
import { CommandPaletteContext } from '@/shared/components/command-palette/context';
import { CommandPaletteProvider, type CommandPaletteApi } from '@/shared/components/command-palette';
import { ShellActionsContext } from '@/app/shell/shellActions';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import { notify } from '@/shared/lib/notify';
import type { ScopeValue } from '@/app/router/scopeContext';
import { fakeDb, resetFakeDb } from './fakeSupabase';
import { COMPANY_ID, DRAAK, FLEET_ACCESS, USER_ID, renderShell, resetShellState, shellState } from './shellFakes';

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  if (!('ResizeObserver' in window)) {
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const realMatchMedia = window.matchMedia;
const wide = () => {
  window.matchMedia = ((query: string) => ({ ...realMatchMedia(query), matches: /min-width:\s*768px/.test(query) })) as typeof window.matchMedia;
};

beforeEach(() => {
  localStorage.clear();
  resetFakeDb();
  resetShellState();
  spies.preload.mockClear();
});
afterEach(() => {
  window.matchMedia = realMatchMedia;
  vi.restoreAllMocks();
});

const openMenu = (trigger: HTMLElement) => fireEvent.keyDown(trigger, { key: 'Enter' });
const topBarProps = { mobileNavAvailable: true, mobileNavOpen: false, onOpenMobileNav: () => undefined };

describe('per scope', () => {
  const scopes: Array<[string, ScopeValue, string]> = [
    ['fleet', { scope: 'fleet' }, '/fleet/dashboard'],
    ['vessel', { scope: 'vessel', vessel: DRAAK, vesselCode: 'DRA' }, '/v/dra/crew/list'],
    ['workspace', { scope: 'workspace', workspace: 'hris' }, '/hris/people'],
    ['personal', { scope: 'personal' }, '/me/hours-of-rest'],
    ['legacy', { scope: 'legacy' }, '/ism/incidents'],
  ];

  it.each(scopes)('%s: the same controls, with the scope shown in the scope control', async (name, scope, path) => {
    renderShell(<TopBar {...topBarProps} />, { path, scope, access: FLEET_ACCESS });
    const bar = screen.getByTestId(SHELL_TEST_IDS.topBar);
    for (const id of [SHELL_TEST_IDS.searchTrigger, SHELL_TEST_IDS.notificationsTrigger, SHELL_TEST_IDS.accountTrigger, SHELL_TEST_IDS.mobileNavTrigger]) {
      expect(within(bar).getByTestId(id)).toBeInTheDocument();
    }
    const fleet = await within(bar).findByTestId(SHELL_TEST_IDS.scopeFleet);
    const vessel = within(bar).getByTestId(SHELL_TEST_IDS.scopeVessel);
    expect(fleet.getAttribute('aria-current')).toBe(name === 'fleet' ? 'true' : null);
    expect(vessel.getAttribute('aria-current')).toBe(name === 'vessel' ? 'true' : null);
    expect(within(bar).queryByTestId(SHELL_TEST_IDS.scopeWorkspaceChip) !== null).toBe(name === 'workspace');
  });

  it('is 52 px tall below 1024 px and 56 px from there, on the translucent top-bar surface', () => {
    renderShell(<TopBar {...topBarProps} />, { path: '/fleet/dashboard', scope: { scope: 'fleet' } });
    expect(screen.getByTestId(SHELL_TEST_IDS.topBar)).toHaveClass('h-[52px]', 'lg:h-14', 'bg-topbar/[0.88]', 'backdrop-blur-md', 'border-b', 'border-border');
  });

  it('turns warning-muted while impersonating', () => {
    renderShell(<TopBar {...topBarProps} impersonating />, { path: '/fleet/dashboard', scope: { scope: 'fleet' } });
    expect(screen.getByTestId(SHELL_TEST_IDS.topBar)).toHaveClass('bg-warning-muted');
    expect(screen.getByTestId(SHELL_TEST_IDS.topBar)).not.toHaveClass('bg-topbar/[0.88]');
  });
});

describe('tenant logo', () => {
  it('shows the display name and links home', async () => {
    renderShell(<TenantLogo />, { path: '/v/dra' });
    const logo = screen.getByTestId(SHELL_TEST_IDS.tenantLogo);
    expect(logo).toHaveTextContent('Demo Fleet');
    await waitFor(() => expect(logo).toHaveAttribute('href', '/fleet/dashboard'));
  });

  it('puts a logo on a light plate edged in the tenant colour (data, never a literal)', () => {
    shellState.branding = { ...shellState.branding, clientLogoUrl: 'https://example.invalid/logo.png', brandColor: 'rgb(30, 58, 138)' };
    renderShell(<TenantLogo />);
    const plate = screen.getByTestId(SHELL_TEST_IDS.tenantLogo).querySelector('img')?.parentElement as HTMLElement;
    expect(plate).toHaveClass('bg-drift-50', 'rounded-md', 'p-1');
    expect(plate.style.borderColor).toBe('rgb(30, 58, 138)');
  });

  it('falls back to the STORM wordmark', () => {
    shellState.branding = { ...shellState.branding, clientDisplayName: null };
    renderShell(<TenantLogo />);
    expect(screen.getByTestId(SHELL_TEST_IDS.tenantLogo)).toHaveTextContent('STORM');
  });
});

describe('search trigger', () => {
  it('opens the command palette, and warms it on hover and focus', () => {
    const open = vi.fn();
    const api: CommandPaletteApi = { isOpen: false, open, close: () => undefined, toggle: () => undefined, available: true };
    render(
      <CommandPaletteContext.Provider value={api}>
        <SearchTrigger />
      </CommandPaletteContext.Provider>,
    );
    const trigger = screen.getByTestId(SHELL_TEST_IDS.searchTrigger);
    expect(trigger).toHaveAccessibleName('Search STORM');
    expect(trigger).toHaveAttribute('aria-keyshortcuts', 'Control+K');
    fireEvent.pointerEnter(trigger);
    fireEvent.focus(trigger);
    expect(spies.preload).toHaveBeenCalledTimes(2);
    fireEvent.click(trigger);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('is disabled without a palette', () => {
    render(<SearchTrigger />);
    expect(screen.getByTestId(SHELL_TEST_IDS.searchTrigger)).toBeDisabled();
  });

  it('is enabled under the real palette provider', () => {
    render(
      <CommandPaletteProvider>
        <SearchTrigger />
      </CommandPaletteProvider>,
    );
    expect(screen.getByTestId(SHELL_TEST_IDS.searchTrigger)).toBeEnabled();
  });
});

describe('Apps', () => {
  const tiles = async () => {
    fireEvent.click(await screen.findByTestId(SHELL_TEST_IDS.appsTrigger));
    const menu = await screen.findByTestId(SHELL_TEST_IDS.appsMenu);
    return within(menu)
      .getAllByRole('link')
      .map((a) => [a.querySelector('.font-semibold')?.textContent, a.getAttribute('href')]);
  };

  it('lists exactly the workspaces the nav shows (planned Shoreside hidden)', async () => {
    renderShell(<AppsMenu />, { path: '/fleet/dashboard', access: FLEET_ACCESS });
    expect(await tiles()).toEqual([
      ['HRIS', '/hris'],
      ['Health & Wellness', '/health'],
      ['Yard', '/yard'],
      ['Legal', '/departments/legal'],
    ]);
  });

  it('drops a workspace the user cannot open (Yard without maintenance)', async () => {
    shellState.perm = { ...shellState.perm, hasPermission: (module: string) => module !== 'maintenance' };
    renderShell(<AppsMenu />, { path: '/fleet/dashboard', access: FLEET_ACCESS });
    expect((await tiles()).map(([label]) => label)).not.toContain('Yard');
  });

  it('is hidden while access loads', () => {
    renderShell(<AppsMenu />, { path: '/fleet/dashboard', access: { ...FLEET_ACCESS, ready: false } });
    expect(screen.queryByTestId(SHELL_TEST_IDS.appsTrigger)).toBeNull();
  });
});

describe('favourites', () => {
  const pin = (target: string, label: string) => ({ id: `pin-${label}`, user_id: USER_ID, shortcut_target: target, shortcut_label: label, shortcut_icon: 'ship', sort_order: 0 });

  it('waits while the pins load, then pins the current page under its nav title', async () => {
    fakeDb.applyWrites = true;
    fakeDb.tables.user_pinned_shortcuts = [];
    fakeDb.delayMs = 30;
    renderShell(<FavouritesControl />, { path: '/v/dra/crew/list?tab=active', scope: { scope: 'vessel', vessel: DRAAK, vesselCode: 'DRA' } });
    const star = screen.getByTestId(SHELL_TEST_IDS.favouriteToggle);
    expect(star).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(star);
    expect(fakeDb.calls.some((c) => c.op === 'insert')).toBe(false);

    await waitFor(() => expect(star).not.toHaveAttribute('aria-disabled'));
    expect(star).toHaveAttribute('aria-pressed', 'false');
    expect(star).toHaveAccessibleName('Add Crew List to favourites');
    fireEvent.click(star);
    await waitFor(() => expect(star).toHaveAttribute('aria-pressed', 'true'));
    const insert = fakeDb.calls.find((c) => c.op === 'insert');
    expect(insert?.payload).toMatchObject({ user_id: USER_ID, shortcut_target: '/v/dra/crew/list?tab=active', shortcut_label: 'Crew List', shortcut_icon: 'ship' });
    expect(star).toHaveAccessibleName('Remove Crew List from favourites');
  });

  it('never shows an unsaved pin: a failed write says so and the star stays off', async () => {
    fakeDb.tables.user_pinned_shortcuts = [];
    fakeDb.writeFailures.user_pinned_shortcuts = { message: 'permission denied' };
    const error = vi.spyOn(notify, 'error').mockImplementation(() => 1);
    renderShell(<FavouritesControl />, { path: '/fleet/documents', scope: { scope: 'fleet' } });
    const star = screen.getByTestId(SHELL_TEST_IDS.favouriteToggle);
    await waitFor(() => expect(star).not.toHaveAttribute('aria-disabled'));
    fireEvent.click(star);
    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(star).toHaveAttribute('aria-pressed', 'false');
  });

  it('a load error keeps the star waiting and the menu offers Retry', async () => {
    fakeDb.failures.user_pinned_shortcuts = { message: 'timeout' };
    renderShell(<FavouritesControl />, { path: '/fleet/documents', scope: { scope: 'fleet' } });
    const star = screen.getByTestId(SHELL_TEST_IDS.favouriteToggle);
    await waitFor(() => expect(star.getAttribute('aria-label')).toMatch(/could not load/));
    expect(star).toHaveAttribute('aria-disabled', 'true');
    openMenu(screen.getByTestId(SHELL_TEST_IDS.favouritesTrigger));
    const menu = await screen.findByTestId(SHELL_TEST_IDS.favouritesMenu);
    expect(within(menu).getByText('Favourites could not load.')).toBeInTheDocument();
    delete fakeDb.failures.user_pinned_shortcuts;
    fakeDb.tables.user_pinned_shortcuts = [pin('/fleet/documents', 'Documents')];
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Retry' }));
    await waitFor(() => expect(star).toHaveAttribute('aria-pressed', 'true'));
  });

  it('the menu lists real pins only, marks this page and links to Manage favourites', async () => {
    fakeDb.tables.user_pinned_shortcuts = [pin('/fleet/documents', 'Documents'), pin('/v/dra/crew/list', 'Crew List')];
    renderShell(<FavouritesControl />, { path: '/fleet/documents', scope: { scope: 'fleet' } });
    await waitFor(() => expect(screen.getByTestId(SHELL_TEST_IDS.favouriteToggle)).not.toHaveAttribute('aria-disabled'));
    openMenu(screen.getByTestId(SHELL_TEST_IDS.favouritesTrigger));
    const menu = await screen.findByTestId(SHELL_TEST_IDS.favouritesMenu);
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['DocumentsThis page', 'Crew List', 'Manage favourites']);
    expect(items[0]).toHaveAttribute('aria-current', 'page');
    expect(items[2]).toHaveAttribute('href', '/me/shortcuts');
  });

  it('an empty list says how to add one, with no suggested defaults', async () => {
    fakeDb.tables.user_pinned_shortcuts = [];
    renderShell(<FavouritesControl />, { path: '/fleet/documents', scope: { scope: 'fleet' } });
    await waitFor(() => expect(screen.getByTestId(SHELL_TEST_IDS.favouriteToggle)).not.toHaveAttribute('aria-disabled'));
    openMenu(screen.getByTestId(SHELL_TEST_IDS.favouritesTrigger));
    const menu = await screen.findByTestId(SHELL_TEST_IDS.favouritesMenu);
    expect(within(menu).getByText('Star a page to keep it here.')).toBeInTheDocument();
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Manage favourites']);
  });
});

describe('notification bell', () => {
  const row = (id: string, severity: string, status = 'OPEN') => ({
    id,
    title: `Alert ${id}`,
    description: null,
    severity_color: severity,
    status,
    vessel_id: DRAAK.id,
    due_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    related_entity_type: null,
    related_entity_id: null,
    source_module: null,
    company_id: COMPANY_ID,
  });

  it('sits in the top bar with a critical badge when an unread alert is RED', async () => {
    fakeDb.tables.alerts = [row('a', 'RED'), row('b', 'YELLOW')];
    renderShell(<TopBar {...topBarProps} />, { path: '/fleet/dashboard', scope: { scope: 'fleet' } });
    const trigger = within(screen.getByTestId(SHELL_TEST_IDS.topBar)).getByTestId(SHELL_TEST_IDS.notificationsTrigger);
    await waitFor(() => expect(trigger).toHaveAccessibleName('Notifications, 2 unread, including critical'));
    const badge = trigger.querySelector('[data-tone]') as HTMLElement;
    expect(badge).toHaveAttribute('data-tone', 'critical');
    expect(badge).toHaveClass('bg-critical', 'text-critical-foreground', 'motion-safe:animate-pulse');
  });

  it('uses the Signal badge, without a pulse, when nothing unread is critical', async () => {
    fakeDb.tables.alerts = [row('a', 'ORANGE'), row('b', 'RED', 'ACKNOWLEDGED')];
    renderShell(<NotificationBell />);
    const trigger = screen.getByTestId(SHELL_TEST_IDS.notificationsTrigger);
    await waitFor(() => expect(trigger.querySelector('[data-tone]')).not.toBeNull());
    const badge = trigger.querySelector('[data-tone]') as HTMLElement;
    expect(badge).toHaveAttribute('data-tone', 'primary');
    expect(badge).toHaveClass('bg-primary', 'text-primary-foreground');
    expect(badge.className).not.toMatch(/animate-pulse/);
  });

  it('opens on demand (ShellActions) and links to the inbox', async () => {
    fakeDb.tables.alerts = [];
    renderShell(<NotificationBell open onOpenChange={() => undefined} />);
    const panel = await screen.findByTestId(SHELL_TEST_IDS.notificationsPanel);
    expect(await within(panel).findByText('No open alerts')).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: 'Open inbox' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/inbox'));
  });

  it('says when alerts could not load, instead of "no alerts"', async () => {
    fakeDb.failures.alerts = { message: 'timeout' };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderShell(<NotificationBell open onOpenChange={() => undefined} />);
    const panel = await screen.findByTestId(SHELL_TEST_IDS.notificationsPanel);
    expect(await within(panel).findByText('Alerts could not load')).toBeInTheDocument();
    expect(within(panel).queryByText('No open alerts')).toBeNull();
  });
});

describe('account menu', () => {
  const open = async () => {
    openMenu(screen.getByTestId(SHELL_TEST_IDS.accountTrigger));
    return screen.findByTestId(SHELL_TEST_IDS.accountMenu);
  };
  const withActions = (ui: React.ReactElement) => (
    <ShellActionsContext.Provider value={{ openKeyboardShortcuts: () => undefined }}>{ui}</ShellActionsContext.Provider>
  );

  it('heads with the name, user kind, job role and current vessel, then the account items', async () => {
    wide();
    renderShell(withActions(<AccountMenu />), { path: '/v/dra', scope: { scope: 'vessel', vessel: DRAAK, vesselCode: 'DRA' } });
    const menu = await open();
    expect(within(menu).getByText('Test Officer')).toBeInTheDocument();
    expect(within(menu).getByText('DPA · Fleet Manager')).toBeInTheDocument();
    expect(within(menu).getByText('DRAAK')).toBeInTheDocument();
    const items = within(menu).getAllByRole('menuitem').map((i) => i.textContent);
    expect(items).toEqual(['My profile', 'Security', 'Appearance', 'Keyboard shortcuts', 'Branding', 'Report an issue', 'Sign out']);
    expect(within(menu).getByRole('menuitem', { name: 'My profile' })).toHaveAttribute('href', '/me/profile');
    expect(within(menu).getByRole('menuitem', { name: 'Security' })).toHaveAttribute('href', '/me/security');
    // Signature waits for its page (planned).
    expect(within(menu).queryByText(/Signature/)).toBeNull();
    // No vessel scope list any more (the scope control owns it).
    expect(within(menu).queryByRole('menuitemcheckbox')).toBeNull();
  });

  it('shows Branding only to account admins', async () => {
    wide();
    shellState.auth.profile = { ...shellState.auth.profile, role: 'master' };
    renderShell(<AccountMenu />, { path: '/fleet/dashboard' });
    const menu = await open();
    expect(within(menu).queryByRole('menuitem', { name: 'Branding' })).toBeNull();
    expect(within(menu).queryByRole('menuitem', { name: 'Keyboard shortcuts' })).toBeNull();
  });

  it('the Theme radio applies the theme and mirrors it to the user preferences', async () => {
    wide();
    const setTheme = vi.spyOn(shellState.theme, 'setTheme');
    renderShell(<AccountMenu />, { path: '/fleet/dashboard' });
    const menu = await open();
    const appearance = within(menu).getByRole('menuitem', { name: 'Appearance' });
    fireEvent.keyDown(appearance, { key: 'ArrowRight' });
    const light = await screen.findByRole('menuitemradio', { name: 'Light' });
    expect(screen.getByRole('menuitemradio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: 'Comfortable' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Appearance settings…' })).toHaveAttribute('href', '/me/appearance');
    await act(async () => {
      fireEvent.click(light);
    });
    expect(setTheme).toHaveBeenCalledWith('light');
    await waitFor(() => expect(fakeDb.calls.find((c) => c.table === 'user_preferences')?.payload).toMatchObject({ user_id: USER_ID, theme: 'light' }));
  });

  it('below 768 px adds a More group with Favourites, Apps and Help', async () => {
    renderShell(<AccountMenu />, { path: '/fleet/dashboard', access: FLEET_ACCESS });
    const menu = await open();
    expect(within(menu).getByText('More')).toBeInTheDocument();
    for (const name of ['Favourites', 'Apps', 'Help']) expect(within(menu).getByRole('menuitem', { name })).toBeInTheDocument();
  });

  it('on a phone, opens Favourites and Appearance in place, with Back (no side sub-menu off screen)', async () => {
    fakeDb.tables.user_pinned_shortcuts = [];
    renderShell(<AccountMenu />, { path: '/fleet/dashboard', access: FLEET_ACCESS });
    const menu = await open();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Favourites' }));
    const back = await within(menu).findByRole('menuitem', { name: 'Back' });
    await waitFor(() => expect(back).toHaveFocus());
    expect(await within(menu).findByRole('menuitem', { name: 'Manage favourites' })).toHaveAttribute('href', '/me/shortcuts');
    expect(within(menu).queryByRole('menuitem', { name: 'Sign out' })).toBeNull();
    fireEvent.click(back);
    await waitFor(() => expect(within(menu).getByRole('menuitem', { name: 'Favourites' })).toHaveFocus());
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Appearance' }));
    expect(await within(menu).findByRole('menuitemradio', { name: 'Light' })).toBeInTheDocument();
    expect(document.querySelector('[role="menu"][data-side]')).toBeTruthy();
  });

  it('signs out and goes to the sign-in page', async () => {
    wide();
    const signOut = vi.spyOn(shellState.auth, 'signOut');
    renderShell(<AccountMenu />, { path: '/fleet/dashboard' });
    const menu = await open();
    await act(async () => {
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Sign out' }));
    });
    expect(signOut).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/auth'));
  });
});

describe('help', () => {
  it('offers guides, support, report a problem and the shortcuts, with no badge', async () => {
    renderShell(
      <ShellActionsContext.Provider value={{ openKeyboardShortcuts: () => undefined }}>
        <HelpMenu />
      </ShellActionsContext.Provider>,
    );
    const trigger = screen.getByTestId(SHELL_TEST_IDS.helpTrigger);
    expect(trigger).toHaveAccessibleName('Help');
    fireEvent.click(trigger);
    const menu = await screen.findByTestId(SHELL_TEST_IDS.helpMenu);
    expect(within(menu).getByRole('link', { name: /How-to guides/ })).toHaveAttribute('href', '/help/how-to-guides');
    expect(within(menu).getByRole('link', { name: /Contact support/ })).toHaveAttribute('href', '/help/support');
    fireEvent.click(within(menu).getByRole('button', { name: /Report a problem/ }));
    await waitFor(() => expect(shellState.feedback.panelOpen).toBe(true));
  });
});

describe('impersonation bar', () => {
  it('says who is being viewed and ends the session', () => {
    const onEnd = vi.fn();
    render(<ImpersonationBar targetLabel="Chief Officer" onEnd={onEnd} />);
    const bar = screen.getByTestId(SHELL_TEST_IDS.impersonationBar);
    expect(bar).toHaveTextContent('Viewing as Chief Officer');
    expect(bar).toHaveClass('bg-warning-muted', 'text-warning');
    fireEvent.click(within(bar).getByRole('button', { name: 'End' }));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

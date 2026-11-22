/**
 * The vessel module tab row (gap/10 IA5; BUILD-PLAN S2; spec §5.4): tab
 * order, filtered by the vessel's module settings and the viewer's gates,
 * labels after overrides (Charter → "Trip" with Show roadmap on, carrying a
 * Planned marker), "← Fleet" only with fleet reach, the cog only with reach,
 * the capability and a visible Vessel Settings leaf, "More ▾" from 768 px
 * with the active state, a locked add-on that explains itself, skeletons
 * while loading, and the fail-closed error state with its Retry strip.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';

const h = vi.hoisted(() => ({ lockTab: null as string | null }));

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
vi.mock('@/shared/hooks/useSidebarBadgeCounts', () => ({
  useSidebarBadgeCounts: () => ({ data: { pendingCompliance: 3, unreadMessages: 0, overdueTasks: 0 } }),
}));
// One test turns a tab into a locked add-on (no vessel module has an entitlement yet).
vi.mock('@/app/nav/useVesselNav', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/nav/useVesselNav')>();
  return {
    ...actual,
    useVesselNav: (...args: Parameters<typeof actual.useVesselNav>) => {
      const nav = actual.useVesselNav(...args);
      if (!h.lockTab) return nav;
      return { ...nav, tabs: nav.tabs.map((t) => (t.id === h.lockTab ? { ...t, locked: true, children: [] } : t)) };
    },
  };
});

import ModuleTabBar from '@/shared/components/layout/ModuleTabBar';
import ShellNotices from '@/shared/components/layout/topbar/ShellNotices';
import { MODULE_SETTINGS_ERROR_MESSAGE } from '@/shared/components/layout/topbar/ModuleSettingsNotice';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import { SHOW_ROADMAP_KEY } from '@/app/nav/roadmap';
import type { NavAccess } from '@/app/nav/navAccess';
import type { ScopeValue } from '@/app/router/scopeContext';
import { fakeDb, resetFakeDb } from './fakeSupabase';
import { DRAAK, FLEET_ACCESS, HYDRA, VESSEL_ONLY_ACCESS, renderShell, resetShellState } from './shellFakes';

const realMatchMedia = window.matchMedia;
const realRect = Element.prototype.getBoundingClientRect;

function viewport({ md = false, reducedMotion = false } = {}) {
  window.matchMedia = ((query: string) => ({
    matches: (/min-width:\s*768px/.test(query) && md) || (/prefers-reduced-motion/.test(query) && reducedMotion),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

/** Layout for the "fits" measurement: every tab 120 px, More 120 px, `available` for the row. */
function layout(available: number) {
  Element.prototype.getBoundingClientRect = function rect(this: Element) {
    const width = this.hasAttribute('data-measure-tab') || this.hasAttribute('data-measure-more')
      ? 120
      : this.parentElement?.getAttribute('data-testid') === SHELL_TEST_IDS.moduleTabBar && this === this.parentElement.firstElementChild
        ? available
        : 0;
    return { width, height: 44, top: 0, left: 0, right: width, bottom: 44, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
}

const vesselScope = (vessel = DRAAK, code = 'DRA'): ScopeValue => ({ scope: 'vessel', vessel, vesselCode: code });

function renderTabs(path: string, { access = FLEET_ACCESS, scope = vesselScope() }: { access?: NavAccess; scope?: ScopeValue } = {}) {
  return renderShell(
    <>
      <ModuleTabBar />
      <ShellNotices />
    </>,
    { path, scope, access },
  );
}

const tabRow = () => screen.getByRole('navigation', { name: 'Vessel modules' });
const tabIds = () =>
  Array.from(tabRow().querySelectorAll<HTMLElement>(`[data-testid^="${SHELL_TEST_IDS.moduleTabPrefix}"]`)).map((el) =>
    el.getAttribute('data-testid')?.slice(SHELL_TEST_IDS.moduleTabPrefix.length),
  );

beforeEach(() => {
  localStorage.clear();
  resetFakeDb();
  resetShellState();
  h.lockTab = null;
  viewport();
});
afterEach(() => {
  window.matchMedia = realMatchMedia;
  Element.prototype.getBoundingClientRect = realRect;
});

describe('tabs', () => {
  it('lists the live modules in tab order as links, the current one marked', async () => {
    renderTabs('/v/dra/safety/drills');
    await waitFor(() => expect(tabIds()).toEqual(['home', 'crew', 'safety', 'certificates', 'technical', 'vessel', 'logbooks', 'calendar']));
    expect(tabRow()).toHaveAttribute('data-testid', SHELL_TEST_IDS.moduleTabBar);
    const safety = screen.getByTestId(`${SHELL_TEST_IDS.moduleTabPrefix}safety`);
    expect(safety.tagName).toBe('A');
    expect(safety).toHaveAttribute('aria-current', 'page');
    expect(safety).toHaveAccessibleName('Safety, 3 pending compliance items');
    expect(safety).toHaveClass('text-primary');
    expect(screen.getByTestId(`${SHELL_TEST_IDS.moduleTabPrefix}crew`)).toHaveAttribute('href', '/v/dra/crew/list');
    expect(screen.getByTestId(`${SHELL_TEST_IDS.moduleTabPrefix}home`)).toHaveAttribute('href', '/v/dra');
    expect(screen.getByTestId(`${SHELL_TEST_IDS.moduleTabPrefix}crew`)).not.toHaveAttribute('aria-current');
  });

  it('hides a module switched off for the vessel (W4)', async () => {
    fakeDb.tables.vessel_module_settings = [{ vessel_id: HYDRA.id, module_key: 'technical', enabled: false, enabled_from: null, label_override: null }];
    renderTabs('/v/hyd/crew/list', { scope: vesselScope(HYDRA, 'HYD') });
    await waitFor(() => expect(tabIds()).toContain('crew'));
    expect(tabIds()).not.toContain('technical');
  });

  it('with Show roadmap on, shows the planned tabs with a Planned marker and the vessel’s labels (Charter → Trip)', async () => {
    localStorage.setItem(SHOW_ROADMAP_KEY, 'true');
    fakeDb.tables.vessel_module_settings = [
      { vessel_id: DRAAK.id, module_key: 'charter', enabled: true, enabled_from: null, label_override: 'Trip' },
      { vessel_id: DRAAK.id, module_key: 'planner', enabled: true, enabled_from: null, label_override: 'Leave' },
    ];
    renderTabs('/v/dra');
    const trip = await screen.findByTestId(`${SHELL_TEST_IDS.moduleTabPrefix}charter`);
    expect(trip).toHaveAccessibleName('Trip, planned');
    expect(within(trip).getByText('Trip')).toBeInTheDocument();
    expect(within(trip).getByText('Planned')).toBeInTheDocument();
    expect(tabIds()).toEqual(['home', 'crew', 'safety', 'certificates', 'technical', 'charter', 'vessel', 'logbooks', 'finance', 'departments', 'calendar', 'reports']);
    // A live tab carries no marker.
    expect(within(screen.getByTestId(`${SHELL_TEST_IDS.moduleTabPrefix}crew`)).queryByText('Planned')).toBeNull();
  });

  it('shows skeletons, never an unfiltered row, while the vessel’s settings load', async () => {
    fakeDb.delayMs = 50;
    renderTabs('/v/dra');
    expect(within(tabRow()).getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(tabIds()).toEqual([]);
    await waitFor(() => expect(tabIds().length).toBeGreaterThan(0));
  });

  it('fails closed when the settings fail: tabs that need a setting are hidden, Home and Calendar stay, a Retry strip shows', async () => {
    fakeDb.failures.vessel_module_settings = { code: '57014', message: 'canceling statement due to statement timeout' };
    renderTabs('/v/dra/crew/list');
    await waitFor(() => expect(tabIds()).toEqual(['home', 'calendar']), { timeout: 4000 });
    expect(screen.getByText(MODULE_SETTINGS_ERROR_MESSAGE)).toBeInTheDocument();
    const retry = screen.getByTestId(SHELL_TEST_IDS.moduleSettingsRetry);
    fakeDb.failures.vessel_module_settings = undefined;
    act(() => {
      fireEvent.click(retry);
    });
    await waitFor(() => expect(tabIds()).toContain('crew'));
    expect(screen.queryByText(MODULE_SETTINGS_ERROR_MESSAGE)).toBeNull();
  });

  it('a missing settings table shows every module (D-01) and no strip', async () => {
    fakeDb.failures.vessel_module_settings = { code: '42P01', message: 'relation "public.vessel_module_settings" does not exist' };
    renderTabs('/v/dra');
    await waitFor(() => expect(tabIds()).toEqual(['home', 'crew', 'safety', 'certificates', 'technical', 'vessel', 'logbooks', 'calendar']));
    expect(screen.queryByText(MODULE_SETTINGS_ERROR_MESSAGE)).toBeNull();
  });

  it('a locked add-on tab explains itself and never navigates', async () => {
    h.lockTab = 'certificates';
    renderTabs('/v/dra');
    const locked = await screen.findByTestId(`${SHELL_TEST_IDS.moduleTabPrefix}certificates`);
    expect(locked.tagName).toBe('BUTTON');
    expect(locked).toHaveAccessibleName('Certificates, add-on, locked');
    act(() => {
      fireEvent.click(locked);
    });
    expect(await screen.findByText('Certificates is an add-on')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/v/dra');
  });

  it('slides a Signal underline that jumps under reduced motion', async () => {
    renderTabs('/v/dra/crew/list');
    await waitFor(() => expect(tabIds().length).toBeGreaterThan(0));
    const underline = tabRow().querySelector('.bg-primary.shadow-glow-signal');
    expect(underline).toHaveClass('motion-reduce:transition-none', 'duration-indicator');
  });
});

describe('the right-hand cluster', () => {
  it('"← Fleet" goes to the visible Fleet counterpart, only with fleet reach (D-26)', async () => {
    const { unmount } = renderTabs('/v/dra/crew/training');
    expect(await screen.findByTestId(SHELL_TEST_IDS.backToFleet)).toHaveAttribute('href', '/fleet/training');
    unmount();
    renderTabs('/v/dra/crew/training', { access: VESSEL_ONLY_ACCESS });
    await waitFor(() => expect(tabIds().length).toBeGreaterThan(0));
    expect(screen.queryByTestId(SHELL_TEST_IDS.backToFleet)).toBeNull();
  });

  it('"← Fleet" falls back to the fleet dashboard when the counterpart is hidden', async () => {
    renderTabs('/v/dra/crew/visitors');
    // Fleet › Visits is planned (hidden without the roadmap).
    expect(await screen.findByTestId(SHELL_TEST_IDS.backToFleet)).toHaveAttribute('href', '/fleet/dashboard');
  });

  it('the cog needs fleet reach, the capability and a visible Vessel Settings leaf (planned: Show roadmap)', async () => {
    const first = renderTabs('/v/dra');
    await waitFor(() => expect(tabIds().length).toBeGreaterThan(0));
    expect(screen.queryByTestId(SHELL_TEST_IDS.vesselSettingsCog)).toBeNull();
    first.unmount();

    localStorage.setItem(SHOW_ROADMAP_KEY, 'true');
    const second = renderTabs('/v/dra');
    const cog = await screen.findByTestId(SHELL_TEST_IDS.vesselSettingsCog);
    expect(cog).toHaveAttribute('href', '/fleet/admin/vessel-settings/dra');
    expect(cog).toHaveAccessibleName('Vessel settings for DRAAK');
    second.unmount();

    renderTabs('/v/dra', { access: { ...FLEET_ACCESS, can: (key) => key !== 'fleet.operations.vessels.admin' } });
    await waitFor(() => expect(tabIds().length).toBeGreaterThan(0));
    expect(screen.queryByTestId(SHELL_TEST_IDS.vesselSettingsCog)).toBeNull();
  });
});

describe('overflow', () => {
  it('from 768 px puts the tabs that do not fit into More, which shows the active tab inside it', async () => {
    viewport({ md: true });
    layout(600);
    renderTabs('/v/dra/logbooks/review');
    const more = await screen.findByTestId(SHELL_TEST_IDS.moduleTabMore);
    expect(tabIds()).toEqual(['home', 'crew', 'safety']);
    expect(more).toHaveAccessibleName('More modules, current: Logbooks');
    expect(more).toHaveAttribute('data-tab-active', 'true');
    act(() => {
      fireEvent.keyDown(more, { key: 'Enter' });
    });
    const menu = await screen.findByRole('menu');
    const logbooks = within(menu).getByRole('menuitem', { name: 'Logbooks' });
    expect(logbooks).toHaveAttribute('aria-current', 'page');
    expect(logbooks).toHaveAttribute('href', '/v/dra/logbooks');
    expect(within(menu).getAllByRole('menuitem').map((i) => i.getAttribute('data-testid'))).toEqual(
      ['certificates', 'technical', 'vessel', 'logbooks', 'calendar'].map((id) => `${SHELL_TEST_IDS.moduleTabPrefix}${id}`),
    );
  });

  it("leaves room for the rail's padding, so the last tab or More never runs into ← Fleet", async () => {
    viewport({ md: true });
    // 8 tabs × 120 px + 7 gaps × 2 px = 974 px: they fit 980 px only if the rail's 16 px padding is ignored.
    layout(980);
    const realStyle = window.getComputedStyle.bind(window);
    const spy = vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element, pseudo?: string | null) => {
      const style = realStyle(el, pseudo);
      const isRail = el.parentElement?.parentElement?.getAttribute('data-testid') === SHELL_TEST_IDS.moduleTabBar;
      return isRail ? ({ ...style, paddingLeft: '8px', paddingRight: '8px' } as CSSStyleDeclaration) : style;
    });
    try {
      renderTabs('/v/dra');
      expect(await screen.findByTestId(SHELL_TEST_IDS.moduleTabMore)).toBeInTheDocument();
      expect(tabIds().length).toBeLessThan(8);
    } finally {
      spy.mockRestore();
    }
  });

  it('shows every tab and no More when they fit', async () => {
    viewport({ md: true });
    layout(2000);
    renderTabs('/v/dra');
    await waitFor(() => expect(tabIds()).toHaveLength(8));
    expect(screen.queryByTestId(SHELL_TEST_IDS.moduleTabMore)).toBeNull();
  });

  it('below 768 px scrolls inside itself (no More), the row snapping to tabs', async () => {
    layout(300);
    renderTabs('/v/dra/logbooks/review');
    await waitFor(() => expect(tabIds()).toHaveLength(8));
    expect(screen.queryByTestId(SHELL_TEST_IDS.moduleTabMore)).toBeNull();
    const rail = screen.getByTestId(`${SHELL_TEST_IDS.moduleTabPrefix}home`).parentElement as HTMLElement;
    expect(rail).toHaveClass('overflow-x-auto', 'snap-x');
  });
});

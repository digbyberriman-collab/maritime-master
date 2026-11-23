import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import SidebarNavigation from '@/shared/components/layout/SidebarNavigation';
import { NavAccessContext, type NavAccess } from '@/app/nav/navAccess';
import { useFilteredModuleTree } from '@/app/nav/useFilteredTree';
import { NAVIGATION_ITEMS } from '@/config/sitemap';
import type { FilteredNavNode } from '@/app/nav/navTree';
import { CheckSquare, FolderOpen, Layers, Navigation, Stethoscope, Utensils } from 'lucide-react';

const mocks = vi.hoisted(() => ({
  order: { map: {} },
  hrAccess: { loading: false },
  payrollAccess: { loading: false },
  medicalAccess: { loading: false, selfOnly: false },
  wellnessAccess: { loading: false, selfOnly: false },
  badgeCounts: { data: { pendingCompliance: 0, unreadMessages: 0, overdueTasks: 0 } },
  permissions: { hasPermission: () => true, isInitialized: true },
}));

vi.mock('@/shared/hooks/useSidebarOrder', () => ({
  useSidebarOrder: () => mocks.order,
  applySidebarOrder: <T,>(items: T[]) => items,
}));
vi.mock('@/modules/auth/store/permissionsStore', () => ({
  usePermissionsStore: (selector: (state: object) => unknown) => selector(mocks.permissions),
}));
vi.mock('@/modules/auth/hooks/useHrAccess', () => ({ useHrAccess: () => mocks.hrAccess }));
vi.mock('@/modules/auth/lib/hrAccess', () => ({ hrAccessSatisfies: () => true }));
vi.mock('@/modules/auth/hooks/usePayrollAccess', () => ({ usePayrollAccess: () => mocks.payrollAccess }));
vi.mock('@/modules/auth/lib/payrollAccess', () => ({ payrollAccessSatisfies: () => true }));
// Health access is mocked for the same reason as HR and payroll: the real
// hooks reach the auth context and the Supabase client, which this
// accessibility test has no business booting.
vi.mock('@/modules/auth/hooks/useMedicalAccess', () => ({ useMedicalAccess: () => mocks.medicalAccess }));
vi.mock('@/modules/auth/lib/medicalAccess', () => ({ medicalAccessSatisfies: () => true }));
vi.mock('@/modules/auth/hooks/useWellnessAccess', () => ({ useWellnessAccess: () => mocks.wellnessAccess }));
vi.mock('@/modules/auth/lib/wellnessAccess', () => ({ wellnessAccessSatisfies: () => true }));
vi.mock('@/shared/hooks/useSidebarBadgeCounts', () => ({
  useSidebarBadgeCounts: () => mocks.badgeCounts,
}));

// The sidebar fails closed without access facts (src/app/nav/navAccess.ts);
// these regressions are about ARIA and focus, so every gate is open.
const OPEN_ACCESS: NavAccess = { ready: true, legacyRole: 'dpa', rbacRoles: [], can: () => true, fleetReach: true, vesselReach: true };

const LocationProbe = () => <output aria-label="Current route">{useLocation().pathname}{useLocation().search}</output>;

/** The static vessel tree (tabs as groups), as a legacy page shows it. */
const VesselTree: React.FC<{ collapsed: boolean; onExpand: () => void }> = ({ collapsed, onExpand }) => {
  const vessel = NAVIGATION_ITEMS.find((m) => m.id === 'vessel') ?? null;
  const nodes = useFilteredModuleTree(vessel);
  return <SidebarNavigation nodes={nodes} heading={vessel} rootPath={vessel?.path} collapsed={collapsed} onExpand={onExpand} />;
};

function renderSidebar(path = '/v/dra/logbooks/review?module=vessel', collapsed = false, onExpand = vi.fn()) {
  return render(
    <NavAccessContext.Provider value={OPEN_ACCESS}>
      <MemoryRouter initialEntries={[path]}>
        <VesselTree collapsed={collapsed} onExpand={onExpand} />
        <LocationProbe />
      </MemoryRouter>
    </NavAccessContext.Provider>,
  );
}

function activateWithKeyboard(control: HTMLElement) {
  act(() => {
    control.focus();
    fireEvent.keyDown(control, { key: 'Enter', code: 'Enter' });
    control.click();
    fireEvent.keyUp(control, { key: 'Enter', code: 'Enter' });
  });
}

describe('SidebarNavigation accessibility regressions', () => {
  beforeEach(() => localStorage.clear());

  it('identifies one active page and announces it through a polite atomic live region', async () => {
    renderSidebar();
    const navigation = screen.getByRole('navigation', { name: 'Vessel folders' });
    const current = within(navigation).getAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page');

    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName(/Review & Sign-off, current page/i);

    const status = within(navigation).getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');
    await waitFor(() => expect(status).toHaveTextContent('Current page: Review & Sign-off'));
  });

  it('keeps focus indicators and valid ARIA state while keyboard-toggling a section', async () => {
    renderSidebar();
    const navigation = screen.getByRole('navigation', { name: 'Vessel folders' });
    const safety = within(navigation).getByRole('button', { name: /Safety section, collapsed/i });

    expect(safety.className).toContain('focus-visible:ring-2');
    expect(safety).toHaveAttribute('aria-expanded', 'false');
    const closedPanelId = safety.getAttribute('aria-controls');
    expect(closedPanelId).toBeTruthy();
    expect(document.getElementById(closedPanelId ?? '')).toBeInTheDocument();

    activateWithKeyboard(safety);
    expect(safety).toHaveFocus();
    await waitFor(() => expect(safety).toHaveAttribute('aria-expanded', 'true'));
    expect(safety).toHaveAccessibleName(/Safety section, expanded/i);
    expect(document.getElementById(safety.getAttribute('aria-controls') ?? '')).toBeInTheDocument();
    expect(within(navigation).getByRole('status')).toHaveTextContent('Safety section expanded');

    activateWithKeyboard(safety);
    await waitFor(() => expect(safety).toHaveAttribute('aria-expanded', 'false'));
    expect(within(navigation).getByRole('status')).toHaveTextContent('Safety section collapsed');
  });

  it('retains accessible names, active state, and focus styling in icon-only mode', () => {
    const onExpand = vi.fn();
    renderSidebar('/v/dra/logbooks/review?module=vessel', true, onExpand);
    const navigation = screen.getByRole('navigation', { name: 'Vessel folders' });
    const logbooks = within(navigation).getByRole('button', { name: /^Logbooks section, contains current page.*Expand sidebar to view/i });

    expect(logbooks).toHaveAccessibleName(/^Logbooks section/i);
    expect(logbooks.className).toContain('focus-visible:ring-2');
    activateWithKeyboard(logbooks);
    expect(logbooks).toHaveFocus();
    expect(onExpand).toHaveBeenCalledOnce();
  });

  it('navigates a focused leaf link and keeps its accessible name', async () => {
    renderSidebar('/v/dra/logbooks/review?module=vessel');
    const crew = screen.getByRole('button', { name: /Crew section, collapsed/i });
    activateWithKeyboard(crew);
    const crewList = await screen.findByRole('link', { name: 'Crew List' });

    expect(crewList.className).toContain('focus-visible:ring-2');
    activateWithKeyboard(crewList);
    expect(crewList).toHaveFocus();
    // A link into the vessel scope never carries a workspace's ?module= (deferred item 2).
    await waitFor(() => expect(screen.getByLabelText('Current route')).toHaveTextContent(/^\/v\/:vesselCode\/crew\/list$/));
  });

  it('long labels keep a tooltip in every expanded row, and a planned leaf is marked without a text chip', () => {
    const LONG = 'Voyage Checklists and Passage Planning Records';
    const nodes: FilteredNavNode[] = [
      { id: 'ops', label: 'Operations Group With A Long Name', path: '/v/:vesselCode/vessel', icon: Navigation, kind: 'group', children: [
        { id: 'voyage', label: LONG, path: '/v/:vesselCode/vessel/voyage-checklists', icon: CheckSquare, kind: 'leaf', status: 'planned' },
      ] },
      { id: 'docs', label: 'Documents & Plans for the Engine Room', path: '/v/:vesselCode/technical/documents', icon: FolderOpen, kind: 'leaf', status: 'live' },
      { id: 'deck', label: 'Deck Plans and General Arrangement', path: '/v/:vesselCode/technical/deck-plans', icon: Layers, kind: 'leaf', status: 'planned', locked: true },
    ];
    render(
      <NavAccessContext.Provider value={OPEN_ACCESS}>
        <MemoryRouter initialEntries={['/v/dra/vessel/voyage-checklists']}>
          <SidebarNavigation nodes={nodes} heading={null} />
        </MemoryRouter>
      </NavAccessContext.Provider>,
    );
    const navigation = screen.getByRole('navigation', { name: 'Navigation' });
    // Group trigger, leaf link and locked button: the truncating label has the full text as its title.
    for (const label of ['Operations Group With A Long Name', LONG, 'Documents & Plans for the Engine Room', 'Deck Plans and General Arrangement']) {
      expect(within(navigation).getByText(label)).toHaveAttribute('title', label);
    }
    const planned = within(navigation).getByRole('link', { name: `${LONG}, planned, current page` });
    expect(planned.querySelector('[data-nav-status="planned"]')).toHaveAttribute('aria-hidden', 'true');
    expect(within(navigation).getByRole('button', { name: 'Deck Plans and General Arrangement, planned, add-on, locked' })).toBeInTheDocument();
    expect(within(navigation).queryByText('Planned')).toBeNull();
  });
  describe('icon-only rows name themselves in a tooltip (D-92)', () => {
    const COLLAPSED_NODES: FilteredNavNode[] = [
      { id: 'medical', label: 'Medical', path: '/health/medical', icon: Stethoscope, kind: 'group', children: [
        { id: 'records', label: 'Records', path: '/health/medical/records', icon: FolderOpen, kind: 'leaf', status: 'live' },
      ] },
      { id: 'nutrition', label: 'Nutrition', path: '/health/nutrition', icon: Utensils, kind: 'leaf', status: 'beta' },
      { id: 'deck', label: 'Deck Plans', path: '/health/deck-plans', icon: Layers, kind: 'leaf', status: 'planned', locked: true },
    ];
    const tooltipText = () => screen.queryByRole('tooltip')?.textContent ?? null;

    function renderCollapsed() {
      return render(
        <NavAccessContext.Provider value={OPEN_ACCESS}>
          <MemoryRouter initialEntries={['/health/medical/records']}>
            <SidebarNavigation nodes={COLLAPSED_NODES} heading={null} collapsed onExpand={vi.fn()} />
          </MemoryRouter>
        </NavAccessContext.Provider>,
      );
    }

    it('a focused leaf and a focused group show their label (and status) in a tooltip; no native title', async () => {
      renderCollapsed();
      const navigation = screen.getByRole('navigation', { name: 'Navigation' });
      const leaf = within(navigation).getByRole('link', { name: 'Nutrition, beta' });
      const group = within(navigation).getByRole('button', { name: 'Medical section, contains current page. Expand sidebar to view' });
      for (const row of [leaf, group]) expect(row).not.toHaveAttribute('title');
      expect(screen.queryByRole('tooltip')).toBeNull();

      act(() => leaf.focus());
      await waitFor(() => expect(tooltipText()).toBe('NutritionBeta'));
      // The tooltip describes the row; its name is unchanged.
      expect(leaf).toHaveAttribute('aria-describedby');
      expect(leaf).toHaveAccessibleName('Nutrition, beta');
      expect(screen.getAllByRole('tooltip')).toHaveLength(1);

      act(() => group.focus());
      await waitFor(() => expect(tooltipText()).toBe('Medical'));
      expect(group).toHaveAccessibleName('Medical section, contains current page. Expand sidebar to view');
      expect(screen.getAllByRole('tooltip')).toHaveLength(1);
    });

    // Placement (to the right of the rail, not clipped) needs a real layout:
    // jsdom has a zero-size viewport, so floating-ui flips the side. The
    // browser probe checks it; here, the portal and the reduced-motion class.
    it('the tooltip is portalled out of the scroll container, its animation off under reduced motion', async () => {
      renderCollapsed();
      const navigation = screen.getByRole('navigation', { name: 'Navigation' });
      const leaf = within(navigation).getByRole('link', { name: 'Nutrition, beta' });
      act(() => leaf.focus());
      const tooltip = await screen.findByRole('tooltip');
      expect(navigation.contains(tooltip)).toBe(false);
      const surface = document.querySelector('[data-side]');
      expect(navigation.contains(surface)).toBe(false);
      expect(surface?.className).toContain('motion-reduce:animate-none');
      expect(surface?.className).toContain('bg-popover');
    });

    it('a locked add-on: tooltip on focus, none while its explanation is open', async () => {
      renderCollapsed();
      const navigation = screen.getByRole('navigation', { name: 'Navigation' });
      const lock = within(navigation).getByRole('button', { name: 'Deck Plans, planned, add-on, locked' });
      expect(lock).not.toHaveAttribute('title');
      act(() => lock.focus());
      await waitFor(() => expect(tooltipText()).toBe('Deck PlansPlanned · Add-on'));
      fireEvent.click(lock);
      expect(await screen.findByText('Deck Plans is an add-on')).toBeInTheDocument();
      expect(lock).toHaveAttribute('data-state', 'open');
      expect(screen.queryByRole('tooltip')).toBeNull();
      act(() => lock.focus());
      expect(screen.queryByRole('tooltip')).toBeNull();
    });
  });
});

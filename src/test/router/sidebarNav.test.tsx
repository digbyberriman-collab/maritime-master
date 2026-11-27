/**
 * The sidebar over the real nav tree (BUILD-PLAN B3, B7, S3; D-06; gap/10
 * IA6, IA7, IA10): planned leaves are hidden by default, shown with a
 * planned mark when an owner or admin turns on "Show roadmap", and never
 * shown to anyone else. The Fleet tree renders its section headings; fleet
 * and vessel nodes need reach to that scope. Vessel URLs light up their leaf.
 *
 * The trees are filtered the way the shell filters them
 * (`useFilteredModuleTree`) and drawn by SidebarNavigation, whose leaves are
 * links. `vessel` here is the static vessel tree a legacy page still shows
 * (tabs as groups on the `/v/:vesselCode` pattern); the vessel scope's own
 * per-tab sidebar is covered by src/test/shell/sidebarScopes.test.tsx.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SidebarNavigation from '@/shared/components/layout/SidebarNavigation';
import SidebarFooter from '@/shared/components/layout/SidebarFooter';
import { NavAccessContext, type NavAccess } from '@/app/nav/navAccess';
import { SHOW_ROADMAP_KEY } from '@/app/nav/roadmap';
import { useFilteredModuleTree } from '@/app/nav/useFilteredTree';
import { NAVIGATION_ITEMS } from '@/config/sitemap';

const mocks = vi.hoisted(() => ({
  order: { map: {} },
  access: { loading: false, selfOnly: false },
  badgeCounts: { data: { pendingCompliance: 0, unreadMessages: 4, overdueTasks: 0 } },
  permissions: { hasPermission: () => true, isInitialized: true, userRoles: [] as { role_name: string }[] },
}));

vi.mock('@/shared/hooks/useSidebarOrder', () => ({
  useSidebarOrder: () => mocks.order,
  applySidebarOrder: <T,>(items: T[]) => items,
}));
vi.mock('@/modules/auth/store/permissionsStore', () => ({
  usePermissionsStore: (selector: (state: object) => unknown) => selector(mocks.permissions),
}));
vi.mock('@/modules/auth/hooks/useHrAccess', () => ({ useHrAccess: () => mocks.access }));
vi.mock('@/modules/auth/lib/hrAccess', () => ({ hrAccessSatisfies: () => true }));
vi.mock('@/modules/auth/hooks/usePayrollAccess', () => ({ usePayrollAccess: () => mocks.access }));
vi.mock('@/modules/auth/lib/payrollAccess', () => ({ payrollAccessSatisfies: () => true }));
vi.mock('@/modules/auth/hooks/useMedicalAccess', () => ({ useMedicalAccess: () => mocks.access }));
vi.mock('@/modules/auth/lib/medicalAccess', () => ({ medicalAccessSatisfies: () => true }));
vi.mock('@/modules/auth/hooks/useWellnessAccess', () => ({ useWellnessAccess: () => mocks.access }));
vi.mock('@/modules/auth/lib/wellnessAccess', () => ({ wellnessAccessSatisfies: () => true }));
vi.mock('@/shared/hooks/useSidebarBadgeCounts', () => ({ useSidebarBadgeCounts: () => mocks.badgeCounts }));

const admin: NavAccess = { ready: true, legacyRole: 'dpa', rbacRoles: ['dpa'], can: () => false, fleetReach: true, vesselReach: true };
const crew: NavAccess = { ready: true, legacyRole: 'crew', rbacRoles: ['crew'], can: () => false, fleetReach: false, vesselReach: true };
const fleetAdmin: NavAccess = { ...admin, can: () => true };

const TreeSidebar: React.FC<{ moduleId: string }> = ({ moduleId }) => {
  const module = NAVIGATION_ITEMS.find((m) => m.id === moduleId) ?? null;
  const nodes = useFilteredModuleTree(module);
  return <SidebarNavigation nodes={nodes} heading={module} rootPath={module?.path} moduleParam={moduleId} />;
};

function renderSidebar(path: string, access?: NavAccess, moduleId = 'vessel') {
  const tree = (
    <MemoryRouter initialEntries={[path]}>
      <TreeSidebar moduleId={moduleId} />
      {/* The Show roadmap switch lives in the sidebar footer (D-29). */}
      <SidebarFooter collapsed={false} />
    </MemoryRouter>
  );
  return render(access ? <NavAccessContext.Provider value={access}>{tree}</NavAccessContext.Provider> : tree);
}

const openGroup = (name: RegExp) => {
  const nav = screen.getByRole('navigation');
  act(() => {
    fireEvent.click(within(nav).getByRole('button', { name }));
  });
};

const DRILLS = '/v/dra/safety/drills?module=vessel';

describe('planned leaves in the sidebar', () => {
  beforeEach(() => localStorage.clear());

  it('are hidden by default, while live leaves show', () => {
    renderSidebar(DRILLS, admin);
    const nav = screen.getByRole('navigation', { name: 'Vessel folders' });
    expect(within(nav).getByRole('link', { name: /^Drills, current page/ })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /^Summary/ })).toBeNull();
    expect(within(nav).queryByRole('link', { name: /Muster List/ })).toBeNull();
  });

  it('hide a group whose leaves are all planned, and the planned Finance and Departments tabs (G1, G5)', () => {
    renderSidebar(DRILLS, admin);
    const nav = screen.getByRole('navigation', { name: 'Vessel folders' });
    expect(within(nav).queryByRole('button', { name: /^Charter section/ })).toBeNull();
    // Finance holds live cross-links into HRIS, Departments into Health; the
    // planned module still hides them.
    expect(within(nav).queryByRole('button', { name: /^Finance section/ })).toBeNull();
    expect(within(nav).queryByRole('button', { name: /^Departments section/ })).toBeNull();
    expect(within(nav).queryByRole('link', { name: /^Reports/ })).toBeNull();
    expect(within(nav).getByRole('link', { name: /^Home/ })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /^Calendar/ })).toBeInTheDocument();
  });

  it('show with a planned mark when an admin turns on Show roadmap', () => {
    renderSidebar(DRILLS, admin);
    const toggle = screen.getByRole('switch', { name: /Show roadmap/ });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    act(() => {
      fireEvent.click(toggle);
    });
    expect(localStorage.getItem(SHOW_ROADMAP_KEY)).toBe('true');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    const nav = screen.getByRole('navigation', { name: 'Vessel folders' });
    const summary = within(nav).getByRole('link', { name: 'Summary, planned' });
    // A compact visual mark (the accessible name says "planned"), and the label keeps its width.
    const mark = summary.querySelector('[data-nav-status="planned"]');
    expect(mark).not.toBeNull();
    expect(mark).toHaveAttribute('aria-hidden', 'true');
    expect(within(nav).queryByText('Planned')).toBeNull();
    expect(within(summary).getByText('Summary')).toHaveAttribute('title', 'Summary');
    expect(within(nav).getByRole('button', { name: /^Finance section/ })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: /^Charter section/ })).toBeInTheDocument();
  });

  it('stay hidden for crew even when the preference is stored, and crew get no toggle', () => {
    localStorage.setItem(SHOW_ROADMAP_KEY, 'true');
    renderSidebar(DRILLS, crew);
    const nav = screen.getByRole('navigation', { name: 'Vessel folders' });
    expect(within(nav).getByRole('link', { name: /^Drills, current page/ })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /^Summary/ })).toBeNull();
    expect(screen.queryByRole('switch', { name: /Show roadmap/ })).toBeNull();
  });

  it('stay hidden without access information (fail closed)', () => {
    localStorage.setItem(SHOW_ROADMAP_KEY, 'true');
    renderSidebar(DRILLS);
    expect(screen.queryByRole('link', { name: /^Summary/ })).toBeNull();
    expect(screen.queryByRole('switch', { name: /Show roadmap/ })).toBeNull();
    // No vessel reach is known yet, so no vessel page is offered at all.
    expect(screen.queryByRole('link', { name: /^Drills/ })).toBeNull();
  });
});

describe('vessel URLs', () => {
  beforeEach(() => localStorage.clear());

  it('light up their leaf for any vessel code', () => {
    renderSidebar('/v/dra/logbooks/review?module=vessel', admin);
    const nav = screen.getByRole('navigation', { name: 'Vessel folders' });
    expect(within(nav).getByRole('link', { name: /Review & Sign-off, current page/ })).toBeInTheDocument();
  });

  it('light up the leaf a detail page sits under', () => {
    // The Planner leaf is a rebuilt page (X1-09B): beta, behind its capability.
    renderSidebar('/v/hyd/crew/planner/manning?module=vessel', fleetAdmin);
    const nav = screen.getByRole('navigation', { name: 'Vessel folders' });
    expect(within(nav).getByRole('link', { name: /^Planner, beta, current page/ })).toBeInTheDocument();
  });

  it('light up Home on the vessel home only, not on every page under it', () => {
    const { unmount } = renderSidebar('/v/dra?module=vessel', admin);
    expect(screen.getByRole('link', { name: /^Home, current page/ })).toBeInTheDocument();
    unmount();
    // A planned page (its own leaf hidden) inside a hidden module: nothing is current.
    renderSidebar('/v/dra/departments/bridge/handover-notes?module=vessel', admin);
    const nav = screen.getByRole('navigation', { name: 'Vessel folders' });
    expect(within(nav).getByRole('link', { name: /^Home$/ })).toBeInTheDocument();
    expect(within(nav).queryAllByRole('link').filter((b) => b.getAttribute('aria-current') === 'page')).toEqual([]);
  });

  it('are hidden from someone with no vessel to open', () => {
    renderSidebar(DRILLS, { ...admin, vesselReach: false });
    const nav = screen.getByRole('navigation', { name: 'Vessel folders' });
    const offered = [...within(nav).queryAllByRole('link'), ...within(nav).queryAllByRole('button')];
    expect(offered).toEqual([]);
  });
});

describe('the Fleet tree', () => {
  beforeEach(() => localStorage.clear());

  it('renders the six section headings of gap/10, in order', () => {
    renderSidebar('/fleet/documents?module=fleet', fleetAdmin, 'fleet');
    const nav = screen.getByRole('navigation', { name: 'Fleet folders' });
    const headings = within(nav).getAllByRole('group').map((g) => g.getAttribute('aria-labelledby'));
    expect(headings.map((id) => (id ? document.getElementById(id)?.textContent : null))).toEqual([
      'Overview', 'Compliance', 'People', 'Workspaces', 'Administration', 'Configuration',
    ]);
    const compliance = within(nav).getByRole('group', { name: 'Compliance' });
    expect(within(compliance).getByRole('link', { name: /^Documents(, beta)?, current page/ })).toBeInTheDocument();
  });

  it('shows only built pages by default', () => {
    renderSidebar('/fleet/dashboard?module=fleet', fleetAdmin, 'fleet');
    const nav = screen.getByRole('navigation', { name: 'Fleet folders' });
    // Phase 3 wave 1 pages are beta behind their capability (fleetAdmin holds every one).
    for (const label of ['Dashboard', 'Tracker', 'Reports', 'Calendar', 'Planner', 'Documents', 'Forms & Checklists', 'Training', 'Medical', 'Users & Access', 'Notifications', 'Vessels']) {
      expect(within(nav).getByRole('link', { name: new RegExp(`^${label.replace(/[&]/g, '\\&')}`) }), label).toBeInTheDocument();
    }
    for (const label of ['Safety queue', 'Visits', 'Support', 'Vessel Settings', 'Add-ons', 'Feedback']) {
      expect(within(nav).queryByRole('link', { name: new RegExp(`^${label}`) }), label).toBeNull();
    }
  });

  it('hides fleet pages from someone without fleet reach, but keeps the workspaces', () => {
    renderSidebar('/hris?module=fleet', { ...fleetAdmin, fleetReach: false }, 'fleet');
    const nav = screen.getByRole('navigation', { name: 'Fleet folders' });
    expect(within(nav).queryByRole('link', { name: /^Dashboard/ })).toBeNull();
    expect(within(nav).queryByRole('group', { name: 'Overview' })).toBeNull();
    const workspaces = within(nav).getByRole('group', { name: 'Workspaces' });
    expect(within(workspaces).getByRole('link', { name: /^HRIS/ })).toBeInTheDocument();
  });

  it('gates the administration leaves on their capability (fail closed)', () => {
    renderSidebar('/fleet/tracker?module=fleet', admin, 'fleet');
    const nav = screen.getByRole('navigation', { name: 'Fleet folders' });
    // Tracker is an ungated platform page; the dashboard (beta, X5-02A) and Users & Access need their capability.
    expect(within(nav).getByRole('link', { name: /^Tracker/ })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /^Dashboard/ })).toBeNull();
    expect(within(nav).queryByRole('link', { name: /^Users & Access/ })).toBeNull();
    expect(within(nav).queryByRole('group', { name: 'Administration' })).toBeNull();
  });
});

describe('badges', () => {
  beforeEach(() => localStorage.clear());

  it('a badge on a hidden leaf moves up to its group', () => {
    renderSidebar(DRILLS, admin);
    const nav = screen.getByRole('navigation', { name: 'Vessel folders' });
    // Communications (unread messages) is planned, so the Vessel group carries its badge.
    expect(within(nav).getByRole('button', { name: /^Vessel section.*4 unread messages/ })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Open 4 unread messages' })).toBeInTheDocument();
  });

  it('skips a section heading, which shows no badge, for the nearest group', () => {
    renderSidebar(DRILLS, admin);
    // Communications sits under the VESSEL RECORD heading inside the Vessel group.
    const nav = screen.getByRole('navigation', { name: 'Vessel folders' });
    openGroup(/^Vessel section/);
    expect(within(nav).getByText('Vessel Record').tagName).toBe('P');
    expect(within(nav).getAllByRole('link', { name: 'Open 4 unread messages' })).toHaveLength(1);
  });

  it('shows on the leaf itself when the leaf is visible', () => {
    localStorage.setItem(SHOW_ROADMAP_KEY, 'true');
    renderSidebar(DRILLS, admin);
    openGroup(/^Vessel section/);
    const nav = screen.getByRole('navigation', { name: 'Vessel folders' });
    expect(within(nav).getByRole('link', { name: /Communications, planned, 4 unread messages/ })).toBeInTheDocument();
  });
});

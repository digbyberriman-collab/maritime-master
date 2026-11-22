/**
 * Sidebar node kinds and gates over a small fixed tree (BUILD-PLAN B3, S3;
 * gap/10 IA6; gap/00 C2): section headings, beta chips, capability gating and
 * the fail-closed RBAC fix. The tree is filtered the way the shell filters
 * it (`useFilteredModuleTree`: `useNavNodeFilter().decide` + `filterNavTree`)
 * and drawn by SidebarNavigation; leaves are links.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SidebarNavigation from '@/shared/components/layout/SidebarNavigation';
import { NavAccessContext, type NavAccess } from '@/app/nav/navAccess';
import { useFilteredModuleTree } from '@/app/nav/useFilteredTree';
import { NAVIGATION_ITEMS } from '@/config/navigation';

const mocks = vi.hoisted(() => ({
  order: { map: {} },
  access: { loading: false, selfOnly: false },
  badgeCounts: { data: { pendingCompliance: 2, unreadMessages: 0, overdueTasks: 0 } },
  permissions: {
    hasPermission: (key: string) => key === 'fleet',
    isInitialized: true,
    userRoles: [] as { role_name: string }[],
  },
}));

vi.mock('@/config/navigation', async () => {
  const icons = await import('lucide-react');
  const leaf = (id: string, label: string, path: string, extra: object = {}) => ({
    id, label, path, icon: icons.Ship, kind: 'leaf', status: 'live', ...extra,
  });
  return {
    NAVIGATION_ITEMS: [
      {
        id: 'fleet',
        label: 'Fleet',
        icon: icons.Ship,
        path: '/fleet',
        permissions: ['all'],
        children: [
          {
            id: 'sec-overview', label: 'Overview', path: '/fleet/overview', icon: icons.Ship, kind: 'section',
            children: [
              leaf('dash', 'Dashboard', '/fleet/dashboard'),
              leaf('beta', 'Safety queue', '/fleet/safety', { status: 'beta', badgeKey: 'pendingCompliance' }),
            ],
          },
          {
            id: 'sec-admin', label: 'Administration', path: '/fleet/admin', icon: icons.Ship, kind: 'section',
            children: [
              leaf('users', 'Users & Access', '/fleet/admin/users', { capability: 'fleet.administration.users_access.view' }),
              leaf('vessels', 'Vessels', '/fleet/admin/vessels', { moduleKey: 'fleet' }),
              leaf('groups', 'Fleet Groups', '/fleet/admin/fleet-groups', { moduleKey: 'settings' }),
            ],
          },
          {
            id: 'sec-empty', label: 'Configuration', path: '/fleet/config', icon: icons.Ship, kind: 'section',
            children: [leaf('planned', 'Add-ons', '/fleet/admin/add-ons', { status: 'planned' })],
          },
        ],
      },
    ],
  };
});

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

const access = (can: (key: string) => boolean): NavAccess => ({ ready: true, legacyRole: 'crew', rbacRoles: [], can, fleetReach: true, vesselReach: true });

const FleetSidebar: React.FC<{ collapsed: boolean }> = ({ collapsed }) => {
  const fleet = NAVIGATION_ITEMS.find((m) => m.id === 'fleet') ?? null;
  const nodes = useFilteredModuleTree(fleet);
  return <SidebarNavigation nodes={nodes} heading={fleet} rootPath={fleet?.path} collapsed={collapsed} />;
};

function renderSidebar(navAccess: NavAccess, { collapsed = false } = {}) {
  return render(
    <NavAccessContext.Provider value={navAccess}>
      <MemoryRouter initialEntries={['/fleet/dashboard']}>
        <FleetSidebar collapsed={collapsed} />
      </MemoryRouter>
    </NavAccessContext.Provider>,
  );
}

describe('section headings', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.permissions.isInitialized = true;
  });

  it('render as non-interactive eyebrow headings that label their leaves', () => {
    renderSidebar(access(() => true));
    const nav = screen.getByRole('navigation', { name: 'Fleet folders' });
    const overview = within(nav).getByRole('group', { name: 'Overview' });
    expect(within(overview).getByRole('link', { name: /^Dashboard/ })).toBeInTheDocument();
    expect(within(nav).getByText('Overview').tagName).toBe('P');
    expect(within(nav).queryByRole('button', { name: /Overview/ })).toBeNull();
  });

  it('are hidden when none of their leaves is visible', () => {
    renderSidebar(access(() => true));
    expect(screen.queryByRole('group', { name: 'Configuration' })).toBeNull();
  });

  it('become separators when the panel collapses to icons, with their leaves still listed', () => {
    renderSidebar(access(() => true), { collapsed: true });
    expect(screen.getByRole('separator', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Dashboard/ })).toBeInTheDocument();
  });
});

describe('node gates', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.permissions.isInitialized = true;
  });

  it('shows a beta leaf with a Beta chip and its badge', () => {
    renderSidebar(access(() => true));
    expect(screen.getByRole('link', { name: 'Safety queue, beta, 2 pending compliance items' })).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('shows a capability-gated leaf only to holders of the capability', () => {
    const { unmount } = renderSidebar(access((key) => key === 'fleet.administration.users_access.view'));
    expect(screen.getByRole('link', { name: /^Users & Access/ })).toBeInTheDocument();
    unmount();
    renderSidebar(access(() => false));
    expect(screen.queryByRole('link', { name: /^Users & Access/ })).toBeNull();
  });

  it('applies the RBAC moduleKey gate', () => {
    renderSidebar(access(() => true));
    expect(screen.getByRole('link', { name: /^Vessels/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Fleet Groups/ })).toBeNull();
  });

  it('fails closed while RBAC is not initialised', () => {
    mocks.permissions.isInitialized = false;
    renderSidebar(access(() => true));
    expect(screen.queryByRole('link', { name: /^Vessels/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /^Fleet Groups/ })).toBeNull();
    // Leaves with no moduleKey are unaffected.
    expect(screen.getByRole('link', { name: /^Dashboard/ })).toBeInTheDocument();
  });
});

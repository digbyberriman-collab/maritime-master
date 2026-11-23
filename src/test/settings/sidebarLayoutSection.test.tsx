/**
 * Sidebar layout (/me/sidebar-layout; D-112): the rows are the trees the
 * shell draws, through the real pipeline (useNavNodeFilter, useFilteredModuleTree,
 * usePersonalNav, useVesselNav, the workspace gate), and every control writes
 * a key a consumer reads.
 *
 * - A vessel master (no fleet reach, D-26) gets no Fleet block, no Shoreside,
 *   and with Show roadmap off no planned leaf.
 * - Skeleton rows while access loads (fail closed, D-04).
 * - Scope trees and vessel tabs are headings without move controls; after
 *   every move control has been used, the stored map holds no '__root' or
 *   'vessel' key, and only keys the shell reads.
 * - A move changes the order the shell's sidebar draws (useFilteredModuleTree),
 *   visibly, and a saved id that is hidden now keeps its place.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', async () => (await import('../shell/fakeSupabase')).fakeSupabaseModule);
vi.mock('@/modules/auth/contexts/AuthContext', async () => {
  const { shellState } = await import('../shell/shellFakes');
  return { useAuth: () => shellState.auth };
});
vi.mock('@/modules/vessels/contexts/VesselContext', async () => {
  const { shellState } = await import('../shell/shellFakes');
  return { useVessel: () => shellState.vessel };
});
vi.mock('@/modules/auth/store/permissionsStore', async () => {
  const { shellState } = await import('../shell/shellFakes');
  return { usePermissionsStore: (selector: (s: object) => unknown) => selector(shellState.perm) };
});

import SidebarLayoutSection from '@/modules/settings/components/sections/SidebarLayoutSection';
import { NAVIGATION_ITEMS, buildVesselNav } from '@/config/sitemap';
import type { NavChild } from '@/config/navigation-types';
import { useFilteredModuleTree } from '@/app/nav/useFilteredTree';
import type { ScopeValue } from '@/app/router/scopeContext';
import { SIDEBAR_ROOT } from '@/shared/hooks/useSidebarOrder';
import { SHOW_ROADMAP_KEY } from '@/app/nav/roadmap';
import { resetFakeDb } from '../shell/fakeSupabase';
import {
  FAIL_CLOSED_NAV_ACCESS,
  FLEET_ACCESS,
  VESSEL_ONLY_ACCESS,
  asLoading,
  asVesselMaster,
  renderShell,
  resetShellState,
} from '../shell/shellFakes';

const PERSONAL: ScopeValue = { scope: 'personal' };
const STORAGE_KEY = 'storm:sidebar-order:v2';
const FLEET_MODULE = NAVIGATION_ITEMS.find((m) => m.id === 'fleet')!;

const stored = (): Record<string, string[]> => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');

/** Every node id under `nodes` that holds children, i.e. every group key the order map can carry. */
function groupIds(nodes: readonly NavChild[] | undefined, acc: Set<string>): Set<string> {
  for (const node of nodes ?? []) {
    if (node.children?.length) {
      acc.add(node.id);
      groupIds(node.children, acc);
    }
  }
  return acc;
}

/**
 * The keys the shell's consumers read: each tree's id (Fleet, the
 * workspaces, Personal) and their groups' ids (useFilteredModuleTree,
 * usePersonalNav), and each vessel tab's `vessel-<tab>` with its groups
 * (buildVesselTabs). Never the vessel pattern tree's own id: its tab order is fixed.
 */
const READ_KEYS: ReadonlySet<string> = (() => {
  const keys = new Set<string>();
  for (const module of NAVIGATION_ITEMS) {
    if (module.id !== 'vessel') keys.add(module.id);
    groupIds(module.children, keys);
  }
  keys.delete('vessel');
  return keys;
})();

/** Ids of planned nodes anywhere in the static trees (the vessel tree for DRA included). */
const PLANNED_IDS: ReadonlySet<string> = (() => {
  const ids = new Set<string>();
  const walk = (nodes: readonly NavChild[] | undefined) => {
    for (const node of nodes ?? []) {
      if (node.status === 'planned') ids.add(node.id);
      walk(node.children);
    }
  };
  for (const module of NAVIGATION_ITEMS) walk(module.children);
  for (const tab of buildVesselNav('DRA')) {
    if (tab.status === 'planned') ids.add(`vessel-${tab.id}`);
    walk(tab.children);
  }
  return ids;
})();

/** The Fleet sidebar's top-level order, as the shell draws it. */
const FleetOrderProbe: React.FC = () => {
  const nodes = useFilteredModuleTree(FLEET_MODULE);
  return <output data-testid="fleet-order">{nodes.map((n) => n.id).join(',')}</output>;
};

function renderSection(access = FLEET_ACCESS) {
  return renderShell(
    <>
      <SidebarLayoutSection />
      <FleetOrderProbe />
    </>,
    { path: '/me/sidebar-layout', scope: PERSONAL, access },
  );
}

const blockIds = () => Array.from(document.querySelectorAll<HTMLElement>('[data-sidebar-layout-block]')).map((el) => el.dataset.sidebarLayoutBlock);
const rowIds = (container: ParentNode = document) =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-order-row]')).map((el) => el.dataset.orderRow);
const block = (id: string) => document.querySelector<HTMLElement>(`[data-sidebar-layout-block="${id}"]`)!;
const ready = () => waitFor(() => expect(document.querySelector('[aria-label="Loading sidebar layout"]')).toBeNull(), { timeout: 4000 });

/** Click every enabled move control the page renders (by element: labels repeat across trees). */
function clickEveryMoveControl(scope: ParentNode = document): number {
  const buttons = Array.from(scope.querySelectorAll<HTMLButtonElement>('button[data-move]'));
  for (const button of buttons) {
    if (!button.isConnected || button.disabled) continue;
    act(() => {
      fireEvent.click(button);
    });
  }
  return buttons.length;
}

/** In every branch (a tree, or an expanded group), click the first row's enabled move control. */
function clickOneMovePerBranch(): number {
  const branches = Array.from(document.querySelectorAll<HTMLElement>('[role="tree"], [role="group"]'));
  let used = 0;
  for (const branch of branches) {
    const row = Array.from(branch.querySelectorAll<HTMLElement>('[data-order-row]')).find(
      (el) => el.parentElement?.closest('[role="tree"], [role="group"]') === branch,
    );
    const button = Array.from(row?.querySelectorAll<HTMLButtonElement>('button[data-move]') ?? []).find((b) => !b.disabled);
    if (!button) continue;
    act(() => {
      fireEvent.click(button);
    });
    used += 1;
  }
  return used;
}

beforeEach(() => {
  localStorage.clear();
  resetFakeDb();
  resetShellState();
});

describe('who sees which sections', () => {
  it('a vessel master gets no Fleet block, no Shoreside and, with Show roadmap off, no planned leaf', async () => {
    asVesselMaster();
    renderSection(VESSEL_ONLY_ACCESS);
    await ready();
    expect(blockIds()).not.toContain('fleet');
    expect(blockIds()).not.toContain('shoreside');
    expect(screen.queryByRole('heading', { name: 'Fleet' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Shoreside' })).toBeNull();
    expect(blockIds()).toContain('personal');
    expect(blockIds()).toContain('vessel');

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    });
    const rows = rowIds();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((id) => PLANNED_IDS.has(id!))).toEqual([]);
    expect(screen.queryByText('Planned')).toBeNull();
    // Nothing from the Fleet tree, which the vessel master cannot open (D-26).
    const fleetIds = groupIds(FLEET_MODULE.children, new Set<string>());
    expect(rows.filter((id) => fleetIds.has(id!))).toEqual([]);
  });

  it('a fleet manager gets the Fleet tree with its six sections, the open workspaces, Personal and the vessel tabs', async () => {
    renderSection();
    await ready();
    expect(blockIds()[0]).toBe('fleet');
    expect(blockIds()).toEqual(expect.arrayContaining(['fleet', 'personal', 'vessel']));
    expect(blockIds()).not.toContain('shoreside');
    const fleetTree = within(block('fleet')).getByRole('tree', { name: 'Fleet pages' });
    expect(within(fleetTree).getAllByRole('treeitem').map((el) => el.dataset.orderRow)).toEqual(FLEET_MODULE.children!.map((n) => n.id));
  });

  it('planned leaves follow Show roadmap (an admin with it on sees them, marked Planned)', async () => {
    const plannedRows = async () => {
      await ready();
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
      });
      return rowIds().filter((id) => PLANNED_IDS.has(id!));
    };
    const off = renderSection();
    expect(await plannedRows()).toEqual([]);
    off.unmount();
    localStorage.setItem(SHOW_ROADMAP_KEY, 'true');
    renderSection();
    expect((await plannedRows()).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Planned').length).toBeGreaterThan(0);
  });

  it('shows skeleton rows, and no tree, while access loads (fail closed)', () => {
    asLoading();
    renderSection(FAIL_CLOSED_NAV_ACCESS);
    expect(screen.getByLabelText('Loading sidebar layout')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('tree')).toBeNull();
    expect(screen.queryAllByRole('button', { name: /^Move / })).toEqual([]);
    expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled();
  });
});

describe('every control writes a key the shell reads', () => {
  it('scope trees and vessel tabs are headings with no move or drag controls', async () => {
    renderSection();
    await ready();
    for (const name of ['Fleet', 'My account', 'Vessel']) {
      const heading = screen.getByRole('heading', { level: 3, name });
      expect(heading.closest('[data-order-row]')).toBeNull();
      expect(heading.closest('[draggable="true"]')).toBeNull();
    }
    expect(screen.queryByRole('button', { name: 'Move Fleet down' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Move Vessel down' })).toBeNull();
    // The vessel tabs are headings inside the Vessel block, not rows.
    const crewTab = within(block('vessel')).getByRole('heading', { name: 'Crew' });
    expect(crewTab.closest('[data-order-row]')).toBeNull();
    expect(rowIds(block('vessel'))).not.toContain('vessel-crew');
  });

  it.each([
    ['a fleet manager', () => undefined, FLEET_ACCESS],
    ['a vessel master', () => asVesselMaster(), VESSEL_ONLY_ACCESS],
  ] as const)('after %s uses every move control, the map holds only keys a consumer reads', async (_who, persona, access) => {
    persona();
    // Stale keys from the old page: the module order and the vessel tab order.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ [SIDEBAR_ROOT]: ['vessel', 'fleet'], vessel: ['vessel-safety', 'vessel-home'] }));
    renderSection(access);
    await ready();
    await waitFor(() => expect(Object.keys(stored())).toEqual([]));

    // Every control the page renders as it opens, then every branch once expanded.
    const used = clickEveryMoveControl();
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    });
    const usedExpanded = clickOneMovePerBranch();
    expect(used).toBeGreaterThan(10);
    expect(usedExpanded).toBeGreaterThan(3);

    const keys = Object.keys(stored());
    expect(keys.length).toBeGreaterThan(0);
    expect(keys).not.toContain(SIDEBAR_ROOT);
    expect(keys).not.toContain('vessel');
    expect(keys.filter((key) => !READ_KEYS.has(key))).toEqual([]);
  }, 30_000);
});

describe('a move is what the sidebar draws', () => {
  it('moving a Fleet section changes useFilteredModuleTree’s order, and the row moves', async () => {
    renderSection();
    await ready();
    const [first, second] = FLEET_MODULE.children!;
    const probe = () => screen.getByTestId('fleet-order').textContent!.split(',');
    expect(probe().slice(0, 2)).toEqual([first.id, second.id]);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: `Move ${first.label} down` }));
    });
    expect(probe().slice(0, 2)).toEqual([second.id, first.id]);
    expect(rowIds(within(block('fleet')).getByRole('tree')).slice(0, 2)).toEqual([second.id, first.id]);
    expect(stored().fleet.slice(0, 2)).toEqual([second.id, first.id]);
    expect(screen.getByText(new RegExp(`^${first.label} moved to position 2 of \\d+\\.$`))).toHaveClass('sr-only');
  });

  it('keyboard: Ctrl+ArrowDown moves the focused row and keeps the focus on it', async () => {
    renderSection();
    await ready();
    const [first, second] = FLEET_MODULE.children!;
    const row = document.querySelector<HTMLElement>(`[data-order-row="${first.id}"]`)!;
    row.focus();
    act(() => {
      fireEvent.keyDown(row, { key: 'ArrowDown', ctrlKey: true });
    });
    expect(screen.getByTestId('fleet-order').textContent!.split(',').slice(0, 2)).toEqual([second.id, first.id]);
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector(`[data-order-row="${first.id}"]`)));
  });

  it('each click visibly moves the row; a saved id that is hidden now keeps its place', async () => {
    const ids = FLEET_MODULE.children!.map((n) => n.id);
    // A saved id the viewer does not see now (a section of an old tree, a planned page).
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ fleet: [ids[0], 'fleet-retired-section', ...ids.slice(1)] }));
    renderSection();
    await ready();
    const second = FLEET_MODULE.children![1];
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: `Move ${second.label} up` }));
    });
    expect(rowIds(within(block('fleet')).getByRole('tree')).slice(0, 2)).toEqual([ids[1], ids[0]]);
    expect(stored().fleet).toEqual([ids[1], 'fleet-retired-section', ids[0], ...ids.slice(2)]);
  });

  it('a vessel tab’s pages order under vessel-<tab>, which the tab’s sidebar reads', async () => {
    renderSection();
    await ready();
    const crew = within(block('vessel')).getByRole('tree', { name: 'Crew pages' });
    const before = rowIds(crew);
    expect(before.length).toBeGreaterThan(1);
    const firstLabel = crew.querySelector<HTMLElement>('[data-order-row]')!.getAttribute('aria-label')!.split(',')[0];
    act(() => {
      fireEvent.click(within(crew).getByRole('button', { name: `Move ${firstLabel} down` }));
    });
    const after = rowIds(within(block('vessel')).getByRole('tree', { name: 'Crew pages' }));
    expect(after.slice(0, 2)).toEqual([before[1], before[0]]);
    expect(stored()['vessel-crew'].slice(0, 2)).toEqual([before[1], before[0]]);
  });

  it('Reset restores the default order', async () => {
    renderSection();
    await ready();
    const [first, second] = FLEET_MODULE.children!;
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: `Move ${first.label} down` }));
    });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    });
    expect(screen.getByTestId('fleet-order').textContent!.split(',').slice(0, 2)).toEqual([first.id, second.id]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

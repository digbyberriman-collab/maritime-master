/**
 * Legal is a workspace with a sidebar tree of its own (gap/10 Workspaces
 * table: Legal sidebar = LEGAL_TABS; IA1; D-83). Its pages resolve to the
 * Legal tree, never to the Fleet tree's WORKSPACES cross-link, so the
 * breadcrumb reads Legal › Dashboard for every viewer (D-58), and the shell
 * draws the Legal sidebar.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { NAVIGATION_ITEMS } from '@/config/sitemap';
import { WORKSPACE_TREES } from '@/config/navSlots';
import { WORKSPACE_ROOTS, sidebarHref } from '@/app/nav/sidebarLinks';
import { resolveModuleForPath } from '@/shared/lib/moduleNavigation';
import { resolvePageNavigation } from '@/shared/lib/pageNavigation';
import { LEGAL_PATHS, LEGAL_TABS } from '@/modules/legal/paths';
import { WORKSPACE_APP_META, WORKSPACE_SCOPE_LABELS } from '@/app/shell/apps';

const crumbs = (path: string, moduleId: string | null) =>
  resolvePageNavigation(path, '', moduleId).crumbs.map((c) => c.label).join(' › ');

describe('the Legal workspace tree', () => {
  it('is a workspace tree at /departments/legal (R4)', () => {
    expect(WORKSPACE_TREES.find((w) => w.id === 'legal')).toMatchObject({ path: LEGAL_PATHS.root, slot: 'workspace.legal' });
    expect(WORKSPACE_ROOTS.filter((root) => root === LEGAL_PATHS.root)).toHaveLength(1);
    expect(new Set(WORKSPACE_ROOTS).size).toBe(WORKSPACE_ROOTS.length);
    // Every tree id has its chip label and Apps line.
    for (const tree of WORKSPACE_TREES) {
      expect(WORKSPACE_SCOPE_LABELS[tree.id], tree.id).toBeTruthy();
      expect(WORKSPACE_APP_META[tree.path], tree.path).toBeTruthy();
    }
  });

  it('has the four tabs as live leaves', () => {
    const legal = NAVIGATION_ITEMS.find((m) => m.id === 'legal');
    expect(legal?.label).toBe('Legal');
    const leaves = legal?.children ?? [];
    expect(leaves.map((l) => l.label)).toEqual(['Dashboard', 'Requests', 'Documents', 'Forms']);
    expect(leaves.map((l) => l.path)).toEqual(LEGAL_TABS.map((t) => t.path));
    expect(leaves.every((l) => l.status === 'live' && l.scope === 'workspace' && !l.crossLink)).toBe(true);
  });

  it('owns its pages: resolveModuleForPath picks Legal, not Fleet', () => {
    for (const path of [
      LEGAL_PATHS.root,
      LEGAL_PATHS.dashboard,
      LEGAL_PATHS.requests,
      LEGAL_PATHS.request('7c9e6679-7425-40de-944b-e07fc1f90ae7'),
      LEGAL_PATHS.formFill('t1'),
    ]) {
      expect(resolveModuleForPath(path)?.id, path).toBe('legal');
    }
  });

  it('roots its breadcrumb in Legal for every viewer, never Fleet › Workspaces', () => {
    for (const moduleId of ['legal', null]) {
      expect(crumbs(LEGAL_PATHS.dashboard, moduleId)).toBe('Legal › Dashboard');
      expect(crumbs(LEGAL_PATHS.requests, moduleId)).toBe('Legal › Requests');
      expect(crumbs(LEGAL_PATHS.newRequest, moduleId)).toBe('Legal › Requests › New');
    }
  });

  it('links its own leaves with ?module=legal, and HRIS links to it without', () => {
    const ctx = { moduleParam: 'legal', rootPath: LEGAL_PATHS.root };
    expect(sidebarHref(LEGAL_PATHS.requests, ctx)).toBe(`${LEGAL_PATHS.requests}?module=legal`);
    expect(sidebarHref(LEGAL_PATHS.root, { moduleParam: 'hris', rootPath: '/hris' })).toBe(LEGAL_PATHS.root);
  });
});

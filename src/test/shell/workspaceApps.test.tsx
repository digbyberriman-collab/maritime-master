/**
 * Apps → a workspace opens its first page the user may open (gap/10 W2:
 * Workspace(w, first allowed leaf); spec §6.3 "lists only workspaces the user
 * can open"): the link the workspace sidebar's first entry opens, with its
 * `?module=`. A workspace with no page the user may open is dropped (fail
 * closed); an entry without a tree of its own keeps its path.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { visibleWorkspaceApps } from '@/shared/components/layout/topbar/useWorkspaceApps';
import { NAVIGATION_ITEMS } from '@/config/sitemap';
import type { NavChild, NavItem } from '@/config/navigation-types';
import type { NavNodeDecision } from '@/app/nav/visibility';

const SECTION = NAVIGATION_ITEMS.find((m) => m.id === 'fleet')?.children?.find((n) => n.id === 'fleet-workspaces');
const HEALTH = NAVIGATION_ITEMS.find((m) => m.id === 'health') as NavItem;

/** The nav's own rule for planned leaves (no roadmap), plus a per-test gate. */
const gate =
  (extra: (node: NavChild) => boolean) =>
  (node: NavChild): NavNodeDecision =>
    node.status === 'planned' || !extra(node) ? 'hidden' : 'visible';
const apps = (decide: (node: NavChild) => NavNodeDecision) => visibleWorkspaceApps(SECTION, (n) => decide(n) !== 'hidden', decide);
const health = (decide: (node: NavChild) => NavNodeDecision) => apps(decide).find((a) => a.root === '/health');

describe('the Health & Wellness tile', () => {
  it('the real Health tree has the nodes these cases rely on', () => {
    const ids = (HEALTH.children ?? []).map((n) => n.id);
    expect(ids.slice(0, 2)).toEqual(['health-medical', 'health-spa']);
    expect((HEALTH.children ?? [])[0].moduleKey).toBe('medical');
  });

  it('opens the Medical dashboard for clinical and wellness access', () => {
    expect(health(gate(() => true))).toMatchObject({ path: '/health/medical/dashboard?module=health', root: '/health' });
  });

  it('opens the Spa dashboard when the medical nodes are hidden and wellness is allowed (not "Clinical access required")', () => {
    const noClinical = gate((node) => node.moduleKey !== 'medical');
    expect(health(noClinical)).toMatchObject({ path: '/health/spa/dashboard?module=health', root: '/health' });
  });

  it('self-serve only: the first self-serve Medical page (C.H.E.K.)', () => {
    const selfServe = gate((node) => !(node.moduleKey === 'medical' || node.moduleKey === 'wellness') || Boolean(node.selfServe));
    expect(health(selfServe)?.path).toBe('/health/medical/chek?module=health');
  });

  it('is dropped when nothing in the workspace is open to the user', () => {
    const nothingInHealth = gate((node) => !node.path.startsWith('/health/'));
    expect(health(nothingInHealth)).toBeUndefined();
    // The other workspaces are unaffected.
    expect(apps(nothingInHealth).map((a) => a.root)).toEqual(expect.arrayContaining(['/hris', '/yard']));
  });
});

describe('every workspace', () => {
  it('each tile opens a page inside its own workspace, and marks it by its root', () => {
    const all = apps(gate(() => true));
    expect(all.map((a) => a.label)).toEqual(['HRIS', 'Health & Wellness', 'Yard', 'Legal']);
    for (const app of all) {
      expect(app.path.startsWith(app.root) || app.path.includes(`module=`)).toBe(true);
      expect(app.purpose).not.toBeNull();
    }
    // Legal stays under its own prefix with or without a tree of its own.
    expect(all.find((a) => a.label === 'Legal')?.path).toMatch(/^\/departments\/legal/);
    expect(all.find((a) => a.label === 'Legal')?.root).toBe('/departments/legal');
  });

  it('works for any workspace tree (no per-workspace case): first allowed leaf, with ?module=', () => {
    const icon = HEALTH.icon;
    const leaf = (id: string, path: string, extra: Partial<NavChild> = {}): NavChild => ({ id, label: id, path, icon, kind: 'leaf', status: 'live', ...extra });
    const section: NavChild = {
      id: 'ws',
      label: 'Workspaces',
      path: '/fleet',
      icon,
      kind: 'section',
      children: [leaf('entry-hris', '/hris', { crossLink: true }), leaf('entry-other', '/other', { crossLink: true })],
    };
    const modules: NavItem[] = [
      {
        id: 'hris',
        label: 'HRIS',
        icon,
        path: '/hris',
        permissions: ['all'],
        children: [leaf('locked-one', '/hris/secret', { capability: 'x' }), leaf('open-one', '/hris/people')],
      },
    ];
    const decide = (node: NavChild): NavNodeDecision => (node.capability ? 'hidden' : 'visible');
    const out = visibleWorkspaceApps(section, (n) => decide(n) !== 'hidden', decide, modules);
    expect(out.map((a) => [a.id, a.path, a.root])).toEqual([
      ['entry-hris', '/hris/people?module=hris', '/hris'],
      ['entry-other', '/other', '/other'],
    ]);
  });

  it('nothing while the section itself is hidden', () => {
    expect(visibleWorkspaceApps(SECTION, () => false, () => 'hidden')).toEqual([]);
  });
});

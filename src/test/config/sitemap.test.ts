import { describe, expect, it } from 'vitest';
import { NAVIGATION_ITEMS, PLACEHOLDER_LEAVES, SECTION_REDIRECTS } from '@/config/sitemap';
import type { NavChild, NavItem } from '@/config/navigation-types';
import { resolveModuleForPath } from '@/shared/lib/moduleNavigation';
import { HEALTH_PATHS } from '@/modules/health/paths';

const walk = (items: (NavItem | NavChild)[], visit: (item: NavItem | NavChild, moduleId: string) => void, moduleId = '') => {
  for (const item of items) {
    const id = moduleId || item.id;
    visit(item, id);
    if ('children' in item && item.children?.length) walk(item.children, visit, id);
  }
};

describe('sitemap invariants', () => {
  it('has no duplicate ids', () => {
    const ids: string[] = [];
    walk(NAVIGATION_ITEMS, (item) => ids.push(item.id));
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });

  it('every path is owned by exactly one module (cross-links excluded)', () => {
    const owners = new Map<string, Set<string>>();
    walk(NAVIGATION_ITEMS, (item, moduleId) => {
      if ('children' in item && item.children?.length) return;
      if ((item as NavChild).crossLink) return;
      const set = owners.get(item.path) ?? new Set<string>();
      set.add(moduleId);
      owners.set(item.path, set);
    });
    const shared = Array.from(owners.entries()).filter(([, set]) => set.size > 1).map(([p]) => p);
    expect(shared).toEqual([]);
  });

  it('HRIS owns its real pages so reloads land in HRIS', () => {
    expect(resolveModuleForPath('/hr')?.id).toBe('hris');
    expect(resolveModuleForPath('/crew/leave')?.id).toBe('hris');
    expect(resolveModuleForPath('/crew/leave/requests')?.id).toBe('hris');
    expect(resolveModuleForPath('/development/my')?.id).toBe('hris');
    expect(resolveModuleForPath('/hris/compensation/payroll')?.id).toBe('hris');
  });

  it('every HRIS record leaf is gated on the hr module', () => {
    const hris = NAVIGATION_ITEMS.find((m) => m.id === 'hris')!;
    const ungated: string[] = [];
    walk(hris.children ?? [], (item) => {
      const child = item as NavChild;
      if (child.children?.length) return;
      if (child.path.startsWith('/hris/') || child.path.startsWith('/hr')) {
        if (!child.moduleKey) ungated.push(child.path);
      }
    }, 'hris');
    expect(ungated).toEqual([]);
  });

  it('section redirects cover /hris and every HRIS group', () => {
    const from = new Set(SECTION_REDIRECTS.map((r) => r.from));
    expect(from.has('/hris')).toBe(true);
    for (const group of ['employee-records', 'compensation', 'performance', 'recruitment', 'leave-and-rotation']) {
      expect(from.has(`/hris/${group}`)).toBe(true);
    }
    for (const r of SECTION_REDIRECTS) {
      expect(r.to).toMatch(/module=/);
      expect(r.to.startsWith(r.from + '/') || !r.to.startsWith('/hris')).toBe(true);
    }
  });

  it('placeholder leaves never collide with section redirects', () => {
    const placeholders = new Set(PLACEHOLDER_LEAVES.map((l) => l.path));
    for (const r of SECTION_REDIRECTS) expect(placeholders.has(r.from)).toBe(false);
  });

  it('every Health & Wellness leaf is gated on medical or wellness', () => {
    const health = NAVIGATION_ITEMS.find((m) => m.id === 'health')!;
    const ungated: string[] = [];
    walk(health.children ?? [], (item) => {
      const child = item as NavChild;
      if (child.children?.length) return;
      if (!child.moduleKey || !['medical', 'wellness'].includes(child.moduleKey)) {
        ungated.push(child.path);
      }
    }, 'health');
    expect(ungated).toEqual([]);
  });

  it('every clinical leaf is gated on medical, not wellness', () => {
    const health = NAVIGATION_ITEMS.find((m) => m.id === 'health')!;
    const wrong: string[] = [];
    walk(health.children ?? [], (item) => {
      const child = item as NavChild;
      if (child.children?.length) return;
      if (child.path.startsWith('/health/medical/') && child.moduleKey !== 'medical') {
        wrong.push(child.path);
      }
    }, 'health');
    expect(wrong).toEqual([]);
  });

  it('HEALTH_PATHS matches the sitemap leaves exactly, so no leaf is left a placeholder', () => {
    const health = NAVIGATION_ITEMS.find((m) => m.id === 'health')!;
    const leaves: string[] = [];
    walk(health.children ?? [], (item) => {
      const child = item as NavChild;
      if (child.children?.length) return;
      leaves.push(child.path);
    }, 'health');

    const routed = new Set<string>(Object.values(HEALTH_PATHS));
    expect([...new Set(leaves)].filter((p) => !routed.has(p)).sort()).toEqual([]);
    expect([...routed].filter((p) => !leaves.includes(p)).sort()).toEqual([]);
  });

  it('section redirects cover /health and every Health group', () => {
    const from = new Set(SECTION_REDIRECTS.map((r) => r.from));
    expect(from.has('/health')).toBe(true);
    for (const group of ['medical', 'spa', 'nutrition', 'physio', 'personal-training']) {
      expect(from.has(`/health/${group}`)).toBe(true);
    }
  });

  it('Health owns its own paths so a reload lands back in the section', () => {
    expect(resolveModuleForPath(HEALTH_PATHS.medicalDashboard)?.id).toBe('health');
    expect(resolveModuleForPath(HEALTH_PATHS.myTraining)?.id).toBe('health');
    expect(resolveModuleForPath(HEALTH_PATHS.physioReferrals)?.id).toBe('health');
  });
});

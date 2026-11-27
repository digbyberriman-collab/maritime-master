/**
 * Vessel root and group redirects skip a path a module manifest routes
 * itself (platform-prep PP3; X1 PR-X1-A part 3), as the workspace section
 * redirects already do. The crew manifest's index page (the crew dashboard,
 * X1-10B) serves `/v/:vesselCode/crew`, so the generated `crew -> list`
 * redirect is not declared beside it.
 *
 * The site map reads the module registry when it loads, so this file swaps
 * in a registry that holds every real manifest plus one fixture redirect.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

vi.mock('@/app/registry/modules', async () => {
  const actual = await vi.importActual<typeof import('@/app/registry/modules')>('@/app/registry/modules');
  const { buildRegistry } = await vi.importActual<typeof import('@/app/registry/registry')>('@/app/registry/registry');
  return {
    MODULE_REGISTRY: buildRegistry([
      ...actual.MODULE_REGISTRY.manifests,
      {
        id: 'bridge-redirect-fixture',
        label: 'Bridge redirect (fixture)',
        scopes: ['vessel'],
        routes: [{ scope: 'vessel', path: 'departments/bridge', redirectTo: '../bridge-home' }],
      },
    ]),
  };
});

import { MODULE_REGISTRY } from '@/app/registry/modules';
import { VESSEL_ROOT_REDIRECTS } from '@/config/sitemap';

describe('VESSEL_ROOT_REDIRECTS with a manifest-routed root', () => {
  it('the fixture registry loads with the real manifests', () => {
    expect(MODULE_REGISTRY.problems).toEqual([]);
    expect(MODULE_REGISTRY.hasPage('/v/:vesselCode/crew')).toBe(true);
  });

  it('skips a module root a manifest routes as a page', () => {
    expect(VESSEL_ROOT_REDIRECTS.map((r) => r.from)).not.toContain('crew');
  });

  it('skips a group a manifest routes as a redirect too', () => {
    expect(VESSEL_ROOT_REDIRECTS.map((r) => r.from)).not.toContain('departments/bridge');
  });

  it('keeps every other root and group redirect', () => {
    const froms = VESSEL_ROOT_REDIRECTS.map((r) => r.from);
    expect(froms).toEqual(expect.arrayContaining(['safety', 'vessel', 'departments', 'departments/deck', 'departments/dive/tools']));
    expect(VESSEL_ROOT_REDIRECTS.find((r) => r.from === 'safety')?.to).toBe('drills');
  });
});

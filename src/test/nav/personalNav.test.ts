/**
 * The personal tree (spec §8; gap/10 "Personal and global"): its sections,
 * the company settings gate, the vessel module setting on Hours of rest
 * (D-109), the planned leaves, and the routes and titles built from it.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { PERSONAL_SETTINGS_ROUTES, buildPersonalNav } from '@/config/personalNav';
import { NAVIGATION_ITEMS, PERSONAL_PLACEHOLDER_LEAVES, navLeaves } from '@/config/sitemap';
import { personalNavFor } from '@/app/nav/usePersonalNav';
import { resolveModuleForPath } from '@/shared/lib/moduleNavigation';
import { resolvePageNavigation } from '@/shared/lib/pageNavigation';
import { SETTINGS_SECTION_IDS, isSettingsSection, settingsSectionPath } from '@/shared/utils/settingsPermissions';

const labels = (role: string | null) => navLeaves(personalNavFor(role)).map((l) => l.label);

describe('buildPersonalNav', () => {
  it('lists the five sections, in order', () => {
    expect(buildPersonalNav(() => true).map((s) => [s.kind, s.label])).toEqual([
      ['section', 'Account'],
      ['section', 'Notifications'],
      ['section', 'My work'],
      ['section', 'Data & help'],
      ['section', 'Company settings'],
    ]);
  });

  it('gives every leaf the personal scope and a /me URL (the inbox at /inbox, Help at /help)', () => {
    const leaves = navLeaves(buildPersonalNav(() => true));
    expect(leaves.every((l) => l.scope === 'personal')).toBe(true);
    expect(leaves.filter((l) => !l.path.startsWith('/me/')).map((l) => l.path)).toEqual(['/inbox', '/help/how-to-guides', '/help/support']);
    expect(new Set(leaves.map((l) => l.id)).size).toBe(leaves.length);
  });

  it('Data & help: data exports, then Help\'s guides and its one Support page (no /me/support)', () => {
    const section = buildPersonalNav(() => true).find((s) => s.label === 'Data & help');
    expect((section?.children ?? []).map((l) => [l.label, l.path, l.status])).toEqual([
      ['Data & exports', '/me/data-exports', 'live'],
      ['How-to guides', '/help/how-to-guides', 'live'],
      ['Support', '/help/support', 'live'],
    ]);
    // The Support leaf keeps its id, so a saved sidebar layout or favourite still finds it.
    expect(section?.children?.find((l) => l.label === 'Support')?.id).toBe('me-support');
    expect(navLeaves(buildPersonalNav(() => true)).some((l) => l.path === '/me/support')).toBe(false);
  });

  it('drops the company settings section for a role without any', () => {
    expect(buildPersonalNav(() => false).map((s) => s.label)).not.toContain('Company settings');
    expect(labels('crew')).not.toContain('Permissions');
    expect(labels('crew')).toContain('Profile');
  });

  it('opens the company settings each role may open, as canAccessSection says', () => {
    expect(labels('dpa')).toEqual(expect.arrayContaining(['Vessel access', 'Permissions', 'Integrations']));
    // A master gets vessel access and audit visibility, never permissions.
    expect(labels('master')).toEqual(expect.arrayContaining(['Vessel access', 'Audit visibility']));
    expect(labels('master')).not.toContain('Permissions');
    expect(labels(null)).not.toContain('Vessel access');
  });

  it('My work: Hours of rest carries the vessel module setting crew_hor; Training carries none (D-109)', () => {
    const section = buildPersonalNav(() => true).find((s) => s.label === 'My work');
    const leaf = (label: string) => section?.children?.find((l) => l.label === label);
    expect(leaf('Hours of rest')?.path).toBe('/me/hours-of-rest');
    expect(leaf('Hours of rest')?.moduleSetting).toBe('crew_hor');
    // /me/training is the user's own development plan, not the vessel's Crew Training.
    expect(leaf('Training')?.path).toBe('/me/training');
    expect(leaf('Training')?.moduleSetting).toBeUndefined();
    // No other personal leaf depends on a vessel's settings.
    const gated = navLeaves(buildPersonalNav(() => true)).filter((l) => l.moduleSetting).map((l) => l.id);
    expect(gated).toEqual(['me-hours-of-rest']);
  });

  it('marks the leaves with no page yet as planned', () => {
    const planned = navLeaves(buildPersonalNav(() => true)).filter((l) => l.status === 'planned').map((l) => l.path);
    expect(planned.sort()).toEqual(
      ['/me/billing', '/me/compliance', '/me/documents', '/me/leave', '/me/logs', '/me/signature', '/me/templates'].sort(),
    );
  });
});

describe('routes and titles from the tree', () => {
  it('routes every settings section with a page, the rest to Coming Soon; Support is the Help page', () => {
    const routed = new Set(PERSONAL_SETTINGS_ROUTES.map((r) => r.section));
    const placeholders = new Set(PERSONAL_PLACEHOLDER_LEAVES.map((l) => l.path));
    const elsewhere = new Set(['support']);
    for (const id of SETTINGS_SECTION_IDS) expect(routed.has(id) || placeholders.has(id) || elsewhere.has(id), id).toBe(true);
    expect(routed.has('support')).toBe(false);
    expect(PERSONAL_SETTINGS_ROUTES.find((r) => r.section === 'notifications')?.path).toBe('notifications/channels');
    expect(placeholders).toEqual(new Set(['signature', 'documents', 'leave', 'templates', 'compliance', 'billing', 'logs']));
  });

  it('knows the section ids and their URLs', () => {
    expect(isSettingsSection('security')).toBe(true);
    expect(isSettingsSection('nothing')).toBe(false);
    expect(isSettingsSection(null)).toBe(false);
    expect(settingsSectionPath('security')).toBe('/me/security');
    expect(settingsSectionPath('notifications')).toBe('/me/notifications/channels');
  });

  it('resolves /me pages and the inbox to the personal tree (titles, breadcrumbs)', () => {
    expect(NAVIGATION_ITEMS.find((m) => m.id === 'personal')?.path).toBe('/me');
    expect(resolveModuleForPath('/me/security')?.id).toBe('personal');
    expect(resolveModuleForPath('/me/training')?.id).toBe('personal');
    expect(resolveModuleForPath('/inbox')?.id).toBe('personal');
    const security = resolvePageNavigation('/me/security', '', 'personal');
    expect(security.title).toBe('Security');
    expect(security.crumbs.map((c) => c.label)).toEqual(['My account', 'Account', 'Security']);
    expect(security.crumbs[1].section).toBe(true);
    expect(resolvePageNavigation('/me/notifications/channels', '', 'personal').title).toBe('Channels & alerts');
    expect(resolvePageNavigation('/me/notifications', '', 'personal').title).toBe('In-app');
    expect(resolvePageNavigation('/inbox', '', 'personal').title).toBe('Inbox');
  });

  it('resolves /help pages to the personal tree, under My account › Data & help', () => {
    for (const path of ['/help/how-to-guides', '/help/support']) expect(resolveModuleForPath(path)?.id).toBe('personal');
    const support = resolvePageNavigation('/help/support', '?subject=x', 'personal');
    expect(support.title).toBe('Support');
    expect(support.crumbs.map((c) => c.label)).toEqual(['My account', 'Data & help', 'Support']);
    expect(support.crumbs[0].path).toBe('/me');
    const guides = resolvePageNavigation('/help/how-to-guides', '', 'personal');
    expect(guides.title).toBe('How-to guides');
    expect(guides.crumbs.map((c) => c.label)).toEqual(['My account', 'Data & help', 'How-to guides']);
  });
});

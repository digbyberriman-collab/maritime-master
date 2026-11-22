/**
 * The personal tree (spec §8; gap/10 "Personal and global"): its sections,
 * the company settings gate, the planned leaves, and the routes and titles
 * built from it.
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

  it('gives every leaf the personal scope and a /me URL (the inbox at /inbox)', () => {
    const leaves = navLeaves(buildPersonalNav(() => true));
    expect(leaves.every((l) => l.scope === 'personal')).toBe(true);
    expect(leaves.filter((l) => !l.path.startsWith('/me/') && l.path !== '/inbox')).toEqual([]);
    expect(new Set(leaves.map((l) => l.id)).size).toBe(leaves.length);
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

  it('marks the leaves with no page yet as planned', () => {
    const planned = navLeaves(buildPersonalNav(() => true)).filter((l) => l.status === 'planned').map((l) => l.path);
    expect(planned.sort()).toEqual(
      ['/me/billing', '/me/compliance', '/me/documents', '/me/leave', '/me/logs', '/me/signature', '/me/templates'].sort(),
    );
  });
});

describe('routes and titles from the tree', () => {
  it('routes every settings section with a page, the rest to Coming Soon', () => {
    const routed = new Set(PERSONAL_SETTINGS_ROUTES.map((r) => r.section));
    const placeholders = new Set(PERSONAL_PLACEHOLDER_LEAVES.map((l) => l.path));
    for (const id of SETTINGS_SECTION_IDS) expect(routed.has(id) || placeholders.has(id), id).toBe(true);
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
});

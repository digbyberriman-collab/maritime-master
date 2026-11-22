/**
 * Dead shell code stays gone (gap/10 IA22; BUILD-PLAN S6/S7; spec §2.1 L1c).
 *
 * The top bar, the vessel tab row, the account menu and the URL-routed
 * personal area replaced these. Each was deleted only once nothing imported
 * it; this test keeps it that way: the files are gone, and no source file
 * imports them or names them again.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

const DELETED_FILES = [
  'src/shared/components/layout/ModuleTopNav.tsx',
  'src/shared/components/layout/FloatingQuickActions.tsx',
  'src/shared/components/layout/SidebarAccountMenu.tsx',
  'src/modules/vessels/components/VesselSelector.tsx',
  'src/modules/settings/components/SettingsHeader.tsx',
  'src/modules/settings/components/SettingsSidebar.tsx',
  'src/modules/settings/components/SettingsMobileNav.tsx',
] as const;

/** The names the deleted modules exported (default exports were imported under these). */
const DELETED_NAMES = [
  'ModuleTopNav',
  'FloatingQuickActions',
  'SidebarAccountMenu',
  'VesselSelector',
  'SettingsHeader',
  'SettingsSidebar',
  'SettingsMobileNav',
] as const;

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, acc);
    else if (/\.(ts|tsx)$/.test(name)) acc.push(path);
  }
  return acc;
}

const THIS_FILE = 'src/test/shell/deadCode.test.ts';
const files = sourceFiles(SRC)
  .map((path) => ({ path: relative(ROOT, path), text: readFileSync(path, 'utf8') }))
  .filter((f) => f.path !== THIS_FILE);

describe('dead shell code (IA22)', () => {
  it.each(DELETED_FILES)('%s is gone', (file) => {
    expect(existsSync(join(ROOT, file))).toBe(false);
  });

  it.each(DELETED_NAMES)('nothing imports or mocks %s', (name) => {
    const importer = new RegExp(`(from\\s+['"][^'"]*/${name}['"])|(import\\(['"][^'"]*/${name}['"]\\))|(vi\\.mock\\(['"][^'"]*/${name}['"])`);
    const offenders = files.filter((f) => importer.test(f.text)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it.each(DELETED_NAMES)('no component renders or re-exports %s', (name) => {
    const use = new RegExp(`<${name}[\\s/>]|export\\s*\\{[^}]*\\b${name}\\b`);
    const offenders = files.filter((f) => use.test(f.text)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('the sidebar has no dashboard-links branch left', () => {
    const sidebar = readFileSync(join(ROOT, 'src/shared/components/layout/SidebarNavigation.tsx'), 'utf8');
    expect(sidebar).not.toMatch(/DASHBOARD_LINKS/);
  });

  it('the settings page renders no chrome of its own inside the shell', () => {
    const settings = readFileSync(join(ROOT, 'src/modules/settings/pages/Settings.tsx'), 'utf8');
    expect(settings).not.toMatch(/SettingsHeader|SettingsSidebar|SettingsMobileNav|min-h-screen/);
  });
});

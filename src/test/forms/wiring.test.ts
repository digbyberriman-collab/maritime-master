/**
 * Wiring of Fleet › Forms & Checklists (X5-06B; gap/02 FC1–FC7, X1;
 * DECISIONS C6, D-01, D-04, D-X5-13, D-X5-20; gap/00 A2):
 *
 * - the manifest registers with no problems, data only, with the five
 *   fleet routes (overview, new, area, edit, preview) on lazy pages, each
 *   guarded by its capability; the Forms & Checklists leaf is
 *   `fleet.compliance` 20, beta, gated by the view key;
 * - registering `/fleet/forms` arms the legacy `/ism/forms/templates`
 *   redirect (PP3 pendingTarget) and `/fleet/forms/:area` serves the
 *   counterparts of the vessel Safety Checklists and Technical Forms;
 * - every key named is in the catalogue;
 * - the pages read only through the module's typed pending client, never
 *   the raw client; every RPC they call is defined in 20261124040500 and
 *   declared pending; status never changes through a table write outside
 *   the D-X5-20 fallback (the draft save writes content only);
 * - `useVesselFormTemplates` is exported from `@/modules/forms`, and the
 *   vessel Safety Checklists page uses it and the run statistics, with no
 *   hard-coded number and no raw palette class;
 * - the builder reuses the ISM form renderer; the pages are reached only
 *   through the manifest.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import manifest from '@/modules/forms/module';
import * as forms from '@/modules/forms';
import { FORMS_CAPABILITIES, FORMS_CAPS, FORMS_FLEET_PATHS, FORMS_PARAMS, fleetFormsPath } from '@/modules/forms/paths';
import { MODULE_REGISTRY } from '@/app/registry/modules';
import { listCatalogueCapabilities } from '@/lib/permissions/catalogue';
import { NAVIGATION_ITEMS } from '@/config/sitemap';
import { legacyEntryApplies, legacyEntryFor } from '@/app/router/legacyResolve';
import type { NavChild } from '@/config/navigation-types';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

/** The files of this slice (the module's pages, components, hooks and libs it added). */
const SLICE_FILES = [
  'src/modules/forms/module.ts',
  'src/modules/forms/paths.ts',
  'src/modules/forms/pages/FleetFormsOverviewPage.tsx',
  'src/modules/forms/pages/FleetFormsAreaPage.tsx',
  'src/modules/forms/pages/FormTemplateBuilderPage.tsx',
  'src/modules/forms/pages/FormTemplatePreviewPage.tsx',
  'src/modules/forms/hooks/useFleetFormTemplates.ts',
  'src/modules/forms/hooks/useVesselFormTemplates.ts',
  'src/modules/forms/lib/catalogueModel.ts',
  'src/modules/forms/lib/templateSchema.ts',
  ...readdirSync(join(ROOT, 'src/modules/forms/components')).map((f) => `src/modules/forms/components/${f}`),
];
const sources = SLICE_FILES.map((file) => ({ file, text: read(file) }));
const allSource = sources.map((s) => s.text).join('\n');
const SQL = read('supabase/migrations/20261124040500_fleet_form_templates.sql');
const pending = read('src/modules/forms/types/db.pending.ts');
const checklists = read('src/modules/ism/pages/ChecklistsPage.tsx');

const leaves = (items: readonly NavChild[], acc: NavChild[] = []): NavChild[] => {
  for (const it of items) {
    if (it.children?.length) leaves(it.children, acc);
    else acc.push(it);
  }
  return acc;
};

describe('forms manifest', () => {
  it('registers the five fleet pages, lazy, each behind its capability', () => {
    expect(MODULE_REGISTRY.problems).toEqual([]);
    expect(MODULE_REGISTRY.manifests.find((m) => m.id === 'forms')).toBe(manifest);
    const routes = MODULE_REGISTRY.routes.filter((r) => r.moduleId === 'forms');
    expect(routes.map((r) => r.fullPath).sort()).toEqual([
      '/fleet/forms',
      '/fleet/forms/:area',
      '/fleet/forms/:templateId/edit',
      '/fleet/forms/:templateId/preview',
      '/fleet/forms/new',
    ]);
    expect(FORMS_FLEET_PATHS).toEqual({
      index: 'forms',
      create: 'forms/new',
      area: 'forms/:area',
      edit: 'forms/:templateId/edit',
      preview: 'forms/:templateId/preview',
    });
    const guards = Object.fromEntries((manifest.routes ?? []).map((r) => [r.path, 'guard' in r ? r.guard : null]));
    expect(guards).toEqual({
      forms: { kind: 'capability', capability: 'fleet.operations.fleet_checklists.view' },
      'forms/new': { kind: 'capability', capability: 'fleet.operations.fleet_checklists.create' },
      'forms/:area': { kind: 'capability', capability: 'fleet.operations.fleet_checklists.view' },
      'forms/:templateId/edit': { kind: 'capability', capability: 'fleet.operations.fleet_checklists.edit' },
      'forms/:templateId/preview': { kind: 'capability', capability: 'fleet.operations.fleet_checklists.view' },
    });
    const text = read('src/modules/forms/module.ts');
    for (const page of ['FleetFormsOverviewPage', 'FleetFormsAreaPage', 'FormTemplateBuilderPage', 'FormTemplatePreviewPage']) {
      expect(text).toContain(`page: () => import('@/modules/forms/pages/${page}')`);
    }
    expect(FORMS_PARAMS).toEqual({ vessel: 'vessel', tab: 'tab', area: 'area' });
    expect(fleetFormsPath.create('technical-forms')).toBe('/fleet/forms/new?area=technical-forms');
    expect(fleetFormsPath.edit('t1')).toBe('/fleet/forms/t1/edit');
  });

  it('is data only: icons, nav builders, types and paths', () => {
    const imports = Array.from(read('src/modules/forms/module.ts').matchAll(/^import [^;]*? from '([^']+)';$/gm)).map((m) => m[1]);
    expect(imports.sort()).toEqual(['./paths', '@/app/registry/types', '@/config/navBuilders', '@/modules/fleet/paths', 'lucide-react']);
    const pathImports = Array.from(read('src/modules/forms/paths.ts').matchAll(/^import (type )?.* from '([^']+)';$/gm)).map((m) => [m[1], m[2]]);
    expect(pathImports).toEqual([['type ', '@/lib/permissions/types']]);
  });

  it('contributes the Forms & Checklists leaf: fleet.compliance 20, beta, gated by the view key', () => {
    expect(manifest.nav?.map((f) => [f.slot, f.order, f.node.label, f.node.path, f.node.capability, f.node.status])).toEqual([
      ['fleet.compliance', 20, 'Forms & Checklists', '/fleet/forms', FORMS_CAPS.view, 'beta'],
    ]);
    const leaf = leaves(NAVIGATION_ITEMS).find((l) => l.path === '/fleet/forms');
    expect(leaf).toMatchObject({ label: 'Forms & Checklists', status: 'beta', capability: 'fleet.operations.fleet_checklists.view' });
  });

  it('arms the legacy /ism/forms/templates redirect and serves the counterparts of the vessel pages', () => {
    const entry = legacyEntryFor('/ism/forms/templates');
    expect(entry?.pendingTarget).toBe('/fleet/forms');
    expect(entry && legacyEntryApplies(entry)).toBe(true);
    expect(MODULE_REGISTRY.hasPage('/fleet/forms/:area')).toBe(true);
  });

  it('every key the manifest declares or the pages name is in the catalogue', () => {
    const catalogue = new Set(listCatalogueCapabilities());
    expect(manifest.capabilities).toEqual(FORMS_CAPABILITIES);
    for (const key of FORMS_CAPABILITIES) expect(catalogue.has(key), key).toBe(true);
    const literal = new Set(Array.from(`${allSource}\n${checklists}`.matchAll(/'((?:fleet|vessel)\.[a-z_]+\.[a-z_]+\.[a-z_]+)'/g)).map((m) => m[1]));
    expect(literal.size).toBeGreaterThanOrEqual(4);
    for (const key of literal) expect(catalogue.has(key), key).toBe(true);
  });
});

describe('database objects', () => {
  const definedFunctions = new Set(Array.from(SQL.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\s*\(/g), (m) => m[1]));
  const granted = new Set(Array.from(SQL.matchAll(/GRANT EXECUTE ON FUNCTION public\.(\w+)\([^)]*\) TO authenticated/g), (m) => m[1]));
  const rpcs = new Set(Array.from(allSource.matchAll(/\.rpc\(\s*'([a-z_]+)'/g), (m) => m[1]));
  const tables = new Set(Array.from(allSource.matchAll(/\.from\(\s*'([a-z_]+)'/g), (m) => m[1]));

  it('reads the live templates and the two 040500 tables; calls only the run statistics directly', () => {
    expect([...tables].sort()).toEqual(['form_template_vessel_settings', 'form_templates']);
    expect([...rpcs].sort()).toEqual(['form_template_run_stats']);
    for (const fn of rpcs) {
      expect(definedFunctions.has(fn), `${fn} in 040500`).toBe(true);
      expect(granted.has(fn), `${fn} granted to authenticated`).toBe(true);
      expect(pending, `${fn} pending`).toMatch(new RegExp(`\\b${fn}: \\{`));
    }
    expect(pending).toMatch(/\bform_template_vessel_settings: PendingTable</);
    expect(SQL).toContain('CREATE TABLE IF NOT EXISTS public.form_template_vessel_settings');
  });

  it('reads and writes only through the typed pending client, never the raw client', () => {
    for (const { file, text } of [...sources, { file: 'src/modules/ism/pages/ChecklistsPage.tsx', text: checklists }]) {
      expect(text, file).not.toMatch(/@\/integrations\/supabase\/client/);
      if (/\.(rpc|from)\(\s*'/.test(text)) expect(text, file).toMatch(/formsDb/);
    }
  });

  it('the status changes only through the definers: the draft save writes content, inserts a DRAFT and filters on DRAFT', () => {
    const hooks = read('src/modules/forms/hooks/useFleetFormTemplates.ts');
    expect(hooks).toMatch(/status: 'DRAFT', created_by: userId/);
    expect(hooks).toMatch(/\.eq\('status', 'DRAFT'\)/);
    expect(hooks).toMatch(/q\.eq\('updated_at', input\.expectedUpdatedAt\)/);
    for (const { file, text } of sources) {
      expect(text, file).not.toMatch(/status:\s*'(PUBLISHED|ARCHIVED|SUPERSEDED)'/);
      expect(text, file).not.toMatch(/\.delete\(\)/);
    }
    // The builder publishes through the mutations (form_template_publish, D-X5-20 fallback inside).
    expect(read('src/modules/forms/pages/FormTemplateBuilderPage.tsx')).toMatch(/mutations\.publish\.mutateAsync/);
  });

  it('every select names its columns (no select("*"), no form_schema in the list read)', () => {
    expect(allSource).not.toMatch(/\.select\(\s*\)|\.select\('\*'\)/);
    const model = read('src/modules/forms/lib/catalogueModel.ts');
    const list = /LIVE_LIST_COLUMNS =\s*'([^']+)'/.exec(model)?.[1] ?? '';
    expect(list).not.toContain('form_schema');
  });
});

describe('public API and the vessel page', () => {
  it('exports useVesselFormTemplates and the catalogue hooks from @/modules/forms', () => {
    expect(typeof forms.useVesselFormTemplates).toBe('function');
    expect(typeof forms.useFormTemplateCatalogue).toBe('function');
    expect(typeof forms.useFormTemplateRunStats).toBe('function');
    expect(typeof forms.saveTemplateDraft).toBe('function');
  });

  it('the vessel Safety Checklists page reads the Safety templates and the run statistics, never a hard-coded number or raw palette', () => {
    expect(checklists).toMatch(/useVesselFormTemplates\(vesselId, 'safety'\)/);
    expect(checklists).toMatch(/useFormTemplateRunStats\(\[vesselId\], 'safety'/);
    expect(checklists).toMatch(/<KpiTile/);
    expect(checklists).not.toMatch(/>\s*0\s*</);
    expect(checklists).not.toMatch(/\b(text|bg|border)-(red|green|blue|purple|orange|yellow|gray|slate)-\d{2,3}\b/);
    expect(checklists).not.toMatch(/\bdark:/);
    expect(checklists).not.toMatch(/useFormTemplates\b/);
  });

  it('the builder and the preview reuse the ISM form renderer; the slice holds no raw palette, hex or dark: class', () => {
    expect(read('src/modules/forms/components/TemplatePreview.tsx')).toMatch(/import FieldRenderer from '@\/modules\/ism\/forms\/components\/FieldRenderer'/);
    for (const { file, text } of sources) {
      expect(text, file).not.toMatch(/\b(text|bg|border|ring)-(red|green|blue|purple|orange|yellow|amber|emerald|gray|slate|zinc)-\d{2,3}\b/);
      expect(text, file).not.toMatch(/#[0-9a-fA-F]{6}\b|rgb\(/);
      expect(text, file).not.toMatch(/\bdark:/);
      expect(text, file).not.toMatch(/\bas any\b|@ts-ignore|eslint-disable/);
    }
  });

  it('the pages are reached only through the manifest (lazy)', () => {
    for (const page of ['FleetFormsOverviewPage', 'FleetFormsAreaPage', 'FormTemplateBuilderPage', 'FormTemplatePreviewPage']) {
      const importers = walk(join(ROOT, 'src'))
        .filter((f) => new RegExp(`(import\\(|from )'[^']*${page}'`).test(readFileSync(f, 'utf8')))
        .map((f) => relative(ROOT, f))
        .filter((f) => f !== `src/modules/forms/pages/${page}.tsx`);
      expect(importers, page).toEqual(['src/modules/forms/module.ts']);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { getCatalogueEntry, listCatalogueCapabilities, listCatalogueEntries } from '@/lib/permissions/catalogue';
import { isCapabilityKey } from '@/lib/permissions/types';

interface ExpandedSub {
  path: string;
  actions: string[];
  crewCreates?: boolean;
  crewSigns?: boolean;
  legacy: Record<string, string>;
}
interface ExpandedCatalogue {
  subcategories: ExpandedSub[];
  capabilities: { key: string }[];
}
interface WorkbookScript {
  loadCatalogue(app: string): unknown;
  expand(cat: unknown): ExpandedCatalogue;
}

/**
 * src/lib/permissions/catalogue.ts is a flattened copy of
 * docs/permissions/catalogues/storm.json. This test expands the JSON with the
 * workbook script's own rules and fails on any drift, printing the row the
 * TS table should hold.
 */
async function loadExpanded(): Promise<ExpandedCatalogue> {
  const script = (await import('../../../../scripts/permissions/build-matrix-workbooks.mjs')) as unknown as WorkbookScript;
  return script.expand(script.loadCatalogue('storm'));
}

function expectedRow(sub: ExpandedSub): string {
  const flags = [sub.crewCreates && 'crewCreates', sub.crewSigns && 'crewSigns'].filter(Boolean).join(' ');
  const legacy = Object.entries(sub.legacy ?? {})
    .map(([a, f]) => `${a}=${f}`)
    .join(' ');
  const parts = [`'${sub.path}'`, `'${sub.actions.join(' ')}'`];
  if (flags || legacy) parts.push(`'${flags}'`);
  if (legacy) parts.push(`'${legacy}'`);
  return `[${parts.join(', ')}],`;
}

describe('capability catalogue (TS) matches docs/permissions/catalogues/storm.json', () => {
  it('has the same subcategories, actions, crew flags and legacy flags', async () => {
    const expanded = await loadExpanded();
    const mismatches: string[] = [];
    for (const sub of expanded.subcategories) {
      const entry = getCatalogueEntry(sub.path);
      const same =
        entry &&
        entry.actions.join(' ') === sub.actions.join(' ') &&
        entry.crewCreates === Boolean(sub.crewCreates) &&
        entry.crewSigns === Boolean(sub.crewSigns) &&
        JSON.stringify(entry.legacy) === JSON.stringify(sub.legacy ?? {});
      if (!same) mismatches.push(expectedRow(sub));
    }
    expect(mismatches, `update src/lib/permissions/catalogue.ts:\n${mismatches.join('\n')}`).toEqual([]);

    const jsonPaths = new Set(expanded.subcategories.map((s) => s.path));
    const extra = listCatalogueEntries().filter((e) => !jsonPaths.has(e.path)).map((e) => e.path);
    expect(extra, 'rows no longer in the catalogue').toEqual([]);
  });

  it('lists exactly the catalogue capability keys', async () => {
    const expanded = await loadExpanded();
    expect(listCatalogueCapabilities()).toEqual(expanded.capabilities.map((c) => c.key));
  });

  it('every catalogue key has the four-segment shape', () => {
    const bad = listCatalogueCapabilities().filter((key) => !isCapabilityKey(key));
    expect(bad).toEqual([]);
  });
});

/**
 * The area model (src/modules/forms/lib/areaModel.ts; gap/02 FC1, FC2;
 * DECISIONS C6):
 *
 * - the area and kind lists are the migration's CHECKs, and every definer
 *   that takes an area accepts the same list;
 * - a label and a "Crew find these in …" location for every area;
 * - URL slugs: `technical-forms` ↔ `technical_forms`, the rest the same,
 *   unknown (and the stored spelling of technical forms) → no area;
 * - Unsorted for no area, and grouping in the overview's order with
 *   Unsorted last.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AREA_CREW_LOCATIONS,
  AREA_LABELS,
  FORM_KIND_LABELS,
  FORM_TEMPLATE_AREAS,
  FORM_TEMPLATE_KINDS,
  UNSORTED_LABEL,
  areaCrewLocation,
  areaFromSlug,
  areaLabel,
  areaSlug,
  formKindLabel,
  groupByArea,
  isFormTemplateArea,
  isFormTemplateKind,
} from '@/modules/forms/lib/areaModel';

const ROOT = process.cwd();
const SQL = readFileSync(join(ROOT, 'supabase/migrations/20261124040500_fleet_form_templates.sql'), 'utf8');

const checkList = (constraint: string): string[] => {
  const line = SQL.split('\n').find((l) => l.includes(`ADD CONSTRAINT ${constraint} CHECK`)) ?? '';
  return [...line.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
};

describe('the lists', () => {
  it('are the migration CHECKs, in order', () => {
    expect([...FORM_TEMPLATE_AREAS]).toEqual(checkList('form_templates_area_check'));
    expect([...FORM_TEMPLATE_KINDS]).toEqual(checkList('form_templates_form_kind_check'));
  });

  it('match the area list every definer validates (move, reorder, run statistics)', () => {
    const lists = [...SQL.matchAll(/p_area NOT IN \(([^)]*)\)/g)].map((m) => [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]));
    expect(lists).toHaveLength(3);
    for (const list of lists) expect(list).toEqual([...FORM_TEMPLATE_AREAS]);
  });

  it('give every area a label and a vessel location, and every kind a label', () => {
    expect(Object.keys(AREA_LABELS)).toEqual([...FORM_TEMPLATE_AREAS]);
    expect(Object.keys(AREA_CREW_LOCATIONS)).toEqual([...FORM_TEMPLATE_AREAS]);
    expect(Object.keys(FORM_KIND_LABELS)).toEqual([...FORM_TEMPLATE_KINDS]);
    for (const area of FORM_TEMPLATE_AREAS) {
      expect(areaLabel(area)).toBe(AREA_LABELS[area]);
      expect(areaCrewLocation(area)).toMatch(/^[A-Z][A-Za-z ]+ › [A-Z]/);
    }
    expect(AREA_LABELS.charter).toBe('Charter / Trip');
    expect(AREA_CREW_LOCATIONS.safety).toBe('Safety › Checklists');
    expect(AREA_CREW_LOCATIONS.sms).toBe('Safety › SMS Forms');
  });

  it('reads Unsorted for no area or an unknown one', () => {
    expect(areaLabel(null)).toBe(UNSORTED_LABEL);
    expect(areaLabel('galley')).toBe('Unsorted');
    expect(areaCrewLocation(null)).toBeNull();
    expect(formKindLabel('passage_plan')).toBe('Passage plan');
    expect(formKindLabel('memo')).toBeNull();
    expect(isFormTemplateArea('ptw')).toBe(true);
    expect(isFormTemplateArea('PTW')).toBe(false);
    expect(isFormTemplateKind('permit')).toBe(true);
  });
});

describe('URL slugs', () => {
  it('round-trip every area; technical forms has a hyphen', () => {
    for (const area of FORM_TEMPLATE_AREAS) expect(areaFromSlug(areaSlug(area))).toBe(area);
    expect(areaSlug('technical_forms')).toBe('technical-forms');
    expect(areaFromSlug('technical-forms')).toBe('technical_forms');
    expect(areaSlug('safety')).toBe('safety');
  });

  it('answer no area for unknown, empty or non-canonical slugs', () => {
    expect(areaFromSlug('technical_forms')).toBeNull();
    expect(areaFromSlug('Safety')).toBeNull();
    expect(areaFromSlug('galley')).toBeNull();
    expect(areaFromSlug('')).toBeNull();
    expect(areaFromSlug(undefined)).toBeNull();
  });
});

describe('grouping', () => {
  const items = [
    { id: 'a', area: 'sms' },
    { id: 'b', area: null },
    { id: 'c', area: 'safety' },
    { id: 'd', area: 'sms' },
    { id: 'e', area: 'galley' },
  ];

  it('groups in the overview order, keeps the order inside a group, Unsorted last', () => {
    const groups = groupByArea(items, (i) => i.area);
    expect(groups.map((g) => [g.area, g.label, g.items.map((i) => i.id)])).toEqual([
      ['safety', 'Safety', ['c']],
      ['sms', 'SMS forms', ['a', 'd']],
      [null, 'Unsorted', ['b', 'e']],
    ]);
  });

  it('lists empty areas when asked, but never an empty Unsorted', () => {
    const groups = groupByArea([{ id: 'x', area: 'crew' }], (i) => i.area, true);
    expect(groups.map((g) => g.area)).toEqual([...FORM_TEMPLATE_AREAS]);
    expect(groups.find((g) => g.area === 'crew')?.items).toHaveLength(1);
  });
});

/**
 * The publish checks (src/modules/forms/lib/publishChecks.ts; gap/02 FC3
 * "block publish with an empty section", W2):
 *
 * - the blocker order is the order form_template_publish_blocker returns;
 * - every case below gets the server's answer, and the SQL test copies the
 *   same cases (supabase/tests/sql/fleet/form_templates.test.sql, between
 *   its publish-cases markers) for the definer and the helper;
 * - sections, issues pointing at their field, the server's text reading
 *   (`->>` and space-only `btrim`).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PUBLISH_BLOCKERS,
  publishBlocker,
  publishBlockers,
  publishIssues,
  schemaFields,
  templateSections,
} from '@/modules/forms/lib/publishChecks';

const ROOT = process.cwd();
const SQL = readFileSync(join(ROOT, 'supabase/migrations/20261124040500_fleet_form_templates.sql'), 'utf8');
const SQL_TEST = readFileSync(join(ROOT, 'supabase/tests/sql/fleet/form_templates.test.sql'), 'utf8');

type Case = [label: string, name: string, schema: string, scope: string, vessels: number, outcome: string];

/** The cases the SQL test copies. */
const CASES: readonly Case[] = [
  ['flat_items', 'Deck rounds', '{"fields": [{"type": "checkbox", "label": "Lifejackets stowed"}, {"type": "yes_no", "label": "Hatches closed"}]}', 'FLEET', 0, 'ok'],
  ['sections', 'Engine rounds', '{"fields": [{"type": "section", "label": "Engine room"}, {"type": "number", "label": "Oil pressure"}, {"type": "section", "label": "Steering"}, {"type": "checkbox", "label": "Gear tested"}]}', 'FLEET', 0, 'ok'],
  ['leading_items', 'Bridge checks', '{"fields": [{"type": "checkbox", "label": "Radar on"}, {"type": "section", "label": "Comms"}, {"type": "checkbox", "label": "VHF tested"}]}', 'FLEET', 0, 'ok'],
  ['blank_name', '   ', '{"fields": [{"type": "checkbox", "label": "Lifejackets stowed"}]}', 'FLEET', 0, 'name_required'],
  ['no_fields', 'Empty form', '{"fields": []}', 'FLEET', 0, 'no_section'],
  ['fields_not_array', 'Odd form', '{"fields": {}}', 'FLEET', 0, 'no_section'],
  ['headers_only', 'Headers only', '{"fields": [{"type": "section", "label": "Deck"}, {"type": "SECTION", "label": "Engine"}]}', 'FLEET', 0, 'no_section'],
  ['empty_middle', 'Gap', '{"fields": [{"type": "section", "label": "Deck"}, {"type": "section", "label": "Engine"}, {"type": "checkbox", "label": "Oil checked"}]}', 'FLEET', 0, 'empty_section'],
  ['empty_last', 'Trailing header', '{"fields": [{"type": "checkbox", "label": "Oil checked"}, {"type": "section", "label": "Later"}]}', 'FLEET', 0, 'empty_section'],
  ['blank_header', 'Unnamed section', '{"fields": [{"type": "section", "label": " "}, {"type": "checkbox", "label": "Oil checked"}]}', 'FLEET', 0, 'unlabelled_section'],
  ['blank_item', 'Unnamed item', '{"fields": [{"type": "section", "label": "Deck"}, {"type": "checkbox", "label": ""}]}', 'FLEET', 0, 'unlabelled_item'],
  ['missing_label', 'No label key', '{"fields": [{"type": "checkbox"}]}', 'FLEET', 0, 'unlabelled_item'],
  ['not_object', 'Stray value', '{"fields": ["Lifejackets"]}', 'FLEET', 0, 'unlabelled_item'],
  ['empty_beats_blank', 'Two problems', '{"fields": [{"type": "section", "label": "Deck"}, {"type": "section", "label": "Engine"}, {"type": "checkbox", "label": ""}]}', 'FLEET', 0, 'empty_section'],
  ['selected_none', 'Selected vessels', '{"fields": [{"type": "checkbox", "label": "Lifejackets stowed"}]}', 'VESSEL_SPECIFIC', 0, 'targets_required'],
  ['selected_one', 'Selected vessels', '{"fields": [{"type": "checkbox", "label": "Lifejackets stowed"}]}', 'VESSEL_SPECIFIC', 1, 'ok'],
];

const inputOf = (c: Case) => ({
  templateName: c[1],
  formSchema: JSON.parse(c[2]) as unknown,
  vesselScope: c[3],
  vesselIds: c[4] > 0 ? Array.from({ length: c[4] }, (_, i) => `vessel-${i}`) : [],
});

describe('the blockers', () => {
  it('are in the order form_template_publish_blocker returns them', () => {
    const body = SQL.split('CREATE OR REPLACE FUNCTION public.form_template_publish_blocker')[1]?.split('$$;')[0] ?? '';
    const returned = [...body.matchAll(/RETURN '([a-z_]+)';/g)].map((m) => m[1]);
    expect(returned).toEqual([...PUBLISH_BLOCKERS]);
  });

  it.each(CASES)('%s -> %s', (...c) => {
    const answer = publishBlocker(inputOf(c as Case));
    expect(answer ?? 'ok').toBe(c[5]);
  });

  it('is the case list the SQL test copies (between its publish-cases markers)', () => {
    const block = SQL_TEST.split('-- publish-cases:start')[1]?.split('-- publish-cases:end')[0] ?? '';
    const rows = [...block.matchAll(/\('([a-z_]+)', '([^']*)', '([^']*)', '([A-Z_]+)', (\d+), '([a-z_]+)'\)/g)].map((m) => [m[1], m[2], m[3], m[4], Number(m[5]), m[6]]);
    expect(rows).toEqual(CASES.map((c) => [...c]));
  });
});

describe('sections and issues', () => {
  const schema = {
    fields: [
      { type: 'checkbox', label: 'Radar on' },
      { type: 'section', label: 'Deck' },
      { type: 'section', label: '' },
      { type: 'checkbox', label: '' },
      { type: 'Section ', label: 'Engine' },
    ],
  };

  it('splits the fields into sections, items before the first header in a section of their own', () => {
    expect(templateSections(schema)).toEqual([
      { header: null, items: [{ index: 0, label: 'Radar on' }] },
      { header: { index: 1, label: 'Deck' }, items: [] },
      { header: { index: 2, label: '' }, items: [{ index: 3, label: '' }] },
      { header: { index: 4, label: 'Engine' }, items: [] },
    ]);
  });

  it('lists every issue in priority order, pointing at its field', () => {
    expect(publishIssues({ templateName: 'Rounds', formSchema: schema, vesselScope: 'VESSEL_SPECIFIC', vesselIds: [null] })).toEqual([
      { code: 'empty_section', fieldIndex: 1 },
      { code: 'empty_section', fieldIndex: 4 },
      { code: 'unlabelled_section', fieldIndex: 2 },
      { code: 'unlabelled_item', fieldIndex: 3 },
      { code: 'targets_required', fieldIndex: null },
    ]);
    expect(publishBlockers({ templateName: '', formSchema: schema, vesselScope: 'FLEET', vesselIds: null })).toEqual([
      'name_required',
      'empty_section',
      'unlabelled_section',
      'unlabelled_item',
    ]);
  });

  it('reads text as the server does: numbers as text, spaces trimmed but not tabs', () => {
    expect(publishBlocker({ templateName: 'Rounds', formSchema: { fields: [{ type: 'checkbox', label: 5 }] }, vesselScope: 'FLEET', vesselIds: null })).toBeNull();
    expect(publishBlocker({ templateName: 'Rounds', formSchema: { fields: [{ type: 'checkbox', label: '\t' }] }, vesselScope: 'FLEET', vesselIds: null })).toBeNull();
    expect(publishBlocker({ templateName: 'Rounds', formSchema: { fields: [{ type: 'checkbox', label: null }] }, vesselScope: 'FLEET', vesselIds: null })).toBe('unlabelled_item');
    expect(publishBlocker({ templateName: '\t', formSchema: { fields: [{ type: 'checkbox', label: 'x' }] }, vesselScope: 'FLEET', vesselIds: null })).toBeNull();
    expect(publishBlocker({ templateName: null, formSchema: { fields: [{ type: 'checkbox', label: 'x' }] }, vesselScope: 'FLEET', vesselIds: null })).toBe('name_required');
  });

  it('treats a schema without a field list as no items', () => {
    expect(schemaFields(null)).toEqual([]);
    expect(schemaFields('[]')).toEqual([]);
    expect(schemaFields({ pages: [] })).toEqual([]);
    expect(publishBlocker({ templateName: 'Rounds', formSchema: undefined, vesselScope: 'FLEET', vesselIds: null })).toBe('no_section');
  });
});

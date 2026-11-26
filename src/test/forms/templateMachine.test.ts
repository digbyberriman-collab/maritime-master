/**
 * The form template lifecycle (src/modules/forms/lib/templateMachine.ts;
 * gap/02 W2, FC3–FC5; D-X5-13):
 *
 * - every cell of the states × actions table, legal and illegal, and the
 *   SQL test's copy of it (supabase/tests/sql/fleet/form_templates.test.sql,
 *   between the machine-table markers) is the same table;
 * - each action's definer exists in the migration and the browser may run it;
 * - the delete and new-version rules in the server's order, the Customise
 *   code, version numbers and labels, the status reader;
 * - a sentence for every refusal the migration raises (definers, publish
 *   checks and guards), and none for an unknown code.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FORM_TEMPLATE_ACTIONS,
  FORM_TEMPLATE_ACTION_RPC,
  FORM_TEMPLATE_MACHINE,
  FORM_TEMPLATE_REFUSAL_CODES,
  FORM_TEMPLATE_STATUSES,
  customiseCode,
  deleteRefusal,
  formTemplateActions,
  formTemplateRefusal,
  formTemplateTransition,
  isFormTemplateStatus,
  newVersionRefusal,
  nextVersionNumber,
  normaliseFormTemplateStatus,
  versionDisplay,
  type FormTemplateAction,
  type FormTemplateStatus,
} from '@/modules/forms/lib/templateMachine';

const ROOT = process.cwd();
const SQL = readFileSync(join(ROOT, 'supabase/migrations/20261124040500_fleet_form_templates.sql'), 'utf8');
const SQL_TEST = readFileSync(join(ROOT, 'supabase/tests/sql/fleet/form_templates.test.sql'), 'utf8');

/** A cell as the SQL test writes it: the status it leads to, 'deleted', or '!' and the refusal. */
const cellText = (status: FormTemplateStatus, action: FormTemplateAction) => {
  const outcome = FORM_TEMPLATE_MACHINE[status][action];
  return 'refusal' in outcome ? `!${outcome.refusal}` : outcome.to;
};

const EXPECTED: ReadonlyArray<[FormTemplateStatus, FormTemplateAction, string]> = [
  ['DRAFT', 'publish', 'PUBLISHED'],
  ['DRAFT', 'new_version', '!template_draft'],
  ['DRAFT', 'customise', '!template_draft'],
  ['DRAFT', 'archive', 'ARCHIVED'],
  ['DRAFT', 'delete_draft', 'deleted'],
  ['DRAFT', 'move_area', 'DRAFT'],
  ['DRAFT', 'set_visibility', '!template_not_published'],
  ['PUBLISHED', 'publish', '!already_published'],
  ['PUBLISHED', 'new_version', 'PUBLISHED'],
  ['PUBLISHED', 'customise', 'PUBLISHED'],
  ['PUBLISHED', 'archive', 'ARCHIVED'],
  ['PUBLISHED', 'delete_draft', '!template_published'],
  ['PUBLISHED', 'move_area', 'PUBLISHED'],
  ['PUBLISHED', 'set_visibility', 'PUBLISHED'],
  ['SUPERSEDED', 'publish', '!template_superseded'],
  ['SUPERSEDED', 'new_version', '!template_superseded'],
  ['SUPERSEDED', 'customise', 'SUPERSEDED'],
  ['SUPERSEDED', 'archive', 'ARCHIVED'],
  ['SUPERSEDED', 'delete_draft', '!template_published'],
  ['SUPERSEDED', 'move_area', '!template_superseded'],
  ['SUPERSEDED', 'set_visibility', '!template_not_published'],
  ['ARCHIVED', 'publish', '!template_archived'],
  ['ARCHIVED', 'new_version', 'ARCHIVED'],
  ['ARCHIVED', 'customise', 'ARCHIVED'],
  ['ARCHIVED', 'archive', '!already_archived'],
  ['ARCHIVED', 'delete_draft', '!template_archived'],
  ['ARCHIVED', 'move_area', '!template_archived'],
  ['ARCHIVED', 'set_visibility', '!template_not_published'],
];

describe('the states × actions table', () => {
  it('has every status and action, and nothing else', () => {
    expect(FORM_TEMPLATE_STATUSES).toEqual(['DRAFT', 'PUBLISHED', 'SUPERSEDED', 'ARCHIVED']);
    expect(FORM_TEMPLATE_ACTIONS).toEqual(['publish', 'new_version', 'customise', 'archive', 'delete_draft', 'move_area', 'set_visibility']);
    expect(Object.keys(FORM_TEMPLATE_MACHINE)).toEqual([...FORM_TEMPLATE_STATUSES]);
    for (const status of FORM_TEMPLATE_STATUSES) expect(Object.keys(FORM_TEMPLATE_MACHINE[status])).toEqual([...FORM_TEMPLATE_ACTIONS]);
    expect(EXPECTED).toHaveLength(FORM_TEMPLATE_STATUSES.length * FORM_TEMPLATE_ACTIONS.length);
  });

  it.each(EXPECTED)('%s + %s -> %s', (status, action, outcome) => {
    expect(cellText(status, action)).toBe(outcome);
    expect(formTemplateTransition(status, action)).toBe(FORM_TEMPLATE_MACHINE[status][action]);
  });

  it('marks the actions that add a row: a new version adds a draft, customise a copy', () => {
    expect(formTemplateTransition('PUBLISHED', 'new_version')).toEqual({ ok: true, to: 'PUBLISHED', adds: 'draft' });
    expect(formTemplateTransition('ARCHIVED', 'new_version')).toEqual({ ok: true, to: 'ARCHIVED', adds: 'draft' });
    for (const status of ['PUBLISHED', 'SUPERSEDED', 'ARCHIVED'] as const) {
      expect(formTemplateTransition(status, 'customise')).toEqual({ ok: true, to: status, adds: 'copy' });
    }
    expect(formTemplateTransition('DRAFT', 'publish')).toEqual({ ok: true, to: 'PUBLISHED' });
  });

  it('is the table the SQL test copies (between its machine-table markers)', () => {
    const block = SQL_TEST.split('-- machine-table:start')[1]?.split('-- machine-table:end')[0] ?? '';
    const rows = [...block.matchAll(/\('([A-Z]+)', '([a-z_]+)', '([!a-zA-Z_]+)'\)/g)].map((m) => [m[1], m[2], m[3]]);
    expect(rows).toEqual(EXPECTED.map(([s, a, o]) => [s, a, o]));
  });

  it('lists the allowed actions per status', () => {
    expect(formTemplateActions('DRAFT')).toEqual(['publish', 'archive', 'delete_draft', 'move_area']);
    expect(formTemplateActions('PUBLISHED')).toEqual(['new_version', 'customise', 'archive', 'move_area', 'set_visibility']);
    expect(formTemplateActions('SUPERSEDED')).toEqual(['customise', 'archive']);
    expect(formTemplateActions('ARCHIVED')).toEqual(['new_version', 'customise']);
  });

  it('names a definer the migration defines and grants to the browser for every action', () => {
    for (const action of FORM_TEMPLATE_ACTIONS) {
      const rpc = FORM_TEMPLATE_ACTION_RPC[action];
      expect(SQL).toMatch(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${rpc}\\(`));
      expect(SQL).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${rpc}\\([^)]*\\) TO authenticated;`));
    }
  });

  it('reads statuses case-insensitively and nothing else', () => {
    expect(normaliseFormTemplateStatus('published')).toBe('PUBLISHED');
    expect(normaliseFormTemplateStatus(' Superseded ')).toBe('SUPERSEDED');
    expect(normaliseFormTemplateStatus('ACTIVE')).toBeNull();
    expect(normaliseFormTemplateStatus(null)).toBeNull();
    expect(isFormTemplateStatus('DRAFT')).toBe(true);
    expect(isFormTemplateStatus('draft')).toBe(false);
  });
});

describe('the rules beyond the status (the server order)', () => {
  it('deletes only a never-published draft with no runs', () => {
    expect(deleteRefusal({ status: 'DRAFT', publishedAt: null, runCount: 0 })).toBeNull();
    expect(deleteRefusal({ status: 'DRAFT', publishedAt: null, runCount: 1 })).toBe('template_has_runs');
    expect(deleteRefusal({ status: 'DRAFT', publishedAt: '2026-11-01T00:00:00Z', runCount: 0 })).toBe('template_published');
    expect(deleteRefusal({ status: 'PUBLISHED', publishedAt: '2026-11-01T00:00:00Z', runCount: 3 })).toBe('template_published');
    expect(deleteRefusal({ status: 'SUPERSEDED', publishedAt: '2026-11-01T00:00:00Z', runCount: 0 })).toBe('template_published');
    expect(deleteRefusal({ status: 'ARCHIVED', publishedAt: null, runCount: 2 })).toBe('template_archived');
  });

  it('starts a new version only from a published or archived company template with no open draft', () => {
    expect(newVersionRefusal({ status: 'PUBLISHED', origin: 'company', familyHasDraft: false })).toBeNull();
    expect(newVersionRefusal({ status: 'ARCHIVED', origin: 'company', familyHasDraft: false })).toBeNull();
    expect(newVersionRefusal({ status: 'DRAFT', origin: 'platform', familyHasDraft: true })).toBe('template_draft');
    expect(newVersionRefusal({ status: 'SUPERSEDED', origin: 'company', familyHasDraft: true })).toBe('template_superseded');
    expect(newVersionRefusal({ status: 'PUBLISHED', origin: 'platform', familyHasDraft: true })).toBe('platform_template_customise');
    expect(newVersionRefusal({ status: 'PUBLISHED', origin: 'company', familyHasDraft: true })).toBe('draft_exists');
  });

  it('numbers a new version one past the family', () => {
    expect(nextVersionNumber([{ version: 1 }, { version: 3 }, { version: 2 }])).toBe(4);
    expect(nextVersionNumber([{ version: null }])).toBe(1);
    expect(nextVersionNumber([])).toBe(1);
  });

  it('shows the typed label, else v<number>', () => {
    expect(versionDisplay({ version: 3, version_label: 'SMS-CL-001 Rev 4' })).toBe('SMS-CL-001 Rev 4');
    expect(versionDisplay({ version: 3, version_label: '  ' })).toBe('v3');
    expect(versionDisplay({ version: 2 })).toBe('v2');
    expect(versionDisplay({ version: null, version_label: null })).toBe('v1');
  });

  it('codes a Customise copy <code>_CUSTOM<n>, the first n free, within 50 characters', () => {
    expect(customiseCode('STD_FIRE', [])).toBe('STD_FIRE_CUSTOM1');
    expect(customiseCode('STD_FIRE', ['STD_FIRE_CUSTOM1', 'STD_FIRE_CUSTOM2'])).toBe('STD_FIRE_CUSTOM3');
    const long = 'L'.repeat(50);
    expect(customiseCode(long, [])).toBe(`${'L'.repeat(42)}_CUSTOM1`);
    expect(customiseCode(long, [])).toHaveLength(50);
    const used = Array.from({ length: 9 }, (_, i) => `${'L'.repeat(42)}_CUSTOM${i + 1}`);
    expect(customiseCode(long, used)).toBe(`${'L'.repeat(41)}_CUSTOM10`);
  });

  it('mirrors the SQL code rule (the suffix and the 50-character cut)', () => {
    expect(SQL).toContain("v_suffix := '_CUSTOM' || v_n;");
    expect(SQL).toContain('v_code := left(t.template_code, 50 - length(v_suffix)) || v_suffix;');
  });
});

describe('refusal sentences', () => {
  /** Every code the migration raises: MESSAGE = '…', the publish CASE, the blocker RETURNs. */
  const raised = new Set<string>([
    ...[...SQL.matchAll(/MESSAGE = '([a-z_]+)'/g)].map((m) => m[1]),
    ...[...SQL.matchAll(/MESSAGE = CASE[\s\S]*?END;/g)].flatMap((m) => [...m[0].matchAll(/(?:THEN|ELSE) '([a-z_]+)'/g)].map((x) => x[1])),
    ...[...SQL.matchAll(/RETURN '([a-z_]+)';/g)].map((m) => m[1]),
  ]);

  it('finds the codes in the migration (parser sanity)', () => {
    expect(raised.size).toBeGreaterThan(25);
    expect(raised).toContain('already_published');
    expect(raised).toContain('template_archived');
    expect(raised).toContain('empty_section');
    expect(raised).toContain('form_templates_guarded');
  });

  it('has a sentence for every refusal the migration raises', () => {
    const missing = [...raised].filter((code) => formTemplateRefusal(code) === null);
    expect(missing).toEqual([]);
  });

  it('every sentence is a plain sentence without a code in it', () => {
    for (const code of FORM_TEMPLATE_REFUSAL_CODES) {
      const sentence = formTemplateRefusal(code) as string;
      expect(sentence).toMatch(/^[A-Z].*\.$/);
      expect(sentence).not.toMatch(/_/);
    }
  });

  it('answers null for an unknown code, nothing or an inherited key', () => {
    expect(formTemplateRefusal('no_such_code')).toBeNull();
    expect(formTemplateRefusal(null)).toBeNull();
    expect(formTemplateRefusal('')).toBeNull();
    expect(formTemplateRefusal('toString')).toBeNull();
  });
});

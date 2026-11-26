/**
 * The catalogue course schema (X5-07A, TR7, TR9; D-X5-05 as amended by
 * plan contract 3): the zod checks of lib/courseSchema.ts are the checks
 * development_course_save() makes (20261124040600_fleet_training_core.sql),
 * the payload carries the id and the last seen updated_at for an edit, and
 * every refusal the course definers raise has a sentence.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEV_FORMATS, courseRefusalMessage, courseSchema, toCoursePayload } from '@/modules/development/lib/courseSchema';

const MIGRATION = readFileSync(join(process.cwd(), 'supabase/migrations/20261124040600_fleet_training_core.sql'), 'utf8');

function functionBody(name: string): string {
  const at = MIGRATION.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(at, name).toBeGreaterThan(-1);
  const start = MIGRATION.indexOf('AS $$', at);
  return MIGRATION.slice(start, MIGRATION.indexOf('\n$$;', start));
}

const base = { name: 'Advanced firefighting', department: 'Deck', category: 'mandatory' as const };
const issues = (input: Record<string, unknown>) => {
  const out = courseSchema.safeParse(input);
  return out.success ? [] : out.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

describe('courseSchema', () => {
  it('accepts a minimal course and trims the text', () => {
    const out = courseSchema.parse({ ...base, name: '  Advanced firefighting  ', notes: '   ' });
    expect(out).toMatchObject({ name: 'Advanced firefighting', department: 'Deck', category: 'mandatory', notes: null });
  });

  it('requires the name, the department and a known category', () => {
    expect(issues({ ...base, name: '   ' })).toEqual(['name: Name the course']);
    expect(issues({ name: 'X', category: 'mandatory' })).toEqual(['department: Choose the department']);
    expect(issues({ ...base, category: 'leisure' })).toEqual(['category: Choose a category']);
    expect(issues({ ...base, name: 'x'.repeat(201) })).toHaveLength(1);
  });

  it('takes the five formats of the server and a blank as none', () => {
    expect([...DEV_FORMATS]).toEqual(['in_person', 'online', 'onboard', 'blended', 'online_in_person']);
    expect(functionBody('development_course_save')).toContain("('in_person', 'online', 'onboard', 'blended', 'online_in_person')");
    expect(courseSchema.parse({ ...base, format: '' }).format).toBeNull();
    expect(issues({ ...base, format: 'by_post' })).toHaveLength(1);
  });

  it('checks the validity and renewal months the way the server does', () => {
    expect(courseSchema.parse({ ...base, valid_for_months: '60', renew_from_months: 6 })).toMatchObject({ valid_for_months: 60, renew_from_months: 6 });
    expect(issues({ ...base, valid_for_months: 0 })).toEqual(['valid_for_months: Enter 1 to 600 months']);
    expect(issues({ ...base, valid_for_months: 601 })).toEqual(['valid_for_months: Enter 1 to 600 months']);
    expect(issues({ ...base, valid_for_months: 12.5 })).toEqual(['valid_for_months: Enter 1 to 600 months']);
    expect(issues({ ...base, renew_from_months: 3 })).toEqual(['renew_from_months: Set how long the course is valid first']);
    expect(issues({ ...base, valid_for_months: 12, renew_from_months: 12 })).toEqual(['renew_from_months: Renewal must open before the course expires']);
    expect(courseSchema.parse({ ...base, valid_for_months: '', renew_from_months: '' })).toMatchObject({ valid_for_months: null, renew_from_months: null });
    const body = functionBody('development_course_save');
    expect(body).toContain('v_valid NOT BETWEEN 1 AND 600');
    expect(body).toContain('v_renew >= v_valid');
  });

  it('checks the catalogue number and the lists', () => {
    expect(issues({ ...base, catalogue_number: 0 })).toHaveLength(1);
    expect(courseSchema.parse({ ...base, catalogue_number: '42' }).catalogue_number).toBe(42);
    expect(issues({ ...base, applies_to_departments: ['Deck', ' '] })).toEqual(['applies_to_departments.1: Remove the empty entry']);
    expect(issues({ ...base, applies_to_positions: Array.from({ length: 51 }, (_, i) => `P${i}`) })).toEqual(['applies_to_positions: Up to 50 entries']);
    expect(issues({ ...base, tags: ['x'.repeat(81)] })).toHaveLength(1);
  });

  it('names the qualification as a crew document type id or as text', () => {
    const id = '5b0c8f9e-1f7a-4c1e-9a52-2d7c7a1f0b11';
    expect(courseSchema.parse({ ...base, qualification_document_type_id: id }).qualification_document_type_id).toBe(id);
    expect(courseSchema.parse({ ...base, qualification_document_type_id: '' }).qualification_document_type_id).toBeNull();
    expect(issues({ ...base, qualification_document_type_id: 'STCW-basic' })).toEqual(['qualification_document_type_id: Choose a document type']);
    expect(courseSchema.parse({ ...base, qualification_label: 'Basic safety' }).qualification_label).toBe('Basic safety');
  });

  it('refuses keys the server does not know', () => {
    expect(courseSchema.safeParse({ ...base, company_id: 'x' }).success).toBe(false);
  });

  it('knows every key development_course_save takes, and no other', () => {
    const body = functionBody('development_course_save');
    const known = body.match(/v_known text\[\] := ARRAY\[([^\]]+)\]/)?.[1] ?? '';
    const serverKeys = [...known.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]).filter((k) => k !== 'id' && k !== 'expected_updated_at');
    expect(Object.keys(courseSchema._def.schema.shape).sort()).toEqual(serverKeys.sort());
  });
});

describe('toCoursePayload', () => {
  it('sends the set values only, with the id and last seen updated_at on an edit', () => {
    const values = courseSchema.parse({ ...base, notes: 'Bring boots' });
    expect(toCoursePayload(values)).toEqual({ ...base, notes: 'Bring boots' });
    expect(toCoursePayload(values, { id: 'c-1', updated_at: '2026-11-01T00:00:00Z' })).toEqual({
      ...base,
      notes: 'Bring boots',
      id: 'c-1',
      expected_updated_at: '2026-11-01T00:00:00Z',
    });
  });
});

describe('courseRefusalMessage', () => {
  it('has a sentence for every refusal the course definers raise', () => {
    const codes = new Set<string>();
    for (const fn of ['development_course_save', 'development_course_archive', 'development_course_promote', 'development_admin_gate']) {
      for (const m of functionBody(fn).matchAll(/MESSAGE = '([a-z_]+)'/g)) codes.add(m[1]);
    }
    expect(codes.size).toBeGreaterThan(5);
    for (const code of codes) expect(courseRefusalMessage({ message: code }), code).toBeTruthy();
  });

  it('names the field from the hint', () => {
    expect(courseRefusalMessage({ message: 'field_invalid', hint: 'renew_from_months' })).toBe('Check when renewal opens: the value is not allowed.');
    expect(courseRefusalMessage({ message: 'field_required', hint: 'name' })).toBe('Fill in the name.');
    expect(courseRefusalMessage({ message: 'field_invalid', hint: 'something_else' })).toBe('Check a field: the value is not allowed.');
    expect(courseRefusalMessage({ message: 'connection reset' })).toBeNull();
    expect(courseRefusalMessage(null)).toBeNull();
  });
});

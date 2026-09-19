import { describe, expect, it } from 'vitest';
import {
  addField,
  answerFields,
  createField,
  duplicateField,
  emptySchema,
  moveField,
  parseFormSchema,
  removeField,
  summariseValue,
  updateField,
  validateSubmission,
  type FormSchema,
} from './forms';

const schema = (): FormSchema => ({
  title: 'Dive waiver',
  fields: [
    { id: 'h', type: 'heading', label: 'Diver details' },
    { id: 'name', type: 'text', label: 'Full name', required: true },
    { id: 'cert', type: 'select', label: 'Certification', options: ['Open Water', 'Advanced'], required: true },
    { id: 'date', type: 'date', label: 'Last dive' },
    { id: 'ok', type: 'checkbox', label: 'I am fit to dive', required: true },
    { id: 'vessel', type: 'reference', label: 'Vessel', referenceEntity: 'vessel', required: true },
    { id: 'sig', type: 'signature', label: 'Signature', required: true },
  ],
});

describe('schema editing', () => {
  it('creates fields with sensible defaults and unique ids', () => {
    const a = createField('select');
    const b = createField('select');
    expect(a.id).not.toBe(b.id);
    expect(a.options).toEqual(['Option 1', 'Option 2']);
    expect(createField('reference').referenceEntity).toBe('vessel');
    expect(createField('signature').required).toBe(true);
  });

  it('adds, moves, duplicates, updates and removes without mutating', () => {
    const s0 = emptySchema('T');
    const s1 = addField(s0, 'text');
    const s2 = addField(s1, 'date');
    expect(s0.fields).toHaveLength(0);
    expect(s2.fields.map((f) => f.type)).toEqual(['text', 'date']);

    const moved = moveField(s2, 1, -1);
    expect(moved.fields.map((f) => f.type)).toEqual(['date', 'text']);
    expect(moveField(s2, 0, -1)).toBe(s2);

    const dup = duplicateField(s2, 0);
    expect(dup.fields).toHaveLength(3);
    expect(dup.fields[1].label).toBe('Short answer (copy)');
    expect(dup.fields[1].id).not.toBe(dup.fields[0].id);

    const updated = updateField(s2, 0, { label: 'Name', required: true });
    expect(updated.fields[0]).toMatchObject({ label: 'Name', required: true });

    const inserted = addField(s2, 'checkbox', 0);
    expect(inserted.fields.map((f) => f.type)).toEqual(['text', 'checkbox', 'date']);

    expect(removeField(s2, 0).fields.map((f) => f.type)).toEqual(['date']);
    expect(removeField(s2, 9)).toBe(s2);
  });
});

describe('parseFormSchema', () => {
  it('rejects junk and repairs partial fields', () => {
    expect(parseFormSchema(null)).toBeNull();
    expect(parseFormSchema('x')).toBeNull();
    expect(parseFormSchema({ title: 'no fields' })).toBeNull();
    const parsed = parseFormSchema({
      title: 'T',
      description: 'D',
      fields: [
        { id: 'a', type: 'text', label: 'A', required: true, options: ['x', 1] },
        { type: 'nope', label: 'bad' },
        { type: 'select', label: 'S', options: ['1', '2'], referenceEntity: 'crew' },
        'junk',
      ],
    });
    expect(parsed?.title).toBe('T');
    expect(parsed?.description).toBe('D');
    expect(parsed?.fields).toHaveLength(2);
    expect(parsed?.fields[0]).toMatchObject({ id: 'a', options: ['x'] });
    expect(parsed?.fields[1].id).toMatch(/^f_/);
    expect(parsed?.fields[1].referenceEntity).toBe('crew');
  });
});

describe('validateSubmission', () => {
  it('reports every missing required answer with a specific message', () => {
    const errors = validateSubmission(schema(), {});
    expect(Object.keys(errors).sort()).toEqual(['cert', 'name', 'ok', 'sig', 'vessel']);
    expect(errors.sig).toBe('Type your name and tick the acknowledgement');
    expect(errors.ok).toBe('This must be ticked');
  });

  it('accepts a complete submission and checks option and date validity', () => {
    const good = validateSubmission(schema(), {
      name: 'Sam',
      cert: 'Advanced',
      date: '2026-09-01',
      ok: true,
      vessel: { id: 'v1', label: 'Draak' },
      sig: { name: 'Sam Smith', acknowledged: true, signedAt: '2026-09-16T00:00:00.000Z' },
    });
    expect(good).toEqual({});
    const bad = validateSubmission(schema(), {
      name: 'Sam',
      cert: 'Master',
      date: 'yesterday',
      ok: true,
      vessel: { id: 'v1', label: 'Draak' },
      sig: { name: 'Sam', acknowledged: false, signedAt: '' },
    });
    expect(bad.cert).toBe('Choose one of the listed options');
    expect(bad.date).toBe('Enter a valid date');
    expect(bad.sig).toBeDefined();
  });

  it('summarises values and lists answer fields', () => {
    const s = schema();
    expect(answerFields(s).map((f) => f.id)).toEqual(['name', 'cert', 'date', 'ok', 'vessel', 'sig']);
    expect(summariseValue(s.fields[4], true)).toBe('Yes');
    expect(summariseValue(s.fields[4], undefined)).toBe('—');
    expect(summariseValue(s.fields[5], { id: 'v', label: 'Draak' })).toBe('Draak');
    expect(summariseValue(s.fields[6], { name: 'Sam', acknowledged: true, signedAt: '' })).toBe('Sam (acknowledged)');
    expect(summariseValue(s.fields[1], '  ')).toBe('—');
  });
});

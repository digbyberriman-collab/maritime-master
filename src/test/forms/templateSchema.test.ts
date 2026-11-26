/**
 * The builder's form (src/modules/forms/lib/templateSchema.ts; gap/02
 * FC3, W2):
 *
 * - stored form_schema ⇄ sections: headers and items, items before the
 *   first header (headerless), fields kept as they were, comment and
 *   attachments stored only when on, a round trip changes nothing;
 * - the zod schema: what a draft needs (name, code format, the area once
 *   areas are set up, the limits); publish problems are builderIssues,
 *   each pointing at its section or item, the server's order;
 * - Add several: one item per line, bullets and numbering removed, the
 *   limit;
 * - codes made from the name, unique; the legacy form_type per kind;
 * - the draft payload (catalogue columns only once applied, D-01);
 * - the dialogs' schemas and the visibility changes;
 * - every item type is one the ISM renderer draws.
 */
import { describe, expect, it } from 'vitest';
import { FIELD_TYPES } from '@/modules/ism/forms/constants';
import {
  ADD_SEVERAL_MAX,
  ITEM_TYPES,
  archiveSchema,
  builderIssues,
  defaultItemType,
  draftPayload,
  emptyTemplateValues,
  formSchemaToSections,
  formTypeFor,
  itemCount,
  kindOfFormType,
  moveAreaSchema,
  newItem,
  newSection,
  parseSeveralItems,
  sectionItemExtra,
  sectionsToFields,
  sectionsToFormSchema,
  suggestTemplateCode,
  templateFormSchema,
  valuesFromTemplate,
  visibilityChangeSchema,
  visibilityChanges,
  type TemplateDetail,
  type TemplateFormValues,
} from '@/modules/forms/lib/templateSchema';

const STORED = {
  pages: [{ id: 'p1', number: 1, fields: ['f0'] }],
  layout: { columnsPerRow: 2 },
  fields: [
    { id: 'f0', type: 'text', label: 'Officer of the watch', required: true, placeholder: 'Name', pageNumber: 1 },
    { id: 's1', type: 'SECTION', label: 'Guest areas', required: false, helpText: 'Decks 2 and 3', pageNumber: 1 },
    { id: 'f1', type: 'yes_no', label: 'Smoke detectors clear', required: true, allowComment: true },
    { id: 'f2', type: 'dropdown', label: 'Condition', required: false, options: ['Good', 'Poor'], allowAttachments: true },
    { id: 's2', type: 'section', label: 'Engine room', required: false },
    { id: 'f3', type: 'table', label: 'Readings', required: false, tableConfig: { columns: [{ id: 'c1', label: 'Gauge', type: 'text' }] } },
  ],
};

describe('form_schema ⇄ sections', () => {
  it('reads headers and items, with a headerless section for items before the first header', () => {
    const sections = formSchemaToSections(STORED);
    expect(sections.map((s) => [s.title, s.headerless, s.items.map((i) => i.key)])).toEqual([
      ['', true, ['f0']],
      ['Guest areas', false, ['f1', 'f2']],
      ['Engine room', false, ['f3']],
    ]);
    expect(sections[1].extra).toEqual({ helpText: 'Decks 2 and 3', pageNumber: 1 });
    expect(sections[1].items[0]).toMatchObject({ type: 'yes_no', required: true, allowComment: true, allowAttachments: false, options: [] });
    expect(sections[1].items[1]).toMatchObject({ type: 'dropdown', options: ['Good', 'Poor'], allowAttachments: true });
    expect(sections[0].items[0].extra).toEqual({ placeholder: 'Name', pageNumber: 1 });
  });

  it('a round trip keeps every field and the schema keys (pages, layout)', () => {
    const sections = formSchemaToSections(STORED);
    const out = sectionsToFormSchema(sections, STORED);
    expect(out.pages).toEqual(STORED.pages);
    expect(out.layout).toEqual(STORED.layout);
    const fields = out.fields as Record<string, unknown>[];
    expect(fields.map((f) => f.id)).toEqual(['f0', 's1', 'f1', 'f2', 's2', 'f3']);
    expect(fields[1]).toEqual({ helpText: 'Decks 2 and 3', pageNumber: 1, id: 's1', type: 'section', label: 'Guest areas', required: false });
    expect(fields[2]).toEqual({ id: 'f1', type: 'yes_no', label: 'Smoke detectors clear', required: true, allowComment: true });
    expect(fields[3]).toMatchObject({ options: ['Good', 'Poor'], allowAttachments: true });
    expect(fields[3]).not.toHaveProperty('allowComment');
    expect(fields[5]).toMatchObject({ tableConfig: { columns: [{ id: 'c1', label: 'Gauge', type: 'text' }] } });
  });

  it('a titled headerless section gets its header; blank choices are dropped; labels are trimmed', () => {
    const sections = formSchemaToSections({ fields: [{ id: 'a', type: 'dropdown', label: ' Pick ', options: ['', 'Yes', ' '] }] });
    sections[0].title = 'Start';
    const fields = sectionsToFields(sections);
    expect(fields[0]).toMatchObject({ type: 'section', label: 'Start' });
    expect(fields[1]).toMatchObject({ id: 'a', label: 'Pick', options: ['Yes'] });
  });

  it('anything that is not a list of fields reads as no sections; duplicate or missing ids get fresh keys', () => {
    expect(formSchemaToSections(null)).toEqual([]);
    expect(formSchemaToSections({ fields: 'x' })).toEqual([]);
    const sections = formSchemaToSections({ fields: [{ id: 'a', type: 'text', label: 'One' }, { id: 'a', type: 'text', label: 'Two' }, 'junk'] });
    const keys = sections[0].items.map((i) => i.key);
    expect(new Set(keys).size).toBe(3);
    expect(keys[0]).toBe('a');
    expect(sections[0].items[2]).toMatchObject({ type: 'text', label: '' });
  });

  it('new items and sections: unique keys, a dropdown starts with two blank choices, the section page carries to its items', () => {
    const a = newItem('yes_no');
    const b = newItem('dropdown', 'Grade');
    expect(a.key).not.toBe(b.key);
    expect(a).toMatchObject({ required: true, allowComment: false, allowAttachments: false, options: [] });
    expect(b.options).toEqual(['', '']);
    expect(newSection().headerless).toBe(false);
    expect(sectionItemExtra({ extra: { pageNumber: 3 } })).toEqual({ pageNumber: 3 });
    expect(sectionItemExtra({ extra: {} })).toEqual({});
    expect(itemCount(formSchemaToSections(STORED))).toBe(4);
  });
});

describe('the item types', () => {
  it('every type the builder offers is one the ISM renderer draws; sections are not items', () => {
    const rendered = new Set(FIELD_TYPES.map((t) => t.value));
    for (const t of ITEM_TYPES) expect(rendered.has(t), t).toBe(true);
    expect(ITEM_TYPES).not.toContain('section');
  });

  it('a new item is Yes / No on a checklist, a tick box on a permit, an answer on a form', () => {
    expect(defaultItemType('checklist')).toBe('yes_no');
    expect(defaultItemType('passage_plan')).toBe('yes_no');
    expect(defaultItemType('permit')).toBe('checkbox');
    expect(defaultItemType('form')).toBe('text');
    expect(defaultItemType(null)).toBe('text');
  });
});

const values = (over: Partial<TemplateFormValues> = {}): TemplateFormValues => ({
  ...emptyTemplateValues('safety'),
  name: 'Fire patrol',
  sections: [{ ...newSection('Decks'), items: [{ ...newItem('yes_no', 'Doors shut') }] }],
  ...over,
});

describe('the zod schema (saving a draft)', () => {
  it('a named template saves; a blank name does not', () => {
    expect(templateFormSchema({ areasSetUp: true }).safeParse(values()).success).toBe(true);
    const blank = templateFormSchema({ areasSetUp: true }).safeParse(values({ name: '   ' }));
    expect(blank.success).toBe(false);
  });

  it('the area is required once areas are set up, not before', () => {
    expect(templateFormSchema({ areasSetUp: true }).safeParse(values({ area: '' })).success).toBe(false);
    expect(templateFormSchema({ areasSetUp: false }).safeParse(values({ area: '' })).success).toBe(true);
  });

  it('a code is letters, digits, - and _ only, up to 50', () => {
    const schema = templateFormSchema({ areasSetUp: true });
    expect(schema.safeParse(values({ code: 'SAF-01_A' })).success).toBe(true);
    expect(schema.safeParse(values({ code: 'SAF 01' })).success).toBe(false);
    expect(schema.safeParse(values({ code: 'X'.repeat(51) })).success).toBe(false);
  });

  it('empty sections and blank labels still save as a draft (they only stop a publish)', () => {
    const v = values({ sections: [newSection(''), { ...newSection(''), items: [newItem('text', '')] }] });
    expect(templateFormSchema({ areasSetUp: true }).safeParse(v).success).toBe(true);
  });

  it('refuses too many items and over-long text', () => {
    const many = values({ sections: [{ ...newSection('All'), items: Array.from({ length: 501 }, () => newItem('yes_no', 'x')) }] });
    expect(templateFormSchema({ areasSetUp: true }).safeParse(many).success).toBe(false);
    expect(templateFormSchema({ areasSetUp: true }).safeParse(values({ description: 'd'.repeat(2001) })).success).toBe(false);
  });
});

describe('builderIssues (the publish checks on the builder)', () => {
  it('a complete template has none', () => {
    expect(builderIssues(values())).toEqual([]);
  });

  it('points each problem at its section or item, in the server order', () => {
    const empty = newSection('Engine');
    const untitled = { ...newSection(''), items: [newItem('yes_no', 'Bilge dry')] };
    const unlabelled = newItem('yes_no', '');
    const v = values({ name: '', sections: [empty, untitled, { ...newSection('Deck'), items: [unlabelled] }], vesselScope: 'VESSEL_SPECIFIC', vesselIds: [] });
    expect(builderIssues(v)).toEqual([
      { code: 'name_required', key: null },
      { code: 'empty_section', key: empty.key },
      { code: 'unlabelled_section', key: untitled.key },
      { code: 'unlabelled_item', key: unlabelled.key },
      { code: 'targets_required', key: null },
    ]);
  });

  it('no item at all is one problem; a blank headerless section is not a section', () => {
    expect(builderIssues(values({ sections: [newSection('Only a title')] })).map((i) => i.code)).toEqual(['no_section']);
    const headerless = { ...newSection(''), headerless: true, items: [newItem('text', 'Watchkeeper')] };
    expect(builderIssues(values({ sections: [headerless] }))).toEqual([]);
  });
});

describe('Add several', () => {
  it('one item per line, blank lines skipped, bullets and numbering removed, spaces collapsed', () => {
    const text = '- Fire doors closed\n\n• Escape routes  clear\r\n3. Extinguishers in date\n(4) Alarm tested\n[ ] Log signed\n[x] Lights on\n  plain line  ';
    expect(parseSeveralItems(text)).toEqual({
      labels: ['Fire doors closed', 'Escape routes clear', 'Extinguishers in date', 'Alarm tested', 'Log signed', 'Lights on', 'plain line'],
      leftOut: 0,
    });
  });

  it('keeps up to the limit and says how many were left out', () => {
    const text = Array.from({ length: ADD_SEVERAL_MAX + 3 }, (_, i) => `Item ${i + 1}`).join('\n');
    const parsed = parseSeveralItems(text);
    expect(parsed.labels).toHaveLength(ADD_SEVERAL_MAX);
    expect(parsed.leftOut).toBe(3);
    expect(parseSeveralItems('   \n\n')).toEqual({ labels: [], leftOut: 0 });
  });

  it('a number that is the item itself is kept', () => {
    expect(parseSeveralItems('2024 survey items').labels).toEqual(['2024 survey items']);
  });
});

describe('codes and form types', () => {
  it('makes a code from the area and the name, unique among the codes in use', () => {
    expect(suggestTemplateCode('Fire patrol rounds', 'safety', [])).toBe('SAF_FIRE_PATROL_ROUNDS');
    expect(suggestTemplateCode('Fire patrol rounds', 'safety', ['saf_fire_patrol_rounds'])).toBe('SAF_FIRE_PATROL_ROUNDS_2');
    expect(suggestTemplateCode('Fire patrol rounds', 'safety', ['SAF_FIRE_PATROL_ROUNDS', 'SAF_FIRE_PATROL_ROUNDS_2'])).toBe('SAF_FIRE_PATROL_ROUNDS_3');
    expect(suggestTemplateCode('Équipe café', 'crew', [])).toBe('CREW_EQUIPE_CAFE');
    expect(suggestTemplateCode('', '', [])).toBe('FORM_TEMPLATE');
    expect(suggestTemplateCode('Bunkering', 'technical_forms', [])).toBe('TECHF_BUNKERING');
    const long = suggestTemplateCode('a very long checklist name that goes on and on and on', 'safety', []);
    expect(long.length).toBeLessThanOrEqual(40);
    expect(long.endsWith('_')).toBe(false);
  });

  it('reads the kind of a legacy form_type, and keeps a form_type that already means the kind', () => {
    expect(kindOfFormType('INSPECTION')).toBe('checklist');
    expect(kindOfFormType('permit_to_work')).toBe('permit');
    expect(kindOfFormType('DRILL_REPORT')).toBe('form');
    expect(kindOfFormType(null)).toBe('form');
    expect(formTypeFor('checklist', null)).toBe('CHECKLIST');
    expect(formTypeFor('checklist', 'INSPECTION')).toBe('INSPECTION');
    expect(formTypeFor('checklist', 'REPORT')).toBe('CHECKLIST');
    expect(formTypeFor('permit', 'CHECKLIST')).toBe('PERMIT_TO_WORK');
    expect(formTypeFor('form', 'DRILL_REPORT')).toBe('DRILL_REPORT');
    expect(formTypeFor('form', 'CHECKLIST')).toBe('REPORT');
    expect(formTypeFor('register', 'OTHER')).toBe('OTHER');
    expect(formTypeFor('passage_plan', null)).toBe('OTHER');
    expect(formTypeFor('register', 'PERMIT_TO_WORK')).toBe('OTHER');
  });
});

describe('values ⇄ rows', () => {
  const detail = (over: Partial<TemplateDetail> = {}): TemplateDetail => ({
    id: 't1',
    companyId: 'co',
    code: 'SAF_A',
    name: 'Rounds',
    description: 'Night rounds',
    formType: 'INSPECTION',
    status: 'DRAFT',
    version: 2,
    versionLabel: null,
    area: 'safety',
    kind: null,
    cadence: null,
    requiresSignature: true,
    origin: 'company',
    sourceTemplateId: null,
    supersedesTemplateId: 'old',
    vesselScope: 'VESSEL_SPECIFIC',
    vesselIds: ['v1'],
    publishedAt: null,
    updatedAt: null,
    createdAt: null,
    formSchema: STORED,
    ...over,
  });

  it('a stored template becomes the builder values (kind from the form type when not stored)', () => {
    const v = valuesFromTemplate(detail());
    expect(v).toMatchObject({ name: 'Rounds', code: 'SAF_A', area: 'safety', kind: 'checklist', description: 'Night rounds', cadence: 'none', requiresSignature: true, vesselScope: 'VESSEL_SPECIFIC', vesselIds: ['v1'] });
    expect(v.sections).toHaveLength(3);
    expect(valuesFromTemplate(detail({ formSchema: {}, vesselScope: 'FLEET' }))).toMatchObject({ vesselIds: [], sections: [expect.objectContaining({ items: [] })] });
  });

  it('the draft payload: live columns always, catalogue columns only once applied', () => {
    const v = { ...valuesFromTemplate(detail()), description: '  ', vesselIds: ['v1', 'v1', 'v2'] };
    const on = draftPayload(v, { areasSetUp: true, current: detail(), code: 'SAF_A' });
    expect(on.live).toMatchObject({ template_name: 'Rounds', template_code: 'SAF_A', description: null, form_type: 'INSPECTION', vessel_scope: 'VESSEL_SPECIFIC', vessel_ids: ['v1', 'v2'] });
    expect((on.live.form_schema as { layout: unknown }).layout).toEqual(STORED.layout);
    expect(on.catalogue).toEqual({ area: 'safety', form_kind: 'checklist', cadence: 'none', requires_completion_signature: true });
    const off = draftPayload({ ...v, vesselScope: 'FLEET' }, { areasSetUp: false, current: null, code: 'X' });
    expect(off.catalogue).toBeNull();
    expect(off.live.vessel_ids).toBeNull();
    expect(off.live.form_type).toBe('CHECKLIST');
  });

  it('a new template: the area from ?area=, a permit in Permits, all vessels, one empty section', () => {
    expect(emptyTemplateValues('ptw')).toMatchObject({ area: 'ptw', kind: 'permit', vesselScope: 'FLEET', vesselIds: [], cadence: 'none' });
    expect(emptyTemplateValues(null).area).toBe('');
    expect(emptyTemplateValues(undefined).sections).toHaveLength(1);
  });
});

describe('the area page dialogs', () => {
  it('a newly hidden vessel needs a reason (up to 300); showing again does not', () => {
    expect(visibilityChangeSchema.safeParse({ hidden: ['v1'], reason: '', newlyHidden: ['v1'] }).success).toBe(false);
    expect(visibilityChangeSchema.safeParse({ hidden: ['v1'], reason: 'Paper log', newlyHidden: ['v1'] }).success).toBe(true);
    expect(visibilityChangeSchema.safeParse({ hidden: [], reason: '', newlyHidden: [] }).success).toBe(true);
    expect(visibilityChangeSchema.safeParse({ hidden: ['v1'], reason: 'r'.repeat(301), newlyHidden: ['v1'] }).success).toBe(false);
  });

  it('the changes between before and after, in the vessels order, the reason only on a hide', () => {
    expect(visibilityChanges(['v1', 'v2', 'v3'], ['v2'], ['v1', 'v3'], ' Paper log ')).toEqual([
      { vesselId: 'v1', visibility: 'hidden', reason: 'Paper log' },
      { vesselId: 'v2', visibility: 'shown', reason: null },
      { vesselId: 'v3', visibility: 'hidden', reason: 'Paper log' },
    ]);
    expect(visibilityChanges(['v1'], ['v1'], ['v1'], '')).toEqual([]);
  });

  it('archive takes an optional reason up to 500; a move needs one of the areas', () => {
    expect(archiveSchema.safeParse({ reason: '' }).success).toBe(true);
    expect(archiveSchema.safeParse({ reason: 'x'.repeat(501) }).success).toBe(false);
    expect(moveAreaSchema.safeParse({ area: 'technical_forms' }).success).toBe(true);
    expect(moveAreaSchema.safeParse({ area: 'deck' }).success).toBe(false);
    expect(moveAreaSchema.safeParse({}).success).toBe(false);
  });
});

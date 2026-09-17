/**
 * Field-to-column mapping for the ruled book pages. Every section field
 * appears exactly once; grouped columns keep individually labelled lines.
 */
import type { TemplateField, TemplateSection } from './templates';

export type ColumnKind = 'date' | 'signatures' | 'entered' | 'code' | 'values';

export interface SheetColumn {
  key: string;
  title: string;
  kind?: ColumnKind;
  fields?: TemplateField[];
  wide?: boolean;
  numbered?: boolean;
  placeholder?: boolean;
}

export function bookColumns(bookId: string, section: TemplateSection): SheetColumn[] {
  const all = section.fields;
  const used = new Set<string>();
  const date: SheetColumn = { key: 'date', title: 'Date / time · UTC', kind: 'date' };
  const signatures: SheetColumn = { key: 'signatures', title: 'Signatures / review', kind: 'signatures' };
  const columns: SheetColumn[] = [date];
  const add = (title: string, keys: string[], extra: Partial<SheetColumn> = {}) => {
    const fields = keys.map((key) => all.find((f) => f.key === key)).filter((f): f is TemplateField => Boolean(f));
    fields.forEach((f) => used.add(f.key));
    if (fields.length || extra.placeholder) {
      columns.push({ key: fields.map((f) => f.key).join('-') || title, title, fields, kind: 'values', ...extra });
    }
  };
  if (['oil', 'oil2', 'cargo', 'ballast'].includes(bookId)) {
    columns.push({ key: 'code', title: 'Code', kind: 'code' });
    add('Item / record of operations', all.map((f) => f.key), { wide: true, numbered: true });
  } else if (['garbage', 'garbage2'].includes(bookId)) {
    add('Position / port / receiving ship', ['port', 'recipient', 'destination', 'latitude', 'longitude', 'location', 'depth', 'startPlace']);
    add('Category', ['category']);
    if (section.id === 'exception') add('Lost / discharged · m³', ['quantity']);
    else {
      const ops: Array<[string, string]> = [['sea', 'To sea · m³'], ['reception', 'To facility / ship · m³'], ...(bookId === 'garbage' ? [['incineration', 'Incinerated · m³'] as [string, string]] : [])];
      for (const [id, title] of ops) add(title, section.id === id ? ['quantity'] : [], { placeholder: true });
    }
    add('Remarks / start and finish', all.filter((f) => !used.has(f.key)).map((f) => f.key), { wide: true });
  } else if (bookId === 'official' && ['drills', 'steering', 'accommodation', 'foodwater'].includes(section.id)) {
    add('Record of exercise / inspection / results', all.map((f) => f.key), { wide: true });
    columns.push({ key: 'entered', title: 'Date of entry', kind: 'entered' });
  } else if (bookId === 'official' && section.id === 'narrative') {
    add('Place / position', ['location']);
    columns.push({ key: 'entered', title: 'Date of entry', kind: 'entered' });
    add('Narrative / cross-references', all.filter((f) => !used.has(f.key)).map((f) => f.key), { wide: true });
  } else if (bookId === 'gmdss' && section.id === 'traffic') {
    add('From / to', ['from', 'to']);
    add('Frequency / channel', ['channel']);
    add('Radio traffic / action', all.filter((f) => !used.has(f.key)).map((f) => f.key), { wide: true });
  } else {
    all.forEach((f) => add(f.label, [f.key], { wide: f.type === 'textarea' }));
  }
  // New fields cannot silently disappear when a template is extended.
  const remainder = all.filter((f) => !used.has(f.key));
  if (remainder.length) add('Additional particulars', remainder.map((f) => f.key));
  return [...columns, signatures];
}

/** Values for storage: blanks omitted, numbers coerced, explicit zero retained, multiline text kept. */
export function lineFields(definitions: TemplateField[], values: Record<string, unknown>): Record<string, string | number> {
  const fields: Record<string, string | number> = {};
  for (const field of definitions) {
    const value = values[field.key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      fields[field.key] = field.type === 'number' ? Number(value) : String(value).trim();
    }
  }
  return fields;
}

/** Merely opening a row must not round a captured time down to the minute. */
export function eventTime(value: string, original?: string | null): string {
  return original && original.slice(0, 16) === value ? original : `${value}:00Z`;
}

/** Formats an item code such as C_11 for display as C.11. */
export const itemCode = (item?: string) => item?.replace(/_/g, '.') ?? '';

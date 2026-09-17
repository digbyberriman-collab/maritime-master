import { describe, expect, it } from 'vitest';
import { LOGBOOK_BOOKS } from '../catalog';
import { bookColumns, eventTime, lineFields } from '../lineLayouts';

describe('bookColumns', () => {
  it('retains every section field exactly once in its editable page columns', () => {
    for (const book of LOGBOOK_BOOKS) {
      for (const section of book.sections) {
        const columns = bookColumns(book.id, section);
        const keys = columns.flatMap((c) => (c.fields ?? []).map((f) => f.key));
        expect(new Set(keys).size, `${book.id}/${section.id}: repeated field`).toBe(keys.length);
        expect(keys.slice().sort(), `${book.id}/${section.id}: missing field`).toEqual(section.fields.map((f) => f.key).sort());
        expect(columns.filter((c) => c.kind === 'signatures')).toHaveLength(1);
        expect(columns.filter((c) => c.kind === 'date')).toHaveLength(1);
      }
    }
  });

  it('enters garbage quantities only in the matching operation column', () => {
    const book = LOGBOOK_BOOKS.find((b) => b.id === 'garbage')!;
    for (const [id, heading] of [['sea', 'To sea · m³'], ['reception', 'To facility / ship · m³'], ['incineration', 'Incinerated · m³']]) {
      const cols = bookColumns(book.id, book.sections.find((s) => s.id === id)!);
      const quantity = cols.filter((c) => c.fields?.some((f) => f.key === 'quantity'));
      expect(quantity).toHaveLength(1);
      expect(quantity[0].title).toBe(heading);
    }
  });

  it('uses code and numbered item columns for oil, cargo and ballast books', () => {
    for (const id of ['oil', 'oil2', 'cargo', 'ballast']) {
      const book = LOGBOOK_BOOKS.find((b) => b.id === id)!;
      const cols = bookColumns(book.id, book.sections[0]);
      expect(cols.some((c) => c.kind === 'code')).toBe(true);
      expect(cols.some((c) => c.numbered)).toBe(true);
    }
  });
});

describe('row payloads', () => {
  it('retains zero and multiline text, omits blanks and preserves captured seconds', () => {
    const fields = [
      { key: 'quantity', type: 'number', label: 'Q', required: true },
      { key: 'blank', type: 'number', label: 'B', required: false },
      { key: 'notes', type: 'textarea', label: 'N', required: false },
    ] as const;
    expect(lineFields([...fields], { quantity: '0', blank: '', notes: 'First line\nSecond line' })).toEqual({ quantity: 0, notes: 'First line\nSecond line' });
    expect(eventTime('2026-09-15T14:05', '2026-09-15T14:05:32.781Z')).toBe('2026-09-15T14:05:32.781Z');
    expect(eventTime('2026-09-15T14:04', '2026-09-15T14:05:32.781Z')).toBe('2026-09-15T14:04:00Z');
  });
});

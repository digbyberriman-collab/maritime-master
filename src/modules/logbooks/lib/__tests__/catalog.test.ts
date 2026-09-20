import { describe, expect, it } from 'vitest';
import { CATALOG_TOTALS, LOGBOOK_BOOKS, getBookBySlug, getBookByDbType } from '../catalog';
import { detailedBooks, profiles, references, volumeFieldsFor } from '../templates';

describe('logbook catalogue', () => {
  it('carries the 17 Meridian books plus the two operational books', () => {
    expect(detailedBooks).toHaveLength(17);
    expect(LOGBOOK_BOOKS).toHaveLength(19);
    expect(CATALOG_TOTALS.books).toBe(19);
  });

  it('retains 103 sections and 604 section fields across the Meridian books', () => {
    const meridian = LOGBOOK_BOOKS.filter((book) => !['bell', 'visitor'].includes(book.id));
    expect(meridian.reduce((n, book) => n + book.sections.length, 0)).toBe(103);
    expect(meridian.reduce((n, book) => n + book.sections.reduce((m, s) => m + s.fields.length, 0), 0)).toBe(604);
  });

  it('gives every book a unique id, slug, code and database type', () => {
    for (const key of ['id', 'slug', 'code', 'dbType'] as const) {
      const values = LOGBOOK_BOOKS.map((book) => book[key]);
      expect(new Set(values).size, key).toBe(values.length);
    }
    expect(getBookBySlug('deck-log')?.id).toBe('deck');
    expect(getBookByDbType('radio_log')?.id).toBe('gmdss');
  });

  it('keeps field keys unique within each section and references every source', () => {
    for (const book of LOGBOOK_BOOKS) {
      expect(references[book.source], book.id).toBeDefined();
      for (const section of book.sections) {
        const keys = section.fields.map((f) => f.key);
        expect(new Set(keys).size, `${book.id}/${section.id}`).toBe(keys.length);
        for (const field of section.fields) {
          if (field.type === 'number') expect(field.min, `${book.id}/${section.id}/${field.key}`).toBeDefined();
          if (field.type === 'select') expect(field.options?.length, `${book.id}/${section.id}/${field.key}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('exposes both flag profiles and book-specific cover fields', () => {
    expect(profiles.map((p) => p.id)).toEqual(['CISR', 'MCA']);
    expect(volumeFieldsFor('ballast').some((f) => f.key === 'ballastCapacity')).toBe(true);
    expect(volumeFieldsFor('oil2').some((f) => f.key === 'slopDepths')).toBe(true);
    expect(volumeFieldsFor('deck').some((f) => f.key === 'slopDepths')).toBe(false);
  });
});

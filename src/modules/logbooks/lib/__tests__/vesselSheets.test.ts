import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { DAGON_ENGINE_LOG, BALANCE_COLUMNS, sheetKey } from '../dagonEngineLog';
import { sheetFields, sheetForSection, sheetSection, vesselSheetSections } from '../vesselSheets';
import { buildTemplate } from '../logbookApi';
import { LOGBOOK_BOOKS } from '../catalog';
import { bookColumns } from '../lineLayouts';

describe('vessel-specific readings sheets', () => {
  it('turns every DAGON sheet cell into an optional text field once', () => {
    const fields = sheetFields(DAGON_ENGINE_LOG);
    const keys = fields.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(fields.every((f) => f.type === 'text' && !f.required)).toBe(true);
    expect(keys).toContain('header.from');
    expect(keys).toContain('signature.chief_engineer');
    for (const section of DAGON_ENGINE_LOG.sections) {
      const columns = section.kind === 'balance' ? BALANCE_COLUMNS : section.columns;
      for (const row of section.rows) for (const column of columns) expect(keys).toContain(sheetKey(section.id, row.key, column.key));
    }
  });

  it('attaches the sheet to the Engine book only for DAGON and keeps it out of other vessels', () => {
    const engine = LOGBOOK_BOOKS.find((b) => b.id === 'engine')!;
    const dagon = buildTemplate(engine, 'M/Y DAGON');
    expect(dagon.sections.some((s) => s.sheet === DAGON_ENGINE_LOG.id)).toBe(true);
    expect(dagon.sections.length).toBe(engine.sections.length + 1);
    expect(buildTemplate(engine, 'M/Y Meridian').sections.length).toBe(engine.sections.length);
    expect(vesselSheetSections('deck-log', 'M/Y DAGON')).toEqual([]);
    const section = sheetSection(DAGON_ENGINE_LOG);
    expect(sheetForSection(section)).toBe(DAGON_ENGINE_LOG);
    expect(section.roles).toEqual(['engineer']);
    // The generic column mapping still accounts for every field, so print fallbacks never drop data.
    const columns = bookColumns('engine', section);
    expect(columns.flatMap((c) => c.fields ?? []).length).toBe(section.fields.length);
  });
});

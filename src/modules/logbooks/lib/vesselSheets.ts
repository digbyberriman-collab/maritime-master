/**
 * Vessel-specific daily readings sheets (currently the M/Y DAGON engine-room
 * log) expressed as template sections so they ride the same volumes, drafts,
 * signatures, pages and audit trail as every other line in the book.
 *
 * Each sheet cell is a schema field keyed `${sectionId}.${rowKey}.${columnKey}`,
 * exactly as the original dialog-based form stored it, so the database guard
 * validates the keys and the printed sheet, computed differences and ROB
 * balances keep working unchanged.
 */
import { DAGON_ENGINE_LOG, BALANCE_COLUMNS, getSheetTemplate, sheetKey, type SheetTemplate } from './dagonEngineLog';
import type { TemplateField, TemplateSection } from './templates';

const SHEETS: Record<string, SheetTemplate> = { [DAGON_ENGINE_LOG.id]: DAGON_ENGINE_LOG };

const text = (key: string, label: string): TemplateField => ({ key, label, type: 'text', required: false });

/** Every cell of the sheet as an optional text field, in sheet order. */
export function sheetFields(template: SheetTemplate): TemplateField[] {
  const fields: TemplateField[] = template.headerFields.map((f) => text(`header.${f.key}`, f.label));
  for (const section of template.sections) {
    const columns = section.kind === 'balance' ? BALANCE_COLUMNS : section.columns;
    for (const row of section.rows) {
      for (const column of columns) fields.push(text(sheetKey(section.id, row.key, column.key), `${section.title} · ${row.label} · ${column.label}`));
    }
  }
  fields.push(...template.signatureFields.map((f) => text(`signature.${f.key}`, f.label)));
  return fields;
}

/** The sheet as a book section. Signed by the duty engineer, reviewed by the Master like any other line. */
export function sheetSection(template: SheetTemplate): TemplateSection {
  return {
    id: template.id,
    title: template.title,
    fields: sheetFields(template),
    referencePages: 'Vessel sheet',
    signing: 'officer-master',
    coverage: 'Vessel-specific company format',
    roles: ['engineer'],
    help: `${template.units}. Readings are entered in the same grids as the paper sheet; running-hour differences and present ROB are calculated.`,
    sheet: template.id,
  };
}

/** Sections to append to a book's template for this vessel (none for vessels without a bespoke sheet). */
export function vesselSheetSections(bookSlug: string, vesselName: string | null | undefined): TemplateSection[] {
  const template = getSheetTemplate(bookSlug, vesselName);
  return template ? [sheetSection(template)] : [];
}

/** The sheet template a section renders with, if any. */
export const sheetForSection = (section: { sheet?: string } | null | undefined): SheetTemplate | undefined =>
  section?.sheet ? SHEETS[section.sheet] : undefined;

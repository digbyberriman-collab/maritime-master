/**
 * Excel builder (gap/08 EX1, EX6), loaded on demand: `runExport` imports this
 * module dynamically and this module imports exceljs dynamically, so neither
 * is in the entry chunk.
 *
 * - one sheet of data: a bold, frozen header row with a filter, column
 *   widths from the column spec, numbers as numbers;
 * - dates as real Excel dates showing the same calendar day as the table
 *   (`yyyy-mm-dd`, or `yyyy-mm-dd hh:mm` for a date and time). Excel dates
 *   have no time zone and exceljs writes a Date as UTC, so the day and the
 *   local wall-clock time are written as a UTC instant: a date never moves
 *   by a day, whatever the viewer's zone;
 * - an "About" sheet: what the export is, its scope, when it was made, the
 *   row count, and the personal-data notice when the export holds personal
 *   data (gap/08 EX4, GD4).
 */
import type { ExportCell, ExportColumnKind, ExportTable } from './table';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface XlsxMeta {
  title: string;
  scope: string;
  generatedAt: string;
  personalData: boolean;
  notice: string | null;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/;

/** A `yyyy-MM-dd[ HH:mm]` cell as the UTC instant Excel shows as that day and time. */
export function excelDate(text: string): Date | null {
  const m = DATE_RE.exec(text);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h ?? 0), Number(mi ?? 0)));
}

/** The value exceljs receives for one cell. */
export function xlsxValue(cell: ExportCell, kind: ExportColumnKind): string | number | Date | null {
  if (cell === null) return null;
  if ((kind === 'date' || kind === 'datetime') && typeof cell === 'string') return excelDate(cell) ?? cell;
  return cell;
}

/** Excel sheet names: at most 31 characters, none of `[]:*?/\`. */
export function sheetName(title: string): string {
  return title.replace(/[[\]:*?/\\]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Export';
}

export async function buildXlsx(table: ExportTable, meta: XlsxMeta): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'STORM';
  workbook.title = meta.title;
  if (meta.notice) workbook.description = meta.notice;

  const sheet = workbook.addWorksheet(sheetName(meta.title), { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = table.headers.map((header, i) => ({
    header,
    key: `c${i}`,
    width: table.widths[i],
    style:
      table.kinds[i] === 'date'
        ? { numFmt: 'yyyy-mm-dd' }
        : table.kinds[i] === 'datetime'
          ? { numFmt: 'yyyy-mm-dd hh:mm' }
          : {},
  }));
  sheet.getRow(1).font = { bold: true };
  for (const row of table.rows) sheet.addRow(row.map((cell, i) => xlsxValue(cell, table.kinds[i])));
  if (table.headers.length) {
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: table.headers.length } };
  }

  const about = workbook.addWorksheet('About');
  about.columns = [
    { key: 'label', width: 18 },
    { key: 'value', width: 70 },
  ];
  about.addRow(['Export', meta.title]);
  about.addRow(['Scope', meta.scope]);
  about.addRow(['Made', meta.generatedAt]);
  about.addRow(['Rows', table.rows.length]);
  if (meta.notice) about.addRow(['Personal data', meta.notice]);
  about.getColumn(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: XLSX_MIME });
}

/**
 * CSV builder (gap/08 EX1), loaded on demand: `runExport` imports this module
 * dynamically and this module imports papaparse dynamically, so neither is in
 * the entry chunk.
 *
 * - UTF-8 with a byte-order mark, so Excel opens accented names correctly;
 * - CRLF line ends, every field quoted where needed (papaparse);
 * - a text cell that a spreadsheet would read as a formula (it starts with
 *   `=`, `+`, `-`, `@`, a tab or a carriage return) is prefixed with `'`
 *   (CSV injection). Number columns stay numbers.
 */
import type { ExportCell, ExportColumnKind, ExportTable } from './table';

export const CSV_MIME = 'text/csv;charset=utf-8';
const FORMULA_START = /^[=+\-@\t\r]/;

/** The text written for one cell. */
export function csvField(cell: ExportCell, kind: ExportColumnKind): string {
  if (cell === null) return '';
  if (typeof cell === 'number') return String(cell);
  if (kind !== 'number' && FORMULA_START.test(cell)) return `'${cell}`;
  return cell;
}

export async function buildCsvText(table: ExportTable): Promise<string> {
  const { default: Papa } = await import('papaparse');
  const data = table.rows.map((row) => row.map((cell, i) => csvField(cell, table.kinds[i])));
  const headers = table.headers.map((h) => csvField(h, 'text'));
  return Papa.unparse({ fields: headers, data }, { newline: '\r\n' });
}

export async function buildCsv(table: ExportTable): Promise<Blob> {
  const text = await buildCsvText(table);
  return new Blob(['\uFEFF', text], { type: CSV_MIME });
}

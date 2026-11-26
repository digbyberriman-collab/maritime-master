/**
 * The table an export is built from (gap/08 EX1; platform-prep PP4).
 *
 * A caller describes its columns once (`ExportColumn`) and hands over its
 * rows; `buildExportTable` turns them into plain cells that the CSV, Excel
 * and PDF builders share, so the three formats always agree.
 *
 * Dates are calendar days (MASTER-PROMPT §4, "date-only strings in local
 * time"):
 * - a `date` column keeps a stored `yyyy-MM-dd` exactly as it is (a date
 *   column never moves with the viewer's time zone); a Date becomes its
 *   local calendar day, and a timestamp string the local day it happened;
 * - a `datetime` column shows the local wall-clock time, `yyyy-MM-dd HH:mm`.
 *
 * Pure: no React, no Supabase, no export library.
 */
import { localCalendarDate } from '@/lib/records/dates';

export type ExportColumnKind = 'text' | 'number' | 'date' | 'datetime' | 'boolean';

/** What a column's `value` may return. */
export type ExportValue = string | number | boolean | Date | null | undefined;

export interface ExportColumn<Row> {
  /** Stable id (snake_case or camelCase); used by tests and the XLSX column keys. */
  key: string;
  /** The heading shown in the file. */
  header: string;
  value: (row: Row) => ExportValue;
  /** Default `text`. */
  kind?: ExportColumnKind;
  /** Rough width in characters, for Excel and PDF. Default from the header and the kind. */
  width?: number;
}

/** A normalised cell: text, a number, or empty. Dates are `yyyy-MM-dd` / `yyyy-MM-dd HH:mm` text. */
export type ExportCell = string | number | null;

export interface ExportTable {
  headers: string[];
  kinds: ExportColumnKind[];
  widths: number[];
  rows: ExportCell[][];
}

export const BOOLEAN_TEXT = { yes: 'Yes', no: 'No' } as const;

const pad = (n: number) => String(n).padStart(2, '0');

/** `yyyy-MM-dd HH:mm` in the viewer's local time. */
export function localDateTime(input: string | Date): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Not a date and time: ${String(input)}`);
  return `${localCalendarDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** One cell, normalised for its column kind. Unreadable dates throw (a caller bug, never a silent blank). */
export function exportCell(value: ExportValue, kind: ExportColumnKind = 'text'): ExportCell {
  if (value === null || value === undefined || value === '') return null;
  switch (kind) {
    case 'number': {
      if (typeof value === 'number') return Number.isFinite(value) ? value : null;
      if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
      return String(value);
    }
    case 'date':
      if (typeof value === 'boolean' || typeof value === 'number') return String(value);
      return localCalendarDate(value);
    case 'datetime':
      if (typeof value === 'boolean' || typeof value === 'number') return String(value);
      return localDateTime(value);
    case 'boolean':
      if (typeof value === 'boolean') return value ? BOOLEAN_TEXT.yes : BOOLEAN_TEXT.no;
      return String(value);
    default:
      if (value instanceof Date) return localDateTime(value);
      if (typeof value === 'boolean') return value ? BOOLEAN_TEXT.yes : BOOLEAN_TEXT.no;
      return String(value);
  }
}

const DEFAULT_WIDTH: Record<ExportColumnKind, number> = { text: 18, number: 10, date: 12, datetime: 17, boolean: 8 };

export function buildExportTable<Row>(columns: readonly ExportColumn<Row>[], rows: readonly Row[]): ExportTable {
  const kinds = columns.map((c) => c.kind ?? 'text');
  return {
    headers: columns.map((c) => c.header),
    kinds,
    widths: columns.map((c, i) => c.width ?? Math.max(DEFAULT_WIDTH[kinds[i]], Math.min(c.header.length + 2, 40))),
    rows: rows.map((row) => columns.map((c, i) => exportCell(c.value(row), kinds[i]))),
  };
}

/** A cell as text (CSV and PDF): empty for null. */
export function cellText(cell: ExportCell): string {
  return cell === null ? '' : String(cell);
}

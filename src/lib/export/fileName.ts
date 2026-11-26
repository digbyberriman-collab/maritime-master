/**
 * Export file names (gap/08 EX1): `<VESSELCODE|FLEET>_<Kind>_<range-or-date>_<yyyy-mm-dd>.<ext>`.
 *
 * - scope: the vessel code in capitals (`DRA`), or `FLEET` for a fleet export;
 * - kind: words joined in PascalCase (`Crew list` → `CrewList`, `hours-of-rest` → `HoursOfRest`);
 * - range-or-date: a reference (`DRA-PTW-2026-001`), one day (`2026-11-01`)
 *   or a range (`2026-11-01-to-2026-11-30`); left out when the export has none;
 * - the last part is the day the file was made, in local time.
 *
 * Every part is sanitised to `[A-Za-z0-9-]`, so a name never carries a path
 * separator, a space or a character a file system refuses.
 */
import { localCalendarDate, type DateInput } from '@/lib/records/dates';

export type ExportExtension = 'csv' | 'xlsx' | 'pdf';

export type ExportRange =
  | { from: DateInput; to: DateInput }
  | { on: DateInput }
  | { ref: string };

export interface ExportFileNameParts {
  /** The vessel's code; empty or missing means a fleet export. */
  vesselCode?: string | null;
  kind: string;
  range?: ExportRange | null;
  ext: ExportExtension;
  /** The day the file is made (default: now, local). */
  generatedOn?: Date;
}

export const FLEET_SCOPE = 'FLEET';
const MAX_PART = 60;

const clean = (text: string) => text.replace(/[^A-Za-z0-9-]+/g, '').slice(0, MAX_PART);

/** `DRA` for a vessel code, `FLEET` when there is none (or nothing usable). */
export function exportScopePart(vesselCode?: string | null): string {
  const code = (vesselCode ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 12);
  return code || FLEET_SCOPE;
}

/** `Crew list` → `CrewList`; acronyms keep their capitals (`HoR month` → `HoRMonth`). */
export function exportKindPart(kind: string): string {
  const words = kind.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const joined = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  return clean(joined) || 'Export';
}

export function exportRangePart(range?: ExportRange | null): string | null {
  if (!range) return null;
  if ('ref' in range) return clean(range.ref.trim().replace(/\s+/g, '-')) || null;
  if ('on' in range) return localCalendarDate(range.on);
  const from = localCalendarDate(range.from);
  const to = localCalendarDate(range.to);
  return from === to ? from : `${from}-to-${to}`;
}

export function exportFileName(parts: ExportFileNameParts): string {
  const segments = [
    exportScopePart(parts.vesselCode),
    exportKindPart(parts.kind),
    exportRangePart(parts.range),
    localCalendarDate(parts.generatedOn ?? new Date()),
  ].filter((s): s is string => Boolean(s));
  return `${segments.join('_')}.${parts.ext}`;
}

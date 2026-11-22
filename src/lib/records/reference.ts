/**
 * Human-readable record references (DECISIONS C21; gap/01 F21).
 *
 *   vessel records   TYPE-VSL-YYYY-NNN    PTW-DRA-2026-061
 *   fleet records    TYPE-YYYY-NNN        AUD-2026-004
 *   voyages          VSL-YYYYMMDD-NNN     DRA-20261103-037
 *
 * TYPE is the record kind's prefix (registry `refPrefix`), VSL the vessel
 * code (D-25, amending C20: a letter then two letters or digits, stored
 * upper case, e.g. `DRA` or `DR1`), NNN the counter, zero-padded to three
 * digits and allowed to grow past 999. Every code `getVesselCode()` can
 * return must format and parse here.
 *
 * Numbers are never computed in the browser: the counter comes from
 * `next_reference_value()` through SQL `format_reference()`. This module
 * formats and parses for display, search ("PTW-DRA-2026-061" in the command
 * palette) and tests, and must stay in step with the SQL.
 */
import { toCalendarDate, type DateInput } from './dates';

/** Record-kind prefixes: an upper-case letter, then up to seven letters or digits. */
export const REFERENCE_TYPE_PATTERN = /^[A-Z][A-Z0-9]{0,7}$/;
/**
 * Vessel codes (D-25, amending C20): a letter followed by two letters or
 * digits. Must agree with `storedVesselCode()` in
 * `src/modules/vessels/lib/vesselCode.ts` (a test pins the agreement).
 */
export const VESSEL_CODE_PATTERN = /^[A-Z][A-Z0-9]{2}$/;

export interface RecordReferenceInput {
  /** Record-kind prefix, e.g. `PTW`. Upper-cased. */
  type: string;
  /** Vessel code (D-25); omit (or null) for fleet-level records. Upper-cased. */
  vesselCode?: string | null;
  /** The record's numbering date; only the year is used. */
  date: DateInput;
  /** Counter value, 1 or more. */
  seq: number;
}

export interface VoyageReferenceInput {
  kind: 'voyage';
  vesselCode: string;
  /** Voyage start date; printed as YYYYMMDD. */
  date: DateInput;
  seq: number;
}

export type ParsedReference =
  | { kind: 'record'; type: string; vesselCode: string | null; year: number; seq: number }
  | { kind: 'voyage'; vesselCode: string; date: string; seq: number };

function checkSeq(seq: number): string {
  if (!Number.isInteger(seq) || seq < 1) throw new RangeError(`Reference counter must be a whole number ≥ 1, got ${seq}`);
  return String(seq).padStart(3, '0');
}

function checkVesselCode(code: string): string {
  const upper = String(code).trim().toUpperCase();
  if (!VESSEL_CODE_PATTERN.test(upper)) throw new RangeError(`Vessel code must be a letter followed by two letters or digits, got "${code}"`);
  return upper;
}

function checkType(type: string): string {
  const upper = String(type).trim().toUpperCase();
  if (!REFERENCE_TYPE_PATTERN.test(upper)) throw new RangeError(`Reference type must be 1–8 letters or digits starting with a letter, got "${type}"`);
  return upper;
}

/** `VSL-YYYYMMDD-NNN`. */
export function formatVoyageReference(input: Omit<VoyageReferenceInput, 'kind'>): string {
  const vessel = checkVesselCode(input.vesselCode);
  const day = toCalendarDate(input.date).replace(/-/g, '');
  return `${vessel}-${day}-${checkSeq(input.seq)}`;
}

/**
 * Format a reference. Record kinds give `TYPE-VSL-YYYY-NNN` (or
 * `TYPE-YYYY-NNN` without a vessel); `{ kind: 'voyage' }` gives
 * `VSL-YYYYMMDD-NNN`. Throws `RangeError` on invalid parts.
 */
export function formatReference(input: RecordReferenceInput | VoyageReferenceInput): string {
  if ('kind' in input && input.kind === 'voyage') return formatVoyageReference(input);
  const record = input as RecordReferenceInput;
  const type = checkType(record.type);
  const year = toCalendarDate(record.date).slice(0, 4);
  const seq = checkSeq(record.seq);
  const hasVessel = record.vesselCode !== null && record.vesselCode !== undefined && String(record.vesselCode).trim() !== '';
  return hasVessel ? `${type}-${checkVesselCode(record.vesselCode as string)}-${year}-${seq}` : `${type}-${year}-${seq}`;
}

const VESSEL_RECORD = /^([A-Z][A-Z0-9]{0,7})-([A-Z][A-Z0-9]{2})-(\d{4})-(\d{3,})$/;
const FLEET_RECORD = /^([A-Z][A-Z0-9]{0,7})-(\d{4})-(\d{3,})$/;
/*
 * Tried first. A fleet record never matches it: FLEET_RECORD's middle
 * segment is a 4-digit year, VOYAGE's an 8-digit date.
 */
const VOYAGE = /^([A-Z][A-Z0-9]{2})-(\d{4})(\d{2})(\d{2})-(\d{3,})$/;

/**
 * Parse a reference typed by a person or printed on a PDF. Case and
 * surrounding space are ignored. Returns null for anything that is not one
 * of the three formats (including a zero counter or an impossible date).
 */
export function parseReference(text: string): ParsedReference | null {
  if (typeof text !== 'string') return null;
  const value = text.trim().toUpperCase();

  const voyage = VOYAGE.exec(value);
  if (voyage) {
    const date = `${voyage[2]}-${voyage[3]}-${voyage[4]}`;
    const seq = Number(voyage[5]);
    try {
      toCalendarDate(date);
    } catch {
      return null;
    }
    return seq >= 1 ? { kind: 'voyage', vesselCode: voyage[1], date, seq } : null;
  }

  const vessel = VESSEL_RECORD.exec(value);
  if (vessel) {
    const seq = Number(vessel[4]);
    return seq >= 1 ? { kind: 'record', type: vessel[1], vesselCode: vessel[2], year: Number(vessel[3]), seq } : null;
  }

  const fleet = FLEET_RECORD.exec(value);
  if (fleet) {
    const seq = Number(fleet[3]);
    return seq >= 1 ? { kind: 'record', type: fleet[1], vesselCode: null, year: Number(fleet[2]), seq } : null;
  }

  return null;
}

/** True when `text` parses as a reference. */
export function isReference(text: string): boolean {
  return parseReference(text) !== null;
}

/** The canonical spelling of a reference (upper case, padded), or null. */
export function normaliseReference(text: string): string | null {
  const parsed = parseReference(text);
  if (!parsed) return null;
  if (parsed.kind === 'voyage') return formatVoyageReference(parsed);
  return formatReference({ type: parsed.type, vesselCode: parsed.vesselCode, date: `${String(parsed.year).padStart(4, '0')}-01-01`, seq: parsed.seq });
}

/**
 * Sort order for registers: type, vessel, year (or date), then counter as a
 * number (so `-1000` sorts after `-999`). Unparseable strings sort last,
 * alphabetically.
 */
export function compareReferences(a: string, b: string): number {
  const pa = parseReference(a);
  const pb = parseReference(b);
  if (!pa || !pb) {
    if (pa) return -1;
    if (pb) return 1;
    return a.localeCompare(b);
  }
  const key = (p: ParsedReference): [string, string, string, number] =>
    p.kind === 'voyage' ? ['', p.vesselCode, p.date, p.seq] : [p.type, p.vesselCode ?? '', String(p.year), p.seq];
  const [ta, va, da, sa] = key(pa);
  const [tb, vb, db, sb] = key(pb);
  return ta.localeCompare(tb) || va.localeCompare(vb) || da.localeCompare(db) || sa - sb;
}

/**
 * The `reference_counters.scope` that `format_reference()` uses. Counters are
 * keyed by vessel **id**, not code (gap/01: a code fix-up never collides),
 * per company, type and year; voyages per vessel and day.
 */
export function referenceCounterScope(input: {
  type: string;
  companyId: string;
  vesselId?: string | null;
  date: DateInput;
  voyage?: boolean;
}): string {
  const day = toCalendarDate(input.date);
  if (input.voyage) {
    if (!input.vesselId) throw new RangeError('Voyage counters need a vessel id');
    return `voyage:${input.companyId}:${input.vesselId}:${day.replace(/-/g, '')}`;
  }
  return `ref:${checkType(input.type)}:${input.companyId}:${input.vesselId ?? 'fleet'}:${day.slice(0, 4)}`;
}

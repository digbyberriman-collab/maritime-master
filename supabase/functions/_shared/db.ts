/**
 * Row narrowing and database error classification for edge functions
 * (Phase 2 spec §C.1; DECISIONS D-01).
 *
 * The edge clients are untyped (`SupabaseClient` without a `Database`
 * type: the app's generated types live under `src/` and are not bundled
 * into functions), so every row read is narrowed here before use instead of
 * trusting an implicit `any`.
 *
 * Missing-object classification mirrors `src/integrations/supabase/missingRelation.ts`:
 * - `isMissingFunction`: the RPC is not in the database yet (42883 undefined
 *   function, PGRST202 schema-cache miss) → the call site's documented
 *   legacy branch (D-01);
 * - `isMissingTable`: the table itself is not there (42P01, PGRST205).
 * Anything else is a real failure and the caller fails closed.
 */

export type Row = Readonly<Record<string, unknown>>;

export interface DbError {
  code?: string;
  message?: string;
}

const MISSING_FUNCTION_CODES: readonly string[] = ['42883', 'PGRST202'];
const MISSING_TABLE_CODES: readonly string[] = ['42P01', 'PGRST205'];

function codeOf(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : '';
}

/** The SQLSTATE / PostgREST code of an error, or '' when it has none. */
export function errorCode(error: unknown): string {
  return codeOf(error);
}

/** The error's message when it is a short single line of text, else ''. Never use it for logs. */
export function errorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' ? message : '';
}

export function isMissingFunction(error: unknown): boolean {
  return MISSING_FUNCTION_CODES.includes(codeOf(error));
}

export function isMissingTable(error: unknown): boolean {
  return MISSING_TABLE_CODES.includes(codeOf(error));
}

/** A plain object row, or null for anything else (null, arrays, scalars). */
export function asRow(value: unknown): Row | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Row;
}

/** Every plain-object row of an array result; anything else is empty. */
export function rowsOf(value: unknown): Row[] {
  if (!Array.isArray(value)) return [];
  const rows: Row[] = [];
  for (const item of value) {
    const row = asRow(item);
    if (row) rows.push(row);
  }
  return rows;
}

/** A non-empty string column, else null. */
export function text(row: Row | null, key: string): string | null {
  const value = row?.[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function bool(row: Row | null, key: string): boolean | null {
  const value = row?.[key];
  return typeof value === 'boolean' ? value : null;
}

export function int(row: Row | null, key: string): number | null {
  const value = row?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Milliseconds since the epoch of a timestamp column, or null when absent or unparseable. */
export function timeOf(row: Row | null, key: string): number | null {
  const value = text(row, key);
  if (value === null) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

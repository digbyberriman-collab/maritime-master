/**
 * The one "not live yet" classifier (DECISIONS D-01; gap/00 D2).
 *
 * True when an error means a table, view, column or RPC is not in the live
 * schema yet, so the page renders its `ModuleOff` / `PageEmpty` state
 * instead of an error: never a crash, never mock rows. Every caller uses
 * this one function, so a page, `PageError` and `notify` classify the same
 * error the same way:
 *
 * - `isMissingRelation` from `@/integrations/supabase/pending` (pages built
 *   on the pending-table shim);
 * - `isMissingRelationError` and `normaliseError(...).kind ===
 *   'missing_feature'` from `@/shared/lib/notify` (`PageError`).
 *
 * Pure on purpose: no client import (importing `client.ts` without the
 * Supabase env throws, which would break every test that touches notify).
 */

/**
 * Postgres SQLSTATE and PostgREST codes for "not in the live schema":
 * undefined table, column and function; PostgREST's schema-cache misses for
 * an embedded relationship, a function, a column and a table.
 */
export const MISSING_RELATION_CODES: readonly string[] = ['42P01', '42703', '42883', 'PGRST200', 'PGRST202', 'PGRST204', 'PGRST205'];

/** For errors that lost their code (e.g. `new Error(error.message)`). */
const MISSING_RELATION_MESSAGE = /relation .* does not exist|could not find the (table|function)|column .* does not exist/i;

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

/**
 * True for a "table / view / column / RPC not live yet" error. A coded error
 * is judged by its code alone; an error without a code (or a bare string)
 * by its message. Never throws.
 */
export function isMissingRelation(error: unknown): boolean {
  if (error === null || error === undefined) return false;
  if (typeof error === 'string') return MISSING_RELATION_MESSAGE.test(error);
  if (typeof error !== 'object') return false;
  const e = error as { code?: unknown; message?: unknown };
  const code = text(e.code);
  if (code) return MISSING_RELATION_CODES.includes(code);
  const message = text(e.message);
  return message !== undefined && MISSING_RELATION_MESSAGE.test(message);
}

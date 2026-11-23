/**
 * Results of the record-engine services (Phase 2 spec §B.6).
 *
 * - `missing`: the engine's table or RPC is not in the database yet (D-01);
 *   pages show their "not set up" state (`ModuleOff` / `PageEmpty`).
 * - `refused`: the server applied its rules and said no (a stable `code`
 *   plus a sentence), e.g. `open_requests`, `slot_waiting`, `not_eligible`.
 * - `ok`: the value.
 *
 * Any other failure (network, RLS denial, a 5xx) is thrown, so React Query
 * and the page's error state with Retry see it. Never a fake success.
 */
import { isMissingRelation } from '@/integrations/supabase/missingRelation';
import type { Json } from '@/integrations/supabase/types';

export type ServiceResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'missing' }
  | { status: 'refused'; code: string; message: string };

export const missing = { status: 'missing' } as const;

/** Narrow a `RecordRpcResult` jsonb answer; anything else is a protocol error (thrown). */
export function fromRpcResult<T>(data: Json | null): ServiceResult<T> {
  if (data && typeof data === 'object' && !Array.isArray(data) && 'ok' in data) {
    if (data.ok === true) return { status: 'ok', value: (data.value ?? null) as T };
    const error = data.error;
    if (data.ok === false && error && typeof error === 'object' && !Array.isArray(error)) {
      const code = typeof error.code === 'string' ? error.code : 'refused';
      const message = typeof error.message === 'string' ? error.message : 'The record engine refused the action.';
      return { status: 'refused', code, message };
    }
  }
  throw new Error('The record engine returned an answer STORM does not understand.');
}

/** `missing` for a not-live-yet error; rethrows anything else. */
export function missingOrThrow(error: unknown): { status: 'missing' } {
  if (isMissingRelation(error)) return missing;
  throw error;
}

/**
 * SQLSTATEs the engine's row-returning definers (file, link and export RPCs)
 * raise for a business rule, with a stable snake_case code as the message
 * (Phase 2 spec §A.13, e.g. `22023 record_closed`). Authorization failures
 * (`42501`), unknown ids (`P0002`) and everything else are not business
 * outcomes: they are thrown.
 */
export const RULE_REFUSAL_SQLSTATES: readonly string[] = ['22023'];

const STABLE_CODE = /^[a-z][a-z0-9_]{0,62}$/;
const REFUSED_FALLBACK = 'The record engine refused the action.';

/** `missing` for a not-live-yet error, `refused` for a business rule (22023), else rethrows. */
export function refusedOrThrow(error: unknown): { status: 'missing' } | { status: 'refused'; code: string; message: string } {
  if (isMissingRelation(error)) return missing;
  const e = (error ?? {}) as { code?: unknown; message?: unknown };
  if (typeof e.code === 'string' && RULE_REFUSAL_SQLSTATES.includes(e.code)) {
    const text = typeof e.message === 'string' ? e.message.trim() : '';
    if (STABLE_CODE.test(text)) return { status: 'refused', code: text, message: REFUSED_FALLBACK };
    return { status: 'refused', code: 'invalid_input', message: text || REFUSED_FALLBACK };
  }
  throw error;
}

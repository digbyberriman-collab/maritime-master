/**
 * The one "not live yet" classifier (DECISIONS D-01). Every code, the
 * code-less message fallbacks, and the cases that must not be mistaken for a
 * missing table. The aliases (`isMissingRelation` from the pending shim,
 * `isMissingRelationError` and `normaliseError` from notify) must give the
 * same answer for every row, so a page and `PageError` never disagree.
 */
import { describe, expect, it, vi } from 'vitest';

// The pending shim imports the app client, which needs the Supabase env.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { MISSING_RELATION_CODES, isMissingRelation } from '@/integrations/supabase/missingRelation';
import { isMissingRelation as pendingIsMissingRelation } from '@/integrations/supabase/pending';
import { isMissingRelationError, normaliseError } from '@/shared/lib/notify';

const MISSING: Array<[string, unknown]> = [
  ['42P01 undefined table', { code: '42P01', message: 'relation "public.rf_snags" does not exist' }],
  ['42703 undefined column', { code: '42703', message: 'column rf_snags.severity does not exist' }],
  ['42883 undefined function', { code: '42883', message: 'function public.next_reference(uuid, text, text) does not exist' }],
  ['PGRST200 embed of a pending table', { code: 'PGRST200', message: "Could not find a relationship between 'crew_members' and 'rf_snags' in the schema cache" }],
  ['PGRST202 RPC not in the schema cache', { code: 'PGRST202', message: 'Could not find the function public.next_reference(_prefix, _table, _vessel_id) in the schema cache' }],
  ['PGRST204 column not in the schema cache', { code: 'PGRST204', message: "Could not find the 'severity' column of 'rf_snags' in the schema cache" }],
  ['PGRST205 table not in the schema cache', { code: 'PGRST205', message: "Could not find the table 'public.rf_snags' in the schema cache" }],
  ['empty code, relation message', { code: '', message: 'relation "rf_x" does not exist' }],
  ['no code, schema-cache table message', { message: "Could not find the table 'public.rf_x' in the schema cache" }],
  ['no code, schema-cache function message', { message: 'Could not find the function public.f in the schema cache' }],
  ['Error that lost its code (relation)', new Error('relation "rf_x" does not exist')],
  ['Error that lost its code (column)', new Error('column "severity" does not exist')],
  ['a bare string', 'relation "rf_x" does not exist'],
];

const NOT_MISSING: Array<[string, unknown]> = [
  ['null', null],
  ['undefined', undefined],
  ['empty object', {}],
  ['a number', 42],
  ['an empty string', ''],
  ['RLS denial', { code: '42501', message: 'permission denied for table rf_snags' }],
  ['no rows from .single()', { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }],
  ['duplicate key', { code: '23505', message: 'duplicate key value violates unique constraint' }],
  ['a coded error is judged by its code, not its text', { code: '42501', message: 'relation "x" does not exist' }],
  ['no code, relationship message (not a table, column or function)', { message: "Could not find a relationship between 'a' and 'b'" }],
  ['network failure', new TypeError('Failed to fetch')],
  ['lock timeout', { code: '55P03', message: 'canceling statement due to lock timeout' }],
];

describe('isMissingRelation (the one classifier)', () => {
  it('lists every "not in the live schema" code', () => {
    expect([...MISSING_RELATION_CODES].sort()).toEqual(['42703', '42883', '42P01', 'PGRST200', 'PGRST202', 'PGRST204', 'PGRST205']);
  });

  it.each(MISSING)('%s → missing', (_label, error) => {
    expect(isMissingRelation(error)).toBe(true);
  });

  it.each(NOT_MISSING)('%s → not missing', (_label, error) => {
    expect(isMissingRelation(error)).toBe(false);
  });

  it('every code is recognised whatever its message', () => {
    for (const code of MISSING_RELATION_CODES) expect(isMissingRelation({ code, message: 'anything' })).toBe(true);
  });
});

describe('every alias gives the same answer', () => {
  it.each([...MISSING, ...NOT_MISSING])('%s', (_label, error) => {
    const expected = isMissingRelation(error);
    expect(isMissingRelationError(error)).toBe(expected);
    expect(normaliseError(error).kind === 'missing_feature').toBe(expected);
    if (error === null || error === undefined || (typeof error === 'object' && !(error instanceof Error))) {
      expect(pendingIsMissingRelation(error as Parameters<typeof pendingIsMissingRelation>[0])).toBe(expected);
    }
  });

  it('notify re-exports the classifier itself', () => {
    expect(isMissingRelationError).toBe(isMissingRelation);
  });
});

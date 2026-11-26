/**
 * The hours-of-rest data layer (services/workRestService.ts; gap/04 C38,
 * C39, C43; DECISIONS D-01, D-239, D-X1-20): the one engine switch
 * (`isEngineMissing`), the refusals, the answer parsers, the engine calls
 * with their legacy fallback, and the reads that fall back to the legacy
 * columns while 20261124060700 is not applied. The Supabase client is a
 * scripted stand-in: every request is recorded and answered by the test.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Filter = [string, string, unknown];
interface Call {
  table: string;
  op: 'select' | 'insert' | 'update' | 'delete' | 'upsert';
  columns: string | null;
  filters: Filter[];
  payload?: unknown;
  returning?: boolean;
}
type Answer = { data: unknown; error: { code?: string; message: string; details?: string; hint?: string } | null };

const h = vi.hoisted(() => ({
  calls: [] as Call[],
  rpcCalls: [] as Array<{ fn: string; args: unknown }>,
  respond: (_call: Call): Answer => ({ data: null, error: null }),
  rpc: (_fn: string, _args: unknown): Answer => ({ data: null, error: null }),
}));

vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    const call: Call = { table, op: 'select', columns: null, filters: [] };
    h.calls.push(call);
    const api = {
      select: (columns?: string) => {
        if (call.op === 'select') call.columns = columns ?? '*';
        else call.returning = true;
        return api;
      },
      insert: (payload: unknown) => Object.assign(call, { op: 'insert', payload }) && api,
      upsert: (payload: unknown) => Object.assign(call, { op: 'upsert', payload }) && api,
      update: (payload: unknown) => Object.assign(call, { op: 'update', payload }) && api,
      delete: () => Object.assign(call, { op: 'delete' }) && api,
      eq: (c: string, v: unknown) => (call.filters.push([c, 'eq', v]), api),
      in: (c: string, v: unknown) => (call.filters.push([c, 'in', v]), api),
      gte: (c: string, v: unknown) => (call.filters.push([c, 'gte', v]), api),
      lte: (c: string, v: unknown) => (call.filters.push([c, 'lte', v]), api),
      order: () => api,
      limit: () => api,
      maybeSingle: () => api,
      single: () => api,
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve().then(() => h.respond(call)).then(resolve, reject),
    };
    return api;
  };
  return {
    supabase: {
      from: (table: string) => builder(table),
      rpc: async (fn: string, args: unknown) => {
        h.rpcCalls.push({ fn, args });
        return h.rpc(fn, args);
      },
    },
  };
});

import {
  asWorkRestError,
  engineBlocks,
  fillDays,
  getOrCreateSubmission,
  isEngineMissing,
  listNonConformities,
  listSignatures,
  listVesselMonthMatrix,
  loadEffectiveRuleSet,
  monthContextRange,
  parseFillDaysResult,
  parseMonthTransitionResult,
  parseSaveDayResult,
  saveDay,
  transitionMonth,
  WorkRestEngineRequired,
  WorkRestRefusal,
} from '@/modules/work-rest/services/workRestService';
import { DEFAULT_THRESHOLDS, type WorkRestBlock } from '@/modules/work-rest/types';

const OK = (data: unknown): Answer => ({ data, error: null });
const FAIL = (code: string, message: string, extra: { details?: string; hint?: string } = {}): Answer => ({ data: null, error: { code, message, ...extra } });
const MISSING_RPC = (fn: string) => FAIL('PGRST202', `Could not find the function public.${fn} in the schema cache`);

const V = '00000000-0000-4000-8000-0000000000a1';
const CREW = '00000000-0000-4000-8000-0000000000c1';
const SUB = '00000000-0000-4000-8000-0000000000d1';
const ACTOR = '00000000-0000-4000-8000-0000000000e1';

const work = (start: number, end: number, extra: Partial<WorkRestBlock> = {}): WorkRestBlock => ({ block_type: 'work', start_minute: start, end_minute: end, ...extra });

beforeEach(() => {
  h.calls = [];
  h.rpcCalls = [];
  h.respond = () => OK(null);
  h.rpc = () => OK(null);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('the engine switch (D-01, D-239)', () => {
  it('PGRST202 means the RPC is not in this database', () => {
    expect(isEngineMissing({ code: 'PGRST202', message: 'Could not find the function' }, 'work_rest_save_day')).toBe(true);
  });

  it('42883 counts only when it names the called function', () => {
    expect(isEngineMissing({ code: '42883', message: 'function public.work_rest_save_day(uuid, uuid, date, jsonb, text) does not exist' }, 'work_rest_save_day')).toBe(true);
    // A helper missing inside an existing engine function is a real error.
    expect(isEngineMissing({ code: '42883', message: 'function public.crew_vessel_cap(text, uuid) does not exist' }, 'work_rest_save_day')).toBe(false);
    expect(isEngineMissing({ code: '42883' }, 'work_rest_save_day')).toBe(false);
  });

  it('anything else is a real error', () => {
    for (const e of [null, undefined, 'PGRST202', { code: '42P01', message: 'relation does not exist' }, { code: '22023', message: 'month_closed' }, { message: 'work_rest_save_day' }]) {
      expect(isEngineMissing(e, 'work_rest_save_day')).toBe(false);
    }
  });
});

describe('refusals', () => {
  it('42501, 22023 and P0002 become a WorkRestRefusal whose message is the DETAIL sentence', () => {
    const r = asWorkRestError({ code: '22023', message: 'month_closed', details: 'This month is submitted. Reopen it to change a day.', hint: '2026-11' });
    expect(r).toBeInstanceOf(WorkRestRefusal);
    const refusal = r as WorkRestRefusal;
    expect(refusal.code).toBe('22023');
    expect(refusal.refusal).toBe('month_closed');
    expect(refusal.message).toBe('This month is submitted. Reopen it to change a day.');
    expect(refusal.hint).toBe('2026-11');
    expect(asWorkRestError({ code: '42501', message: 'work_rest_engine_only' })).toMatchObject({ code: '42501', message: 'work_rest_engine_only', hint: null });
    expect(asWorkRestError({ code: 'P0002', message: 'crew_not_found', details: ' ' })).toMatchObject({ message: 'crew_not_found' });
  });

  it('any other error is returned as it is', () => {
    const e = { code: '23505', message: 'duplicate key' };
    expect(asWorkRestError(e)).toBe(e);
    expect(asWorkRestError('boom')).toBe('boom');
    expect(asWorkRestError(null)).toBeNull();
  });
});

describe('answer parsers', () => {
  it('reads work_rest_save_day', () => {
    const r = parseSaveDayResult({
      record_id: 'r1',
      submission_id: SUB,
      date: '2026-11-10',
      day: { work_minutes: 840, rest_minutes: 600, longest_rest_minutes: 600, rest_period_count: 1, is_compliant: true },
      breaches: [
        { id: 'n1', rule_code: 'REST_24H_MIN', severity: 'high', is_serious: false, measured_value: 7.5, threshold_value: 10, deficit_hours: 2.5 },
        { id: 'n2', rule_code: 'REST_PERIODS_MAX', severity: 'medium', is_serious: false, measured_value: 3, threshold_value: 2, deficit_hours: null },
      ],
      changes: { days: 8, inserted: 1, updated: 0, superseded: 1, deleted: 0 },
    });
    expect(r.day).toEqual({ work_minutes: 840, rest_minutes: 600, longest_rest_minutes: 600, rest_period_count: 1, is_compliant: true });
    expect(r.breaches[0]).toMatchObject({ rule_code: 'REST_24H_MIN', deficit_hours: 2.5 });
    expect(r.breaches[1].deficit_hours).toBeNull();
    expect(r.changes.superseded).toBe(1);
  });

  it('numbers sent as strings (numeric columns) are read as numbers; missing parts default', () => {
    const r = parseSaveDayResult({ record_id: 'r1', submission_id: SUB, date: '2026-11-10', day: { work_minutes: '60' }, breaches: [{ measured_value: '7.50', deficit_hours: '2.50' }] });
    expect(r.day.work_minutes).toBe(60);
    expect(r.day.is_compliant).toBe(false);
    expect(r.breaches[0]).toMatchObject({ measured_value: 7.5, deficit_hours: 2.5, is_serious: false });
    expect(r.changes).toEqual({ days: 0, inserted: 0, updated: 0, superseded: 0, deleted: 0 });
  });

  it('refuses an answer that is not an object', () => {
    expect(() => parseSaveDayResult([])).toThrow(/unexpected shape/);
    expect(() => parseMonthTransitionResult(null)).toThrow(/unexpected shape/);
  });

  it('reads work_rest_fill_days and work_rest_month_transition', () => {
    expect(parseFillDaysResult({ filled: 2, dates: ['2026-11-11', '2026-11-12'], changes: { days: 9 } })).toEqual({
      filled: 2,
      dates: ['2026-11-11', '2026-11-12'],
      changes: { days: 9, inserted: 0, updated: 0, superseded: 0, deleted: 0 },
    });
    expect(parseMonthTransitionResult({ submission_id: SUB, status: 'approved', warnings: ['hod_not_signed'], signature_id: 's1' })).toEqual({
      submission_id: SUB,
      status: 'approved',
      warnings: ['hod_not_signed'],
      signature_id: 's1',
    });
    expect(parseMonthTransitionResult({ submission_id: SUB, status: 'locked' })).toMatchObject({ warnings: [], signature_id: null });
  });
});

describe('engine blocks', () => {
  it('sends work blocks only, whole minutes, in time order', () => {
    expect(
      engineBlocks([
        work(720.4, 1080, { category: 'watch' }),
        { block_type: 'rest', start_minute: 0, end_minute: 360 },
        work(360, 479.6, { notes: 'drill' }),
      ]),
    ).toEqual([
      { block_type: 'work', start_minute: 360, end_minute: 480, category: null, notes: 'drill' },
      { block_type: 'work', start_minute: 720, end_minute: 1080, category: 'watch', notes: null },
    ]);
  });
});

describe('saveDay', () => {
  const opts = { vesselId: V, crewId: CREW, date: '2026-11-10', blocks: [work(480, 1200), { block_type: 'rest' as const, start_minute: 0, end_minute: 480 }], note: 'Port day' };

  it('calls work_rest_save_day with the work blocks and answers applied', async () => {
    h.rpc = () => OK({ record_id: 'r1', submission_id: SUB, date: '2026-11-10', day: { rest_minutes: 720 }, breaches: [] });
    const r = await saveDay(opts);
    expect(h.rpcCalls).toEqual([
      {
        fn: 'work_rest_save_day',
        args: {
          p_vessel_id: V,
          p_crew_user_id: CREW,
          p_date: '2026-11-10',
          p_blocks: [{ block_type: 'work', start_minute: 480, end_minute: 1200, category: null, notes: null }],
          p_note: 'Port day',
        },
      },
    ]);
    expect(r.applied).toBe(true);
    if (r.applied) expect(r.data.day.rest_minutes).toBe(720);
    expect(h.calls).toHaveLength(0);
  });

  it('answers not applied while the RPC is missing, and writes nothing itself', async () => {
    h.rpc = (fn) => MISSING_RPC(fn);
    expect(await saveDay(opts)).toEqual({ applied: false });
    expect(h.calls).toHaveLength(0);
  });

  it('throws a refusal as a WorkRestRefusal', async () => {
    h.rpc = () => FAIL('22023', 'month_closed', { details: 'This month is submitted.' });
    await expect(saveDay(opts)).rejects.toMatchObject({ name: 'WorkRestRefusal', refusal: 'month_closed', message: 'This month is submitted.' });
  });

  it('throws any other error as it is (a missing helper is not a missing engine)', async () => {
    const helperMissing = { code: '42883', message: 'function public.crew_vessel_cap(text, uuid) does not exist' };
    h.rpc = () => ({ data: null, error: helperMissing });
    await expect(saveDay(opts)).rejects.toBe(helperMissing);
  });
});

describe('fillDays', () => {
  it('calls work_rest_fill_days, or answers not applied while it is missing', async () => {
    h.rpc = () => OK({ filled: 1, dates: ['2026-11-11'], changes: {} });
    const r = await fillDays({ vesselId: V, crewId: CREW, sourceDate: '2026-11-10', targetDates: ['2026-11-11'] });
    expect(h.rpcCalls[0]).toEqual({ fn: 'work_rest_fill_days', args: { p_vessel_id: V, p_crew_user_id: CREW, p_source_date: '2026-11-10', p_target_dates: ['2026-11-11'] } });
    expect(r).toMatchObject({ applied: true, data: { filled: 1 } });

    h.rpc = (fn) => FAIL('42883', `function public.${fn}(uuid, uuid, date, date[]) does not exist`);
    expect(await fillDays({ vesselId: V, crewId: CREW, sourceDate: '2026-11-10', targetDates: ['2026-11-11'] })).toEqual({ applied: false });
  });
});

describe('transitionMonth', () => {
  const base = { vesselId: V, crewId: CREW, year: 2026, month: 11 } as const;
  const writes = () => h.calls.filter((c) => c.op !== 'select').map((c) => [c.table, c.op]);

  it('moves the month through the engine when it is there', async () => {
    h.rpc = () => OK({ submission_id: SUB, status: 'approved', warnings: ['low_breaches_unreviewed'], signature_id: 's1' });
    const r = await transitionMonth({ ...base, action: 'approve', signatureText: 'Master', legacy: { submissionId: SUB, actorId: ACTOR } });
    expect(h.rpcCalls[0]).toEqual({
      fn: 'work_rest_month_transition',
      args: { p_vessel_id: V, p_crew_user_id: CREW, p_year: 2026, p_month: 11, p_action: 'approve', p_reason: null, p_signature_text: 'Master' },
    });
    expect(r).toEqual({ mode: 'engine', result: { submission_id: SUB, status: 'approved', warnings: ['low_breaches_unreviewed'], signature_id: 's1' } });
    expect(writes()).toEqual([]);
  });

  it('runs the legacy writes while the engine is missing: submit signs as crew and stamps the month', async () => {
    h.rpc = (fn) => MISSING_RPC(fn);
    h.respond = (c) => (c.op === 'update' ? OK({ id: SUB, crew_id: CREW, vessel_id: V, period_year: 2026, period_month: 11, status: 'submitted' }) : OK({ id: 's1' }));
    const r = await transitionMonth({ ...base, action: 'submit', legacy: { submissionId: SUB, actorId: CREW } });
    expect(r).toEqual({ mode: 'legacy', status: 'submitted' });
    expect(writes()).toEqual([
      ['work_rest_signatures', 'insert'],
      ['work_rest_monthly_submissions', 'update'],
      ['work_rest_audit_log', 'insert'],
    ]);
    expect(h.calls[0].payload).toMatchObject({ submission_id: SUB, signer_id: CREW, signer_role: 'crew', signature_method: 'electronic' });
    const update = h.calls[1];
    expect(update.filters).toEqual([['id', 'eq', SUB]]);
    expect(update.payload).toMatchObject({ status: 'submitted' });
    expect(update.payload).toHaveProperty('submitted_at');
    expect(update.payload).toHaveProperty('crew_signed_at');
    expect(h.calls[2].payload).toMatchObject({ action: 'month_submit', actor_role: 'crew' });
  });

  it('legacy approval stays captain_reviewed (the legacy status list has no approved); reopen keeps its reason and signs nothing', async () => {
    h.rpc = (fn) => MISSING_RPC(fn);
    h.respond = () => OK({ id: SUB, crew_id: CREW, vessel_id: V, period_year: 2026, period_month: 11, status: 'x' });
    expect(await transitionMonth({ ...base, action: 'approve', legacy: { submissionId: SUB, actorId: ACTOR } })).toEqual({ mode: 'legacy', status: 'captain_reviewed' });
    expect(h.calls.find((c) => c.table === 'work_rest_signatures')?.payload).toMatchObject({ signer_role: 'captain' });

    h.calls = [];
    expect(await transitionMonth({ ...base, action: 'reopen', reason: 'Correct day 4', legacy: { submissionId: SUB, actorId: ACTOR } })).toEqual({ mode: 'legacy', status: 'reopened' });
    expect(h.calls.some((c) => c.table === 'work_rest_signatures')).toBe(false);
    expect(h.calls.find((c) => c.op === 'update')?.payload).toMatchObject({ status: 'reopened', reopened_by: ACTOR, reopen_reason: 'Correct day 4' });
  });

  it('submit on behalf exists only in the engine; without the legacy context nothing is written', async () => {
    h.rpc = (fn) => MISSING_RPC(fn);
    await expect(transitionMonth({ ...base, action: 'submit_on_behalf', reason: 'Left the vessel', legacy: { submissionId: SUB, actorId: ACTOR } })).rejects.toBeInstanceOf(
      WorkRestEngineRequired,
    );
    await expect(transitionMonth({ ...base, action: 'lock' })).rejects.toBeInstanceOf(WorkRestEngineRequired);
    expect(h.calls).toHaveLength(0);
  });

  it('a refusal is thrown and the legacy path never runs', async () => {
    h.rpc = () => FAIL('22023', 'breaches_unreviewed', { details: 'Review the breaches first.' });
    await expect(transitionMonth({ ...base, action: 'approve', legacy: { submissionId: SUB, actorId: ACTOR } })).rejects.toMatchObject({ refusal: 'breaches_unreviewed' });
    expect(h.calls).toHaveLength(0);
  });
});

describe('getOrCreateSubmission (one month per person and vessel, D-X1-20)', () => {
  const opts = { crewId: CREW, vesselId: V, year: 2026, month: 11 };
  const row = (extra: Record<string, unknown> = {}) => ({ id: SUB, crew_id: CREW, vessel_id: V, period_year: 2026, period_month: 11, status: 'draft', ...extra });

  it('reads the month of the person on this vessel', async () => {
    h.respond = () => OK(row({ status: 'hod_signed' }));
    expect(await getOrCreateSubmission(opts)).toMatchObject({ id: SUB, status: 'hod_signed' });
    expect(h.calls[0].filters).toEqual([
      ['crew_id', 'eq', CREW],
      ['vessel_id', 'eq', V],
      ['period_year', 'eq', 2026],
      ['period_month', 'eq', 11],
    ]);
  });

  it('creates a blank draft when there is none', async () => {
    h.respond = (c) => (c.op === 'insert' ? OK(row()) : OK(null));
    expect(await getOrCreateSubmission(opts)).toMatchObject({ id: SUB, status: 'draft' });
    expect(h.calls[1].payload).toEqual({ crew_id: CREW, vessel_id: V, period_year: 2026, period_month: 11, status: 'draft' });
  });

  it('under the legacy per-person unique, the person\'s month on another vessel answers', async () => {
    const other = '00000000-0000-4000-8000-0000000000a2';
    h.respond = (c) => {
      if (c.op === 'insert') return FAIL('23505', 'duplicate key value violates unique constraint "work_rest_monthly_submissions_crew_id_period_year_period_month_key"');
      const byVessel = c.filters.some(([col]) => col === 'vessel_id');
      return OK(byVessel ? null : row({ vessel_id: other, status: 'submitted' }));
    };
    expect(await getOrCreateSubmission(opts)).toMatchObject({ vessel_id: other, status: 'submitted' });
    expect(h.calls[2].filters.map(([c]) => c)).toEqual(['crew_id', 'period_year', 'period_month']);
  });

  it('a duplicate with nothing to read, or any other insert error, is thrown', async () => {
    h.respond = (c) => (c.op === 'insert' ? FAIL('23505', 'duplicate key') : OK(null));
    await expect(getOrCreateSubmission(opts)).rejects.toMatchObject({ code: '23505' });
    h.respond = (c) => (c.op === 'insert' ? FAIL('42501', 'work_rest_engine_only') : OK(null));
    await expect(getOrCreateSubmission(opts)).rejects.toBeInstanceOf(WorkRestRefusal);
  });
});

describe('listNonConformities', () => {
  const nc = (id: string, extra: Record<string, unknown> = {}) => ({ id, submission_id: SUB, rule_code: 'REST_24H_MIN', window_start: `2026-11-0${id}T00:00:00Z`, ...extra });

  it('reads the 060700 columns and leaves superseded breaches out unless asked', async () => {
    h.respond = () => OK([nc('1', { superseded_at: null, is_serious: true }), nc('2', { superseded_at: '2026-11-20T10:00:00Z' })]);
    expect((await listNonConformities(SUB)).map((r) => r.id)).toEqual(['1']);
    expect(h.calls[0].columns).toContain('superseded_at');
    expect((await listNonConformities(SUB, { includeSuperseded: true })).map((r) => r.id)).toEqual(['1', '2']);
  });

  it('falls back to the legacy columns while the new ones are missing, with their defaults', async () => {
    h.respond = (c) => (c.columns?.includes('breach_day') ? FAIL('42703', 'column work_rest_non_conformities.breach_day does not exist') : OK([nc('1')]));
    const rows = await listNonConformities(SUB);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: '1', is_serious: false, deficit_hours: null, superseded_at: null, breach_day: null });
    expect(h.calls[1].columns).not.toContain('breach_day');
  });

  it('any other error is thrown', async () => {
    h.respond = () => FAIL('42501', 'permission denied');
    await expect(listNonConformities(SUB)).rejects.toMatchObject({ code: '42501' });
  });
});

describe('listSignatures', () => {
  const sig = (id: string, extra: Record<string, unknown> = {}) => ({ id, submission_id: SUB, signer_id: ACTOR, signer_role: 'crew', signature_method: 'electronic', signed_at: '2026-11-30T10:00:00Z', ...extra });

  it('leaves stale signatures out unless asked, and drops rows without a time', async () => {
    h.respond = () => OK([sig('1', { stale_at: '2026-12-01T09:00:00Z', stale_reason: 'Correct day 4' }), sig('2', { stale_at: null }), sig('3', { signed_at: null, stale_at: null })]);
    expect((await listSignatures(SUB)).map((s) => s.id)).toEqual(['2']);
    expect((await listSignatures(SUB, { includeStale: true })).map((s) => s.id)).toEqual(['1', '2']);
  });

  it('falls back to the legacy columns while stale_at is missing', async () => {
    h.respond = (c) => (c.columns?.includes('stale_at') ? FAIL('42703', 'column work_rest_signatures.stale_at does not exist') : OK([sig('1')]));
    expect(await listSignatures(SUB)).toEqual([expect.objectContaining({ id: '1', stale_at: null, stale_reason: null })]);
  });
});

describe('listVesselMonthMatrix (T-144)', () => {
  it('lists everyone aboard on any day of the month, with their days on this vessel', async () => {
    h.respond = (c) => {
      if (c.table === 'crew_assignments') {
        return OK([
          { user_id: 'u-current', join_date: '2026-01-01', leave_date: null, end_date: null, is_current: true },
          { user_id: 'u-left-in-month', join_date: '2026-03-01', leave_date: '2026-11-10', end_date: null, is_current: false },
          { user_id: 'u-left-before', join_date: '2026-03-01', leave_date: '2026-10-31', end_date: null, is_current: false },
          { user_id: 'u-ended', join_date: '2026-03-01', leave_date: null, end_date: '2026-11-01', is_current: false },
          { user_id: 'u-stale', join_date: '2026-03-01', leave_date: null, end_date: null, is_current: false },
          // X1-08: a row with only a start date counts from it (the engine's coalesce(join_date, start_date)).
          { user_id: 'u-start-only', join_date: null, start_date: '2026-11-15', leave_date: null, end_date: null, is_current: true },
          { user_id: 'u-joins-later', join_date: '2026-12-01', leave_date: null, end_date: null, is_current: true },
        ]);
      }
      if (c.table === 'profiles') {
        const ids = (c.filters.find(([col]) => col === 'user_id')?.[2] ?? []) as string[];
        return OK(ids.map((id) => ({ user_id: id, first_name: 'Deck', last_name: 'Rating', rank: 'AB', department: 'deck' })));
      }
      return OK([
        { crew_id: 'u-current', record_date: '2026-11-02', total_rest_minutes: 600, is_compliant: true },
        { crew_id: 'u-left-in-month', record_date: '2026-11-03', total_rest_minutes: 480, is_compliant: false },
      ]);
    };
    const rows = await listVesselMonthMatrix({ vesselId: V, year: 2026, month: 11 });
    // X1-08: every assignment row of the vessel; the overlap rule (assignmentOverlapsMonth) picks the month's.
    expect(h.calls[0].filters).toEqual([['vessel_id', 'eq', V]]);
    expect(h.calls[1].filters).toEqual([['user_id', 'in', ['u-current', 'u-left-in-month', 'u-ended', 'u-start-only']]]);
    const byId = new Map(rows.map((r) => [r.crew_id, r]));
    expect([...byId.keys()].sort()).toEqual(['u-current', 'u-ended', 'u-left-in-month', 'u-start-only']);
    expect(byId.get('u-current')).toMatchObject({ status: 'review', avg_rest: 10, department: 'DECK', crew_name: 'Deck Rating' });
    expect(byId.get('u-current')?.rest_by_day[2]).toBe(10);
    expect(byId.get('u-current')?.rest_by_day[30]).toBeNull();
    expect(byId.get('u-left-in-month')?.status).toBe('non_compliant');
    expect(byId.get('u-ended')?.status).toBe('no_data');
  });

  it('asks for nothing more when nobody was aboard', async () => {
    h.respond = () => OK([]);
    expect(await listVesselMonthMatrix({ vesselId: V, year: 2026, month: 11 })).toEqual([]);
    expect(h.calls).toHaveLength(1);
  });
});

describe('loadEffectiveRuleSet', () => {
  const rules = { id: 'rs1', name: 'MLC 2006', min_rest_per_24h: '10', min_rest_per_7d: '77', max_rest_periods_per_24h: 2, min_long_rest_block: '6', max_interval_between_rest: '14' };

  it('takes the vessel\'s rule set with its margins and serious thresholds', async () => {
    h.respond = (c) => {
      if (c.table === 'vessel_work_rest_settings' && c.columns?.includes('serious_24h_h')) {
        return OK({ warning_margin_24h_h: '1.50', warning_margin_7d_h: '4', serious_24h_h: '5', serious_7d_h: '55' });
      }
      if (c.table === 'vessel_work_rest_settings') return OK({ rule_set_id: 'rs1' });
      return OK(rules);
    };
    expect(await loadEffectiveRuleSet(V)).toEqual({
      id: 'rs1',
      name: 'MLC 2006',
      min_rest_per_24h: 10,
      min_rest_per_7d: 77,
      max_rest_periods_per_24h: 2,
      min_long_rest_block: 6,
      max_interval_between_rest: 14,
      warning_margin_24h: 1.5,
      warning_margin_7d: 4,
      serious_24h: 5,
      serious_7d: 55,
    });
  });

  it('uses the default margins while the 060700 columns are missing', async () => {
    h.respond = (c) => {
      if (c.table === 'vessel_work_rest_settings' && c.columns?.includes('serious_24h_h')) return FAIL('42703', 'column vessel_work_rest_settings.serious_24h_h does not exist');
      if (c.table === 'vessel_work_rest_settings') return OK(null);
      return OK(rules);
    };
    expect(await loadEffectiveRuleSet(V)).toMatchObject({
      id: 'rs1',
      warning_margin_24h: DEFAULT_THRESHOLDS.warning_margin_24h,
      warning_margin_7d: DEFAULT_THRESHOLDS.warning_margin_7d,
      serious_24h: DEFAULT_THRESHOLDS.serious_24h,
      serious_7d: DEFAULT_THRESHOLDS.serious_7d,
    });
  });
});

describe('monthContextRange', () => {
  it('is the six days before the month, across a year end and a leap February', () => {
    expect(monthContextRange(2026, 1)).toEqual({ from: '2025-12-26', to: '2025-12-31' });
    expect(monthContextRange(2028, 3)).toEqual({ from: '2028-02-24', to: '2028-02-29' });
  });
});

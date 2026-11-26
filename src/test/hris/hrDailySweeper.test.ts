/**
 * The daily sweeper (supabase/functions/hr-daily-sweeper; D-227, D-228,
 * D-232, D-239; platform-prep PP4, contract 10).
 *
 * Its behaviour is tested in Deno, where it runs:
 * supabase/functions/hr-daily-sweeper/index.test.ts drives the real handler
 * with a fake client (the run order; 'not applied' only for PGRST202 or a
 * 42883 that names the called function, with the anchored pattern pinned
 * case by case; a 42883 inside an existing body, any other error and an
 * answer that is neither a count nor a JSON object are failures, ok false
 * and status 500, and the later sweeps still run; the bearer check; logs
 * without the key or the secret). Since PP4 the function is on npm:
 * specifiers, which Vite cannot load, so this file pins from the source
 * what the rest of the app relies on and that the Deno test keeps covering
 * it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const SWEEPER = 'supabase/functions/hr-daily-sweeper/index.ts';
const DENO_TEST = 'supabase/functions/hr-daily-sweeper/index.test.ts';

const sweeps = (): string[] => {
  const list = /export const SWEEPS = \[([\s\S]*?)\] as const;/.exec(read(SWEEPER));
  expect(list, 'the sweeper keeps its RPCs in `export const SWEEPS = [...] as const;`').not.toBeNull();
  return Array.from((list?.[1] ?? '').matchAll(/'([a-z_]+)'/g)).map((m) => m[1]);
};

describe('hr-daily-sweeper', () => {
  it('runs the platform sweeps first, then the hr_* sweeps, then the five stream sweeps of contract 10', () => {
    expect(sweeps()).toEqual([
      'crew_assignments_end_stale',
      'expire_invitations',
      'hr_expire_overrun_contracts',
      'hr_expire_disciplinary_records',
      'hr_archive_due_records',
      'hr_generate_alerts',
      'crew_document_expiry_sweep',
      'work_rest_send_due_reminders',
      'frp_periods_extend_open',
      'crew_transfers_complete_due',
      'fleet_ops_daily_sweep',
    ]);
  });

  it('"not applied" is PGRST202 or a 42883 whose message names the called function itself (anchored); anything else is a failure', () => {
    const source = read(SWEEPER);
    expect(source).toContain("error.code === 'PGRST202'");
    expect(source).toContain("error.code === '42883' && new RegExp(`^function (public\\\\.)?${escapeRe(fn)}\\\\(.*\\\\) does not exist$`)");
    expect(source).toContain('failed.push(fn)');
    expect(source).toMatch(/ok \? 200 : 500/);
  });

  it('the Deno test covers the cases this file used to run (D-239 included)', () => {
    expect(existsSync(join(ROOT, DENO_TEST))).toBe(true);
    const test = read(DENO_TEST);
    for (const needle of [
      'function public.hr_can_admin(uuid) does not exist',
      'operator does not exist: uuid = text',
      'ERROR: function public.expire_invitations() does not exist',
      'function public.expire_invitations_legacy() does not exist',
      "'not applied'",
      'never the bearer, the key or the secret',
      '401',
    ]) {
      expect(test.includes(needle) || (needle === "'not applied'" && test.includes('NOT_APPLIED')), needle).toBe(true);
    }
  });

  it('docs/JOBS.md lists every sweep and the owner action', () => {
    const jobs = read('docs/JOBS.md');
    for (const fn of sweeps()) expect(jobs, fn).toContain(`\`${fn}\``);
    expect(jobs).toContain('Owner action: schedule the sweeper daily');
  });
});

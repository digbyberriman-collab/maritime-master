/**
 * updateCrewMember against the Phase 2 guards (finding
 * crew-edit-guard-refusal-fake-success; non-negotiable 9):
 *
 * - the profile saved but crew_assignments refused the position change
 *   (42501 master_office_change_refused / self_office_change_refused, or an
 *   RLS-filtered 0-row update): "Partly saved" with the guard's sentence,
 *   the crew list refreshed, never "Crew member updated successfully";
 * - the profile refused (42501 profile_access_columns_locked): "Not saved"
 *   with the DETAIL sentence, never the raw code;
 * - both parts saved: the success toast.
 *
 * And the other legacy crew writers (X1-02; D-225): transferCrew,
 * signOffCrew and deactivateCrew name a refusal in a STORM sentence
 * (crewRefusalMessage), check the rows each write reports (.select('id');
 * zero rows reads "You can't change this assignment."), refuse a pending
 * placement before writing anything, and report a transfer whose new
 * assignment was refused after the old one ended as "Partly saved".
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Answer = { data: unknown; error: unknown };

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  warning: vi.fn(),
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  writes: [] as Array<{ table: string; payload: unknown; filters: Array<[string, unknown]> }>,
  answers: {} as Record<string, { data: unknown; error: unknown }>,
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    let op = 'select';
    let write: { table: string; payload: unknown; filters: Array<[string, unknown]> } | null = null;
    const chain: Record<string, unknown> = {};
    for (const m of ['in', 'order', 'limit', 'neq', 'is', 'maybeSingle', 'single', 'select']) chain[m] = () => chain;
    chain.eq = (column: string, value: unknown) => {
      write?.filters.push([column, value]);
      return chain;
    };
    chain.update = (payload: unknown) => {
      op = 'update';
      write = { table, payload, filters: [] };
      h.writes.push(write);
      return chain;
    };
    chain.insert = (payload: unknown) => {
      op = 'insert';
      write = { table, payload, filters: [] };
      h.writes.push(write);
      return chain;
    };
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(h.answers[`${table}.${op}`] ?? { data: [], error: null }).then(resolve);
    return chain;
  };
  return { supabase: { from } };
});
vi.mock('@/modules/auth/contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: { id: 'p-master', user_id: 'u-master', company_id: 'c-1', role: 'master', email: 'master@example.test' },
    user: { id: 'u-master' },
  }),
}));
vi.mock('@/shared/hooks/use-toast', () => ({ useToast: () => ({ toast: h.toast }), toast: h.toast }));
vi.mock('@/shared/lib/notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/notify')>();
  return {
    ...actual,
    notify: { ...actual.notify, warning: h.warning, error: h.notifyError, success: h.notifySuccess },
  };
});

import {
  CrewTransferPartialError,
  PENDING_PLACEMENT_NOT_ASSIGNED_MESSAGE,
  useCrew,
  type SignOffCrewData,
  type TransferCrewData,
  type UpdateCrewMemberData,
} from '@/modules/crew/hooks/useCrew';
import { CrewUpdatePartialError } from '@/modules/crew/lib/crewUpdateErrors';

const MASTER_DETAIL = 'Only a users-access administrator of the vessel can appoint or remove a Master.';
const SELF_DETAIL = 'Only a users-access administrator can change their own position or rank.';
const PENDING_DETAIL =
  'Only a users-access administrator of the pending vessel can change the position, rank or joining date of a pending crew member.';

let qc: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

/** Every outcome the user saw, as "title: description". */
function outcomes(): string[] {
  const shadcn = h.toast.mock.calls.map(([t]: [{ title?: string; description?: string }]) => `${t.title}: ${t.description}`);
  const sonner = [...h.warning.mock.calls, ...h.notifySuccess.mock.calls].map(
    ([title, options]: [string, { description?: string } | undefined]) => `${title}: ${options?.description ?? ''}`,
  );
  const errors = h.notifyError.mock.calls.map(([e, options]: [unknown, { title?: string } | undefined]) => `${options?.title ?? ''}: ${String(e)}`);
  return [...shadcn, ...sonner, ...errors];
}

const edit = (extra: Partial<UpdateCrewMemberData> = {}): UpdateCrewMemberData => ({
  profileId: 'p-crew',
  userId: 'u-crew',
  firstName: 'Deck',
  ...extra,
});

async function run(data: UpdateCrewMemberData) {
  const { result } = renderHook(() => useCrew(), { wrapper });
  let rejection: unknown = null;
  await act(async () => {
    await result.current.updateCrewMember.mutateAsync(data).catch((e: unknown) => {
      rejection = e;
    });
  });
  return rejection;
}

const crewInvalidated = (spy: ReturnType<typeof vi.spyOn>) =>
  spy.mock.calls.some(([filters]) => JSON.stringify((filters as { queryKey?: unknown })?.queryKey) === JSON.stringify(['crew']));

beforeEach(() => {
  h.toast.mockReset();
  h.warning.mockReset();
  h.notifyError.mockReset();
  h.notifySuccess.mockReset();
  h.writes.length = 0;
  h.answers = {
    'profiles.update': { data: [{ id: 'p-crew' }], error: null },
    'crew_assignments.update': { data: [{ id: 'a-1' }], error: null },
  } satisfies Record<string, Answer>;
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});

describe('updateCrewMember', () => {
  it('reports a refused Master appointment as partly saved, with the guard sentence', async () => {
    h.answers['crew_assignments.update'] = {
      data: null,
      error: { code: '42501', message: 'master_office_change_refused', details: MASTER_DETAIL, hint: null },
    };
    const invalidate = vi.spyOn(qc, 'invalidateQueries');

    const rejection = await run(edit({ assignmentId: 'a-1', position: 'Master' }));

    expect(rejection).toBeInstanceOf(CrewUpdatePartialError);
    expect((rejection as CrewUpdatePartialError).profileSaved).toBe(true);
    expect((rejection as CrewUpdatePartialError).reason).toBe(MASTER_DETAIL);
    // Both writes went out: the profile first, then the assignment by id.
    expect(h.writes.map((w) => w.table)).toEqual(['profiles', 'crew_assignments']);
    expect(h.writes[1].payload).toMatchObject({ position: 'Master' });
    expect(h.writes[1].filters).toEqual([['id', 'a-1']]);

    expect(h.warning).toHaveBeenCalledWith('Partly saved', {
      description: `Profile saved. The position change was refused: ${MASTER_DETAIL}`,
    });
    expect(crewInvalidated(invalidate)).toBe(true);
    const seen = outcomes();
    expect(seen.join('\n')).not.toMatch(/updated successfully/);
    expect(seen.join('\n')).not.toMatch(/master_office_change_refused/);
    expect(h.toast).not.toHaveBeenCalled();
  });

  it('reports a refused own-position change with its sentence', async () => {
    h.answers['crew_assignments.update'] = {
      data: null,
      error: { code: '42501', message: 'self_office_change_refused', details: SELF_DETAIL, hint: null },
    };
    await run(edit({ profileId: 'p-master', userId: 'u-master', assignmentId: 'a-9', position: 'Chief Officer' }));

    expect(h.warning).toHaveBeenCalledWith('Partly saved', {
      description: `Profile saved. The position change was refused: ${SELF_DETAIL}`,
    });
    expect(outcomes().join('\n')).not.toMatch(/updated successfully|self_office_change_refused/);
  });

  it('reports an assignment update that matched no row as partly saved', async () => {
    h.answers['crew_assignments.update'] = { data: [], error: null };
    const invalidate = vi.spyOn(qc, 'invalidateQueries');

    const rejection = await run(edit({ assignmentId: 'a-1', joinDate: '2026-11-01' }));

    expect(rejection).toBeInstanceOf(CrewUpdatePartialError);
    expect(h.warning).toHaveBeenCalledWith('Partly saved', {
      description: "Profile saved. The position change was refused: You can't change this assignment.",
    });
    expect(crewInvalidated(invalidate)).toBe(true);
    expect(outcomes().join('\n')).not.toMatch(/updated successfully/);
  });

  it('reports a refused profile as not saved with the DETAIL, never the raw code', async () => {
    h.answers['profiles.update'] = {
      data: null,
      error: { code: '42501', message: 'profile_access_columns_locked', details: PENDING_DETAIL, hint: null },
    };

    const rejection = await run(edit({ rank: 'Bosun' }));

    expect(rejection).toBeInstanceOf(Error);
    expect(rejection).not.toBeInstanceOf(CrewUpdatePartialError);
    expect(h.writes.map((w) => w.table)).toEqual(['profiles']);
    expect(h.toast).toHaveBeenCalledWith({ title: 'Not saved', description: PENDING_DETAIL, variant: 'destructive' });
    const seen = outcomes().join('\n');
    expect(seen).not.toMatch(/profile_access_columns_locked/);
    expect(seen).not.toMatch(/updated successfully/);
    expect(h.warning).not.toHaveBeenCalled();
  });

  it('never shows a bare guard code, even without a DETAIL', async () => {
    h.answers['profiles.update'] = { data: null, error: { code: 'P0001', message: 'profile_access_columns_locked' } };

    await run(edit());

    expect(h.toast).toHaveBeenCalledWith({
      title: 'Not saved',
      description: "You don't have permission to do that.",
      variant: 'destructive',
    });
    expect(outcomes().join('\n')).not.toMatch(/profile_access_columns_locked/);
  });

  it('says updated only when the profile and the assignment both saved', async () => {
    await run(edit({ assignmentId: 'a-1', position: 'Bosun', joinDate: '2026-11-01' }));

    expect(h.writes.map((w) => w.table)).toEqual(['profiles', 'crew_assignments']);
    expect(h.writes[1].payload).toMatchObject({ position: 'Bosun', join_date: '2026-11-01' });
    expect(h.toast).toHaveBeenCalledWith({ title: 'Success', description: 'Crew member updated successfully' });
    expect(h.warning).not.toHaveBeenCalled();
  });

  it('never writes a pending placement as a crew_assignments row', async () => {
    await run(edit({ profileId: 'p-pending', userId: null, assignmentId: 'imported-p-pending', position: 'Bosun' }));

    expect(h.writes.map((w) => w.table)).toEqual(['profiles']);
  });

  it('writes a pending placement’s position and joining date to the profile', async () => {
    await run(edit({ profileId: 'p-pending', userId: null, pendingPosition: 'Bosun', pendingJoiningDate: '2026-12-01' }));

    expect(h.writes).toHaveLength(1);
    expect(h.writes[0].payload).toMatchObject({ position: 'Bosun', joining_date: '2026-12-01' });
    expect(h.writes[0].filters).toEqual([['id', 'p-pending']]);
  });
});

// ---------------------------------------------------------------- the other legacy writers (X1-02)

const writesTo = (table: string) => h.writes.filter((w) => w.table === table);

async function runWriter<T>(pick: (crew: ReturnType<typeof useCrew>) => { mutateAsync: (v: T) => Promise<unknown> }, value: T) {
  const { result } = renderHook(() => useCrew(undefined, { enabled: false }), { wrapper });
  let rejection: unknown = null;
  await act(async () => {
    await pick(result.current).mutateAsync(value).catch((e: unknown) => {
      rejection = e;
    });
  });
  return rejection;
}

const signOff = (extra: Partial<SignOffCrewData> = {}): SignOffCrewData => ({ assignmentId: 'a-1', leaveDate: '2026-11-30', reason: 'contract_end', ...extra });
const transfer = (extra: Partial<TransferCrewData> = {}): TransferCrewData => ({
  userId: 'u-crew',
  currentAssignmentId: 'a-1',
  newVesselId: 'v-hyd',
  position: 'Deckhand',
  transferDate: '2026-12-01',
  ...extra,
});

describe('signOffCrew', () => {
  it('ends the assignment by id, asks for the changed row, and says so only then', async () => {
    const rejection = await runWriter((c) => c.signOffCrew, signOff());
    expect(rejection).toBeNull();
    expect(writesTo('crew_assignments')[0].filters).toEqual([['id', 'a-1']]);
    expect(writesTo('crew_assignments')[0].payload).toMatchObject({ is_current: false, leave_date: '2026-11-30', end_date: '2026-11-30', end_reason: 'contract_end' });
    expect(h.toast).toHaveBeenCalledWith({ title: 'Success', description: 'Crew member signed off successfully' });
  });

  it('zero rows changed reads "You can\'t change this assignment.", never success', async () => {
    h.answers['crew_assignments.update'] = { data: [], error: null };
    const rejection = await runWriter((c) => c.signOffCrew, signOff());
    expect(rejection).toBeInstanceOf(Error);
    expect(h.toast).toHaveBeenCalledWith({ title: 'Not signed off', description: "You can't change this assignment.", variant: 'destructive' });
    expect(outcomes().join('\n')).not.toMatch(/successfully/);
  });

  it('a guard refusal shows its DETAIL, never the raw code', async () => {
    h.answers['crew_assignments.update'] = { data: null, error: { code: '42501', message: 'master_office_change_refused', details: MASTER_DETAIL, hint: null } };
    await runWriter((c) => c.signOffCrew, signOff());
    expect(h.toast).toHaveBeenCalledWith({ title: 'Not signed off', description: MASTER_DETAIL, variant: 'destructive' });
    expect(outcomes().join('\n')).not.toMatch(/master_office_change_refused/);
  });

  it('refuses a pending placement before writing anything (D-225)', async () => {
    const rejection = await runWriter((c) => c.signOffCrew, signOff({ assignmentId: 'imported-p-pending' }));
    expect((rejection as Error).message).toBe(PENDING_PLACEMENT_NOT_ASSIGNED_MESSAGE);
    expect(writesTo('crew_assignments')).toEqual([]);
  });
});

describe('transferCrew', () => {
  it('ends the old assignment, opens the new one, and says transferred only then', async () => {
    h.answers['crew_assignments.insert'] = { data: { id: 'a-2' }, error: null };
    const rejection = await runWriter((c) => c.transferCrew, transfer());
    expect(rejection).toBeNull();
    const writes = writesTo('crew_assignments');
    expect(writes.map((w) => w.payload && Object.keys(w.payload as object).includes('vessel_id'))).toEqual([false, true]);
    expect(writes[0].filters).toEqual([['id', 'a-1']]);
    expect(writes[1].payload).toMatchObject({ user_id: 'u-crew', vessel_id: 'v-hyd', position: 'Deckhand', join_date: '2026-12-01', is_current: true });
    expect(h.toast).toHaveBeenCalledWith({ title: 'Success', description: 'Crew member transferred successfully' });
  });

  it('an old assignment that matched no row stops the transfer: nothing is opened', async () => {
    h.answers['crew_assignments.update'] = { data: [], error: null };
    await runWriter((c) => c.transferCrew, transfer());
    expect(writesTo('crew_assignments')).toHaveLength(1);
    expect(h.toast).toHaveBeenCalledWith({ title: 'Not transferred', description: "You can't change this assignment.", variant: 'destructive' });
  });

  it('a new assignment refused after the old one ended is "Partly saved", with the reason', async () => {
    h.answers['crew_assignments.insert'] = { data: null, error: { code: '42501', message: 'assignment_vessel_out_of_reach', details: 'You can only assign crew to a vessel you can reach.', hint: null } };
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    const rejection = await runWriter((c) => c.transferCrew, transfer());
    expect(rejection).toBeInstanceOf(CrewTransferPartialError);
    expect(h.warning).toHaveBeenCalledWith('Partly saved', {
      description: 'The old assignment was ended, but the new one was not saved: You can only assign crew to a vessel you can reach.',
    });
    expect(crewInvalidated(invalidate)).toBe(true);
    expect(outcomes().join('\n')).not.toMatch(/transferred successfully|assignment_vessel_out_of_reach/);
  });

  it('refuses a pending placement, or a person without a login, before writing anything', async () => {
    await runWriter((c) => c.transferCrew, transfer({ currentAssignmentId: 'imported-p-pending' }));
    await runWriter((c) => c.transferCrew, transfer({ userId: '' }));
    expect(writesTo('crew_assignments')).toEqual([]);
    expect(h.toast).toHaveBeenCalledWith({ title: 'Not transferred', description: PENDING_PLACEMENT_NOT_ASSIGNED_MESSAGE, variant: 'destructive' });
  });
});

describe('deactivateCrew', () => {
  it('a profile update that matched no row is refused, and no assignment is touched', async () => {
    h.answers['profiles.update'] = { data: [], error: null };
    await runWriter((c) => c.deactivateCrew, 'u-crew');
    expect(writesTo('crew_assignments')).toEqual([]);
    expect(h.toast).toHaveBeenCalledWith({ title: 'Not deactivated', description: "You can't change this crew member.", variant: 'destructive' });
  });

  it('an assignment left open is "Partly saved"', async () => {
    h.answers['crew_assignments.select'] = { data: [{ id: 'a-1' }, { id: 'a-2' }], error: null };
    h.answers['crew_assignments.update'] = { data: [{ id: 'a-1' }], error: null };
    await runWriter((c) => c.deactivateCrew, 'u-crew');
    expect(h.warning).toHaveBeenCalledWith('Partly saved', {
      description: "The profile was marked inactive, but not every assignment was ended: You can't change this assignment.",
    });
  });

  it('says deactivated when the profile and every assignment changed', async () => {
    h.answers['crew_assignments.select'] = { data: [{ id: 'a-1' }], error: null };
    await runWriter((c) => c.deactivateCrew, 'u-crew');
    expect(h.toast).toHaveBeenCalledWith({ title: 'Success', description: 'Crew member deactivated' });
  });
});

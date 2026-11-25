/**
 * Vessel writes report what the database did (DECISIONS D-124, D-224;
 * non-negotiable 9). Since the P3 vessel policies, a caller without
 * `fleet.operations.vessels.admin` gets one of three answers, none of which
 * may read as success or as raw database text:
 *
 * - Remove (an UPDATE to Sold) matches 0 rows with no error;
 * - Edit and Particulars (`.select().single()`) fail with PGRST116;
 * - Add fails with 42501 "new row violates row-level security policy".
 *
 * Before the fix Remove toasted "Vessel removed successfully" for the 0-row
 * update, and Edit and Add showed the raw PostgREST text.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Result = { data: unknown; error: { code?: string; message: string } | null };

interface Call {
  op: 'select' | 'insert' | 'update';
  payload?: unknown;
  filters: Array<[string, unknown]>;
  /** Columns of a `select()` chained after the write (the rows asked back). */
  returning?: string;
  single?: boolean;
}

const state = vi.hoisted(() => ({
  calls: [] as Call[],
  /** What the next write resolves. */
  write: { data: null, error: null } as Result,
  toasts: [] as Array<{ title?: string; description?: string; variant?: string }>,
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = () => {
    const call: Call = { op: 'select', filters: [] };
    state.calls.push(call);
    const resolve = (): Result => (call.op === 'select' ? { data: [], error: null } : state.write);
    const chain = {
      select: (cols?: string) => {
        if (call.op !== 'select') call.returning = cols ?? '*';
        return chain;
      },
      insert: (payload: unknown) => {
        call.op = 'insert';
        call.payload = payload;
        return chain;
      },
      update: (payload: unknown) => {
        call.op = 'update';
        call.payload = payload;
        return chain;
      },
      eq: (column: string, value: unknown) => {
        call.filters.push([column, value]);
        return chain;
      },
      neq: () => chain,
      order: () => chain,
      single: () => {
        call.single = true;
        return chain;
      },
      then: (onDone: (value: Result) => unknown, onFail?: (reason: unknown) => unknown) =>
        Promise.resolve(resolve()).then(onDone, onFail),
    };
    return chain;
  };
  return { supabase: { from } };
});
vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => ({ profile: { company_id: 'co-1' } }) }));
vi.mock('@/modules/vessels/contexts/VesselContext', () => ({ useVessel: () => ({ refreshVessels: () => {} }) }));
vi.mock('@/shared/hooks/use-toast', () => ({
  toast: (t: { title?: string; description?: string; variant?: string }) => {
    state.toasts.push(t);
  },
}));

import { useVessels, type VesselFormData } from '@/modules/vessels/hooks/useVessels';
import {
  VESSEL_WRITE_REFUSED_MESSAGES,
  VesselWriteRefusedError,
  isVesselRefusal,
  vesselWriteError,
} from '@/modules/vessels/lib/vesselWriteErrors';

const REMOVE = "You can't remove this vessel. Only a vessel administrator can do this.";
const CHANGE = "You can't change this vessel. Only a vessel administrator can do this.";
const CREATE = "You can't add a vessel. Only a vessel administrator can do this.";

const PGRST116 = {
  code: 'PGRST116',
  message: 'Cannot coerce the result to a single JSON object',
};
const RLS_42501 = { code: '42501', message: 'new row violates row-level security policy for table "vessels"' };
const PERMISSION_42501 = { code: '42501', message: 'permission denied for table vessels' };
const UNCODED_RLS = { message: 'new row violates row-level security policy for table "vessels"' };
const TIMEOUT = { code: '57014', message: 'canceling statement due to statement timeout' };

const row = { id: 'v1', company_id: 'co-1', name: 'Alpha', status: 'Active', particulars: null };

const form: VesselFormData = {
  name: 'Alpha',
  imo_number: '1234567',
  flag_state: 'Malta',
  classification_society: null,
  vessel_type: null,
  gross_tonnage: null,
  build_year: null,
  status: 'Active',
};

const setup = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: 0 } } });
  const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useVessels(), { wrapper });
};

/** Runs a mutation to the end, swallowing its rejection (the toast is what the user sees). */
async function run(start: () => Promise<unknown>): Promise<unknown> {
  let outcome: unknown;
  await act(async () => {
    outcome = await start().then(
      () => 'resolved',
      (error: unknown) => error,
    );
  });
  return outcome;
}

const descriptions = () => state.toasts.map((t) => t.description);
const lastToast = () => state.toasts[state.toasts.length - 1];
const writes = () => state.calls.filter((c) => c.op !== 'select');

beforeEach(() => {
  state.calls.length = 0;
  state.toasts.length = 0;
  state.write = { data: null, error: null };
});

describe('isVesselRefusal / vesselWriteError', () => {
  it.each([
    ['42501', PERMISSION_42501, true],
    ['PGRST116', PGRST116, true],
    ['an uncoded row-level security message', UNCODED_RLS, true],
    ['a bare row-level security string', 'new row violates row-level security policy', true],
    ['a statement timeout', TIMEOUT, false],
    ['a duplicate', { code: '23505', message: 'duplicate key value violates unique constraint' }, false],
    ['null', null, false],
  ])('%s → %s', (_label, error, expected) => {
    expect(isVesselRefusal(error)).toBe(expected);
  });

  it('maps a refusal to the copy for its kind and anything else to the normalised sentence', () => {
    expect(vesselWriteError(PGRST116, 'change')).toBeInstanceOf(VesselWriteRefusedError);
    expect(vesselWriteError(PGRST116, 'change').message).toBe(CHANGE);
    expect(vesselWriteError(RLS_42501, 'create').message).toBe(CREATE);
    expect(vesselWriteError(PERMISSION_42501, 'remove').message).toBe(REMOVE);
    const other = vesselWriteError(TIMEOUT, 'remove');
    expect(other).not.toBeInstanceOf(VesselWriteRefusedError);
    expect(other.message).toBe('That took too long. Try again, or narrow the filters.');
    expect(VESSEL_WRITE_REFUSED_MESSAGES).toEqual({ remove: REMOVE, change: CHANGE, create: CREATE });
  });
});

describe('deleteVessel', () => {
  it('asks for the row back and reads a 0-row update as a refusal, never as removed', async () => {
    const { result } = setup();
    state.write = { data: [], error: null };

    const outcome = await run(() => result.current.deleteVessel.mutateAsync('v1'));

    expect(outcome).toBeInstanceOf(VesselWriteRefusedError);
    expect(writes()).toEqual([
      { op: 'update', payload: { status: 'Sold' }, filters: [['id', 'v1']], returning: 'id' },
    ]);
    expect(lastToast()).toMatchObject({ variant: 'destructive', description: REMOVE });
    expect(descriptions()).not.toContain('Vessel removed successfully');
  });

  it('reads a null result as a refusal too', async () => {
    const { result } = setup();
    state.write = { data: null, error: null };
    await run(() => result.current.deleteVessel.mutateAsync('v1'));
    expect(lastToast()).toMatchObject({ variant: 'destructive', description: REMOVE });
    expect(descriptions()).not.toContain('Vessel removed successfully');
  });

  it.each([
    ['42501', PERMISSION_42501],
    ['an uncoded row-level security message', UNCODED_RLS],
  ])('reads %s as a refusal', async (_label, error) => {
    const { result } = setup();
    state.write = { data: null, error };
    await run(() => result.current.deleteVessel.mutateAsync('v1'));
    expect(lastToast()).toMatchObject({ variant: 'destructive', description: REMOVE });
    expect(descriptions()).not.toContain('Vessel removed successfully');
  });

  it('shows any other failure as the normalised sentence, never the raw text', async () => {
    const { result } = setup();
    state.write = { data: null, error: TIMEOUT };
    await run(() => result.current.deleteVessel.mutateAsync('v1'));
    expect(lastToast()).toMatchObject({ variant: 'destructive', description: 'That took too long. Try again, or narrow the filters.' });
    expect(descriptions().join(' ')).not.toContain('canceling statement');
  });

  it('toasts success only after a returned row', async () => {
    const { result } = setup();
    state.write = { data: [{ id: 'v1' }], error: null };
    const outcome = await run(() => result.current.deleteVessel.mutateAsync('v1'));
    expect(outcome).toBe('resolved');
    expect(lastToast()).toMatchObject({ title: 'Success', description: 'Vessel removed successfully' });
    expect(lastToast().variant).toBeUndefined();
  });
});

describe('updateVessel', () => {
  it.each([
    ['PGRST116 (the policy hid the row)', PGRST116],
    ['42501', PERMISSION_42501],
    ['an uncoded row-level security message', UNCODED_RLS],
  ])('reads %s as the change refusal', async (_label, error) => {
    const { result } = setup();
    state.write = { data: null, error };
    const outcome = await run(() => result.current.updateVessel.mutateAsync({ id: 'v1', formData: form }));
    expect(outcome).toBeInstanceOf(VesselWriteRefusedError);
    expect(lastToast()).toMatchObject({ variant: 'destructive', description: CHANGE });
    expect(descriptions().join(' ')).not.toMatch(/coerce|row-level security|permission denied/);
    expect(descriptions()).not.toContain('Vessel updated successfully');
  });

  it('reads an empty result as the change refusal', async () => {
    const { result } = setup();
    state.write = { data: null, error: null };
    await run(() => result.current.updateVessel.mutateAsync({ id: 'v1', formData: form }));
    expect(lastToast()).toMatchObject({ variant: 'destructive', description: CHANGE });
  });

  it('normalises any other failure', async () => {
    const { result } = setup();
    state.write = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "vessels_imo_key"' } };
    await run(() => result.current.updateVessel.mutateAsync({ id: 'v1', formData: form }));
    expect(lastToast()).toMatchObject({ variant: 'destructive', description: 'That already exists. Check for a duplicate and try again.' });
  });

  it('still toasts success when the row comes back', async () => {
    const { result } = setup();
    state.write = { data: row, error: null };
    const outcome = await run(() => result.current.updateVessel.mutateAsync({ id: 'v1', formData: form }));
    expect(outcome).toBe('resolved');
    expect(writes()[0]).toMatchObject({ op: 'update', filters: [['id', 'v1']], returning: '*', single: true });
    expect(lastToast()).toMatchObject({ title: 'Success', description: 'Vessel updated successfully' });
  });
});

describe('updateVesselParticulars', () => {
  it.each([
    ['PGRST116 (a Master after the P3 policies)', PGRST116],
    ['42501', PERMISSION_42501],
  ])('reads %s as the change refusal', async (_label, error) => {
    const { result } = setup();
    state.write = { data: null, error };
    await run(() => result.current.updateVesselParticulars.mutateAsync({ id: 'v1', particulars: { loa: '50 m' } }));
    expect(lastToast()).toMatchObject({ variant: 'destructive', description: CHANGE });
    expect(descriptions()).not.toContain('Vessel particulars updated');
  });

  it('reads an empty result as the change refusal', async () => {
    const { result } = setup();
    state.write = { data: null, error: null };
    await run(() => result.current.updateVesselParticulars.mutateAsync({ id: 'v1', particulars: { loa: '50 m' } }));
    expect(lastToast()).toMatchObject({ variant: 'destructive', description: CHANGE });
  });

  it('still toasts success when the row comes back', async () => {
    const { result } = setup();
    state.write = { data: { ...row, particulars: { loa: '50 m' } }, error: null };
    await run(() => result.current.updateVesselParticulars.mutateAsync({ id: 'v1', particulars: { loa: '50 m' } }));
    expect(lastToast()).toMatchObject({ title: 'Saved', description: 'Vessel particulars updated' });
  });
});

describe('createVessel', () => {
  it.each([
    ['the 42501 row-level security violation', RLS_42501],
    ['the uncoded row-level security message', UNCODED_RLS],
  ])('reads %s as the add refusal', async (_label, error) => {
    const { result } = setup();
    state.write = { data: null, error };
    const outcome = await run(() => result.current.createVessel.mutateAsync(form));
    expect(outcome).toBeInstanceOf(VesselWriteRefusedError);
    expect(lastToast()).toMatchObject({ variant: 'destructive', description: CREATE });
    expect(descriptions().join(' ')).not.toContain('row-level security');
    expect(descriptions()).not.toContain('Vessel created successfully');
  });

  it('inserts into the profile company and still toasts success', async () => {
    const { result } = setup();
    state.write = { data: row, error: null };
    await run(() => result.current.createVessel.mutateAsync(form));
    expect(writes()[0]).toMatchObject({ op: 'insert', payload: { company_id: 'co-1', name: 'Alpha' } });
    await waitFor(() => expect(lastToast()).toMatchObject({ title: 'Success', description: 'Vessel created successfully' }));
  });
});

/**
 * The pending-table shim types calls correctly and is the app's own client
 * (BUILD-PLAN B9; gap/00 D2).
 *
 * The `typed()` body is never run: `npm run typecheck` checks it, so a shim
 * that stops typing pending tables (or starts accepting unknown ones) fails
 * the typecheck gate. The `it` blocks check the runtime half.
 */
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

const client = vi.hoisted(() => ({ marker: 'the app client' }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: client }));

import { isMissingRelation, pendingClient, type PendingTable } from '@/integrations/supabase/pending';
import { refitDb } from '@/modules/refit/lib/db';
import type { ChangeOrder, PendingApproval } from '@/modules/refit/types/db.pending';

// Never called; type-checked only.
export async function typed(vesselId: string) {
  // A pending table reads as its declared row.
  const orders = await refitDb.from('rf_change_orders').select('*').eq('vessel_id', vesselId);
  expectTypeOf(orders.data).toEqualTypeOf<ChangeOrder[] | null>();

  // Selected columns narrow the row, as for generated tables.
  const one = await refitDb.from('rf_change_orders').select('id, title').eq('id', vesselId).single();
  expectTypeOf(one.data).toEqualTypeOf<{ id: string; title: string } | null>();

  // An insert needs the required columns…
  await refitDb.from('rf_crew_requests').insert({ vessel_id: vesselId, reference: 'CR-1', title: 'Fix' });
  // @ts-expect-error title is required on insert
  await refitDb.from('rf_crew_requests').insert({ vessel_id: vesselId, reference: 'CR-1' });
  // @ts-expect-error status is a union, not any string
  await refitDb.from('rf_crew_requests').update({ status: 'nonsense' }).eq('id', vesselId);

  // Pending views and RPCs.
  const pending = await refitDb.from('v_pending_approvals').select('*').eq('vessel_id', vesselId);
  expectTypeOf(pending.data).toEqualTypeOf<PendingApproval[] | null>();
  const ref = await refitDb.rpc('next_reference', { _vessel_id: vesselId, _prefix: 'CO', _table: 'change_orders' });
  expectTypeOf(ref.data).toEqualTypeOf<string | null>();

  // Undeclared columns read as unknown, so callers must narrow.
  const snags = await refitDb.from('rf_snags').select('*');
  const snag = snags.data?.[0];
  expectTypeOf(snag?.id).toEqualTypeOf<string | undefined>();
  expectTypeOf(snag?.severity).toEqualTypeOf<unknown>();

  // Live tables keep their generated types on the same client.
  const vessel = await refitDb.from('vessels').select('id, name').eq('id', vesselId).maybeSingle();
  expectTypeOf(vessel.data).toEqualTypeOf<{ id: string; name: string } | null>();

  // A table nobody declared is still rejected.
  // @ts-expect-error not a generated or pending table
  await refitDb.from('rf_not_a_table').select('*');

  // A one-table shim for a new module.
  type Pending = { widgets: PendingTable<{ id: string; label: string }, 'label'> };
  const db = pendingClient<Pending>();
  const w = await db.from('widgets').select('label');
  expectTypeOf(w.data).toEqualTypeOf<{ label: string }[] | null>();
}

describe('pendingClient', () => {
  it('is the app client itself: same session, same RLS', () => {
    expect(pendingClient()).toBe(client);
    expect(refitDb).toBe(client);
  });
});

describe('isMissingRelation (D-01: a pending table may not exist yet)', () => {
  // Alias checks only: the full classifier table is src/test/lib/missingRelation.test.ts.
  it('is the shared classifier', () => {
    expect(isMissingRelation({ code: '42P01', message: 'relation "public.rf_snags" does not exist' })).toBe(true);
    expect(isMissingRelation({ code: 'PGRST202', message: 'Could not find the function public.next_reference in the schema cache' })).toBe(true);
    expect(isMissingRelation({ code: '', message: 'relation "rf_x" does not exist' })).toBe(true);
    expect(isMissingRelation({ code: '42501', message: 'permission denied for table rf_snags' })).toBe(false);
    expect(isMissingRelation(null)).toBe(false);
  });
});

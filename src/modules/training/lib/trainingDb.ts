/**
 * The training module's client typed with its pending familiarisation
 * tables, columns and RPCs (X1-10; D-01): 20261124061000 is written, not
 * applied, so they are not in types.ts yet. The crew familiarisation hooks
 * (src/modules/crew/hooks/useFamiliarisation.ts) call its RPCs through
 * trainingRpc.
 */
import { pendingClient, type NoPending } from '@/integrations/supabase/pending';
import type { Json } from '@/integrations/supabase/types';
import type { TrainingPendingColumns, TrainingPendingFunctions, TrainingPendingTables } from '@/modules/training/types/db.pending';

export const trainingDb = pendingClient<TrainingPendingTables, NoPending, TrainingPendingFunctions, TrainingPendingColumns>();

export type TrainingRpcName = keyof TrainingPendingFunctions;

/** Calls one of the module's pending RPCs; the answer is the RPC's JSON (or its error) as PostgREST gave it. */
export async function trainingRpc(fn: TrainingRpcName, args: Record<string, unknown>): Promise<{ data: Json | null; error: unknown }> {
  const { data, error } = await trainingDb.rpc(fn as never, args as never);
  return { data: (data ?? null) as Json | null, error };
}

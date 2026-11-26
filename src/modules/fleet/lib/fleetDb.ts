/**
 * The Fleet operations module's typed client (gap/00 D2; DECISIONS D-01):
 * the app's one Supabase client, typed with the expiry engine's pending
 * table and RPCs (../types/db.pending.ts). Hooks read and write through it
 * and treat `isMissingRelation` as "not set up yet" (never mock rows); any
 * other error is a real error with Retry.
 */
import { pendingClient, type NoPending } from '@/integrations/supabase/pending';
import type { FleetPendingFunctions, FleetPendingTables } from '../types/db.pending';

export const fleetDb = pendingClient<FleetPendingTables, NoPending, FleetPendingFunctions>();

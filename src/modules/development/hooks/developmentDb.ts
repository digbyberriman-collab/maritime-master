/**
 * The development module's typed client (gap/00 D2; DECISIONS D-01): the
 * app's Supabase client with the training core's pending columns, table
 * and definers (`../types/db.pending.ts`, `20261124040600_fleet_training_core.sql`).
 * A missing column, table or RPC answers `isMissingRelation`; callers map
 * it to their documented fallback (D-X5-20), never to mock rows.
 */
import { pendingClient, type NoPending } from '@/integrations/supabase/pending';
import type { DevelopmentPendingColumns, DevelopmentPendingFunctions, DevelopmentPendingTables } from '../types/db.pending';

export const developmentDb = pendingClient<DevelopmentPendingTables, NoPending, DevelopmentPendingFunctions, DevelopmentPendingColumns>();

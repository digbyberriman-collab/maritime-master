/**
 * The documents module's typed client for the fleet document library
 * (D-01): the app's one Supabase client, with the library's pending tables
 * and RPCs (../types/db.pending.ts) added to its type. Every library read
 * and write goes through it, so a missing table or RPC is a typed
 * `isMissingRelation` answer the hooks turn into "Fleet documents are not
 * set up yet", never a crash. The controlled register keeps the plain
 * client (its tables are live).
 */
import { pendingClient, type NoPending } from '@/integrations/supabase/pending';
import type { DocumentsPendingFunctions, DocumentsPendingTables } from '../types/db.pending';

export const fleetDocumentsDb = pendingClient<DocumentsPendingTables, NoPending, DocumentsPendingFunctions>();

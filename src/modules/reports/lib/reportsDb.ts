/**
 * The reports module's typed client (D-01): the app's one Supabase client,
 * with the module's pending RPCs (../types/db.pending.ts) added to its type.
 * Every reports read goes through it, so a missing RPC is a typed
 * `isMissingRelation` answer the hooks turn into "This report is not set up
 * yet", never a crash.
 */
import { pendingClient, type NoPending } from '@/integrations/supabase/pending';
import type { ReportsPendingFunctions } from '../types/db.pending';

export const reportsDb = pendingClient<NoPending, NoPending, ReportsPendingFunctions>();

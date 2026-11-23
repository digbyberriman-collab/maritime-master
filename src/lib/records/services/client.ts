/**
 * The one pending client for the record-engine tables, views and RPCs
 * (./db.pending.ts; gap/00 D2). Same client instance as `supabase`
 * (session, RLS); only the type is widened.
 */
import { pendingClient } from '@/integrations/supabase/pending';
import type { RecordsPendingFunctions, RecordsPendingTables, RecordsPendingViews } from './db.pending';

export const recordsDb = pendingClient<RecordsPendingTables, RecordsPendingViews, RecordsPendingFunctions>();

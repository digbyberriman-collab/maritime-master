/**
 * The one pending client for the access tables, columns and RPCs in
 * ../types/db.pending.ts (gap/00 D2). Everything that reads memberships,
 * invitations, the account status or the server-side capability check goes
 * through `authDb`, so the pending-table ratchet sees one shim and one
 * client. Same client instance as `supabase` (session, RLS); only the type
 * is widened.
 */
import { pendingClient, type NoPending } from '@/integrations/supabase/pending';
import type { AuthPendingColumns, AuthPendingFunctions, AuthPendingTables } from '../types/db.pending';

export const authDb = pendingClient<AuthPendingTables, NoPending, AuthPendingFunctions, AuthPendingColumns>();

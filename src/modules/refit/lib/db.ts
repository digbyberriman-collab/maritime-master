/**
 * The Refit module's Supabase client, on the pending-table shim (gap/00 D2;
 * BUILD-PLAN B9).
 *
 * No `rf_*` table is in the generated types (or in any migration yet): the
 * Refit schema import is its own stream. Their shapes live in
 * ../types/db.pending.ts, and `refitDb` is the app's client typed with them,
 * so a call such as
 *
 *   const { data } = await refitDb.from('rf_change_orders').select('*').eq('vessel_id', id);
 *
 * returns `ChangeOrder[]` and an insert is checked against its required
 * columns. Live tables keep their generated types on the same client.
 *
 * `db` is the same client with the schema left untyped. The ported pages
 * still call it the way they were written (`db.from("rf_x" as any)`,
 * `db.from(config.table)`), and it stays until each page moves to
 * `refitDb`. Those pages are listed in
 * src/test/config/pendingTables.allowlist.json, which may only shrink.
 */
import { pendingClient } from '@/integrations/supabase/pending';
import type { RefitPendingFunctions, RefitPendingTables, RefitPendingViews } from '../types/db.pending';

export type {
  Department,
  VesselArea,
  CostCode,
  ChangeOrder,
  ChangeOrderApproval,
  ChangeOrderAttachment,
  CrewRequest,
  PurchaseOrder,
  Invoice,
  Contractor,
  LogisticsItem,
  InventoryItem,
  Meeting,
  MeetingAction,
  Risk,
  Comment,
  Notification,
  PendingApproval,
  RefitPendingTables,
} from '../types/db.pending';

/** Typed Refit client: pending `rf_*` tables, the approvals view and `next_reference`. */
export const refitDb = pendingClient<RefitPendingTables, RefitPendingViews, RefitPendingFunctions>();

/**
 * The untyped handle the ported pages use (see the header). It must stay
 * fully untyped until they move: several pass query builders to helpers
 * typed as `Promise`, which a typed builder (PromiseLike) does not satisfy.
 * New code uses `refitDb`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy handle for the ported pages; shrinks page by page
export const db: any = refitDb;

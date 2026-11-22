/**
 * Typed client for tables that are written in the repo but not yet in the
 * generated types (gap/00 D2, §4 "Pending-table shim"; DECISIONS D-01).
 *
 * The only hand-written file in this folder: `client.ts`, `types.ts` and
 * `previewAuthStorage.ts` are generated and never edited by hand (a
 * hand-patched `types.ts` once collided with a Lovable resync and sent `tsc`
 * out of memory).
 *
 * A module lists its pending tables in `src/modules/<m>/types/db.pending.ts`
 * and builds its client once:
 *
 *   export const db = pendingClient<SafetyPendingTables>();
 *   const { data } = await db.from('safety_permits').select('id, status');
 *
 * Calls on pending tables are typed from the module's Row/Insert/Update
 * shapes; calls on live tables keep their generated types. When the
 * migration is applied and `types.ts` regenerated, the pending-table test
 * (src/test/config/pendingTables.test.ts) fails until the module's entry is
 * deleted, so a shim never outlives its table.
 *
 * Pending tables are not live (D-01): code built on them must treat a
 * "relation does not exist" error as "module not set up yet" and render an
 * empty or ModuleOff state, never a crash and never mock rows
 * (`isMissingRelation` below).
 *
 * Measured on 22 Nov 2026 (tsconfig.app.json settings, the real `types.ts`):
 * a probe making 11 calls through `pendingClient` with Refit's 31 pending
 * tables checked in 1.07–1.12 s against 0.89–1.16 s for 5 calls on the
 * plain client (21.2k → 29.8k type instantiations). The intersection is
 * cheap, so the documented fallback (`.from(name as never)` with
 * `.overrideTypes<Row[], { merge: false }>()`) is not needed. Re-measure if
 * a module lists hundreds of tables.
 */
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { supabase } from './client';

/** One pending table, in the generated types' shape. */
export interface PendingTableShape {
  Row: object;
  Insert: object;
  Update: object;
  Relationships: [];
}

/** One pending view (read-only). */
export interface PendingViewShape {
  Row: object;
  Relationships: [];
}

/** One pending RPC (a function the code calls before its migration is applied). */
export interface PendingFunctionShape {
  Args: object;
  Returns: unknown;
}

export type PendingTables = Record<string, PendingTableShape>;
export type PendingViews = Record<string, PendingViewShape>;
export type PendingFunctions = Record<string, PendingFunctionShape>;

type None = Record<never, never>;

/**
 * A pending table from its row type: every column optional on insert except
 * `Required`, every column optional on update.
 */
export type PendingTable<Row extends object, Required extends keyof Row = never> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, Required>;
  Update: Partial<Row>;
  Relationships: [];
};

/** A pending view from its row type. */
export type PendingView<Row extends object> = { Row: Row; Relationships: [] };

/**
 * A row whose columns are not declared yet (the table exists only in the
 * code that reads it). Every field reads as `unknown`, so callers must
 * narrow; declare the columns when the table's migration is written.
 */
export type UndeclaredRow = { id: string } & Record<string, unknown>;

/**
 * The generated `Database` with a module's pending tables, views and
 * functions merged into `public`.
 */
export type WithPending<T extends PendingTables, V extends PendingViews = None, F extends PendingFunctions = None> = Omit<
  Database,
  'public'
> & {
  public: Omit<Database['public'], 'Tables' | 'Views' | 'Functions'> & {
    Tables: Database['public']['Tables'] & T;
    Views: Database['public']['Views'] & V;
    Functions: Database['public']['Functions'] & F;
  };
};

/**
 * The app's Supabase client, typed with a module's pending tables (and
 * optionally views and functions). The same client instance (session, RLS);
 * only the type is widened.
 */
export const pendingClient = <T extends PendingTables, V extends PendingViews = None, F extends PendingFunctions = None>() =>
  supabase as unknown as SupabaseClient<WithPending<T, V, F>>;

/**
 * True when a query failed because the table or view is not in the
 * database yet (Postgres 42P01, or PostgREST's PGRST205 schema-cache miss).
 * Pages map this to their "not set up" state (D-01).
 */
export function isMissingRelation(error: Pick<PostgrestError, 'code' | 'message'> | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  return /relation .* does not exist|could not find the table/i.test(error.message ?? '');
}

/**
 * Permission override writes for Users & Access (`user_permission_overrides`).
 *
 * Row level security refuses an override write silently: a DELETE the
 * caller may not make removes 0 rows and answers no error (RLS
 * `permission_override_write_allowed`: never on yourself, never above the
 * level you hold). So every write here proves what it changed
 * (non-negotiable 9):
 *
 * 1. read the rows the caller can see for the user and module(s);
 * 2. delete them with `.select('id')`, and compare the count per module;
 * 3. a module with a surviving row is refused (`override_refused`): no level
 *    is inserted next to it, so a lower row can never sit beside a higher
 *    one that still applies;
 * 4. an INSERT refused by RLS (42501) is the same refusal, never the raw
 *    Postgres message.
 *
 * Editing your own access is refused before anything is sent.
 *
 * The server-side replacement (one definer RPC that checks and replaces in
 * one statement) is deferred to X6.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import type { PermissionLevel } from '../lib/presets';

/** The caller may not change this person's access for these modules (RLS, or their own access). */
export class OverrideRefusedError extends Error {
  readonly code = 'override_refused' as const;
  /** The modules that were not changed. */
  readonly moduleKeys: readonly string[];
  /** Part of the request was saved anyway (rows removed, or other modules set): the page must reload what is saved. */
  readonly partial: boolean;
  /** The refusal is about the caller's own access. */
  readonly self: boolean;

  constructor(moduleKeys: readonly string[], options: { partial?: boolean; self?: boolean } = {}) {
    super(options.self ? "You can't change your own access." : "You can't change this person's access for these modules.");
    this.name = 'OverrideRefusedError';
    this.moduleKeys = moduleKeys;
    this.partial = options.partial ?? false;
    this.self = options.self ?? false;
  }
}

export function isOverrideRefused(error: unknown): error is OverrideRefusedError {
  return error instanceof OverrideRefusedError;
}

export const isRlsRefusal = (error: { code?: string } | null | undefined) => error?.code === '42501';

const countBy = (rows: ReadonlyArray<{ module_key: string }> | null | undefined) => {
  const counts = new Map<string, number>();
  for (const row of rows ?? []) counts.set(row.module_key, (counts.get(row.module_key) ?? 0) + 1);
  return counts;
};

interface Cleared {
  /** Modules with no row left. */
  cleared: string[];
  /** Modules with a row the caller could not remove. */
  refused: string[];
  /** At least one row was removed. */
  removedAny: boolean;
}

/**
 * Clear the user's overrides for `moduleKeys`, as far as the caller may:
 * the visible rows first, then the DELETE with its deleted rows, counted per
 * module.
 */
export async function clearOverrides(userId: string, moduleKeys: readonly string[]): Promise<Cleared> {
  const visible = await supabase.from('user_permission_overrides').select('id, module_key').eq('user_id', userId).in('module_key', [...moduleKeys]);
  if (visible.error) throw visible.error;
  const before = countBy(visible.data);
  if (before.size === 0) return { cleared: [...moduleKeys], refused: [], removedAny: false };

  const deleted = await supabase
    .from('user_permission_overrides')
    .delete()
    .eq('user_id', userId)
    .in('module_key', [...before.keys()])
    .select('id, module_key');
  if (deleted.error) {
    if (isRlsRefusal(deleted.error)) return { cleared: moduleKeys.filter((k) => !before.has(k)), refused: [...before.keys()], removedAny: false };
    throw deleted.error;
  }
  const removed = countBy(deleted.data);
  const refused = [...before.entries()].filter(([key, n]) => (removed.get(key) ?? 0) < n).map(([key]) => key);
  return { cleared: moduleKeys.filter((k) => !refused.includes(k)), refused, removedAny: removed.size > 0 };
}

interface SaveArgs {
  userId: string;
  moduleKey: string;
  permission: PermissionLevel | null; // null = remove (no access)
}

export function useSavePermissionOverride() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ userId, moduleKey, permission }: SaveArgs) => {
      if (!user) throw new Error('Your session has expired. Sign in again to continue.');
      if (userId === user.id) throw new OverrideRefusedError([moduleKey], { self: true });

      const { refused, removedAny } = await clearOverrides(userId, [moduleKey]);
      // A row survived: nothing is inserted next to it.
      if (refused.length > 0) throw new OverrideRefusedError(refused, { partial: removedAny });

      if (permission) {
        const { error: insErr } = await supabase.from('user_permission_overrides').insert({
          user_id: userId,
          module_key: moduleKey,
          permission,
          is_granted: true,
          created_by: user.id,
          reason: 'Updated via Users & Access',
        });
        if (insErr) {
          // The old rows may be gone already: say so, so the page reloads what is saved.
          if (isRlsRefusal(insErr)) throw new OverrideRefusedError([moduleKey], { partial: removedAny });
          throw insErr;
        }
      }
    },
    onSettled: (_d, _e, vars) => {
      void qc.invalidateQueries({ queryKey: ['users-access', 'detail', vars.userId] });
      void qc.invalidateQueries({ queryKey: ['users-access', 'list'] });
    },
  });
}

export function useApplyPreset() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ userId, matrix }: { userId: string; matrix: Record<string, PermissionLevel | null> }) => {
      const moduleKeys = Object.keys(matrix);
      if (!user) throw new Error('Your session has expired. Sign in again to continue.');
      if (userId === user.id) throw new OverrideRefusedError(moduleKeys, { self: true });

      const { cleared, refused, removedAny } = await clearOverrides(userId, moduleKeys);

      // Only modules whose rows are all gone get their new level.
      const rows = cleared
        .filter((k) => matrix[k])
        .map((k) => ({
          user_id: userId,
          module_key: k,
          permission: matrix[k] as PermissionLevel,
          is_granted: true,
          created_by: user.id,
          reason: 'Applied access preset',
        }));

      if (rows.length) {
        const { error: insErr } = await supabase.from('user_permission_overrides').insert(rows);
        if (insErr) {
          if (isRlsRefusal(insErr)) throw new OverrideRefusedError([...refused, ...rows.map((r) => r.module_key)], { partial: removedAny });
          throw insErr;
        }
      }
      if (refused.length > 0) throw new OverrideRefusedError(refused, { partial: removedAny || rows.length > 0 });
    },
    onSettled: (_d, _e, vars) => {
      void qc.invalidateQueries({ queryKey: ['users-access', 'detail', vars.userId] });
      void qc.invalidateQueries({ queryKey: ['users-access', 'list'] });
    },
  });
}

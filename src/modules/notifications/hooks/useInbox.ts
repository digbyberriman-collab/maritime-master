/**
 * React Query hooks on the per-user inbox (gap/03 C9; Phase 2 spec §B.7):
 * the list (`useInbox`), the bell's exact head counts (`useInboxCounts`,
 * D-91), the writes (`useInboxMutations`) and the optional realtime channel
 * (`useInboxRealtime`). Every key starts with `inboxKeys.user(userId)`, so a
 * write or a realtime event refreshes every inbox read of that user, and a
 * read for one user never shows for another.
 *
 * Nothing is read without a signed-in user. A missing table comes back as
 * `source: 'table-missing'` (D-01); any other failure is the query's error
 * (the callers show it with Retry, never as "no notifications").
 */
import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import {
  fetchInbox,
  fetchInboxCounts,
  inboxKeys,
  markAllInboxRead,
  markInboxRead,
  setInboxArchived,
  type InboxCounts,
  type InboxFilters,
  type InboxList,
} from '../services/inbox';

/** A backstop poll; the realtime channel refreshes sooner when it is connected. */
export const INBOX_REFRESH_MS = 60_000;

/** The signed-in user's id, or null. */
export function useInboxUserId(): string | null {
  const { user } = useAuth();
  return user?.id ?? null;
}

const SIGNED_OUT_KEY = ['notification-inbox', 'signed-out'] as const;

export interface InboxQueryOptions {
  /** Extra condition on top of "signed in" (e.g. the panel is open). Default true. */
  enabled?: boolean;
  /** Poll interval; false for none. Default `INBOX_REFRESH_MS`. */
  refetchInterval?: number | false;
}

export function useInbox(filters: InboxFilters, options: InboxQueryOptions = {}) {
  const userId = useInboxUserId();
  return useQuery<InboxList>({
    queryKey: userId ? inboxKeys.list(userId, filters) : [...SIGNED_OUT_KEY, 'list'],
    queryFn: () => fetchInbox(userId as string, filters),
    enabled: Boolean(userId) && options.enabled !== false,
    refetchInterval: options.refetchInterval ?? INBOX_REFRESH_MS,
    staleTime: 15_000,
  });
}

export function useInboxCounts(options: InboxQueryOptions = {}) {
  const userId = useInboxUserId();
  return useQuery<InboxCounts>({
    queryKey: userId ? inboxKeys.counts(userId) : [...SIGNED_OUT_KEY, 'counts'],
    queryFn: () => fetchInboxCounts(userId as string),
    enabled: Boolean(userId) && options.enabled !== false,
    refetchInterval: options.refetchInterval ?? INBOX_REFRESH_MS,
    staleTime: 15_000,
  });
}

/** An archive or unarchive that changed no row: RLS hid it, or it is gone. Never a silent success. */
export class InboxWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InboxWriteError';
  }
}

export interface ArchiveInput {
  ids: readonly string[];
  archived: boolean;
}

export function useInboxMutations() {
  const queryClient = useQueryClient();
  const userId = useInboxUserId();
  const refresh = () => (userId ? queryClient.invalidateQueries({ queryKey: inboxKeys.user(userId) }) : Promise.resolve());

  const markRead = useMutation({
    mutationFn: (ids: readonly string[]) => markInboxRead(ids),
    onSettled: refresh,
  });
  const markAllRead = useMutation({
    mutationFn: (before?: string) => markAllInboxRead(before),
    onSettled: refresh,
  });
  const setArchived = useMutation({
    mutationFn: async ({ ids, archived }: ArchiveInput) => {
      const changed = await setInboxArchived(ids, archived);
      if (ids.length > 0 && changed === 0) {
        throw new InboxWriteError(archived ? 'That notification was not archived.' : 'That notification was not moved back to the inbox.');
      }
      return changed;
    },
    onSettled: refresh,
  });
  return { markRead, markAllRead, setArchived };
}

let channelSeq = 0;

/**
 * Refresh the user's inbox reads when a row of theirs changes (RLS applies to
 * realtime too). Subscribe only once the table is known to exist; each caller
 * gets its own channel, removed on unmount or when the user changes.
 */
export function useInboxRealtime(userId: string | null, enabled: boolean): void {
  const queryClient = useQueryClient();
  const instance = useRef(0);
  if (instance.current === 0) {
    channelSeq += 1;
    instance.current = channelSeq;
  }
  useEffect(() => {
    if (!userId || !enabled) return undefined;
    const channel = supabase
      .channel(`notification-inbox:${userId}:${instance.current}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_inbox', filter: `user_id=eq.${userId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: inboxKeys.user(userId) });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, enabled, queryClient]);
}

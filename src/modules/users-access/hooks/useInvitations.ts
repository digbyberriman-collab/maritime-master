/**
 * Invitation status and actions for Users & Access (Phase 2 spec §B.3,
 * §C.3). Reads `user_invitations` (pending table) for the people listed;
 * invites, resends, bulk invites and revokes go through the typed wrappers,
 * and every toast reports the outcome the server gave (never "sent" when
 * the email failed).
 */
import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchInvitationsByProfile, revokeInvitation, revokeInvitationNotice, type InvitationListRow } from '@/modules/auth/services/invitations';
import { bulkInvite, bulkInviteNotice, inviteNotice, sendInvitation } from '@/modules/auth/services/adminActions';
import { showOutcomeNotice } from '@/modules/auth/lib/outcomeNotices';
import { notify } from '@/shared/lib/notify';
import { usersAccessKeys } from './useUsersWithAccess';
import type { InvitationSource } from '../lib/invitationStatus';

export interface InvitationStatuses {
  source: InvitationSource;
  byProfile: ReadonlyMap<string, InvitationListRow>;
  error: unknown;
  refetch: () => void;
}

const EMPTY = new Map<string, InvitationListRow>();

export function useInvitationStatuses(companyId: string | null | undefined, profileIds: readonly string[]): InvitationStatuses {
  const query = useQuery({
    enabled: Boolean(companyId) && profileIds.length > 0,
    queryKey: usersAccessKeys.invitations(companyId, profileIds),
    queryFn: () => fetchInvitationsByProfile(companyId!, profileIds),
  });
  const { refetch } = query;
  const retry = useCallback(() => void refetch(), [refetch]);
  return useMemo<InvitationStatuses>(() => {
    if (query.isError) return { source: 'error', byProfile: EMPTY, error: query.error, refetch: retry };
    if (!query.data) return { source: profileIds.length === 0 ? 'table' : 'loading', byProfile: EMPTY, error: null, refetch: retry };
    return { source: query.data.source, byProfile: query.data.byProfile, error: null, refetch: retry };
  }, [query.isError, query.error, query.data, profileIds.length, retry]);
}

export interface InviteTarget {
  profileId: string;
  name: string;
  email: string;
}

export function useInvitationActions() {
  const queryClient = useQueryClient();
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['users-access'] });
    void queryClient.invalidateQueries({ queryKey: ['crew'] });
  }, [queryClient]);

  const invite = useMutation({
    mutationFn: (target: InviteTarget) => sendInvitation(target.profileId),
    onSettled: refresh,
  });

  const inviteOne = useCallback(
    async function run(target: InviteTarget): Promise<void> {
      try {
        const outcome = await invite.mutateAsync(target);
        showOutcomeNotice(inviteNotice(outcome, target.email || null), { id: `invite-${target.profileId}`, onRetry: () => void run(target) });
      } catch (error) {
        notify.error(error, { title: 'Could not send the invitation', id: `invite-${target.profileId}` });
      }
    },
    [invite],
  );

  const bulk = useMutation({
    mutationFn: (profileIds: readonly string[]) => bulkInvite(profileIds),
    onSettled: refresh,
  });

  const inviteMany = useCallback(
    async (profileIds: readonly string[]): Promise<void> => {
      try {
        const outcome = await bulk.mutateAsync(profileIds);
        showOutcomeNotice(bulkInviteNotice(outcome), { id: 'invite-bulk' });
      } catch (error) {
        notify.error(error, { title: 'Could not send the invitations', id: 'invite-bulk' });
      }
    },
    [bulk],
  );

  const revokeMutation = useMutation({
    mutationFn: ({ invitationId }: { invitationId: string; name: string }) => revokeInvitation(invitationId),
    onSettled: refresh,
  });

  /**
   * Revoke, then say what happened (admin-actions `revoke_invitation`):
   * "can no longer use the link" only when the login was blocked; a warning
   * when they may still sign in (turn their access off for that).
   */
  const revoke = useCallback(
    async function run(target: { invitationId: string; name: string }): Promise<void> {
      const id = `revoke-${target.invitationId}`;
      try {
        const outcome = await revokeMutation.mutateAsync(target);
        showOutcomeNotice(revokeInvitationNotice(outcome, target.name), { id, onRetry: () => void run(target) });
      } catch (error) {
        notify.error(error, { title: 'Could not revoke the invitation', id });
      }
    },
    [revokeMutation],
  );

  return {
    inviteOne,
    inviteMany,
    revoke: (target: { invitationId: string; name: string }) => void revoke(target),
    invitingProfileId: invite.isPending ? invite.variables?.profileId ?? null : null,
    bulkPending: bulk.isPending,
    revokePending: revokeMutation.isPending,
  };
}

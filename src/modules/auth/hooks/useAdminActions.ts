/**
 * Admin actions on another person's account (crew roster: PIN-gated reset,
 * access on / off, reallocate). Every call goes through the typed wrappers
 * in `services/adminActions.ts`, so the answer is the honest outcome the
 * edge function gave (Phase 2 spec §C.3): never "sent", "reset" or
 * "disabled" unless that step worked.
 *
 * - `setPin` / `verifyPin` resolve `{ success: true }` (and the confirmation
 *   time) or reject with one sentence of STORM copy (wrong PIN with the
 *   attempts left, locked with the wait).
 * - `resetAccount` and `toggleAccess` resolve the outcome itself; the modal
 *   that called them shows it (inline, with Try again), so nothing here
 *   toasts a result it did not check.
 * - `reallocateVessel` toasts "updated" only for a confirmed assignment and
 *   rejects with the part that failed otherwise.
 */
import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { notify } from '@/shared/lib/notify';
import {
  endAllSessions,
  reallocateVessel as reallocateVesselCall,
  resendInvitation,
  sendPasswordReset,
  setAccess,
  setAdminPin,
  verifyAdminPin,
  type EndSessionsOutcome,
  type InviteOutcome,
  type PasswordResetOutcome,
  type ReallocatedAssignment,
  type ReallocateInput,
  type ToggleAccessOutcome,
} from '../services/adminActions';

export interface PinResult {
  success: true;
  confirmedUntil?: string;
}

export type ResetType = 'password_reset' | 'invalidate_sessions' | 'resend_invitation';

export interface ResetAccountInput {
  targetUserId: string | null;
  /** For a resend to someone without a login yet. */
  targetProfileId?: string | null;
  resetType: ResetType;
  reason?: string;
}

export type ResetAccountResult =
  | { resetType: 'password_reset'; outcome: PasswordResetOutcome }
  | { resetType: 'resend_invitation'; outcome: InviteOutcome }
  | { resetType: 'invalidate_sessions'; outcome: EndSessionsOutcome };

export interface ToggleAccessInput {
  targetUserId: string;
  enableAccess: boolean;
  reason?: string;
}

// Session-based confirmation tracking (the server's 10 minute window).
const CONFIRMED_KEY = 'admin_confirmed_until';

function storedConfirmation(): Date | null {
  try {
    const stored = sessionStorage.getItem(CONFIRMED_KEY);
    if (!stored) return null;
    const date = new Date(stored);
    return date > new Date() ? date : null;
  } catch {
    return null;
  }
}

const CREW_KEYS = [['crew'], ['users-access'], ['hris', 'crew-directory']] as const;

export const useAdminActions = () => {
  const queryClient = useQueryClient();
  const [confirmedUntil, setConfirmedUntil] = useState<Date | null>(storedConfirmation);

  const isConfirmed = useCallback(() => Boolean(confirmedUntil && confirmedUntil > new Date()), [confirmedUntil]);

  const setConfirmation = useCallback((until: Date) => {
    setConfirmedUntil(until);
    try {
      sessionStorage.setItem(CONFIRMED_KEY, until.toISOString());
    } catch {
      // The confirmation still holds for this page.
    }
  }, []);

  const invalidatePeople = useCallback(() => {
    for (const queryKey of CREW_KEYS) void queryClient.invalidateQueries({ queryKey: [...queryKey] });
  }, [queryClient]);

  // Whether the caller has a PIN set (own row only, RLS).
  const { data: hasPinSet, refetch: refetchPinStatus } = useQuery({
    queryKey: ['admin-pin-status'],
    queryFn: async () => {
      const { data, error } = await supabase.from('admin_pins').select('id').limit(1);
      if (error) throw error;
      return Boolean(data && data.length > 0);
    },
  });

  const setPin = useMutation({
    mutationFn: async (pin: string): Promise<PinResult> => {
      const outcome = await setAdminPin(pin);
      if (outcome.kind === 'failed') throw new Error(outcome.failure.message);
      return { success: true };
    },
    onSuccess: () => {
      void refetchPinStatus();
      notify.success('Admin PIN set', { description: 'STORM asks for it before sensitive admin actions.' });
    },
  });

  const verifyPin = useMutation({
    mutationFn: async (pin: string): Promise<PinResult> => {
      const outcome = await verifyAdminPin(pin);
      if (outcome.kind === 'failed') throw new Error(outcome.failure.message);
      return { success: true, confirmedUntil: outcome.confirmedUntil };
    },
    onSuccess: (data) => {
      if (data.confirmedUntil) setConfirmation(new Date(data.confirmedUntil));
    },
  });

  const resetAccount = useMutation({
    mutationFn: async ({ targetUserId, targetProfileId, resetType, reason }: ResetAccountInput): Promise<ResetAccountResult> => {
      if (resetType === 'resend_invitation') {
        return { resetType, outcome: await resendInvitation({ userId: targetUserId, profileId: targetProfileId }, reason) };
      }
      if (!targetUserId) throw new Error('This person has not joined STORM yet. Send an invitation instead.');
      if (resetType === 'password_reset') return { resetType, outcome: await sendPasswordReset(targetUserId, reason) };
      return { resetType, outcome: await endAllSessions(targetUserId, reason) };
    },
    onSettled: invalidatePeople,
  });

  const toggleAccess = useMutation({
    mutationFn: ({ targetUserId, enableAccess, reason }: ToggleAccessInput): Promise<ToggleAccessOutcome> =>
      setAccess(targetUserId, enableAccess, reason?.trim() || undefined),
    onSettled: invalidatePeople,
  });

  const reallocateVessel = useMutation({
    mutationFn: async (input: ReallocateInput): Promise<ReallocatedAssignment> => {
      const outcome = await reallocateVesselCall(input);
      if (outcome.kind === 'done') return outcome.assignment;
      if (outcome.kind === 'partial_failure') throw new Error(outcome.message);
      if (outcome.kind === 'unconfirmed') throw new Error("STORM could not confirm the new assignment. Check the person's vessel before trying again.");
      throw new Error(outcome.failure.message);
    },
    onSuccess: () => {
      notify.success('Vessel assignment updated', { description: 'The crew member has been reassigned.' });
    },
    onError: (error: Error) => {
      notify.error(error.message, { title: 'Could not change the vessel assignment' });
    },
    onSettled: invalidatePeople,
  });

  return {
    hasPinSet,
    isConfirmed,
    confirmedUntil,
    setPin,
    verifyPin,
    resetAccount,
    toggleAccess,
    reallocateVessel,
    refetchPinStatus,
  };
};

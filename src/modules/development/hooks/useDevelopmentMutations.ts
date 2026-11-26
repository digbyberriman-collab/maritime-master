/**
 * Training application writes (gap/02 TR4–TR6, W3; X5 spec §2 X5-07A,
 * D-X5-20). Every status change goes through `development_transition()`
 * (`20261124040600_fleet_training_core.sql`): the server checks the
 * machine, the caller's part on the application and the payload, writes
 * one event row and notifies the next actor. A new application is a draft
 * (the column default; the server's guard refuses anything else).
 *
 * D-X5-20: while development_transition is missing (the file not applied,
 * D-01), the applicant's submit of their draft or returned application and
 * cancel of their draft keep today's direct writes; nothing else falls
 * back: every other action raises TransitionNotSetUpError ("not set up
 * yet"). The fallback runs only on a missing RPC, never after a refusal,
 * so it can never bypass the guard that ships in the same file.
 *
 * Expense claims are their own entity (useDevelopmentExpenses.ts); they are
 * re-exported here for the module's public API.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { notify } from '@/shared/lib/notify';
import {
  ACTION_DONE,
  AWAITING_APPROVAL_STATUSES,
  hasLegacyFallback,
  type ApplicationAction,
  type ApplicationActor,
} from '../lib/applicationMachine';
import { developmentDb } from './developmentDb';
import { developmentKeys, invalidateApplicationQueries } from './keys';
import {
  TransitionNotSetUpError,
  TransitionUnconfirmedError,
  isTransitionMissing,
  parseTransitionResult,
  transitionErrorMessage,
  type TransitionResult,
} from './applicationTransition';

export { useSubmitExpense, useFleetExpenses } from './useDevelopmentExpenses';
export { TransitionNotSetUpError, TransitionUnconfirmedError, parseTransitionResult, transitionErrorMessage, type TransitionResult } from './applicationTransition';

interface CreateApplicationInput {
  course_id?: string;
  course_name: string;
  category: string;
  course_description?: string;
  course_provider?: string;
  course_url?: string;
  course_location?: string;
  course_start_date?: string;
  course_end_date?: string;
  course_duration_days?: number;
  estimated_tuition_usd?: number;
  estimated_travel_usd?: number;
  estimated_travel_route?: string;
  estimated_accommodation_usd?: number;
  estimated_accommodation_nights?: number;
  estimated_accommodation_nightly_rate?: number;
  estimated_food_per_diem_usd?: number;
  is_custom_course?: boolean;
  leave_days_accrued?: number;
  neutral_days_accrued?: number;
  application_currency?: string;
  exchange_rate_to_usd?: number;
  tuition_local_amount?: number;
  travel_local_amount?: number;
  accommodation_local_amount?: number;
  course_duration_hours?: number;
  is_online_short?: boolean;
}

/** The new draft as the insert returned it. */
export interface CreatedApplication {
  id: string;
  application_number: string;
  crew_member_id: string;
}

/** Creates a draft application (the default status; the guard refuses anything else). */
export function useCreateApplication(options: { quiet?: boolean } = {}) {
  const { user, profile } = useAuth();
  const { selectedVesselId, vessels } = useVessel();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateApplicationInput): Promise<CreatedApplication> => {
      if (!user?.id || !profile?.company_id) throw new Error('Not authenticated');

      let vesselId = selectedVesselId;
      if (!vesselId) {
        const { data: assignment, error: assignmentError } = await supabase
          .from('crew_assignments')
          .select('vessel_id')
          .eq('user_id', user.id)
          .eq('is_current', true)
          .limit(1)
          .maybeSingle();
        if (assignmentError) throw assignmentError;
        vesselId = assignment?.vessel_id ?? null;
      }
      if (!vesselId) {
        const fallbackVessel = vessels.find((v) => v.name !== 'Fleet-Wide' && v.status !== 'Sold') ?? vessels[0];
        vesselId = fallbackVessel?.id ?? null;
      }
      if (!vesselId) throw new Error('Select a vessel before creating an application');

      const { estimated_total_usd: _ignoredTotal, ...applicationInput } = input as CreateApplicationInput & { estimated_total_usd?: never };
      const { data, error } = await supabase
        .from('development_applications')
        .insert({ ...applicationInput, crew_member_id: user.id, company_id: profile.company_id, vessel_id: vesselId })
        .select('id, application_number, crew_member_id')
        .single();
      if (error) throw error;
      if (!data?.id || data.crew_member_id !== user.id) throw new Error('The application was not saved. Try again.');
      return data;
    },
    onSuccess: () => {
      void invalidateApplicationQueries(queryClient);
      if (!options.quiet) notify.success('Draft saved');
    },
    onError: (err: unknown) => notify.error(err, { title: 'The application was not saved' }),
  });
}

/** What a transition needs: the action, its payload and what the caller last saw. */
export interface TransitionInput {
  applicationId: string;
  action: ApplicationAction;
  payload?: Record<string, unknown>;
  /** The application's updated_at as loaded: a change in between is refused as stale. */
  expectedUpdatedAt?: string | null;
  /** The status as loaded, for the D-X5-20 fallback. */
  currentStatus?: string;
  /** The part the caller acts in, as far as the page knows (the server decides). */
  actingAs?: ApplicationActor | null;
}

/** The outcome: confirmed by the definer, or written by the D-X5-20 fallback. */
export type TransitionOutcome = { mode: 'rpc'; result: TransitionResult } | { mode: 'fallback'; applicationId: string; action: ApplicationAction };

/**
 * Runs one transition. The definer's answer is checked (the same
 * application, a known status); a missing definer takes the D-X5-20
 * fallback for the applicant's submit / cancel of a draft and raises
 * TransitionNotSetUpError for everything else.
 */
export async function runApplicationTransition(input: TransitionInput, userId: string): Promise<TransitionOutcome> {
  const { data, error } = await developmentDb.rpc('development_transition', {
    p_application_id: input.applicationId,
    p_action: input.action,
    p_payload: (input.payload ?? {}) as Json,
    p_expected_updated_at: input.expectedUpdatedAt ?? null,
  });
  if (error) {
    if (!isTransitionMissing(error)) throw error;
    const status = input.currentStatus ?? '';
    if (!hasLegacyFallback(input.action, status, input.actingAs ?? null)) throw new TransitionNotSetUpError();
    return runLegacyFallback(input, userId);
  }
  const result = parseTransitionResult(data, input.applicationId);
  if (!result) throw new TransitionUnconfirmedError();
  return { mode: 'rpc', result };
}

/**
 * D-X5-20: today's direct writes, only for the applicant's own row and only
 * from the statuses today's policy lets them write. The affected row is
 * checked; nothing changed means nothing is reported as done.
 */
async function runLegacyFallback(input: TransitionInput, userId: string): Promise<TransitionOutcome> {
  const query =
    input.action === 'submit'
      ? supabase
          .from('development_applications')
          .update({ status: 'hod_review', submitted_at: new Date().toISOString() })
          .eq('id', input.applicationId)
          .eq('crew_member_id', userId)
          .in('status', ['draft', 'returned'])
      : supabase
          .from('development_applications')
          .update({ status: 'cancelled' })
          .eq('id', input.applicationId)
          .eq('crew_member_id', userId)
          .eq('status', 'draft');
  const { data, error } = await query.select('id');
  if (error) throw error;
  if (!data || data.length !== 1) throw new TransitionUnconfirmedError();
  return { mode: 'fallback', applicationId: input.applicationId, action: input.action };
}

/** Whether development_transition answered in this session: 'unknown', 'available' or 'missing'. */
export type TransitionSupport = 'unknown' | 'available' | 'missing';

/** The cached answer of the last transition call (no request of its own). */
export function useTransitionSupport(): TransitionSupport {
  const { profile } = useAuth();
  const { data } = useQuery({
    queryKey: developmentKeys.transitionSupport(profile?.company_id),
    queryFn: (): TransitionSupport => 'unknown',
    initialData: 'unknown' as TransitionSupport,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return data;
}

/** One transition with its toasts: success only once the server (or the fallback's checked write) confirmed it. */
export function useApplicationTransition() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const supportKey = developmentKeys.transitionSupport(profile?.company_id);

  return useMutation({
    mutationFn: async (input: TransitionInput): Promise<TransitionOutcome> => {
      if (!user?.id) throw new Error('Not authenticated');
      return runApplicationTransition(input, user.id);
    },
    onSuccess: (outcome, input) => {
      queryClient.setQueryData<TransitionSupport>(supportKey, outcome.mode === 'rpc' ? 'available' : 'missing');
      void invalidateApplicationQueries(queryClient);
      notify.success(ACTION_DONE[input.action]);
    },
    onError: (err: unknown) => {
      if (err instanceof TransitionNotSetUpError) queryClient.setQueryData<TransitionSupport>(supportKey, 'missing');
      notify.error(new Error(transitionErrorMessage(err)), { title: 'Nothing was changed' });
    },
  });
}

/** Submits the applicant's draft or returned application for approval. */
export function useSubmitApplication() {
  const { user } = useAuth();
  const transition = useApplicationTransition();
  return {
    ...transition,
    mutateAsync: (applicationId: string, currentStatus: string = 'draft') =>
      transition.mutateAsync({ applicationId, action: 'submit', currentStatus, actingAs: user?.id ? 'applicant' : null }),
  };
}

// Query configs for admin / reviewer pages (useQuery(config)).

/** Applications waiting for an approval in the caller's company (RLS narrows them to the ones the caller reviews). */
export function useApplicationsForReview() {
  const { profile } = useAuth();
  return {
    queryKey: developmentKeys.review(profile?.company_id),
    queryFn: async () => {
      if (!profile?.company_id) return [];
      const { data, error } = await supabase
        .from('development_applications')
        .select(`
          *,
          crew_member:profiles!development_applications_crew_member_id_fkey(first_name, last_name, email)
        `)
        .eq('company_id', profile.company_id)
        .in('status', [...AWAITING_APPROVAL_STATUSES])
        .order('submitted_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.company_id,
  };
}

/** The company's applications for the fleet pages; voided ones are left out of registers and totals (TR6). */
export function useFleetApplications() {
  const { profile } = useAuth();
  return {
    queryKey: developmentKeys.fleet(profile?.company_id),
    queryFn: async () => {
      if (!profile?.company_id) return [];
      const { data, error } = await supabase
        .from('development_applications')
        .select(`
          *,
          crew_member:profiles!development_applications_crew_member_id_fkey(first_name, last_name, email),
          vessel:vessels!development_applications_vessel_id_fkey(name)
        `)
        .eq('company_id', profile.company_id)
        .neq('status', 'voided')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.company_id,
  };
}

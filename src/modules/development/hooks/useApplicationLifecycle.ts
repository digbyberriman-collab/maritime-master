/**
 * The lifecycle columns 040600 adds to an application (when it entered its
 * stage, why it was rejected, voided or cancelled, the qualification its
 * completion wrote), read in a select of their own so a database without
 * 040600 still shows the live application (D-X5-20). Missing columns read
 * as `notSetUp`, never as invented values.
 */
import { useQuery } from '@tanstack/react-query';
import { isMissingRelation } from '@/integrations/supabase/pending';
import { developmentDb } from './developmentDb';
import { developmentKeys } from './keys';

export interface ApplicationLifecycle {
  notSetUp: boolean;
  stage_entered_at: string | null;
  rejected_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  qualification_record_id: string | null;
}

const EMPTY: Omit<ApplicationLifecycle, 'notSetUp'> = {
  stage_entered_at: null,
  rejected_at: null,
  voided_at: null,
  void_reason: null,
  cancelled_at: null,
  cancel_reason: null,
  qualification_record_id: null,
};

export function useApplicationLifecycle(applicationId: string | null | undefined) {
  return useQuery({
    queryKey: developmentKeys.lifecycle(applicationId),
    enabled: !!applicationId,
    queryFn: async (): Promise<ApplicationLifecycle> => {
      const { data, error } = await developmentDb
        .from('development_applications')
        .select('stage_entered_at, rejected_at, voided_at, void_reason, cancelled_at, cancel_reason, qualification_record_id')
        .eq('id', applicationId as string)
        .maybeSingle();
      if (error) {
        if (isMissingRelation(error)) return { ...EMPTY, notSetUp: true };
        throw error;
      }
      return { ...EMPTY, ...(data ?? {}), notSetUp: false };
    },
  });
}

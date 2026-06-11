import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';

export interface EligibilityContext {
  contractStartDate: string | null;
  probationEndDate: string | null;
  lastApprovedCourseEndDate: string | null;
}

/**
 * Loads the data needed by checkEligibility() for the current crew member:
 * contract_start_date, probation_end_date, and the most-recent approved
 * course end date (drives the 30-day anniversary rule).
 */
export function useEligibilityContext(userId?: string) {
  const { user } = useAuth();
  const targetId = userId ?? user?.id;

  return useQuery({
    queryKey: ['development-eligibility-context', targetId],
    queryFn: async (): Promise<EligibilityContext> => {
      if (!targetId) {
        return { contractStartDate: null, probationEndDate: null, lastApprovedCourseEndDate: null };
      }

      const [profileRes, lastCourseRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('contract_start_date, probation_end_date')
          .eq('user_id', targetId)
          .maybeSingle(),
        supabase
          .from('development_applications')
          .select('course_end_date')
          .eq('crew_member_id', targetId)
          .in('status', ['approved', 'enrolled', 'completed', 'discretionary_approved'])
          .not('course_end_date', 'is', null)
          .order('course_end_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const profileData = profileRes.data as
        | { contract_start_date?: string | null; probation_end_date?: string | null }
        | null;

      return {
        contractStartDate: profileData?.contract_start_date ?? null,
        probationEndDate: profileData?.probation_end_date ?? null,
        lastApprovedCourseEndDate: lastCourseRes.data?.course_end_date ?? null,
      };
    },
    enabled: !!targetId,
    staleTime: 60_000,
  });
}
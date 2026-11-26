import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import type { DevCategory, DevFormat } from '@/modules/development/constants';
import { ACTIVE_STATUSES } from '@/modules/development/lib/applicationMachine';
import { developmentKeys } from './keys';

export interface DevelopmentCourse {
  id: string;
  catalogue_number: number | null;
  name: string;
  department: string;
  sub_section: string | null;
  category: DevCategory;
  format: DevFormat | null;
  duration_description: string | null;
  renewal_period: string | null;
  reimbursement_summary: string | null;
  notes: string | null;
  contact_person: string | null;
  over_4k_rule: boolean;
  status: string;
}

export interface DevelopmentApplication {
  id: string;
  application_number: string;
  crew_member_id: string;
  course_name: string;
  category: DevCategory;
  status: string;
  course_provider?: string | null;
  course_location?: string | null;
  course_description?: string | null;
  course_duration_days?: number | null;
  estimated_tuition_usd?: number | null;
  estimated_travel_usd?: number | null;
  estimated_accommodation_usd?: number | null;
  estimated_accommodation_nights?: number | null;
  estimated_accommodation_nightly_rate?: number | null;
  estimated_food_per_diem_usd?: number | null;
  hod_decision?: string | null;
  hod_comments?: string | null;
  purser_decision?: string | null;
  purser_comments?: string | null;
  captain_decision?: string | null;
  captain_comments?: string | null;
  is_discretionary?: boolean | null;
  discretionary_justification?: string | null;
  denial_reason?: string | null;
  updated_at?: string | null;
  vessel?: { name?: string | null } | null;
  crew_member?: { first_name?: string | null; last_name?: string | null } | null;
  estimated_total_usd: number | null;
  submitted_at: string | null;
  created_at: string;
  course_start_date: string | null;
  course_end_date: string | null;
  hod_reviewer_id: string | null;
  hod_reviewed_at: string | null;
  purser_reviewer_id: string | null;
  purser_reviewed_at: string | null;
  captain_reviewer_id: string | null;
  captain_reviewed_at: string | null;
}

export interface DevelopmentRepayment {
  id: string;
  total_reimbursed_usd: number;
  reimbursement_date: string;
  amortisation_end_date: string;
  remaining_obligation_usd: number;
  is_fully_amortised: boolean;
  application: { course_name: string } | null;
}

interface CatalogueFilters {
  search?: string;
  departments?: string[];
  categories?: DevCategory[];
  formats?: DevFormat[];
}

export function useCourseCatalogue(filters: CatalogueFilters = {}) {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  return useQuery({
    queryKey: ['development-courses', companyId, filters],
    queryFn: async () => {
      if (!companyId) return [];

      let query = supabase
        .from('development_courses')
        .select('*')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .order('category')
        .order('department')
        .order('catalogue_number');

      if (filters.departments?.length) {
        query = query.in('department', filters.departments);
      }
      if (filters.categories?.length) {
        query = query.in('category', filters.categories);
      }
      if (filters.formats?.length) {
        query = query.in('format', filters.formats);
      }
      if (filters.search) {
        query = query.or(`name.ilike.%${filters.search}%,notes.ilike.%${filters.search}%,sub_section.ilike.%${filters.search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as DevelopmentCourse[];
    },
    enabled: !!companyId,
  });
}

export function useMyApplications() {
  const { user, profile } = useAuth();
  const companyId = profile?.company_id;

  return useQuery({
    queryKey: developmentKeys.myApplications(user?.id),
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('development_applications')
        .select(`
          *,
          crew_member:profiles!development_applications_crew_member_id_fkey(first_name, last_name, email),
          vessel:vessels!development_applications_vessel_id_fkey(name)
        `)
        .eq('crew_member_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as DevelopmentApplication[];
    },
    enabled: !!user?.id && !!companyId,
  });
}

export function useMyRepayments() {
  const { user } = useAuth();

  return useQuery({
    queryKey: developmentKeys.myRepayments(user?.id),
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('development_repayments')
        .select(`
          *,
          application:development_applications(course_name)
        `)
        .eq('crew_member_id', user.id)
        .eq('is_fully_amortised', false)
        .order('amortisation_end_date');

      if (error) throw error;
      return (data || []) as DevelopmentRepayment[];
    },
    enabled: !!user?.id,
  });
}

export function useDevelopmentStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: developmentKeys.myStats(user?.id),
    queryFn: async () => {
      if (!user?.id) return { activeApps: 0, completedCourses: 0, totalReimbursed: 0, pendingReimbursement: 0 };

      // Active applications (submitted through enrolled), completed courses
      // (completed, reimbursed or closed) and the paid reimbursements; a
      // failed count is an error, never a zero.
      const [active, completed, paid] = await Promise.all([
        supabase.from('development_applications').select('id', { count: 'exact', head: true })
          .eq('crew_member_id', user.id).in('status', [...ACTIVE_STATUSES]),
        supabase.from('development_applications').select('id', { count: 'exact', head: true })
          .eq('crew_member_id', user.id).in('status', ['completed', 'reimbursed', 'closed']),
        supabase.from('development_expenses').select('approved_reimbursement_usd')
          .eq('crew_member_id', user.id).eq('status', 'paid'),
      ]);
      if (active.error) throw active.error;
      if (completed.error) throw completed.error;
      if (paid.error) throw paid.error;
      const activeApps = active.count;
      const completedCourses = completed.count;
      const totalReimbursed = (paid.data ?? []).reduce((sum, e) => sum + (e.approved_reimbursement_usd || 0), 0);

      return {
        activeApps: activeApps || 0,
        completedCourses: completedCourses || 0,
        totalReimbursed,
        pendingReimbursement: 0,
      };
    },
    enabled: !!user?.id,
  });
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import type { DevCategory, DevFormat } from '@/modules/development/constants';

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
  course_name: string;
  category: DevCategory;
  status: string;
  estimated_total_usd: number | null;
  submitted_at: string | null;
  created_at: string;
  course_start_date: string | null;
  course_end_date: string | null;
  hod_reviewer_id: string | null;
  hod_reviewed_at: string | null;
  peer_reviewer_id: string | null;
  peer_reviewed_at: string | null;
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
    queryKey: ['my-development-applications', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('development_applications')
        .select('*')
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
    queryKey: ['my-development-repayments', user?.id],
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
    queryKey: ['my-development-stats', user?.id],
    queryFn: async () => {
      if (!user?.id) return { activeApps: 0, completedCourses: 0, totalReimbursed: 0, pendingReimbursement: 0 };

      // Active applications
      const { count: activeApps } = await supabase
        .from('development_applications')
        .select('id', { count: 'exact', head: true })
        .eq('crew_member_id', user.id)
        .in('status', ['submitted', 'hod_review', 'peer_review', 'captain_review', 'approved', 'enrolled']);

      // Completed courses
      const { count: completedCourses } = await supabase
        .from('development_applications')
        .select('id', { count: 'exact', head: true })
        .eq('crew_member_id', user.id)
        .eq('status', 'completed');

      // Total reimbursed
      const { data: expenses } = await supabase
        .from('development_expenses')
        .select('approved_reimbursement_usd')
        .eq('crew_member_id', user.id)
        .eq('status', 'paid');

      const totalReimbursed = expenses?.reduce((sum, e) => sum + (e.approved_reimbursement_usd || 0), 0) || 0;

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

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { generateAuditNumber, generateFindingNumber } from '@/lib/auditConstants';
import type { Json } from '@/integrations/supabase/types';

export interface Audit {
  id: string;
  audit_number: string;
  audit_type: string;
  audit_scope: string;
  vessel_id: string | null;
  company_id: string;
  scheduled_date: string;
  actual_start_date: string | null;
  actual_end_date: string | null;
  lead_auditor_id: string | null;
  external_auditor_name: string | null;
  external_auditor_org: string | null;
  ism_sections_covered: number[];
  status: string;
  audit_report_url: string | null;
  overall_result: string | null;
  notes: string | null;
  audit_team: string[];
  created_at: string;
  updated_at: string;
  vessel?: { id: string; name: string } | null;
  lead_auditor?: { user_id: string; first_name: string; last_name: string } | null;
}

export interface AuditFinding {
  id: string;
  audit_id: string;
  finding_number: string;
  finding_type: string;
  ism_section: number;
  requirement_text: string;
  finding_description: string;
  objective_evidence: string;
  vessel_response: string | null;
  status: string;
  closeout_evidence_urls: string[];
  closed_date: string | null;
  verified_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ManagementReview {
  id: string;
  review_date: string;
  company_id: string;
  attendees: Json;
  period_covered: string;
  agenda_items: Json;
  incident_summary: Json;
  audit_summary: Json;
  capa_summary: Json;
  sms_changes_needed: string[];
  resource_decisions: string[];
  action_items: Json;
  minutes_url: string | null;
  status: string;
  next_review_date: string | null;
  created_at: string;
  updated_at: string;
}

// Helper types for working with the data
export interface Attendee {
  user_id: string;
  name: string;
  role: string;
}

export interface ActionItem {
  description: string;
  owner: string;
  due_date: string;
  priority: string;
  status?: string;
}

export function useAudits() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all audits
  const { data: audits = [], isLoading: auditsLoading, error: auditsError } = useQuery({
    queryKey: ['audits', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];
      
      const { data, error } = await supabase
        .from('audits')
        .select(`
          *,
          vessel:vessels(id, name),
          lead_auditor:profiles!audits_lead_auditor_id_fkey(user_id, first_name, last_name)
        `)
        .eq('company_id', profile.company_id)
        .order('scheduled_date', { ascending: false });

      if (error) throw error;
      return data as Audit[];
    },
    enabled: !!profile?.company_id,
  });

  // Fetch audit findings
  const { data: findings = [], isLoading: findingsLoading } = useQuery({
    queryKey: ['audit-findings', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];

      const { data, error } = await supabase
        .from('audit_findings')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as AuditFinding[];
    },
    enabled: !!profile?.company_id,
  });

  // Fetch management reviews
  const { data: reviews = [], isLoading: reviewsLoading } = useQuery({
    queryKey: ['management-reviews', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];

      const { data, error } = await supabase
        .from('management_reviews')
        .select('*')
        .eq('company_id', profile.company_id)
        .order('review_date', { ascending: false });

      if (error) throw error;
      return data as ManagementReview[];
    },
    enabled: !!profile?.company_id,
  });

  // Add audit mutation
  const addAuditMutation = useMutation({
    mutationFn: async (auditData: Omit<Audit, 'id' | 'audit_number' | 'created_at' | 'updated_at' | 'vessel' | 'lead_auditor'>) => {
      const auditNumber = generateAuditNumber(audits.length);
      
      const { data, error } = await supabase
        .from('audits')
        .insert([{ ...auditData, audit_number: auditNumber }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audits'] });
      toast({ title: 'Audit scheduled successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to schedule audit', description: error.message, variant: 'destructive' });
    },
  });

  // Update audit mutation
  const updateAuditMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Audit> & { id: string }) => {
      // Remove joined relation fields that don't exist on the table
      const { vessel, lead_auditor, ...dbUpdates } = updates as Record<string, unknown>;

      const { data, error } = await supabase
        .from('audits')
        .update(dbUpdates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audits'] });
      toast({ title: 'Audit updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update audit', description: error.message, variant: 'destructive' });
    },
  });

  // Delete audit mutation
  const deleteAuditMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('audits').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audits'] });
      toast({ title: 'Audit deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to delete audit', description: error.message, variant: 'destructive' });
    },
  });

  // Add finding mutation
  const addFindingMutation = useMutation({
    mutationFn: async (findingData: Omit<AuditFinding, 'id' | 'finding_number' | 'created_at' | 'updated_at'>) => {
      const audit = audits.find(a => a.id === findingData.audit_id);
      const auditFindings = findings.filter(f => f.audit_id === findingData.audit_id);
      const findingNumber = generateFindingNumber(audit?.audit_number || 'AUD-0000-000', auditFindings.length);

      const { data, error } = await supabase
        .from('audit_findings')
        .insert([{ ...findingData, finding_number: findingNumber }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-findings'] });
      toast({ title: 'Finding added successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to add finding', description: error.message, variant: 'destructive' });
    },
  });

  // Update finding mutation
  const updateFindingMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AuditFinding> & { id: string }) => {
      const { data, error } = await supabase
        .from('audit_findings')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-findings'] });
      toast({ title: 'Finding updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update finding', description: error.message, variant: 'destructive' });
    },
  });

  // Add management review mutation
  const addReviewMutation = useMutation({
    mutationFn: async (reviewData: Omit<ManagementReview, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('management_reviews')
        .insert([reviewData])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['management-reviews'] });
      toast({ title: 'Management review scheduled successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to schedule review', description: error.message, variant: 'destructive' });
    },
  });

  // Update management review mutation
  const updateReviewMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ManagementReview> & { id: string }) => {
      const { data, error } = await supabase
        .from('management_reviews')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['management-reviews'] });
      toast({ title: 'Management review updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update review', description: error.message, variant: 'destructive' });
    },
  });

  // Computed values
  const internalAudits = audits.filter(a => a.audit_type === 'Internal');
  const externalAudits = audits.filter(a => a.audit_type !== 'Internal');
  const openFindings = findings.filter(f => f.status !== 'Closed');
  const nextAudit = audits
    .filter(a => new Date(a.scheduled_date) >= new Date() && a.status === 'Planned')
    .sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime())[0];

  return {
    audits,
    internalAudits,
    externalAudits,
    findings,
    openFindings,
    reviews,
    nextAudit,
    isLoading: auditsLoading || findingsLoading || reviewsLoading,
    error: auditsError,
    addAudit: addAuditMutation.mutate,
    updateAudit: updateAuditMutation.mutate,
    deleteAudit: deleteAuditMutation.mutate,
    addFinding: addFindingMutation.mutate,
    updateFinding: updateFindingMutation.mutate,
    addReview: addReviewMutation.mutate,
    updateReview: updateReviewMutation.mutate,
    isAddingAudit: addAuditMutation.isPending,
    isAddingReview: addReviewMutation.isPending,
  };
}

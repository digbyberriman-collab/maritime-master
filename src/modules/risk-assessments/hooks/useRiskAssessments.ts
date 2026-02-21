import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/shared/hooks/use-toast';
import { format } from 'date-fns';

// Types
export interface RiskAssessmentTemplate {
  id: string;
  vessel_id: string | null;
  template_name: string;
  task_category: string;
  common_hazards: any[];
  created_by: string | null;
  is_active: boolean;
  created_at: string;
}

export interface RiskAssessment {
  id: string;
  assessment_number: string;
  vessel_id: string;
  template_id: string | null;
  task_name: string;
  task_description: string | null;
  task_location: string;
  task_date: string;
  assessed_by_id: string;
  approved_by_id: string | null;
  assessment_date: string;
  review_date: string;
  linked_procedure_id: string | null;
  status: string;
  risk_score_initial: number | null;
  risk_score_residual: number | null;
  created_at: string;
  updated_at: string;
  vessel?: { name: string };
  assessed_by?: { first_name: string; last_name: string };
  approved_by?: { first_name: string; last_name: string };
  hazards?: RiskAssessmentHazard[];
}

export interface RiskAssessmentHazard {
  id: string;
  risk_assessment_id: string;
  hazard_description: string;
  consequences: string;
  likelihood_before: number;
  severity_before: number;
  risk_score_before: number;
  controls: string[];
  likelihood_after: number | null;
  severity_after: number | null;
  risk_score_after: number | null;
  responsible_person: string | null;
  sequence_order: number;
  created_at: string;
}

export interface WorkPermit {
  id: string;
  permit_number: string;
  vessel_id: string;
  permit_type: string;
  risk_assessment_id: string | null;
  work_description: string;
  work_location: string;
  requested_by_id: string;
  approved_by_id: string | null;
  start_datetime: string;
  end_datetime: string;
  actual_start: string | null;
  actual_end: string | null;
  status: string;
  workers: any[];
  safety_precautions_required: any[];
  precautions_verified: boolean;
  equipment_isolated: boolean;
  atmosphere_tested: boolean;
  atmosphere_results: any | null;
  fire_watch_required: boolean;
  fire_watch_assigned_id: string | null;
  emergency_equipment: string[];
  cancellation_reason: string | null;
  completion_notes: string | null;
  created_at: string;
  updated_at: string;
  vessel?: { name: string };
  requested_by?: { first_name: string; last_name: string };
  approved_by?: { first_name: string; last_name: string };
  risk_assessment?: { assessment_number: string; task_name: string };
}

export interface PermitExtension {
  id: string;
  permit_id: string;
  extended_by_id: string;
  new_end_datetime: string;
  extension_reason: string;
  approved_by_id: string | null;
  created_at: string;
  extended_by?: { first_name: string; last_name: string };
  approved_by?: { first_name: string; last_name: string };
}

// Generate unique numbers
const generateAssessmentNumber = () => {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `RA-${year}-${random}`;
};

const generatePermitNumber = () => {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `WP-${year}-${random}`;
};

// Risk Assessment Templates
export const useRiskAssessmentTemplates = (vesselId?: string) => {
  return useQuery({
    queryKey: ['risk-assessment-templates', vesselId],
    queryFn: async () => {
      let query = supabase
        .from('risk_assessment_templates')
        .select('*')
        .eq('is_active', true)
        .order('template_name');

      if (vesselId) {
        query = query.or(`vessel_id.is.null,vessel_id.eq.${vesselId}`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as RiskAssessmentTemplate[];
    },
    enabled: true,
  });
};

export const useCreateRiskAssessmentTemplate = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (template: Omit<RiskAssessmentTemplate, 'id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('risk_assessment_templates')
        .insert(template)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['risk-assessment-templates'] });
      toast({ title: 'Template created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error creating template', description: error.message, variant: 'destructive' });
    },
  });
};

export const useUpdateRiskAssessmentTemplate = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<RiskAssessmentTemplate> & { id: string }) => {
      const { data, error } = await supabase
        .from('risk_assessment_templates')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['risk-assessment-templates'] });
      toast({ title: 'Template updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating template', description: error.message, variant: 'destructive' });
    },
  });
};

// Risk Assessments
export const useRiskAssessments = (vesselId?: string) => {
  return useQuery({
    queryKey: ['risk-assessments', vesselId],
    queryFn: async () => {
      let query = supabase
        .from('risk_assessments')
        .select(`
          *,
          vessel:vessels(name),
          assessed_by:profiles!risk_assessments_assessed_by_id_fkey(first_name, last_name),
          approved_by:profiles!risk_assessments_approved_by_id_fkey(first_name, last_name)
        `)
        .order('created_at', { ascending: false });

      if (vesselId) {
        query = query.eq('vessel_id', vesselId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as RiskAssessment[];
    },
  });
};

export const useRiskAssessment = (assessmentId: string) => {
  return useQuery({
    queryKey: ['risk-assessment', assessmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('risk_assessments')
        .select(`
          *,
          vessel:vessels(name),
          assessed_by:profiles!risk_assessments_assessed_by_id_fkey(first_name, last_name),
          approved_by:profiles!risk_assessments_approved_by_id_fkey(first_name, last_name)
        `)
        .eq('id', assessmentId)
        .single();
      if (error) throw error;

      // Fetch hazards separately
      const { data: hazards, error: hazardsError } = await supabase
        .from('risk_assessment_hazards')
        .select('*')
        .eq('risk_assessment_id', assessmentId)
        .order('sequence_order');
      if (hazardsError) throw hazardsError;

      return { ...data, hazards } as RiskAssessment;
    },
    enabled: !!assessmentId,
  });
};

export const useCreateRiskAssessment = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (assessment: Omit<RiskAssessment, 'id' | 'assessment_number' | 'created_at' | 'updated_at' | 'vessel' | 'assessed_by' | 'approved_by' | 'hazards'>) => {
      const { data, error } = await supabase
        .from('risk_assessments')
        .insert({
          ...assessment,
          assessment_number: generateAssessmentNumber(),
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['risk-assessments'] });
      toast({ title: 'Risk assessment created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error creating risk assessment', description: error.message, variant: 'destructive' });
    },
  });
};

export const useUpdateRiskAssessment = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<RiskAssessment> & { id: string }) => {
      const { data, error } = await supabase
        .from('risk_assessments')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['risk-assessments'] });
      queryClient.invalidateQueries({ queryKey: ['risk-assessment'] });
      toast({ title: 'Risk assessment updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating risk assessment', description: error.message, variant: 'destructive' });
    },
  });
};

export const useDeleteRiskAssessment = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('risk_assessments')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['risk-assessments'] });
      toast({ title: 'Risk assessment deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error deleting risk assessment', description: error.message, variant: 'destructive' });
    },
  });
};

// Risk Assessment Hazards
export const useRiskAssessmentHazards = (assessmentId: string) => {
  return useQuery({
    queryKey: ['risk-assessment-hazards', assessmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('risk_assessment_hazards')
        .select('*')
        .eq('risk_assessment_id', assessmentId)
        .order('sequence_order');
      if (error) throw error;
      return data as RiskAssessmentHazard[];
    },
    enabled: !!assessmentId,
  });
};

export const useCreateRiskAssessmentHazard = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (hazard: Omit<RiskAssessmentHazard, 'id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('risk_assessment_hazards')
        .insert(hazard)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['risk-assessment-hazards', variables.risk_assessment_id] });
      queryClient.invalidateQueries({ queryKey: ['risk-assessment'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Error adding hazard', description: error.message, variant: 'destructive' });
    },
  });
};

export const useUpdateRiskAssessmentHazard = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<RiskAssessmentHazard> & { id: string }) => {
      const { data, error } = await supabase
        .from('risk_assessment_hazards')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['risk-assessment-hazards'] });
      queryClient.invalidateQueries({ queryKey: ['risk-assessment'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating hazard', description: error.message, variant: 'destructive' });
    },
  });
};

export const useDeleteRiskAssessmentHazard = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('risk_assessment_hazards')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['risk-assessment-hazards'] });
      queryClient.invalidateQueries({ queryKey: ['risk-assessment'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Error deleting hazard', description: error.message, variant: 'destructive' });
    },
  });
};

export const useBulkCreateHazards = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (hazards: Omit<RiskAssessmentHazard, 'id' | 'created_at'>[]) => {
      const { data, error } = await supabase
        .from('risk_assessment_hazards')
        .insert(hazards)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['risk-assessment-hazards'] });
      queryClient.invalidateQueries({ queryKey: ['risk-assessment'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Error adding hazards', description: error.message, variant: 'destructive' });
    },
  });
};

// Work Permits
export const useWorkPermits = (vesselId?: string) => {
  return useQuery({
    queryKey: ['work-permits', vesselId],
    queryFn: async () => {
      let query = supabase
        .from('work_permits')
        .select(`
          *,
          vessel:vessels(name),
          requested_by:profiles!work_permits_requested_by_id_fkey(first_name, last_name),
          approved_by:profiles!work_permits_approved_by_id_fkey(first_name, last_name),
          risk_assessment:risk_assessments(assessment_number, task_name)
        `)
        .order('created_at', { ascending: false });

      if (vesselId) {
        query = query.eq('vessel_id', vesselId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as WorkPermit[];
    },
  });
};

export const useWorkPermit = (permitId: string) => {
  return useQuery({
    queryKey: ['work-permit', permitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('work_permits')
        .select(`
          *,
          vessel:vessels(name),
          requested_by:profiles!work_permits_requested_by_id_fkey(first_name, last_name),
          approved_by:profiles!work_permits_approved_by_id_fkey(first_name, last_name),
          risk_assessment:risk_assessments(assessment_number, task_name)
        `)
        .eq('id', permitId)
        .single();
      if (error) throw error;
      return data as WorkPermit;
    },
    enabled: !!permitId,
  });
};

export const useCreateWorkPermit = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (permit: Omit<WorkPermit, 'id' | 'permit_number' | 'created_at' | 'updated_at' | 'vessel' | 'requested_by' | 'approved_by' | 'risk_assessment'>) => {
      const { data, error } = await supabase
        .from('work_permits')
        .insert({
          ...permit,
          permit_number: generatePermitNumber(),
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-permits'] });
      toast({ title: 'Work permit created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error creating work permit', description: error.message, variant: 'destructive' });
    },
  });
};

export const useUpdateWorkPermit = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<WorkPermit> & { id: string }) => {
      const { data, error } = await supabase
        .from('work_permits')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-permits'] });
      queryClient.invalidateQueries({ queryKey: ['work-permit'] });
      toast({ title: 'Work permit updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating work permit', description: error.message, variant: 'destructive' });
    },
  });
};

export const useDeleteWorkPermit = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('work_permits')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-permits'] });
      toast({ title: 'Work permit deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error deleting work permit', description: error.message, variant: 'destructive' });
    },
  });
};

// Permit Extensions
export const usePermitExtensions = (permitId: string) => {
  return useQuery({
    queryKey: ['permit-extensions', permitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permit_extensions')
        .select(`
          *,
          extended_by:profiles!permit_extensions_extended_by_id_fkey(first_name, last_name),
          approved_by:profiles!permit_extensions_approved_by_id_fkey(first_name, last_name)
        `)
        .eq('permit_id', permitId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as PermitExtension[];
    },
    enabled: !!permitId,
  });
};

export const useCreatePermitExtension = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (extension: Omit<PermitExtension, 'id' | 'created_at' | 'extended_by' | 'approved_by'>) => {
      const { data, error } = await supabase
        .from('permit_extensions')
        .insert(extension)
        .select()
        .single();
      if (error) throw error;

      // Update work permit end_datetime
      await supabase
        .from('work_permits')
        .update({ end_datetime: extension.new_end_datetime })
        .eq('id', extension.permit_id);

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['permit-extensions', variables.permit_id] });
      queryClient.invalidateQueries({ queryKey: ['work-permits'] });
      queryClient.invalidateQueries({ queryKey: ['work-permit'] });
      toast({ title: 'Permit extended successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error extending permit', description: error.message, variant: 'destructive' });
    },
  });
};

// Stats and Analytics
export const useRiskAssessmentStats = (vesselId?: string) => {
  return useQuery({
    queryKey: ['risk-assessment-stats', vesselId],
    queryFn: async () => {
      let query = supabase
        .from('risk_assessments')
        .select('id, status, risk_score_residual, review_date');

      if (vesselId) {
        query = query.eq('vessel_id', vesselId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const today = new Date();
      const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

      const totalAssessments = data?.length || 0;
      const highRiskTasks = data?.filter(ra => (ra.risk_score_residual || 0) > 15).length || 0;
      const dueForReview = data?.filter(ra => new Date(ra.review_date) <= thirtyDaysFromNow).length || 0;

      return {
        totalAssessments,
        highRiskTasks,
        dueForReview,
      };
    },
  });
};

export const useWorkPermitStats = (vesselId?: string) => {
  return useQuery({
    queryKey: ['work-permit-stats', vesselId],
    queryFn: async () => {
      let query = supabase
        .from('work_permits')
        .select('id, status');

      if (vesselId) {
        query = query.eq('vessel_id', vesselId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const activePermits = data?.filter(wp => wp.status === 'Active' || wp.status === 'Approved').length || 0;
      const pendingPermits = data?.filter(wp => wp.status === 'Pending').length || 0;

      return {
        activePermits,
        pendingPermits,
      };
    },
  });
};

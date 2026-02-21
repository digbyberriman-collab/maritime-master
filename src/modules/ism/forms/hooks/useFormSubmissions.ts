import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { useToast } from '@/shared/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';

// ============== TYPES ==============

export interface FormSubmission {
  id: string;
  submission_number: string;
  template_id: string;
  template_version: number;
  schedule_id: string | null;
  company_id: string | null;
  vessel_id: string | null;
  form_data: Json;
  line_items: Json | null;
  created_date: string;
  created_time_utc: string;
  vessel_local_offset_minutes: number | null;
  due_date: string | null;
  status: string | null;
  is_locked: boolean | null;
  locked_at: string | null;
  content_hash: string | null;
  created_offline: boolean | null;
  synced_at: string | null;
  offline_device_id: string | null;
  linked_incident_id: string | null;
  linked_nc_id: string | null;
  linked_capa_id: string | null;
  linked_audit_id: string | null;
  requires_amendment: boolean | null;
  amendment_of_id: string | null;
  amendment_reason: string | null;
  created_by: string | null;
  created_at: string | null;
  submitted_at: string | null;
  submitted_by: string | null;
  // Joined relations
  template?: {
    id: string;
    template_code: string;
    template_name: string;
    form_type: string;
    form_schema: Json;
    required_signers: Json;
    allow_parallel_signing?: boolean;
    allow_line_items?: boolean;
  } | null;
  vessel?: { id: string; name: string } | null;
  creator?: { user_id: string; first_name: string | null; last_name: string | null } | null;
  signatures?: FormSignature[];
}

export interface FormSignature {
  id: string;
  submission_id: string;
  signer_user_id: string | null;
  signer_name: string | null;
  signer_role: string | null;
  signer_rank: string | null;
  signature_order: number;
  signature_type: string | null;
  signature_data: string | null;
  signed_at: string | null;
  ip_address: string | null;
  device_info: string | null;
  user_agent: string | null;
  status: string | null;
  rejection_reason: string | null;
  delegated_to: string | null;
  created_at: string | null;
}

export interface SubmissionFilters {
  status?: string | 'all';
  templateId?: string;
  vesselId?: string;
  dateFrom?: string;
  dateTo?: string;
  createdBy?: string;
}

// Helper to get full name from profile
function getFullName(creator: { first_name: string | null; last_name: string | null } | null | undefined): string {
  if (!creator) return 'Unknown';
  return [creator.first_name, creator.last_name].filter(Boolean).join(' ') || 'Unknown';
}

// ============== HOOKS ==============

// Fetch submissions list
export function useFormSubmissions(filters: SubmissionFilters = {}) {
  const { profile } = useAuth();
  const { selectedVesselId } = useVessel();
  const vesselId = filters.vesselId || selectedVesselId;

  return useQuery({
    queryKey: ['form-submissions', profile?.company_id, filters, vesselId],
    queryFn: async () => {
      if (!profile?.company_id) return [];

      let query = supabase
        .from('form_submissions')
        .select(`
          *,
          template:form_templates(
            id, template_code, template_name, form_type, form_schema, required_signers, allow_parallel_signing
          ),
          vessel:vessels(id, name),
          creator:profiles!form_submissions_created_by_fkey(user_id, first_name, last_name),
          signatures:form_signatures(*)
        `)
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }

      if (filters.templateId) {
        query = query.eq('template_id', filters.templateId);
      }

      if (vesselId && vesselId !== '__all__') {
        query = query.eq('vessel_id', vesselId);
      }

      if (filters.dateFrom) {
        query = query.gte('created_date', filters.dateFrom);
      }

      if (filters.dateTo) {
        query = query.lte('created_date', filters.dateTo);
      }

      if (filters.createdBy) {
        query = query.eq('created_by', filters.createdBy);
      }

      const { data, error } = await query.limit(100);

      if (error) {
        console.error('Error fetching submissions:', error);
        throw error;
      }

      return data || [];
    },
    enabled: !!profile?.company_id,
  });
}

// Fetch single submission
export function useFormSubmission(submissionId: string | null) {
  return useQuery({
    queryKey: ['form-submission', submissionId],
    queryFn: async () => {
      if (!submissionId) return null;

      const { data, error } = await supabase
        .from('form_submissions')
        .select(`
          *,
          template:form_templates(
            id, template_code, template_name, form_type, form_schema, required_signers,
            allow_parallel_signing, allow_line_items
          ),
          vessel:vessels(id, name),
          creator:profiles!form_submissions_created_by_fkey(user_id, first_name, last_name),
          signatures:form_signatures(*)
        `)
        .eq('id', submissionId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!submissionId,
  });
}

// Fetch user's draft submissions
export function useMyDraftSubmissions() {
  const { profile, user } = useAuth();

  return useQuery({
    queryKey: ['my-draft-submissions', user?.id],
    queryFn: async () => {
      if (!profile?.company_id || !user?.id) return [];

      const { data, error } = await supabase
        .from('form_submissions')
        .select(`
          *,
          template:form_templates(
            id, template_code, template_name, form_type
          ),
          vessel:vessels(id, name)
        `)
        .eq('company_id', profile.company_id)
        .eq('created_by', user.id)
        .in('status', ['DRAFT', 'IN_PROGRESS'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.company_id && !!user?.id,
  });
}

// Fetch submissions pending user's signature
export function usePendingSignatures() {
  const { profile, user } = useAuth();

  return useQuery({
    queryKey: ['pending-signatures', user?.id],
    queryFn: async () => {
      if (!profile?.company_id || !user?.id) return [];

      // Get user's role/rank from profile
      const userRole = (profile as any).rank?.toLowerCase() || (profile as any).position?.toLowerCase() || 'crew';

      // First get all pending submissions
      const { data, error } = await supabase
        .from('form_submissions')
        .select(`
          *,
          template:form_templates(
            id, template_code, template_name, form_type, required_signers, allow_parallel_signing
          ),
          vessel:vessels(id, name),
          creator:profiles!form_submissions_created_by_fkey(user_id, first_name, last_name),
          signatures:form_signatures(*)
        `)
        .eq('company_id', profile.company_id)
        .eq('status', 'PENDING_SIGNATURE')
        .order('submitted_at', { ascending: true });

      if (error) throw error;

      // Filter to only those requiring this user's signature
      const pendingForUser = (data || []).filter((submission) => {
        const requiredSigners = (submission.template?.required_signers as any[]) || [];
        const existingSignatures = submission.signatures || [];
        
        // Find if there's a requirement matching user's role
        const matchingReq = requiredSigners.find(
          (r: any) => r.role?.toLowerCase() === userRole
        );
        if (!matchingReq) return false;

        // Check if already signed by this user
        const alreadySigned = existingSignatures.some(
          s => s.signer_user_id === user.id
        );
        if (alreadySigned) return false;

        // Check sequential signing order
        if (!submission.template?.allow_parallel_signing) {
          const reqOrder = matchingReq.order || 0;
          const previousReqs = requiredSigners.filter((r: any) => (r.order || 0) < reqOrder);
          const allPreviousSigned = previousReqs.every((req: any) =>
            existingSignatures.some(s => s.signer_role?.toLowerCase() === req.role?.toLowerCase())
          );
          if (!allPreviousSigned) return false;
        }

        return true;
      });

      return pendingForUser;
    },
    enabled: !!profile?.company_id && !!user?.id,
  });
}

// Create submission mutation
export function useCreateSubmission() {
  const queryClient = useQueryClient();
  const { profile, user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: {
      template_id: string;
      template_version: number;
      vessel_id: string | null;
      form_data: Record<string, unknown>;
    }) => {
      if (!profile?.company_id || !user?.id) {
        throw new Error('Not authenticated');
      }

      const insertData = {
        template_id: data.template_id,
        template_version: data.template_version,
        company_id: profile.company_id,
        vessel_id: data.vessel_id,
        form_data: data.form_data as unknown as Json,
        status: 'DRAFT',
        created_date: new Date().toISOString().split('T')[0],
        created_time_utc: new Date().toISOString(),
        created_by: user.id,
      };

      const { data: submission, error } = await supabase
        .from('form_submissions')
        .insert(insertData as any)
        .select()
        .single();

      if (error) throw error;
      return submission;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['my-draft-submissions'] });
    },
    onError: (error) => {
      console.error('Failed to create submission:', error);
      toast({
        title: 'Error',
        description: 'Failed to create form submission',
        variant: 'destructive',
      });
    },
  });
}

// Update submission mutation
export function useUpdateSubmission() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      submissionId,
      updates,
    }: {
      submissionId: string;
      updates: {
        form_data?: Record<string, unknown>;
        line_items?: any[];
        status?: string;
      };
    }) => {
      const updateData: Record<string, unknown> = {};
      
      if (updates.form_data) {
        updateData.form_data = updates.form_data as unknown as Json;
      }
      if (updates.line_items) {
        updateData.line_items = updates.line_items as unknown as Json;
      }
      if (updates.status) {
        updateData.status = updates.status;
      }

      const { data, error } = await supabase
        .from('form_submissions')
        .update(updateData)
        .eq('id', submissionId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['form-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['form-submission', data.id] });
      queryClient.invalidateQueries({ queryKey: ['my-draft-submissions'] });
    },
    onError: (error) => {
      console.error('Failed to update submission:', error);
      toast({
        title: 'Error',
        description: 'Failed to save form',
        variant: 'destructive',
      });
    },
  });
}

// Submit for signatures mutation
export function useSubmitForSignatures() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      submissionId,
      formData,
    }: {
      submissionId: string;
      formData: Record<string, unknown>;
    }) => {
      // Generate content hash
      const content = JSON.stringify(formData);
      let hash = 0;
      for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      const contentHash = Math.abs(hash).toString(16).padStart(16, '0');

      const { data, error } = await supabase
        .from('form_submissions')
        .update({
          form_data: formData as unknown as Json,
          status: 'PENDING_SIGNATURE',
          submitted_at: new Date().toISOString(),
          submitted_by: user?.id,
          content_hash: contentHash,
          is_locked: true,
          locked_at: new Date().toISOString(),
        })
        .eq('id', submissionId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['my-draft-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['pending-signatures'] });
      toast({
        title: 'Submitted',
        description: 'Form submitted for signature',
      });
    },
    onError: (error) => {
      console.error('Failed to submit:', error);
      toast({
        title: 'Error',
        description: 'Failed to submit form',
        variant: 'destructive',
      });
    },
  });
}

// Sign submission mutation
export function useSignSubmission() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      submissionId,
      signatureData,
    }: {
      submissionId: string;
      signatureData?: string; // Base64 drawn signature
    }) => {
      if (!user?.id || !profile) throw new Error('Not authenticated');

      const signerRole = (profile as any).rank || (profile as any).position || 'Crew';
      const signerName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || user.email || 'Unknown';

      // Get the next signature order
      const { data: existingSigs } = await supabase
        .from('form_signatures')
        .select('signature_order')
        .eq('submission_id', submissionId)
        .order('signature_order', { ascending: false })
        .limit(1);

      const nextOrder = (existingSigs?.[0]?.signature_order || 0) + 1;

      // Create signature record
      const { error: sigError } = await supabase
        .from('form_signatures')
        .insert({
          submission_id: submissionId,
          signer_role: signerRole,
          signer_user_id: user.id,
          signer_name: signerName,
          signature_order: nextOrder,
          signature_type: signatureData ? 'DRAWN' : 'TYPED',
          signature_data: signatureData || null,
          status: 'SIGNED',
          signed_at: new Date().toISOString(),
          device_info: JSON.stringify({ userAgent: navigator.userAgent }),
        });

      if (sigError) throw sigError;

      // Check if all signatures are collected
      const { data: submission } = await supabase
        .from('form_submissions')
        .select(`
          *,
          template:form_templates(required_signers),
          signatures:form_signatures(*)
        `)
        .eq('id', submissionId)
        .single();

      if (submission) {
        const requiredSigners = (submission.template?.required_signers as any[]) || [];
        const signatures = submission.signatures || [];
        const requiredCount = requiredSigners.filter((r: any) => r.is_mandatory !== false).length;

        if (signatures.length >= requiredCount) {
          // All signatures collected - mark as complete
          await supabase
            .from('form_submissions')
            .update({
              status: 'SIGNED',
            })
            .eq('id', submissionId);
        }
      }

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['pending-signatures'] });
      toast({
        title: 'Signed',
        description: 'Your signature has been recorded',
      });
    },
    onError: (error) => {
      console.error('Failed to sign:', error);
      toast({
        title: 'Error',
        description: 'Failed to sign form',
        variant: 'destructive',
      });
    },
  });
}

// Delete draft submission
export function useDeleteSubmission() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (submissionId: string) => {
      const { error } = await supabase
        .from('form_submissions')
        .delete()
        .eq('id', submissionId)
        .in('status', ['DRAFT', 'IN_PROGRESS']); // Only allow deleting drafts

      if (error) throw error;
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['my-draft-submissions'] });
      toast({
        title: 'Deleted',
        description: 'Draft submission deleted',
      });
    },
    onError: (error) => {
      console.error('Failed to delete:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete submission',
        variant: 'destructive',
      });
    },
  });
}

// Create amendment mutation
export function useCreateAmendment() {
  const queryClient = useQueryClient();
  const { profile, user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      originalSubmissionId,
      reason,
    }: {
      originalSubmissionId: string;
      reason: string;
    }) => {
      if (!profile?.company_id || !user?.id) {
        throw new Error('Not authenticated');
      }

      // Fetch original submission
      const { data: original, error: fetchError } = await supabase
        .from('form_submissions')
        .select('*')
        .eq('id', originalSubmissionId)
        .single();

      if (fetchError || !original) throw fetchError || new Error('Submission not found');

      // Create amendment
      const amendmentData = {
        template_id: original.template_id,
        template_version: original.template_version,
        company_id: profile.company_id,
        vessel_id: original.vessel_id,
        form_data: original.form_data,
        status: 'DRAFT',
        amendment_of_id: originalSubmissionId,
        amendment_reason: reason,
        requires_amendment: true,
        created_date: new Date().toISOString().split('T')[0],
        created_time_utc: new Date().toISOString(),
        created_by: user.id,
      };

      const { data: amendment, error } = await supabase
        .from('form_submissions')
        .insert(amendmentData as any)
        .select()
        .single();

      if (error) throw error;

      // Mark original as amended
      await supabase
        .from('form_submissions')
        .update({ status: 'AMENDED' })
        .eq('id', originalSubmissionId);

      return amendment;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['form-submissions'] });
      toast({
        title: 'Amendment Created',
        description: `Amendment ${data.submission_number} created`,
      });
    },
    onError: (error) => {
      console.error('Failed to create amendment:', error);
      toast({
        title: 'Error',
        description: 'Failed to create amendment',
        variant: 'destructive',
      });
    },
  });
}

// Helper function exported for components
export { getFullName };

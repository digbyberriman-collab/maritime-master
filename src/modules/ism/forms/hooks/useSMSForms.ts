import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { toast } from 'sonner';
import { 
  SubmissionStatus, 
  canTransition, 
  generateSubmissionNumber,
  generateContentHash,
} from '@/modules/ism/constants';
import type { Json } from '@/integrations/supabase/types';

// Types using Json for Supabase compatibility
interface SMSTemplate {
  id: string;
  company_id: string;
  template_code: string;
  template_name: string;
  template_type: string;
  category: string | null;
  version: number;
  effective_date: string;
  description: string | null;
  instructions: string | null;
  form_schema: Json;
  owner_role: string | null;
  required_signers: Json;
  allows_attachments: boolean;
  max_attachments: number;
  recurrence_type: string | null;
  recurrence_config: Json | null;
  status: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SMSSubmission {
  id: string;
  submission_number: string;
  template_id: string;
  template_version: number;
  company_id: string;
  vessel_id: string | null;
  form_data: Json;
  submission_date: string;
  submission_time_utc: string;
  vessel_local_offset_minutes: number | null;
  status: string;
  is_locked: boolean;
  locked_at: string | null;
  content_hash: string | null;
  created_by: string | null;
  created_at: string;
  submitted_at: string | null;
  submitted_by: string | null;
  updated_at: string;
  template?: SMSTemplate | null;
  signatures?: SMSSignature[];
}

interface SMSSignature {
  id: string;
  submission_id: string;
  signer_user_id: string;
  signer_name: string;
  signer_role: string;
  signer_rank: string | null;
  signature_order: number;
  signed_at: string;
  signature_method: string;
  action: string | null;
  rejection_reason: string | null;
  delegated_to: string | null;
}

interface SMSAmendment {
  id: string;
  submission_id: string;
  amendment_number: number;
  amendment_reason: string;
  previous_data: Json;
  new_data: Json;
  changed_fields: string[] | null;
  amended_by: string;
  amended_at: string;
  requires_re_signature: boolean;
  re_signed_at: string | null;
}

interface RequiredSigner {
  role: string;
  order: number;
  is_mandatory: boolean;
}

// Helper to safely parse required_signers
function parseRequiredSigners(signers: Json): RequiredSigner[] {
  if (Array.isArray(signers)) {
    return signers.map(s => {
      const signer = s as Record<string, unknown>;
      return {
        role: String(signer.role || ''),
        order: Number(signer.order || 0),
        is_mandatory: Boolean(signer.is_mandatory),
      };
    });
  }
  return [];
}

// Hook for SMS Templates
export function useSMSTemplates(options?: { status?: string; type?: string }) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['sms-templates', profile?.company_id, options],
    queryFn: async () => {
      if (!profile?.company_id) return [];

      let query = supabase
        .from('sms_templates')
        .select('*')
        .eq('company_id', profile.company_id)
        .order('template_name');

      if (options?.status) {
        query = query.eq('status', options.status);
      }
      if (options?.type) {
        query = query.eq('template_type', options.type);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as SMSTemplate[];
    },
    enabled: !!profile?.company_id,
  });
}

// Hook for SMS Submissions
export function useSMSSubmissions(options?: { 
  vesselId?: string; 
  status?: SubmissionStatus;
  templateId?: string;
}) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['sms-submissions', profile?.company_id, options],
    queryFn: async () => {
      if (!profile?.company_id) return [];

      let query = supabase
        .from('sms_submissions')
        .select(`
          *,
          template:sms_templates(*),
          signatures:sms_signatures(*)
        `)
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false });

      if (options?.vesselId) {
        query = query.eq('vessel_id', options.vesselId);
      }
      if (options?.status) {
        query = query.eq('status', options.status);
      }
      if (options?.templateId) {
        query = query.eq('template_id', options.templateId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as SMSSubmission[];
    },
    enabled: !!profile?.company_id,
  });
}

// Hook for single submission
export function useSMSSubmission(submissionId: string | null) {
  return useQuery({
    queryKey: ['sms-submission', submissionId],
    queryFn: async () => {
      if (!submissionId) return null;

      const { data, error } = await supabase
        .from('sms_submissions')
        .select(`
          *,
          template:sms_templates(*),
          signatures:sms_signatures(*),
          attachments:sms_attachments(*),
          amendments:sms_amendments(*)
        `)
        .eq('id', submissionId)
        .single();

      if (error) throw error;
      return data as SMSSubmission & { 
        attachments: unknown[]; 
        amendments: SMSAmendment[] 
      };
    },
    enabled: !!submissionId,
  });
}

// Create submission mutation
export function useCreateSMSSubmission() {
  const queryClient = useQueryClient();
  const { profile, user } = useAuth();

  return useMutation({
    mutationFn: async (data: {
      templateId: string;
      templateVersion: number;
      vesselId?: string;
      vesselName?: string;
      formData?: Record<string, unknown>;
    }) => {
      if (!profile?.company_id || !user?.id) {
        throw new Error('Not authenticated');
      }

      // Get sequence number for this template
      const { count } = await supabase
        .from('sms_submissions')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', profile.company_id)
        .eq('template_id', data.templateId);

      // Get template for code
      const { data: template } = await supabase
        .from('sms_templates')
        .select('template_code')
        .eq('id', data.templateId)
        .single();

      const submissionNumber = generateSubmissionNumber(
        template?.template_code || 'SMS',
        data.vesselName || 'FLEET',
        new Date().getFullYear(),
        (count || 0) + 1
      );

      const { data: submission, error } = await supabase
        .from('sms_submissions')
        .insert({
          submission_number: submissionNumber,
          template_id: data.templateId,
          template_version: data.templateVersion,
          company_id: profile.company_id,
          vessel_id: data.vesselId || null,
          form_data: (data.formData || {}) as Json,
          submission_date: new Date().toISOString().split('T')[0],
          submission_time_utc: new Date().toISOString(),
          status: 'DRAFT',
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return submission;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sms-submissions'] });
      toast.success('Form created');
    },
    onError: (error) => {
      toast.error(`Failed to create form: ${error.message}`);
    },
  });
}

// Update submission mutation
export function useUpdateSMSSubmission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      submissionId, 
      formData 
    }: { 
      submissionId: string; 
      formData: Record<string, unknown>;
    }) => {
      // Check if submission is locked
      const { data: existing } = await supabase
        .from('sms_submissions')
        .select('is_locked, status')
        .eq('id', submissionId)
        .single();

      if (existing?.is_locked) {
        throw new Error('Form is locked and cannot be modified');
      }

      if (existing?.status !== 'DRAFT') {
        throw new Error('Only draft forms can be edited');
      }

      const { data, error } = await supabase
        .from('sms_submissions')
        .update({ form_data: formData as Json })
        .eq('id', submissionId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sms-submission', variables.submissionId] });
      queryClient.invalidateQueries({ queryKey: ['sms-submissions'] });
      toast.success('Form saved');
    },
    onError: (error) => {
      toast.error(`Failed to save form: ${error.message}`);
    },
  });
}

// Submit for signing mutation
export function useSubmitForSigning() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (submissionId: string) => {
      const { data: submission } = await supabase
        .from('sms_submissions')
        .select('status, form_data')
        .eq('id', submissionId)
        .single();

      if (!submission) throw new Error('Submission not found');

      const transition = canTransition(submission.status as SubmissionStatus, 'submit');
      if (!transition) {
        throw new Error(`Cannot submit from status: ${submission.status}`);
      }

      // Generate content hash for integrity
      const contentHash = generateContentHash(submission.form_data as Record<string, unknown>);

      const { data, error } = await supabase
        .from('sms_submissions')
        .update({
          status: transition.to,
          submitted_at: new Date().toISOString(),
          submitted_by: user?.id,
          content_hash: contentHash,
        })
        .eq('id', submissionId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, submissionId) => {
      queryClient.invalidateQueries({ queryKey: ['sms-submission', submissionId] });
      queryClient.invalidateQueries({ queryKey: ['sms-submissions'] });
      toast.success('Form submitted for signing');
    },
    onError: (error) => {
      toast.error(`Failed to submit: ${error.message}`);
    },
  });
}

// Start signing process mutation
export function useStartSigning() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (submissionId: string) => {
      const { data: submission } = await supabase
        .from('sms_submissions')
        .select('status')
        .eq('id', submissionId)
        .single();

      if (!submission) throw new Error('Submission not found');

      const transition = canTransition(submission.status as SubmissionStatus, 'start_signing');
      if (!transition) {
        throw new Error(`Cannot start signing from status: ${submission.status}`);
      }

      const { data, error } = await supabase
        .from('sms_submissions')
        .update({
          status: transition.to,
          is_locked: true,
          locked_at: new Date().toISOString(),
        })
        .eq('id', submissionId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, submissionId) => {
      queryClient.invalidateQueries({ queryKey: ['sms-submission', submissionId] });
      queryClient.invalidateQueries({ queryKey: ['sms-submissions'] });
      toast.success('Signing process started');
    },
    onError: (error) => {
      toast.error(`Failed to start signing: ${error.message}`);
    },
  });
}

// Sign submission mutation
export function useSignSubmission() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async ({
      submissionId,
      signatureOrder,
      signatureMethod = 'PIN',
    }: {
      submissionId: string;
      signatureOrder: number;
      signatureMethod?: string;
    }) => {
      if (!user || !profile) throw new Error('Not authenticated');

      // Get submission and template
      const { data: submission } = await supabase
        .from('sms_submissions')
        .select(`
          *,
          template:sms_templates(required_signers),
          signatures:sms_signatures(*)
        `)
        .eq('id', submissionId)
        .single();

      if (!submission) throw new Error('Submission not found');
      if (submission.status !== 'PENDING_SIGNATURE') {
        throw new Error('Form is not pending signature');
      }

      const signatures = (submission.signatures || []) as SMSSignature[];
      
      // Check if user already signed
      const existingSignature = signatures.find(
        s => s.signer_user_id === user.id && s.signature_order === signatureOrder
      );
      if (existingSignature) {
        throw new Error('Already signed at this position');
      }

      // Record signature
      const { error: sigError } = await supabase
        .from('sms_signatures')
        .insert({
          submission_id: submissionId,
          signer_user_id: user.id,
          signer_name: `${profile.first_name} ${profile.last_name}`,
          signer_role: profile.role,
          signature_order: signatureOrder,
          signed_at: new Date().toISOString(),
          signature_method: signatureMethod,
          action: 'SIGNED',
          user_agent: navigator.userAgent,
        });

      if (sigError) throw sigError;

      // Check if all required signatures are collected
      const template = submission.template as SMSTemplate | null;
      const requiredSigners = parseRequiredSigners(template?.required_signers || []);
      const mandatoryCount = requiredSigners.filter(s => s.is_mandatory).length;
      const currentSignatures = signatures.length + 1;

      if (currentSignatures >= mandatoryCount) {
        // All signatures collected - mark as signed
        await supabase
          .from('sms_submissions')
          .update({ status: 'SIGNED' })
          .eq('id', submissionId);
      }

      return { success: true };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sms-submission', variables.submissionId] });
      queryClient.invalidateQueries({ queryKey: ['sms-submissions'] });
      toast.success('Signature recorded');
    },
    onError: (error) => {
      toast.error(`Failed to sign: ${error.message}`);
    },
  });
}

// Reject submission mutation
export function useRejectSubmission() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async ({
      submissionId,
      signatureOrder,
      rejectionReason,
    }: {
      submissionId: string;
      signatureOrder: number;
      rejectionReason: string;
    }) => {
      if (!user || !profile) throw new Error('Not authenticated');

      // Record rejection signature
      const { error: sigError } = await supabase
        .from('sms_signatures')
        .insert({
          submission_id: submissionId,
          signer_user_id: user.id,
          signer_name: `${profile.first_name} ${profile.last_name}`,
          signer_role: profile.role,
          signature_order: signatureOrder,
          signed_at: new Date().toISOString(),
          signature_method: 'PIN',
          action: 'REJECTED',
          rejection_reason: rejectionReason,
        });

      if (sigError) throw sigError;

      // Update submission status
      const { error } = await supabase
        .from('sms_submissions')
        .update({ 
          status: 'REJECTED',
          is_locked: false,
        })
        .eq('id', submissionId);

      if (error) throw error;

      return { success: true };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sms-submission', variables.submissionId] });
      queryClient.invalidateQueries({ queryKey: ['sms-submissions'] });
      toast.success('Form rejected');
    },
    onError: (error) => {
      toast.error(`Failed to reject: ${error.message}`);
    },
  });
}

// Create amendment mutation
export function useCreateAmendment() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      submissionId,
      newFormData,
      amendmentReason,
    }: {
      submissionId: string;
      newFormData: Record<string, unknown>;
      amendmentReason: string;
    }) => {
      if (!user) throw new Error('Not authenticated');

      // Get current submission
      const { data: submission } = await supabase
        .from('sms_submissions')
        .select('*, amendments:sms_amendments(amendment_number)')
        .eq('id', submissionId)
        .single();

      if (!submission) throw new Error('Submission not found');
      if (submission.status !== 'SIGNED') {
        throw new Error('Only signed forms can be amended');
      }

      const previousData = submission.form_data as Record<string, unknown>;
      const changedFields = Object.keys(newFormData).filter(
        key => JSON.stringify(previousData[key]) !== JSON.stringify(newFormData[key])
      );

      const amendments = (submission.amendments || []) as SMSAmendment[];
      const amendmentNumber = amendments.length + 1;

      // Create amendment record
      const { error: amendError } = await supabase
        .from('sms_amendments')
        .insert({
          submission_id: submissionId,
          amendment_number: amendmentNumber,
          amendment_reason: amendmentReason,
          previous_data: previousData as Json,
          new_data: newFormData as Json,
          changed_fields: changedFields,
          amended_by: user.id,
          requires_re_signature: true,
        });

      if (amendError) throw amendError;

      // Update submission
      const { error } = await supabase
        .from('sms_submissions')
        .update({
          form_data: newFormData as Json,
          status: 'AMENDED',
          content_hash: generateContentHash(newFormData),
        })
        .eq('id', submissionId);

      if (error) throw error;

      return { success: true };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sms-submission', variables.submissionId] });
      queryClient.invalidateQueries({ queryKey: ['sms-submissions'] });
      toast.success('Amendment created - re-signatures required');
    },
    onError: (error) => {
      toast.error(`Failed to amend: ${error.message}`);
    },
  });
}

// Get pending signatures for current user
export function usePendingSignatures() {
  const { user, profile } = useAuth();

  return useQuery({
    queryKey: ['pending-signatures', user?.id],
    queryFn: async () => {
      if (!user || !profile?.company_id) return [];

      const { data, error } = await supabase
        .from('sms_submissions')
        .select(`
          *,
          template:sms_templates(*)
        `)
        .eq('company_id', profile.company_id)
        .eq('status', 'PENDING_SIGNATURE')
        .order('submitted_at', { ascending: false });

      if (error) throw error;

      // Filter to submissions where user hasn't signed yet and is a required signer
      return ((data || []) as SMSSubmission[]).filter(submission => {
        const template = submission.template;
        const requiredSigners = parseRequiredSigners(template?.required_signers || []);
        return requiredSigners.some(s => 
          s.role === profile.role || s.role === 'master'
        );
      });
    },
    enabled: !!user && !!profile?.company_id,
  });
}

// Export types for use in components
export type { SMSTemplate, SMSSubmission, SMSSignature, SMSAmendment, RequiredSigner };
export { parseRequiredSigners };

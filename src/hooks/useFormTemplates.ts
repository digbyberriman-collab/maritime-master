import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { Json } from '@/integrations/supabase/types';
import type { FormSchema, RequiredSigner, FormTemplateStatus, FormType } from '@/lib/formConstants';

// Form Template interface matching database schema
export interface FormTemplate {
  id: string;
  company_id: string;
  template_code: string;
  template_name: string;
  description: string | null;
  category_id: string | null;
  form_type: string;
  vessel_scope: string;
  vessel_ids: string[] | null;
  department_scope: string | null;
  version: number;
  version_notes: string | null;
  effective_date: string | null;
  supersedes_template_id: string | null;
  source_file_url: string | null;
  source_file_name: string | null;
  source_file_type: string | null;
  form_schema: Json;
  initiation_mode: string;
  allow_line_items: boolean;
  has_expiry: boolean;
  expiry_hours: number | null;
  expiry_action: string | null;
  required_signers: Json;
  allow_parallel_signing: boolean;
  review_cycle_days: number | null;
  last_reviewed_at: string | null;
  next_review_date: string | null;
  can_trigger_incident: boolean;
  can_trigger_nc: boolean;
  can_trigger_capa: boolean;
  auto_attach_to_audit: boolean;
  status: string;
  published_at: string | null;
  published_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined relations
  category?: { id: string; name: string } | null;
}

// Hook options
interface UseFormTemplatesOptions {
  status?: FormTemplateStatus | 'all';
  formType?: FormType | 'all';
  vesselId?: string;
  enabled?: boolean;
}

// Fetch form templates
export function useFormTemplates(options: UseFormTemplatesOptions = {}) {
  const { profile } = useAuth();
  const { status = 'all', formType = 'all', vesselId, enabled = true } = options;

  return useQuery({
    queryKey: ['form-templates', profile?.company_id, status, formType, vesselId],
    queryFn: async () => {
      if (!profile?.company_id) return [];

      let query = supabase
        .from('form_templates')
        .select(`
          *,
          category:form_categories(id, name)
        `)
        .eq('company_id', profile.company_id)
        .order('template_name');

      if (status && status !== 'all') {
        query = query.eq('status', status);
      }

      if (formType && formType !== 'all') {
        query = query.eq('form_type', formType);
      }

      // Filter by vessel scope
      if (vesselId) {
        query = query.or(`vessel_scope.eq.FLEET,vessel_ids.cs.{${vesselId}}`);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching form templates:', error);
        throw error;
      }

      return (data || []) as FormTemplate[];
    },
    enabled: enabled && !!profile?.company_id,
  });
}

// Fetch single form template
export function useFormTemplate(templateId: string | null) {
  return useQuery({
    queryKey: ['form-template', templateId],
    queryFn: async () => {
      if (!templateId) return null;

      const { data, error } = await supabase
        .from('form_templates')
        .select(`
          *,
          category:form_categories(id, name)
        `)
        .eq('id', templateId)
        .single();

      if (error) {
        console.error('Error fetching form template:', error);
        throw error;
      }

      return data as FormTemplate;
    },
    enabled: !!templateId,
  });
}

// Create form template mutation
export function useCreateFormTemplate() {
  const queryClient = useQueryClient();
  const { profile, user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (templateData: {
      template_code: string;
      template_name: string;
      description?: string;
      form_type: string;
      vessel_scope: string;
      vessel_ids?: string[];
      department_scope?: string;
      initiation_mode: string;
      has_expiry?: boolean;
      expiry_hours?: number;
      allow_line_items?: boolean;
      required_signers?: RequiredSigner[];
      allow_parallel_signing?: boolean;
      source_file_url?: string;
      source_file_name?: string;
      source_file_type?: string;
      form_schema: FormSchema;
      status?: string;
    }) => {
      if (!profile?.company_id || !user?.id) {
        throw new Error('Not authenticated');
      }

      const isPublishing = templateData.status === 'PUBLISHED';

      const insertData = {
        company_id: profile.company_id,
        template_code: templateData.template_code,
        template_name: templateData.template_name,
        description: templateData.description || null,
        form_type: templateData.form_type,
        vessel_scope: templateData.vessel_scope,
        vessel_ids: templateData.vessel_ids || null,
        department_scope: templateData.department_scope || 'ALL',
        initiation_mode: templateData.initiation_mode,
        has_expiry: templateData.has_expiry || false,
        expiry_hours: templateData.expiry_hours || null,
        allow_line_items: templateData.allow_line_items ?? true,
        required_signers: (templateData.required_signers || []) as unknown as Json,
        allow_parallel_signing: templateData.allow_parallel_signing || false,
        source_file_url: templateData.source_file_url || null,
        source_file_name: templateData.source_file_name || null,
        source_file_type: templateData.source_file_type || null,
        form_schema: templateData.form_schema as unknown as Json,
        status: templateData.status || 'DRAFT',
        published_at: isPublishing ? new Date().toISOString() : null,
        published_by: isPublishing ? user.id : null,
        created_by: user.id,
      };

      const { data, error } = await supabase
        .from('form_templates')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;
      return data as FormTemplate;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['form-templates'] });
      toast({
        title: variables.status === 'PUBLISHED' ? 'Template Published' : 'Template Saved',
        description: `${data.template_name} has been ${variables.status === 'PUBLISHED' ? 'published' : 'saved as draft'}`,
      });
    },
    onError: (error) => {
      console.error('Failed to create template:', error);
      toast({
        title: 'Error',
        description: 'Failed to create template',
        variant: 'destructive',
      });
    },
  });
}

// Update form template mutation
export function useUpdateFormTemplate() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      templateId,
      updates,
    }: {
      templateId: string;
      updates: Partial<{
        template_name: string;
        description: string;
        form_type: string;
        vessel_scope: string;
        department_scope: string;
        initiation_mode: string;
        has_expiry: boolean;
        expiry_hours: number;
        allow_line_items: boolean;
        required_signers: RequiredSigner[];
        allow_parallel_signing: boolean;
        form_schema: FormSchema;
        status: string;
      }>;
    }) => {
      const isPublishing = updates.status === 'PUBLISHED';

      const updateData: Record<string, unknown> = { ...updates };
      
      if (updates.required_signers) {
        updateData.required_signers = updates.required_signers as unknown as Json;
      }
      if (updates.form_schema) {
        updateData.form_schema = updates.form_schema as unknown as Json;
      }
      if (isPublishing) {
        updateData.published_at = new Date().toISOString();
        updateData.published_by = user?.id;
      }

      const { data, error } = await supabase
        .from('form_templates')
        .update(updateData)
        .eq('id', templateId)
        .select()
        .single();

      if (error) throw error;
      return data as FormTemplate;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['form-templates'] });
      queryClient.invalidateQueries({ queryKey: ['form-template', data.id] });
      toast({
        title: 'Template Updated',
        description: `${data.template_name} has been updated`,
      });
    },
    onError: (error) => {
      console.error('Failed to update template:', error);
      toast({
        title: 'Error',
        description: 'Failed to update template',
        variant: 'destructive',
      });
    },
  });
}

// Duplicate template mutation
export function useDuplicateFormTemplate() {
  const queryClient = useQueryClient();
  const { profile, user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (templateId: string) => {
      if (!profile?.company_id || !user?.id) {
        throw new Error('Not authenticated');
      }

      // Fetch original template
      const { data: original, error: fetchError } = await supabase
        .from('form_templates')
        .select('*')
        .eq('id', templateId)
        .single();

      if (fetchError || !original) throw fetchError || new Error('Template not found');

      // Create duplicate with new code
      const duplicateData = {
        company_id: profile.company_id,
        template_code: `${original.template_code}_COPY`,
        template_name: `${original.template_name} (Copy)`,
        description: original.description,
        form_type: original.form_type,
        vessel_scope: original.vessel_scope,
        vessel_ids: original.vessel_ids,
        department_scope: original.department_scope,
        initiation_mode: original.initiation_mode,
        has_expiry: original.has_expiry,
        expiry_hours: original.expiry_hours,
        allow_line_items: original.allow_line_items,
        required_signers: original.required_signers,
        allow_parallel_signing: original.allow_parallel_signing,
        form_schema: original.form_schema,
        status: 'DRAFT',
        created_by: user.id,
      };

      const { data, error } = await supabase
        .from('form_templates')
        .insert(duplicateData)
        .select()
        .single();

      if (error) throw error;
      return data as FormTemplate;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['form-templates'] });
      toast({
        title: 'Template Duplicated',
        description: `Created "${data.template_name}"`,
      });
    },
    onError: (error) => {
      console.error('Failed to duplicate template:', error);
      toast({
        title: 'Error',
        description: 'Failed to duplicate template',
        variant: 'destructive',
      });
    },
  });
}

// Archive template mutation
export function useArchiveFormTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (templateId: string) => {
      const { data, error } = await supabase
        .from('form_templates')
        .update({ status: 'ARCHIVED' })
        .eq('id', templateId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form-templates'] });
      toast({
        title: 'Template Archived',
        description: 'Template has been archived',
      });
    },
    onError: (error) => {
      console.error('Failed to archive template:', error);
      toast({
        title: 'Error',
        description: 'Failed to archive template',
        variant: 'destructive',
      });
    },
  });
}

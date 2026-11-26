/**
 * The ISM template hooks. Reads are direct (RLS); writes of content are
 * direct on drafts only (the server's guard refuses anything else); every
 * status change goes through the Forms & Checklists definers
 * (@/modules/forms; 20261124040500_fleet_form_templates.sql): publish and
 * archive with their D-01 fallback while the definers are missing
 * (D-X5-20), duplicate as a Customise copy. No hook writes a status, a
 * version or a publish date itself.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { notify } from '@/shared/lib/notify';
import type { Json, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import type { FormSchema, RequiredSigner, FormTemplateStatus, FormType } from '@/modules/ism/forms/constants';
import {
  FormTemplateRefusalError,
  LEGACY_TEMPLATE_KEYS,
  archiveTemplateWithFallback,
  customiseTemplate,
  formTemplateRefusal,
  formsKeys,
  publishTemplateWithFallback,
} from '@/modules/forms';

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

/** Invalidate every template list and detail (the ISM keys and the Forms & Checklists keys). */
function useInvalidateTemplates() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  return () => {
    for (const key of LEGACY_TEMPLATE_KEYS) void queryClient.invalidateQueries({ queryKey: [...key] });
    void queryClient.invalidateQueries({ queryKey: formsKeys.company(profile?.company_id) });
  };
}

/** A status the hooks may ask for: only the definers' targets. */
type RequestedStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

/** A status the definers never set on request (a template goes back to a draft only as a new version). */
function statusRefusal(): never {
  throw new FormTemplateRefusalError('form_templates_guarded', formTemplateRefusal('form_templates_guarded') as string);
}

// Create form template mutation: always a draft; publishing it is the
// definer's job (with the D-01 fallback while the definer is missing).
export function useCreateFormTemplate() {
  const { profile, user } = useAuth();
  const invalidate = useInvalidateTemplates();

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
      /** 'PUBLISHED' publishes the new draft through the definer. */
      status?: RequestedStatus;
    }) => {
      if (!profile?.company_id || !user?.id) {
        throw new Error('Not authenticated');
      }

      const insertData: TablesInsert<'form_templates'> = {
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
        status: 'DRAFT',
        created_by: user.id,
      };

      const { data, error } = await supabase
        .from('form_templates')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;
      const created = data as FormTemplate;
      if (templateData.status !== 'PUBLISHED') return created;
      await publishTemplateWithFallback(profile.company_id, user.id, { templateId: created.id, expectedUpdatedAt: created.updated_at });
      // What the server stored, not what was asked.
      const { data: published, error: readError } = await supabase.from('form_templates').select().eq('id', created.id).maybeSingle();
      if (readError) throw readError;
      return (published ?? created) as FormTemplate;
    },
    onSuccess: (data) => {
      notify.success(data.status === 'PUBLISHED' ? 'Template published' : 'Template saved as a draft', { description: data.template_name });
    },
    onError: (error) => notify.error(error, { title: 'Template not saved' }),
    onSettled: invalidate,
  });
}

// Update form template mutation: content on a draft directly; a status
// change only through the definers.
export function useUpdateFormTemplate() {
  const { profile, user } = useAuth();
  const invalidate = useInvalidateTemplates();

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
        status: RequestedStatus;
      }>;
    }) => {
      const { status, required_signers, form_schema, ...content } = updates;
      const updateData: TablesUpdate<'form_templates'> = { ...content };
      if (required_signers) updateData.required_signers = required_signers as unknown as Json;
      if (form_schema) updateData.form_schema = form_schema as unknown as Json;

      let row: FormTemplate | null = null;
      if (Object.keys(updateData).length > 0) {
        const { data, error } = await supabase
          .from('form_templates')
          .update(updateData)
          .eq('id', templateId)
          .select()
          .maybeSingle();
        if (error) throw error;
        // RLS filters what it refuses: no row back is no save.
        if (!data) throw new FormTemplateRefusalError('not_saved', 'The template was not saved. Refresh it and try again.');
        row = data as FormTemplate;
      }

      if (status !== undefined) {
        if (!profile?.company_id || !user?.id) throw new Error('Not authenticated');
        if (status === 'PUBLISHED') {
          await publishTemplateWithFallback(profile.company_id, user.id, { templateId, expectedUpdatedAt: row?.updated_at ?? null });
        } else if (status === 'ARCHIVED') {
          await archiveTemplateWithFallback(profile.company_id, { templateId });
        } else {
          statusRefusal();
        }
        const { data, error } = await supabase.from('form_templates').select().eq('id', templateId).maybeSingle();
        if (error) throw error;
        if (!data) throw new FormTemplateRefusalError('template_not_found', formTemplateRefusal('template_not_found') as string);
        row = data as FormTemplate;
      }

      if (!row) throw new FormTemplateRefusalError('not_saved', 'Nothing to save.');
      return row;
    },
    onSuccess: (data) => notify.success('Template updated', { description: data.template_name }),
    onError: (error) => notify.error(error, { title: 'Template not updated' }),
    onSettled: invalidate,
  });
}

// Duplicate template mutation: a Customise copy (form_template_customise):
// a company draft linked to its source, coded <code>_CUSTOM<n>.
export function useDuplicateFormTemplate() {
  const { profile } = useAuth();
  const invalidate = useInvalidateTemplates();

  return useMutation({
    mutationFn: async (templateId: string) => {
      if (!profile?.company_id) throw new Error('Not authenticated');
      return customiseTemplate(profile.company_id, templateId);
    },
    onSuccess: (data) => notify.success('Copy created as a draft', { description: `${data.template_name} (${data.template_code})` }),
    onError: (error) => notify.error(error, { title: 'Template not copied' }),
    onSettled: invalidate,
  });
}

// Archive template mutation (form_template_archive; the D-01 fallback while it is missing).
export function useArchiveFormTemplate() {
  const { profile } = useAuth();
  const invalidate = useInvalidateTemplates();

  return useMutation({
    mutationFn: async (templateId: string) => {
      if (!profile?.company_id) throw new Error('Not authenticated');
      return archiveTemplateWithFallback(profile.company_id, { templateId });
    },
    onSuccess: () => notify.success('Template archived', { description: 'Its runs stay in the records.' }),
    onError: (error) => notify.error(error, { title: 'Template not archived' }),
    onSettled: invalidate,
  });
}

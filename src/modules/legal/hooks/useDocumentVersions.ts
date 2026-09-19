import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import type { FormSchema } from '@/modules/legal/lib/forms';
import { errorMessage } from '@/modules/legal/lib/storage';
import { LEGAL_SEARCH_KEY, LEGAL_TEMPLATE_KEY, LEGAL_TEMPLATES_KEY, LEGAL_VERSIONS_KEY, type LegalVersionRow } from './useLegalDocuments';

export interface SaveVersionArgs {
  content: string;
  form_schema?: FormSchema | null;
  change_summary: string;
}

export interface UpdateVersionContentArgs {
  versionId: string;
  content?: string;
  form_schema?: FormSchema | null;
  change_summary?: string | null;
}

/** Versions of a template, newest first, plus the version lifecycle mutations. */
export function useDocumentVersions(templateId: string | null | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [...LEGAL_VERSIONS_KEY, templateId ?? null],
    enabled: Boolean(user) && Boolean(templateId),
    queryFn: async (): Promise<LegalVersionRow[]> => {
      const { data, error } = await supabase
        .from('legal_document_versions')
        .select('*')
        .eq('template_id', templateId as string)
        .order('version_number', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: [...LEGAL_VERSIONS_KEY, templateId ?? null] });
    void queryClient.invalidateQueries({ queryKey: [...LEGAL_TEMPLATE_KEY, templateId ?? null] });
    void queryClient.invalidateQueries({ queryKey: LEGAL_TEMPLATES_KEY });
    void queryClient.invalidateQueries({ queryKey: LEGAL_SEARCH_KEY });
  };

  /** Creates the next version and bumps the template's current_version. */
  const saveVersion = useMutation({
    mutationFn: async (args: SaveVersionArgs): Promise<LegalVersionRow> => {
      if (!user?.id) throw new Error('You must be signed in');
      if (!templateId) throw new Error('No template selected');
      const { data: latest, error: lErr } = await supabase
        .from('legal_document_versions')
        .select('version_number')
        .eq('template_id', templateId)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lErr) throw lErr;
      const next = (latest?.version_number ?? 0) + 1;
      const { data, error } = await supabase
        .from('legal_document_versions')
        .insert({
          template_id: templateId,
          version_number: next,
          content: args.content,
          form_schema: (args.form_schema as unknown as Json) ?? null,
          change_summary: args.change_summary.trim() || null,
          authored_by: user.id,
          status: 'draft',
        })
        .select('*')
        .single();
      if (error) throw error;
      const { error: tErr } = await supabase
        .from('legal_document_templates')
        .update({ current_version: next, status: 'under_review' })
        .eq('id', templateId)
        .in('status', ['draft', 'active', 'under_review']);
      if (tErr) throw tErr;
      return data;
    },
    onSuccess: (data) => {
      invalidate();
      toast.success(`Version ${data.version_number} saved`, { description: 'Approve it to make it the active version.' });
    },
    onError: (error) => toast.error('Could not save the new version', { description: errorMessage(error) }),
  });

  /** Edits a draft version in place (approved versions are immutable in the UI). */
  const updateVersionContent = useMutation({
    mutationFn: async (args: UpdateVersionContentArgs): Promise<LegalVersionRow> => {
      const patch: Record<string, unknown> = {};
      if (args.content !== undefined) patch.content = args.content;
      if (args.form_schema !== undefined) patch.form_schema = args.form_schema as unknown as Json;
      if (args.change_summary !== undefined) patch.change_summary = args.change_summary;
      const { data, error } = await supabase.from('legal_document_versions').update(patch).eq('id', args.versionId).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Draft saved');
    },
    onError: (error) => toast.error('Could not save the draft', { description: errorMessage(error) }),
  });

  /** Approves a version: the trigger supersedes older approvals and activates the template. */
  const approveVersion = useMutation({
    mutationFn: async (versionId: string): Promise<LegalVersionRow> => {
      if (!user?.id) throw new Error('You must be signed in');
      const { data, error } = await supabase
        .from('legal_document_versions')
        .update({ status: 'approved', approved_by: user.id, approved_at: new Date().toISOString() })
        .eq('id', versionId)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      invalidate();
      toast.success(`Version ${data.version_number} approved`, { description: 'The template is now active.' });
    },
    onError: (error) => toast.error('Could not approve the version', { description: errorMessage(error) }),
  });

  const versions = useMemo(() => query.data ?? [], [query.data]);
  const current = useMemo(() => versions.find((v) => v.status === 'approved') ?? versions[0] ?? null, [versions]);
  return { ...query, versions, current, saveVersion, updateVersionContent, approveVersion };
}

/** One version by id (used to show a submission against the schema it was filled on). */
export function useDocumentVersion(versionId: string | null | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...LEGAL_VERSIONS_KEY, 'one', versionId ?? null],
    enabled: Boolean(user) && Boolean(versionId),
    queryFn: async (): Promise<LegalVersionRow> => {
      const { data, error } = await supabase.from('legal_document_versions').select('*').eq('id', versionId as string).single();
      if (error) throw error;
      return data;
    },
  });
}

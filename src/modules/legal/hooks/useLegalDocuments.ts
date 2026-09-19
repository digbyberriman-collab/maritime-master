import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Json, Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import type { FormSchema } from '@/modules/legal/lib/forms';
import { errorMessage } from '@/modules/legal/lib/storage';

export type LegalTemplateRow = Tables<'legal_document_templates'>;
export type LegalVersionRow = Tables<'legal_document_versions'>;

export const LEGAL_TEMPLATES_KEY = ['legal-document-templates'] as const;
export const LEGAL_TEMPLATE_KEY = ['legal-document-template'] as const;
export const LEGAL_VERSIONS_KEY = ['legal-document-versions'] as const;
export const LEGAL_SEARCH_KEY = ['legal-document-search'] as const;

export interface CreateTemplateArgs {
  name: string;
  document_type: string;
  category: string;
  department: string;
  description?: string | null;
  tags?: string[];
  is_prerequisite_gate?: boolean;
  validity_months?: number | null;
  linked_table?: string | null;
  linked_data_key?: string | null;
  /** Initial schema for form templates. */
  form_schema?: FormSchema | null;
}

/** Document library: every template in the company (any signed-in user can read). */
export function useLegalDocuments(options: { enabled?: boolean } = {}) {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...LEGAL_TEMPLATES_KEY, companyId],
    enabled: Boolean(user) && Boolean(companyId) && options.enabled !== false,
    queryFn: async (): Promise<LegalTemplateRow[]> => {
      const { data, error } = await supabase
        .from('legal_document_templates')
        .select('*')
        .eq('company_id', companyId as string)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = useCallback(
    (id?: string) => {
      void queryClient.invalidateQueries({ queryKey: LEGAL_TEMPLATES_KEY });
      void queryClient.invalidateQueries({ queryKey: LEGAL_SEARCH_KEY });
      if (id) {
        void queryClient.invalidateQueries({ queryKey: [...LEGAL_TEMPLATE_KEY, id] });
        void queryClient.invalidateQueries({ queryKey: [...LEGAL_VERSIONS_KEY, id] });
      }
    },
    [queryClient],
  );

  const createTemplate = useMutation({
    mutationFn: async (args: CreateTemplateArgs): Promise<LegalTemplateRow> => {
      if (!user?.id) throw new Error('You must be signed in');
      if (!companyId) throw new Error('Your profile is not linked to a company');
      const insert: TablesInsert<'legal_document_templates'> = {
        company_id: companyId,
        name: args.name.trim(),
        document_type: args.document_type,
        category: args.category,
        department: args.department,
        description: args.description?.trim() || null,
        tags: args.tags ?? [],
        is_prerequisite_gate: args.is_prerequisite_gate ?? false,
        validity_months: args.validity_months ?? null,
        linked_table: args.linked_table ?? null,
        linked_data_key: args.linked_data_key ?? null,
        created_by: user.id,
        status: 'draft',
        current_version: 1,
      };
      const { data: template, error } = await supabase.from('legal_document_templates').insert(insert).select('*').single();
      if (error) throw error;
      // Creating a template also creates version 1.
      const { error: vErr } = await supabase.from('legal_document_versions').insert({
        template_id: template.id,
        version_number: 1,
        content: '',
        form_schema: (args.form_schema as unknown as Json) ?? (args.document_type === 'form' ? ({ title: template.name, fields: [] } as unknown as Json) : null),
        change_summary: 'Initial version',
        authored_by: user.id,
        status: 'draft',
      });
      if (vErr) throw vErr;
      return template;
    },
    onSuccess: (data) => {
      invalidate(data.id);
      toast.success(`"${data.name}" created`, { description: 'Version 1 is ready to edit.' });
    },
    onError: (error) => toast.error('Could not create the document', { description: errorMessage(error) }),
  });

  const updateTemplate = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<'legal_document_templates'> }): Promise<LegalTemplateRow> => {
      const { data, error } = await supabase.from('legal_document_templates').update(patch).eq('id', id).select('*').single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      invalidate(data.id);
      toast.success('Document updated');
    },
    onError: (error) => toast.error('Could not update the document', { description: errorMessage(error) }),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string): Promise<string> => {
      const { error } = await supabase.from('legal_document_templates').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      invalidate(id);
      toast.success('Document deleted');
    },
    onError: (error) => toast.error('Could not delete the document', { description: errorMessage(error) }),
  });

  const templates = useMemo(() => query.data ?? [], [query.data]);
  return { ...query, templates, createTemplate, updateTemplate, deleteTemplate, invalidate };
}

/** One template by id. */
export function useLegalDocument(id: string | null | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...LEGAL_TEMPLATE_KEY, id ?? null],
    enabled: Boolean(user) && Boolean(id),
    queryFn: async (): Promise<LegalTemplateRow> => {
      const { data, error } = await supabase.from('legal_document_templates').select('*').eq('id', id as string).single();
      if (error) throw error;
      return data;
    },
  });
}

export interface DocumentSearchHit {
  template_id: string;
  version_id: string;
  version_number: number;
  rank: number;
  headline: string;
}

/** Full-text search over the current version content (server side). */
export function useLegalDocumentSearch(query: string) {
  const { user } = useAuth();
  const trimmed = query.trim();
  const q = useQuery({
    queryKey: [...LEGAL_SEARCH_KEY, trimmed],
    enabled: Boolean(user) && trimmed.length >= 2,
    staleTime: 30_000,
    queryFn: async (): Promise<DocumentSearchHit[]> => {
      const { data, error } = await supabase.rpc('legal_search_documents', { p_query: trimmed, p_limit: 50 });
      if (error) throw error;
      return (data ?? []) as DocumentSearchHit[];
    },
  });
  return { ...q, hits: q.data ?? [] };
}

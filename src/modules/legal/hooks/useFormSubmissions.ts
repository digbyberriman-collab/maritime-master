import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Json, Tables } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import type { FormData } from '@/modules/legal/lib/forms';
import { errorMessage } from '@/modules/legal/lib/storage';

export type LegalSubmissionRow = Tables<'legal_form_submissions'>;

export const LEGAL_SUBMISSIONS_KEY = ['legal-form-submissions'] as const;

export interface SubmitFormArgs {
  templateId: string;
  versionId: string | null;
  form_data: FormData;
  submitted_for_name?: string | null;
  submitted_for_profile_id?: string | null;
}

export interface ReviewSubmissionArgs {
  id: string;
  status: 'approved' | 'rejected';
  review_notes?: string | null;
}

/**
 * Submissions for one template (or every template with `'all'`), newest
 * first. Submitters see their own; the legal team sees the company's.
 */
export function useFormSubmissions(templateId: string | 'all' | null | undefined) {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...LEGAL_SUBMISSIONS_KEY, templateId ?? null, companyId],
    enabled: Boolean(user) && Boolean(templateId) && Boolean(companyId),
    queryFn: async (): Promise<LegalSubmissionRow[]> => {
      let q = supabase.from('legal_form_submissions').select('*').eq('company_id', companyId as string);
      if (templateId !== 'all') q = q.eq('template_id', templateId as string);
      const { data, error } = await q.order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: LEGAL_SUBMISSIONS_KEY });

  const submitForm = useMutation({
    mutationFn: async (args: SubmitFormArgs): Promise<LegalSubmissionRow> => {
      if (!user?.id) throw new Error('You must be signed in');
      if (!companyId) throw new Error('Your profile is not linked to a company');
      const { data, error } = await supabase
        .from('legal_form_submissions')
        .insert({
          template_id: args.templateId,
          version_id: args.versionId,
          company_id: companyId,
          submitted_by: user.id,
          submitted_for_name: args.submitted_for_name?.trim() || null,
          submitted_for_profile_id: args.submitted_for_profile_id || null,
          form_data: args.form_data as unknown as Json,
          status: 'submitted',
        })
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Form submitted', { description: 'The legal team will review it.' });
    },
    onError: (error) => toast.error('Could not submit the form', { description: errorMessage(error) }),
  });

  const reviewSubmission = useMutation({
    mutationFn: async (args: ReviewSubmissionArgs): Promise<LegalSubmissionRow> => {
      if (!user?.id) throw new Error('You must be signed in');
      const { data, error } = await supabase
        .from('legal_form_submissions')
        .update({ status: args.status, review_notes: args.review_notes?.trim() || null, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
        .eq('id', args.id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      invalidate();
      toast.success(data.status === 'approved' ? 'Submission approved' : 'Submission rejected');
    },
    onError: (error) => toast.error('Could not review the submission', { description: errorMessage(error) }),
  });

  const deleteSubmission = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('legal_form_submissions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Submission deleted');
    },
    onError: (error) => toast.error('Could not delete the submission', { description: errorMessage(error) }),
  });

  const submissions = useMemo(() => query.data ?? [], [query.data]);
  return { ...query, submissions, submitForm, reviewSubmission, deleteSubmission };
}

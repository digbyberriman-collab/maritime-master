import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { Document } from './useDocuments';

export interface PendingReview {
  id: string;
  document_number: string;
  title: string;
  author: { first_name: string; last_name: string } | null;
  created_at: string;
  status: string;
  reviewer_id: string | null;
  approver_id: string | null;
}

export interface ReviewAction {
  documentId: string;
  action: 'approve' | 'reject';
  feedback?: string;
}

export const usePendingReviews = () => {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['pending-reviews', profile?.user_id],
    queryFn: async () => {
      if (!profile?.user_id || !profile?.company_id) return [];

      // Get documents where user is reviewer or approver and status is Under_Review
      const { data, error } = await supabase
        .from('documents')
        .select(`
          id,
          document_number,
          title,
          status,
          reviewer_id,
          approver_id,
          created_at,
          author:profiles!documents_author_id_fkey(first_name, last_name)
        `)
        .eq('company_id', profile.company_id)
        .eq('status', 'Under_Review')
        .or(`reviewer_id.eq.${profile.user_id},approver_id.eq.${profile.user_id}`);

      if (error) throw error;
      return data as PendingReview[];
    },
    enabled: !!profile?.user_id && !!profile?.company_id,
  });
};

export const usePendingReviewCount = () => {
  const { data: reviews = [] } = usePendingReviews();
  return reviews.length;
};

export const useReviewers = () => {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['reviewers', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];

      // Get Masters and DPAs who can review
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, role')
        .eq('company_id', profile.company_id)
        .in('role', ['master', 'dpa', 'shore_management']);

      if (error) throw error;
      return data;
    },
    enabled: !!profile?.company_id,
  });
};

export const useApprovers = () => {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['approvers', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];

      // Only DPAs can approve
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, role')
        .eq('company_id', profile.company_id)
        .in('role', ['dpa', 'shore_management']);

      if (error) throw error;
      return data;
    },
    enabled: !!profile?.company_id,
  });
};

export const useDocumentWorkflowMutations = () => {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { toast } = useToast();

  const submitForReview = useMutation({
    mutationFn: async ({
      documentId,
      reviewerId,
      approverId,
      comments,
    }: {
      documentId: string;
      reviewerId: string;
      approverId: string;
      comments?: string;
    }) => {
      const { data, error } = await supabase
        .from('documents')
        .update({
          status: 'Under_Review',
          reviewer_id: reviewerId,
          approver_id: approverId,
        })
        .eq('id', documentId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['pending-reviews'] });
      toast({
        title: 'Document submitted for review',
        description: 'The reviewer has been notified.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Submission failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const approveDocument = useMutation({
    mutationFn: async ({ documentId }: { documentId: string }) => {
      if (!profile?.user_id) throw new Error('Not authenticated');

      // Get the document to check reviewer/approver status
      const { data: doc, error: fetchError } = await supabase
        .from('documents')
        .select('reviewer_id, approver_id')
        .eq('id', documentId)
        .single();

      if (fetchError) throw fetchError;

      // If user is reviewer and there's a separate approver, just forward
      const isReviewer = doc.reviewer_id === profile.user_id;
      const isApprover = doc.approver_id === profile.user_id;
      const isFinalApprover = isApprover || (isReviewer && !doc.approver_id);

      if (isFinalApprover) {
        // Final approval
        const { data, error } = await supabase
          .from('documents')
          .update({
            status: 'Approved',
            approved_date: new Date().toISOString().split('T')[0],
            issue_date: new Date().toISOString().split('T')[0],
          })
          .eq('id', documentId)
          .select()
          .single();

        if (error) throw error;
        return { ...data, action: 'approved' };
      } else {
        // Reviewer approves, forward to approver
        return { action: 'forwarded' };
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['pending-reviews'] });
      toast({
        title: data.action === 'approved' ? 'Document approved' : 'Review complete',
        description:
          data.action === 'approved'
            ? 'The document has been approved and published.'
            : 'The document has been forwarded to the approver.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Approval failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const rejectDocument = useMutation({
    mutationFn: async ({
      documentId,
      feedback,
    }: {
      documentId: string;
      feedback: string;
    }) => {
      const { data, error } = await supabase
        .from('documents')
        .update({
          status: 'Draft',
          reviewer_id: null,
          approver_id: null,
        })
        .eq('id', documentId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['pending-reviews'] });
      toast({
        title: 'Changes requested',
        description: 'The author has been notified with your feedback.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Action failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const approveImmediately = useMutation({
    mutationFn: async ({ documentId }: { documentId: string }) => {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('documents')
        .update({
          status: 'Approved',
          approved_date: today,
          issue_date: today,
          approver_id: profile?.user_id,
        })
        .eq('id', documentId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast({
        title: 'Document approved',
        description: 'The document has been approved and published.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Approval failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    submitForReview,
    approveDocument,
    rejectDocument,
    approveImmediately,
  };
};

export const useExistingTags = () => {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['document-tags', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];

      const { data, error } = await supabase
        .from('documents')
        .select('tags')
        .eq('company_id', profile.company_id);

      if (error) throw error;

      // Flatten and deduplicate tags
      const allTags = data.flatMap((d) => d.tags || []);
      return [...new Set(allTags)];
    },
    enabled: !!profile?.company_id,
  });
};

export const useCheckDocumentNumber = () => {
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (documentNumber: string) => {
      if (!profile?.company_id) return { exists: false };

      const { data, error } = await supabase
        .from('documents')
        .select('id')
        .eq('company_id', profile.company_id)
        .eq('document_number', documentNumber)
        .maybeSingle();

      if (error) throw error;
      return { exists: !!data };
    },
  });
};

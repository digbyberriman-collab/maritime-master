import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { addDays, addYears, isAfter, isBefore, startOfDay } from 'date-fns';

export interface ReviewDocument {
  id: string;
  document_number: string;
  title: string;
  category: { name: string; color: string } | null;
  revision: string;
  next_review_date: string | null;
  issue_date: string | null;
  author: { first_name: string; last_name: string } | null;
  vessel: { name: string } | null;
  status: string;
  daysUntilDue: number;
  isOverdue: boolean;
  urgencyLevel: 'overdue' | 'urgent' | 'warning' | 'normal';
}

export const useDocumentReviews = () => {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['document-reviews', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];

      const { data, error } = await supabase
        .from('documents')
        .select(`
          id,
          document_number,
          title,
          revision,
          next_review_date,
          issue_date,
          status,
          category:document_categories(name, color),
          author:profiles!documents_author_id_fkey(first_name, last_name),
          vessel:vessels(name)
        `)
        .eq('company_id', profile.company_id)
        .eq('status', 'Approved')
        .not('next_review_date', 'is', null)
        .order('next_review_date', { ascending: true });

      if (error) throw error;

      const today = startOfDay(new Date());
      const in30Days = addDays(today, 30);
      const in60Days = addDays(today, 60);
      const in90Days = addDays(today, 90);

      return (data || []).map(doc => {
        const reviewDate = doc.next_review_date ? startOfDay(new Date(doc.next_review_date)) : null;
        const daysUntilDue = reviewDate
          ? Math.ceil((reviewDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
          : 999;
        const isOverdue = reviewDate ? isBefore(reviewDate, today) : false;

        let urgencyLevel: ReviewDocument['urgencyLevel'] = 'normal';
        if (isOverdue) {
          urgencyLevel = 'overdue';
        } else if (reviewDate && isBefore(reviewDate, in30Days)) {
          urgencyLevel = 'urgent';
        } else if (reviewDate && isBefore(reviewDate, in60Days)) {
          urgencyLevel = 'warning';
        }

        return {
          ...doc,
          daysUntilDue,
          isOverdue,
          urgencyLevel,
        } as ReviewDocument;
      });
    },
    enabled: !!profile?.company_id,
  });
};

export const useOverdueReviewCount = () => {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['overdue-review-count', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return 0;

      const today = new Date().toISOString().split('T')[0];

      const { count, error } = await supabase
        .from('documents')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', profile.company_id)
        .eq('status', 'Approved')
        .lt('next_review_date', today);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!profile?.company_id,
  });
};

export const useUpcomingReviewCount = () => {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['upcoming-review-count', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return 0;

      const today = new Date();
      const in90Days = addDays(today, 90).toISOString().split('T')[0];
      const todayStr = today.toISOString().split('T')[0];

      const { count, error } = await supabase
        .from('documents')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', profile.company_id)
        .eq('status', 'Approved')
        .gte('next_review_date', todayStr)
        .lte('next_review_date', in90Days);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!profile?.company_id,
  });
};

export const useMarkAsReviewed = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      documentId,
      nextReviewDate,
      comments,
    }: {
      documentId: string;
      nextReviewDate: string;
      comments?: string;
    }) => {
      const { data, error } = await supabase
        .from('documents')
        .update({
          next_review_date: nextReviewDate,
          updated_at: new Date().toISOString(),
        })
        .eq('id', documentId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['overdue-review-count'] });
      queryClient.invalidateQueries({ queryKey: ['upcoming-review-count'] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast({
        title: 'Review completed',
        description: 'The document review date has been updated.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

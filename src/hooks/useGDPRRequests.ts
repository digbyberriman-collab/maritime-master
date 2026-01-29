import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { GDPRRequest } from '@/lib/compliance/types';

export const useGDPRRequests = () => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id;

  // Fetch GDPR requests
  const { data: gdprRequests, isLoading } = useQuery({
    queryKey: ['gdpr-requests', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      
      const { data, error } = await supabase
        .from('gdpr_requests')
        .select('*')
        .eq('company_id', companyId)
        .order('requested_at', { ascending: false });
      
      if (error) throw error;
      return data as GDPRRequest[];
    },
    enabled: !!companyId,
  });

  // Create GDPR request (for data subject)
  const createRequest = useMutation({
    mutationFn: async (params: {
      subject_user_id: string;
      request_type: GDPRRequest['request_type'];
    }) => {
      if (!companyId || !user?.id) throw new Error('Not authenticated');
      
      // Calculate deadline (30 days for GDPR compliance)
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + 30);
      
      const { data, error } = await supabase
        .from('gdpr_requests')
        .insert({
          company_id: companyId,
          subject_user_id: params.subject_user_id,
          request_type: params.request_type,
          status: 'pending',
          requested_by: user.id,
          deadline_date: deadline.toISOString().split('T')[0],
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gdpr-requests', companyId] });
      toast({
        title: 'Request Submitted',
        description: 'GDPR request has been submitted for processing.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Submission Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Process GDPR request (for DPA)
  const processRequest = useMutation({
    mutationFn: async (params: {
      requestId: string;
      status: 'in_progress' | 'completed' | 'rejected';
      response_notes?: string;
      export_file_url?: string;
    }) => {
      if (!user?.id) throw new Error('Not authenticated');
      
      const { data, error } = await supabase
        .from('gdpr_requests')
        .update({
          status: params.status,
          processed_by: user.id,
          processed_at: params.status !== 'in_progress' ? new Date().toISOString() : null,
          response_notes: params.response_notes,
          export_file_url: params.export_file_url,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.requestId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['gdpr-requests', companyId] });
      toast({
        title: 'Request Updated',
        description: `GDPR request status changed to ${variables.status}.`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Update Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Get pending requests count
  const pendingCount = gdprRequests?.filter((r) => r.status === 'pending').length || 0;

  // Get overdue requests (past deadline)
  const overdueRequests = gdprRequests?.filter((r) => {
    if (r.status === 'completed' || r.status === 'rejected') return false;
    return new Date(r.deadline_date) < new Date();
  }) || [];

  return {
    gdprRequests,
    isLoading,
    pendingCount,
    overdueRequests,
    createRequest,
    processRequest,
  };
};

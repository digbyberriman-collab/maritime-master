import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface DocumentAcknowledgment {
  id: string;
  document_id: string;
  user_id: string;
  acknowledged_at: string;
  ip_address: string | null;
  user?: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  revision: string;
  file_url: string;
  change_summary: string | null;
  created_by: string;
  created_at: string;
  creator?: {
    first_name: string;
    last_name: string;
  };
}

export interface AcknowledgmentStats {
  documentId: string;
  documentTitle: string;
  documentNumber: string;
  category: string;
  totalCrew: number;
  acknowledged: number;
  pending: number;
  percentComplete: number;
  lastReminderSent: string | null;
}

// Hook to get acknowledgments for a specific document
export const useDocumentAcknowledgments = (documentId: string | null) => {
  return useQuery({
    queryKey: ['document-acknowledgments', documentId],
    queryFn: async () => {
      if (!documentId) return [];

      const { data, error } = await supabase
        .from('document_acknowledgments')
        .select(`
          *,
          user:profiles!document_acknowledgments_user_id_fkey(first_name, last_name, email)
        `)
        .eq('document_id', documentId)
        .order('acknowledged_at', { ascending: false });

      if (error) throw error;
      return data as DocumentAcknowledgment[];
    },
    enabled: !!documentId,
  });
};

// Hook to check if current user has acknowledged a document
export const useUserAcknowledgment = (documentId: string | null) => {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['user-acknowledgment', documentId, profile?.user_id],
    queryFn: async () => {
      if (!documentId || !profile?.user_id) return null;

      const { data, error } = await supabase
        .from('document_acknowledgments')
        .select('*')
        .eq('document_id', documentId)
        .eq('user_id', profile.user_id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!documentId && !!profile?.user_id,
  });
};

// Hook to get document versions
export const useDocumentVersions = (documentId: string | null) => {
  return useQuery({
    queryKey: ['document-versions', documentId],
    queryFn: async () => {
      if (!documentId) return [];

      const { data, error } = await supabase
        .from('document_versions')
        .select(`
          *,
          creator:profiles!document_versions_created_by_fkey(first_name, last_name)
        `)
        .eq('document_id', documentId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as DocumentVersion[];
    },
    enabled: !!documentId,
  });
};

// Hook to acknowledge a document
export const useAcknowledgeMutation = () => {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (documentId: string) => {
      if (!profile?.user_id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('document_acknowledgments')
        .insert({
          document_id: documentId,
          user_id: profile.user_id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, documentId) => {
      queryClient.invalidateQueries({ queryKey: ['document-acknowledgments', documentId] });
      queryClient.invalidateQueries({ queryKey: ['user-acknowledgment', documentId] });
      queryClient.invalidateQueries({ queryKey: ['acknowledgment-stats'] });
      queryClient.invalidateQueries({ queryKey: ['mandatory-documents'] });
      toast({
        title: 'Document acknowledged',
        description: 'Your acknowledgment has been recorded.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Acknowledgment failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
};

// Hook to get crew members for a company (for acknowledgment tracking)
export const useCompanyCrew = () => {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['company-crew', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];

      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, email, role')
        .eq('company_id', profile.company_id)
        .eq('status', 'Active');

      if (error) throw error;
      return data;
    },
    enabled: !!profile?.company_id,
  });
};

// Hook to get acknowledgment statistics for all mandatory documents
export const useAcknowledgmentStats = () => {
  const { profile } = useAuth();
  const { data: crew } = useCompanyCrew();

  return useQuery({
    queryKey: ['acknowledgment-stats', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];

      // Get all mandatory read documents
      const { data: documents, error: docError } = await supabase
        .from('documents')
        .select(`
          id,
          title,
          document_number,
          category:document_categories(name)
        `)
        .eq('company_id', profile.company_id)
        .eq('is_mandatory_read', true)
        .eq('status', 'Approved');

      if (docError) throw docError;
      if (!documents) return [];

      // Get all acknowledgments
      const { data: acknowledgments, error: ackError } = await supabase
        .from('document_acknowledgments')
        .select('document_id, user_id')
        .in('document_id', documents.map(d => d.id));

      if (ackError) throw ackError;

      const totalCrew = crew?.length || 0;
      const ackByDoc: Record<string, Set<string>> = {};

      acknowledgments?.forEach(ack => {
        if (!ackByDoc[ack.document_id]) {
          ackByDoc[ack.document_id] = new Set();
        }
        ackByDoc[ack.document_id].add(ack.user_id);
      });

      return documents.map(doc => {
        const acknowledged = ackByDoc[doc.id]?.size || 0;
        return {
          documentId: doc.id,
          documentTitle: doc.title,
          documentNumber: doc.document_number,
          category: doc.category?.name || 'Unknown',
          totalCrew,
          acknowledged,
          pending: totalCrew - acknowledged,
          percentComplete: totalCrew > 0 ? Math.round((acknowledged / totalCrew) * 100) : 0,
          lastReminderSent: null,
        };
      }) as AcknowledgmentStats[];
    },
    enabled: !!profile?.company_id && !!crew,
  });
};

// Hook to get mandatory documents pending acknowledgment for current user
export const useMandatoryDocumentsPending = () => {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['mandatory-documents', profile?.user_id],
    queryFn: async () => {
      if (!profile?.user_id || !profile?.company_id) return [];

      // Get all mandatory approved documents
      const { data: documents, error: docError } = await supabase
        .from('documents')
        .select(`
          id,
          title,
          document_number,
          category:document_categories(name, icon, color)
        `)
        .eq('company_id', profile.company_id)
        .eq('is_mandatory_read', true)
        .eq('status', 'Approved');

      if (docError) throw docError;
      if (!documents || documents.length === 0) return [];

      // Get user's acknowledgments
      const { data: acknowledgments, error: ackError } = await supabase
        .from('document_acknowledgments')
        .select('document_id')
        .eq('user_id', profile.user_id)
        .in('document_id', documents.map(d => d.id));

      if (ackError) throw ackError;

      const acknowledgedIds = new Set(acknowledgments?.map(a => a.document_id));
      
      return documents.filter(doc => !acknowledgedIds.has(doc.id));
    },
    enabled: !!profile?.user_id && !!profile?.company_id,
  });
};

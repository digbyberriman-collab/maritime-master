import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface DocumentCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  display_order: number;
}

export interface Document {
  id: string;
  company_id: string;
  vessel_id: string | null;
  category_id: string;
  document_number: string;
  title: string;
  description: string | null;
  revision: string;
  language: string;
  file_url: string;
  file_name: string;
  file_size: number;
  file_type: string;
  status: string;
  author_id: string;
  reviewer_id: string | null;
  approver_id: string | null;
  issue_date: string | null;
  next_review_date: string | null;
  approved_date: string | null;
  tags: string[];
  is_mandatory_read: boolean;
  ism_sections: number[];
  created_at: string;
  updated_at: string;
  // Joined data
  category?: DocumentCategory;
  vessel?: { id: string; name: string } | null;
  author?: { first_name: string; last_name: string } | null;
}

export interface DocumentFilters {
  search: string;
  categories: string[];
  statuses: string[];
  ismSections: number[];
  vesselId: string | null;
}

export interface UploadDocumentData {
  file: File;
  title: string;
  description?: string;
  category_id: string;
  vessel_id?: string | null;
  revision: string;
  language: string;
  status: string;
  tags: string[];
  is_mandatory_read: boolean;
  ism_sections: number[];
  next_review_date?: string | null;
}

export const useDocumentCategories = () => {
  return useQuery({
    queryKey: ['document-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_categories')
        .select('*')
        .order('display_order');

      if (error) throw error;
      return data as DocumentCategory[];
    },
  });
};

export const useDocuments = (filters: DocumentFilters) => {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['documents', filters, profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];

      let query = supabase
        .from('documents')
        .select(`
          *,
          category:document_categories(*),
          vessel:vessels(id, name),
          author:profiles!documents_author_id_fkey(first_name, last_name)
        `)
        .eq('company_id', profile.company_id);

      // Apply filters
      if (filters.search) {
        query = query.or(`title.ilike.%${filters.search}%,document_number.ilike.%${filters.search}%`);
      }

      if (filters.categories.length > 0) {
        query = query.in('category_id', filters.categories);
      }

      if (filters.statuses.length > 0) {
        query = query.in('status', filters.statuses);
      }

      if (filters.vesselId) {
        query = query.eq('vessel_id', filters.vesselId);
      }

      if (filters.ismSections.length > 0) {
        query = query.overlaps('ism_sections', filters.ismSections);
      }

      const { data, error } = await query.order('updated_at', { ascending: false });

      if (error) throw error;
      return data as Document[];
    },
    enabled: !!profile?.company_id,
  });
};

export const useDocument = (documentId: string | null) => {
  return useQuery({
    queryKey: ['document', documentId],
    queryFn: async () => {
      if (!documentId) return null;

      const { data, error } = await supabase
        .from('documents')
        .select(`
          *,
          category:document_categories(*),
          vessel:vessels(id, name),
          author:profiles!documents_author_id_fkey(first_name, last_name)
        `)
        .eq('id', documentId)
        .maybeSingle();

      if (error) throw error;
      return data as Document | null;
    },
    enabled: !!documentId,
  });
};

export const useDocumentMutations = () => {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { toast } = useToast();

  const generateDocumentNumber = async (): Promise<string> => {
    if (!profile?.company_id) throw new Error('No company ID');

    const year = new Date().getFullYear();
    const { count } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', profile.company_id);

    const nextNum = (count || 0) + 1;
    return `STORM-DOC-${year}-${String(nextNum).padStart(4, '0')}`;
  };

  const uploadDocument = useMutation({
    mutationFn: async (data: UploadDocumentData) => {
      if (!profile?.company_id || !profile?.user_id) {
        throw new Error('User not authenticated');
      }

      // Generate document number
      const documentNumber = await generateDocumentNumber();

      // Upload file to storage
      const fileExt = data.file.name.split('.').pop();
      const filePath = `${profile.company_id}/${documentNumber}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, data.file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);

      // Create document record
      const { data: doc, error: docError } = await supabase
        .from('documents')
        .insert({
          company_id: profile.company_id,
          vessel_id: data.vessel_id || null,
          category_id: data.category_id,
          document_number: documentNumber,
          title: data.title,
          description: data.description || null,
          revision: data.revision,
          language: data.language,
          file_url: urlData.publicUrl,
          file_name: data.file.name,
          file_size: data.file.size,
          file_type: data.file.type,
          status: data.status,
          author_id: profile.user_id,
          tags: data.tags,
          is_mandatory_read: data.is_mandatory_read,
          ism_sections: data.ism_sections,
          next_review_date: data.next_review_date || null,
        })
        .select()
        .single();

      if (docError) throw docError;
      return doc;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast({
        title: 'Document uploaded',
        description: 'The document has been uploaded successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Upload failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateDocument = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Document> & { id: string }) => {
      const { data, error } = await supabase
        .from('documents')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast({
        title: 'Document updated',
        description: 'The document has been updated successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Update failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteDocument = useMutation({
    mutationFn: async (documentId: string) => {
      // Get document to delete file from storage
      const { data: doc } = await supabase
        .from('documents')
        .select('file_url, company_id, document_number')
        .eq('id', documentId)
        .single();

      if (doc) {
        // Extract file path from URL
        const filePath = `${doc.company_id}/${doc.document_number}.${doc.file_url.split('.').pop()}`;
        await supabase.storage.from('documents').remove([filePath]);
      }

      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', documentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      toast({
        title: 'Document deleted',
        description: 'The document has been deleted successfully.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Delete failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    uploadDocument,
    updateDocument,
    deleteDocument,
  };
};

export const useDocumentStats = () => {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['document-stats', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return { total: 0, byStatus: {}, byCategory: {} };

      const { data, error } = await supabase
        .from('documents')
        .select('status, category_id')
        .eq('company_id', profile.company_id);

      if (error) throw error;

      const byStatus: Record<string, number> = {};
      const byCategory: Record<string, number> = {};

      data?.forEach((doc) => {
        byStatus[doc.status] = (byStatus[doc.status] || 0) + 1;
        byCategory[doc.category_id] = (byCategory[doc.category_id] || 0) + 1;
      });

      return {
        total: data?.length || 0,
        byStatus,
        byCategory,
      };
    },
    enabled: !!profile?.company_id,
  });
};

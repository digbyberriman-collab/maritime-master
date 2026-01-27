import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface CrewAttachment {
  id: string;
  user_id: string;
  attachment_type: string;
  file_name: string;
  file_url: string;
  file_size: number;
  mime_type: string | null;
  description: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
  uploader?: {
    first_name: string;
    last_name: string;
  } | null;
}

export interface AttachmentFormData {
  attachment_type: string;
  description?: string;
  file: File;
}

export const ATTACHMENT_TYPES = [
  'Contract',
  'CV / Resume',
  'Reference Letter',
  'Training Record',
  'Performance Review',
  'Disciplinary Record',
  'Medical Record',
  'Insurance Document',
  'Travel Document',
  'Photo ID',
  'Bank Details',
  'Tax Document',
  'Visa Copy',
  'Other'
] as const;

export const useCrewAttachments = (userId: string) => {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch attachments for a crew member
  const { data: attachments, isLoading, error } = useQuery({
    queryKey: ['crew-attachments', userId],
    queryFn: async () => {
      if (!userId) return [];

      // Use explicit foreign key hint for the uploader relationship
      const { data, error } = await supabase
        .from('crew_attachments')
        .select(`
          id,
          user_id,
          attachment_type,
          file_name,
          file_url,
          file_size,
          mime_type,
          description,
          uploaded_by,
          created_at,
          updated_at,
          uploader:profiles!crew_attachments_uploaded_by_fkey(first_name, last_name)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []) as unknown as CrewAttachment[];
    },
    enabled: !!userId,
  });

  // Upload attachment mutation
  const uploadAttachment = useMutation({
    mutationFn: async (formData: AttachmentFormData) => {
      if (!profile?.user_id) throw new Error('Not authenticated');

      // Validate file size (max 25MB)
      if (formData.file.size > 25 * 1024 * 1024) {
        throw new Error('File size exceeds 25MB limit');
      }

      // Upload file to storage
      const fileExt = formData.file.name.split('.').pop();
      const filePath = `attachments/${userId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, formData.file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);

      // Create database record
      const { data, error: dbError } = await supabase
        .from('crew_attachments')
        .insert({
          user_id: userId,
          attachment_type: formData.attachment_type,
          file_name: formData.file.name,
          file_url: urlData.publicUrl,
          file_size: formData.file.size,
          mime_type: formData.file.type,
          description: formData.description || null,
          uploaded_by: profile.user_id,
        })
        .select()
        .single();

      if (dbError) throw dbError;

      // Audit log
      await supabase.from('audit_logs').insert({
        entity_type: 'crew_attachment',
        entity_id: data.id,
        action: 'CREATE',
        actor_user_id: profile.user_id,
        actor_email: user?.email,
        actor_role: profile.role,
        new_values: {
          attachment_type: formData.attachment_type,
          file_name: formData.file.name,
        },
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crew-attachments', userId] });
      toast({
        title: 'Attachment uploaded',
        description: 'File has been successfully uploaded.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Upload failed',
        description: error.message || 'Failed to upload attachment. Please try again.',
        variant: 'destructive',
      });
      console.error('Error uploading attachment:', error);
    },
  });

  // Delete attachment mutation
  const deleteAttachment = useMutation({
    mutationFn: async (attachment: CrewAttachment) => {
      if (!profile?.user_id) throw new Error('Not authenticated');

      // Delete from storage
      const filePath = `attachments/${userId}/${attachment.file_url.split('/').pop()}`;
      await supabase.storage.from('documents').remove([filePath]);

      // Delete database record
      const { error } = await supabase
        .from('crew_attachments')
        .delete()
        .eq('id', attachment.id);

      if (error) throw error;

      // Audit log
      await supabase.from('audit_logs').insert({
        entity_type: 'crew_attachment',
        entity_id: attachment.id,
        action: 'DELETE',
        actor_user_id: profile.user_id,
        actor_email: user?.email,
        actor_role: profile.role,
        old_values: {
          attachment_type: attachment.attachment_type,
          file_name: attachment.file_name,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crew-attachments', userId] });
      toast({
        title: 'Attachment deleted',
        description: 'File has been successfully deleted.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Delete failed',
        description: 'Failed to delete attachment. Please try again.',
        variant: 'destructive',
      });
      console.error('Error deleting attachment:', error);
    },
  });

  return {
    attachments,
    isLoading,
    error,
    uploadAttachment,
    deleteAttachment,
  };
};

// Format file size helper
export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
};

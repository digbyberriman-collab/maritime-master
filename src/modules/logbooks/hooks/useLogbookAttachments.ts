import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { toast } from '@/shared/hooks/use-toast';

const BUCKET = 'logbook-attachments';
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export interface LogbookAttachment {
  id: string;
  entry_id: string;
  logbook_id: string;
  company_id: string;
  vessel_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  description: string | null;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  created_at: string;
}

interface EntryRef {
  entryId: string | null;
  logbookId: string | null;
  companyId: string | null;
  vesselId: string | null;
}

const safeName = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'file';

export const useLogbookAttachments = ({ entryId, logbookId, companyId, vesselId }: EntryRef) => {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();

  const uploaderName = useMemo(() => {
    const first = (profile as { first_name?: string } | null)?.first_name ?? '';
    const last = (profile as { last_name?: string } | null)?.last_name ?? '';
    return `${first} ${last}`.trim() || profile?.email || 'Unknown';
  }, [profile]);

  const attachmentsQuery = useQuery({
    queryKey: ['logbook-attachments', entryId],
    enabled: !!entryId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('logbook_attachments')
        .select('*')
        .eq('entry_id', entryId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as LogbookAttachment[];
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['logbook-attachments', entryId] });

  const uploadFiles = useMutation({
    mutationFn: async (files: File[]) => {
      if (!entryId || !logbookId || !companyId || !vesselId) {
        throw new Error('Save the entry before attaching files.');
      }
      for (const file of files) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          throw new Error(`"${file.name}" is larger than the 25 MB limit.`);
        }
        const path = `${companyId}/${entryId}/${Date.now()}-${safeName(file.name)}`;
        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { cacheControl: '3600', upsert: false });
        if (uploadError) throw uploadError;

        const { error: insertError } = await supabase.from('logbook_attachments').insert({
          entry_id: entryId,
          logbook_id: logbookId,
          company_id: companyId,
          vessel_id: vesselId,
          storage_path: path,
          file_name: file.name,
          mime_type: file.type || null,
          file_size: file.size,
          uploaded_by: user?.id ?? null,
          uploaded_by_name: uploaderName,
        });
        if (insertError) {
          await supabase.storage.from(BUCKET).remove([path]);
          throw insertError;
        }
      }
    },
    onSuccess: (_data, files) => {
      invalidate();
      toast({
        title: files.length > 1 ? 'Files attached' : 'File attached',
        description: `${files.length} file${files.length > 1 ? 's' : ''} added to this entry.`,
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
    },
  });

  const removeAttachment = useMutation({
    mutationFn: async (attachment: LogbookAttachment) => {
      const { error } = await supabase
        .from('logbook_attachments')
        .delete()
        .eq('id', attachment.id);
      if (error) throw error;
      await supabase.storage.from(BUCKET).remove([attachment.storage_path]);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Attachment removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not remove attachment', description: error.message, variant: 'destructive' });
    },
  });

  const openAttachment = async (attachment: LogbookAttachment) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(attachment.storage_path, 60 * 10);
    if (error || !data?.signedUrl) {
      toast({
        title: 'Could not open file',
        description: error?.message ?? 'The file link could not be created.',
        variant: 'destructive',
      });
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  return {
    attachments: attachmentsQuery.data ?? [],
    isLoading: attachmentsQuery.isLoading,
    uploadFiles,
    removeAttachment,
    openAttachment,
    currentUserId: user?.id ?? null,
  };
};

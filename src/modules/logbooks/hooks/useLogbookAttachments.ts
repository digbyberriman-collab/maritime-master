import { useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { toast } from '@/shared/hooks/use-toast';

const BUCKET = 'logbook-attachments';
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const ALLOWED_MIME_PREFIXES = ['image/'];
const ALLOWED_MIME_TYPES = ['application/pdf'];
// Extensions for browsers that report an empty file.type (rare, but possible).
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.heif', '.svg'];

export const isAllowedAttachmentType = (file: File): boolean => {
  if (file.type) {
    return (
      ALLOWED_MIME_TYPES.includes(file.type) ||
      ALLOWED_MIME_PREFIXES.some((prefix) => file.type.startsWith(prefix))
    );
  }
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  return ALLOWED_EXTENSIONS.includes(extension);
};

export const ALLOWED_TYPES_MESSAGE = 'Only PDF and image files (photos and scans) can be attached.';

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

export interface AttachmentUploadProgress {
  key: string;
  name: string;
  size: number;
  /** 0-100 while the file is being sent to storage. */
  progress: number;
  status: 'uploading' | 'saving' | 'done' | 'error';
  error?: string;
}

interface EntryRef {
  entryId: string | null;
  logbookId: string | null;
  companyId: string | null;
  vesselId: string | null;
}

const safeName = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'file';

/**
 * Upload a file to storage with real progress events. The Supabase JS client
 * does not expose upload progress, so this uses XHR against the same storage
 * endpoint with the user's session token.
 */
const uploadWithProgress = async (
  path: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${supabaseUrl}/storage/v1/object/${BUCKET}/${path}`);
    xhr.setRequestHeader('apikey', anonKey);
    if (session?.access_token) {
      xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
    }
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('cache-control', '3600');
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
        return;
      }
      let message = `Upload failed (${xhr.status}).`;
      try {
        const body = JSON.parse(xhr.responseText) as { message?: string; error?: string };
        message = body.message ?? body.error ?? message;
      } catch {
        // keep the generic message
      }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error('Network error while uploading the file.'));
    xhr.send(file);
  });
};

export const useLogbookAttachments = ({ entryId, logbookId, companyId, vesselId }: EntryRef) => {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const [uploads, setUploads] = useState<AttachmentUploadProgress[]>([]);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const updateUpload = (key: string, patch: Partial<AttachmentUploadProgress>) =>
    setUploads((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );

  const scheduleClearDoneUploads = () => {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => {
      setUploads((current) => current.filter((item) => item.status === 'uploading' || item.status === 'saving'));
    }, 2500);
  };

  const uploadFiles = useMutation({
    mutationFn: async (files: File[]) => {
      if (!entryId || !logbookId || !companyId || !vesselId) {
        throw new Error('Save the entry before attaching files.');
      }
      if (clearTimer.current) clearTimeout(clearTimer.current);
      const stamp = Date.now();
      const queue: AttachmentUploadProgress[] = files.map((file, index) => ({
        key: `${stamp}-${index}`,
        name: file.name,
        size: file.size,
        progress: 0,
        status: 'uploading',
      }));
      setUploads((current) => [...current.filter((item) => item.status === 'uploading' || item.status === 'saving'), ...queue]);

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const key = queue[index].key;
        try {
          if (file.size > MAX_ATTACHMENT_BYTES) {
            throw new Error(`"${file.name}" is larger than the 25 MB limit.`);
          }
          if (!isAllowedAttachmentType(file)) {
            throw new Error(`"${file.name}" is not a supported file type. ${ALLOWED_TYPES_MESSAGE}`);
          }
          const path = `${companyId}/${entryId}/${stamp}-${index}-${safeName(file.name)}`;
          await uploadWithProgress(path, file, (percent) => updateUpload(key, { progress: percent }));

          updateUpload(key, { status: 'saving', progress: 100 });
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
          updateUpload(key, { status: 'done', progress: 100 });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Upload failed.';
          updateUpload(key, { status: 'error', error: message });
          throw error instanceof Error ? error : new Error(message);
        }
      }
    },
    onSuccess: (_data, files) => {
      invalidate();
      scheduleClearDoneUploads();
      toast({
        title: files.length > 1 ? 'Files attached' : 'File attached',
        description: `${files.length} file${files.length > 1 ? 's' : ''} added to this entry.`,
      });
    },
    onError: (error: Error) => {
      scheduleClearDoneUploads();
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

  const createSignedLink = async (
    attachment: LogbookAttachment,
    download: boolean,
  ): Promise<string | null> => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(attachment.storage_path, 60 * 10, {
        download: download ? attachment.file_name : false,
      });
    if (error || !data?.signedUrl) {
      toast({
        title: 'Could not open file',
        description: error?.message ?? 'The file link could not be created.',
        variant: 'destructive',
      });
      return null;
    }
    return data.signedUrl;
  };

  const openAttachment = async (attachment: LogbookAttachment) => {
    const url = await createSignedLink(attachment, false);
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const downloadAttachment = async (attachment: LogbookAttachment) => {
    const url = await createSignedLink(attachment, true);
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = attachment.file_name;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return {
    attachments: attachmentsQuery.data ?? [],
    isLoading: attachmentsQuery.isLoading,
    uploads,
    uploadFiles,
    removeAttachment,
    openAttachment,
    downloadAttachment,
    currentUserId: user?.id ?? null,
  };
};

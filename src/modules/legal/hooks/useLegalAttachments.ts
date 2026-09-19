import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { parseAttachments, type LegalAttachment, type LegalRequestRow } from '@/modules/legal/lib/requests';
import {
  attachmentBelongsToRequest,
  buildAttachmentPath,
  errorMessage,
  isAllowedAttachmentType,
  isInlineViewable,
  LEGAL_ATTACHMENT_MAX_BYTES,
  LEGAL_ATTACHMENTS_BUCKET,
  LEGAL_SIGNED_URL_TTL_SECONDS,
} from '@/modules/legal/lib/storage';
import { LEGAL_REQUEST_EVENTS_KEY, LEGAL_REQUEST_KEY, LEGAL_REQUESTS_KEY } from './useLegalRequests';

export const getLegalAttachmentUrl = async (path: string, download?: string | boolean): Promise<string> => {
  const { data, error } = await supabase.storage
    .from(LEGAL_ATTACHMENTS_BUCKET)
    .createSignedUrl(path, LEGAL_SIGNED_URL_TTL_SECONDS, download ? { download } : undefined);
  if (error) throw error;
  return data.signedUrl;
};

/**
 * Opens a request attachment: PDFs and images inline, anything else as a
 * download. Refuses paths outside the request's own folder.
 */
export const openLegalAttachment = async (attachment: LegalAttachment, request: Pick<LegalRequestRow, 'id' | 'company_id'>): Promise<void> => {
  if (!attachmentBelongsToRequest(attachment.path, request.company_id, request.id)) throw new Error('This attachment does not belong to the request');
  const url = await getLegalAttachmentUrl(attachment.path, isInlineViewable(attachment.mime_type) ? undefined : attachment.name);
  window.open(url, '_blank', 'noopener');
};

/** Upload / remove files on a request; the jsonb `attachments` column is the index. */
export function useLegalAttachments() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id ?? null;

  const invalidate = (requestId: string) => {
    void queryClient.invalidateQueries({ queryKey: LEGAL_REQUESTS_KEY });
    void queryClient.invalidateQueries({ queryKey: [...LEGAL_REQUEST_KEY, requestId] });
    void queryClient.invalidateQueries({ queryKey: [...LEGAL_REQUEST_EVENTS_KEY, requestId] });
  };

  const writeIndex = async (requestId: string, attachments: LegalAttachment[]) => {
    const { error } = await supabase
      .from('legal_requests')
      .update({ attachments: attachments as unknown as Json })
      .eq('id', requestId);
    if (error) throw error;
  };

  const upload = useMutation({
    mutationFn: async ({ request, file }: { request: LegalRequestRow; file: File }): Promise<LegalAttachment> => {
      if (!user?.id) throw new Error('You must be signed in');
      if (!companyId) throw new Error('Your profile is not linked to a company');
      if (file.size > LEGAL_ATTACHMENT_MAX_BYTES) throw new Error('Files must be 25 MB or smaller');
      if (!isAllowedAttachmentType(file.type)) throw new Error(`${file.name}: documents, images, spreadsheets, emails and zip archives only`);
      const path = buildAttachmentPath({ companyId, kind: 'requests', recordId: request.id, fileName: file.name });
      const { error } = await supabase.storage.from(LEGAL_ATTACHMENTS_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (error) throw error;
      const attachment: LegalAttachment = {
        path,
        name: file.name,
        size: file.size,
        mime_type: file.type || 'application/octet-stream',
        uploaded_by: user.id,
        uploaded_at: new Date().toISOString(),
      };
      // Re-read the index so concurrent uploads do not clobber each other.
      const { data: fresh, error: rErr } = await supabase.from('legal_requests').select('attachments').eq('id', request.id).single();
      if (rErr) throw rErr;
      await writeIndex(request.id, [...parseAttachments(fresh.attachments), attachment]);
      return attachment;
    },
    onSuccess: (attachment, { request }) => {
      invalidate(request.id);
      toast.success(`${attachment.name} attached`);
    },
    onError: (error) => toast.error('Could not attach the file', { description: errorMessage(error) }),
  });

  const remove = useMutation({
    mutationFn: async ({ request, attachment }: { request: LegalRequestRow; attachment: LegalAttachment }): Promise<void> => {
      if (!attachmentBelongsToRequest(attachment.path, request.company_id, request.id)) throw new Error('This attachment does not belong to the request');
      const { data: fresh, error: rErr } = await supabase.from('legal_requests').select('attachments').eq('id', request.id).single();
      if (rErr) throw rErr;
      await writeIndex(request.id, parseAttachments(fresh.attachments).filter((a) => a.path !== attachment.path));
      const { error } = await supabase.storage.from(LEGAL_ATTACHMENTS_BUCKET).remove([attachment.path]);
      if (error) console.warn('legal attachment object not removed', error);
    },
    onSuccess: (_, { request, attachment }) => {
      invalidate(request.id);
      toast.success(`${attachment.name} removed`);
    },
    onError: (error) => toast.error('Could not remove the file', { description: errorMessage(error) }),
  });

  return { upload, remove };
}

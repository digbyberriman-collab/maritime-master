import React, { useRef } from 'react';
import { ExternalLink, FileText, Paperclip, Trash2, Upload } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { openLegalAttachment, useLegalAttachments } from '@/modules/legal/hooks/useLegalAttachments';
import { formatBytes, parseAttachments, type LegalRequestRow } from '@/modules/legal/lib/requests';
import { errorMessage, LEGAL_ATTACHMENT_ACCEPT } from '@/modules/legal/lib/storage';

interface AttachmentListProps {
  request: LegalRequestRow;
  canEdit: boolean;
}

export const AttachmentList: React.FC<AttachmentListProps> = ({ request, canEdit }) => {
  const { upload, remove } = useLegalAttachments();
  const inputRef = useRef<HTMLInputElement>(null);
  const attachments = parseAttachments(request.attachments);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      await upload.mutateAsync({ request, file }).catch(() => undefined);
    }
    if (inputRef.current) inputRef.current.value = '';
  };

  const open = (a: (typeof attachments)[number]) => openLegalAttachment(a, request).catch((e: unknown) => toast.error('Could not open the file', { description: errorMessage(e) }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Paperclip className="h-4 w-4 text-muted-foreground" aria-hidden /> Attachments
          <span className="text-sm font-normal text-muted-foreground">({attachments.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {attachments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No files attached.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {attachments.map((a) => (
              <li key={a.path} className="flex items-center gap-3 px-3 py-2">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <button type="button" onClick={() => open(a)} className="block max-w-full truncate text-left text-sm font-medium text-foreground hover:underline">
                    {a.name}
                  </button>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(a.size)}
                    {a.uploaded_at ? ` · ${format(new Date(a.uploaded_at), 'd MMM yyyy, HH:mm')}` : ''}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => open(a)} aria-label={`Open ${a.name}`}>
                  <ExternalLink className="h-4 w-4" />
                </Button>
                {canEdit && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove.mutate({ request, attachment: a })} disabled={remove.isPending} aria-label={`Remove ${a.name}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <div>
            <input ref={inputRef} type="file" multiple accept={LEGAL_ATTACHMENT_ACCEPT} className="hidden" onChange={(e) => onFiles(e.target.files)} aria-label="Choose files to attach" />
            <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={upload.isPending}>
              <Upload className="mr-2 h-4 w-4" /> {upload.isPending ? 'Uploading…' : 'Attach files'}
            </Button>
            <p className="mt-1 text-xs text-muted-foreground">Documents, images, spreadsheets, emails and zip archives up to 25 MB. Stored privately; only you and the legal team can open them.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AttachmentList;

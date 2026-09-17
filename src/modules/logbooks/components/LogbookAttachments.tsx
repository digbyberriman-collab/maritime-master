import React from 'react';
import { FileText, Image as ImageIcon, Paperclip, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MAX_ATTACHMENT_BYTES,
  useLogbookAttachments, type LogbookAttachment,
} from '@/modules/logbooks/hooks/useLogbookAttachments';

const MAX_ATTACHMENT_MB = MAX_ATTACHMENT_BYTES / (1024 * 1024);

interface Props {
  entryId: string | null;
  logbookId: string | null;
  companyId: string | null;
  vesselId: string | null;
  canManage: boolean;
}

const formatSize = (bytes: number | null) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const iconFor = (attachment: LogbookAttachment) =>
  attachment.mime_type?.startsWith('image/') ? ImageIcon : FileText;

const LogbookAttachments: React.FC<Props> = ({
  entryId, logbookId, companyId, vesselId, canManage,
}) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const {
    attachments, isLoading, uploadFiles, removeAttachment, openAttachment, currentUserId,
  } = useLogbookAttachments({ entryId, logbookId, companyId, vesselId });

  if (!entryId) {
    return (
      <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
        Save the entry first, then reopen it to attach photos, scans or PDFs.
      </div>
    );
  }

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    uploadFiles.mutate(Array.from(fileList));
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <Label className="flex items-center gap-2">
          <Paperclip className="h-4 w-4" /> Attachments
        </Label>
        {canManage && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={uploadFiles.isPending}
          >
            <Upload className="mr-1 h-4 w-4" />
            {uploadFiles.isPending ? 'Uploading...' : 'Add files'}
          </Button>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
          onChange={(event) => handleFiles(event.target.files)}
        />
      </div>

      {isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No files attached. Photos, scanned receipts and PDFs up to 25 MB each are supported.
        </p>
      ) : (
        <ul className="space-y-2">
          {attachments.map((attachment) => {
            const Icon = iconFor(attachment);
            const canRemove = canManage || attachment.uploaded_by === currentUserId;
            return (
              <li
                key={attachment.id}
                className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2"
              >
                <button
                  type="button"
                  onClick={() => openAttachment(attachment)}
                  className="flex min-w-0 items-center gap-2 text-left text-sm hover:underline"
                >
                  <Icon className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate">{attachment.file_name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatSize(attachment.file_size)}
                  </span>
                </button>
                {canRemove && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${attachment.file_name}`}
                    onClick={() => removeAttachment.mutate(attachment)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default LogbookAttachments;

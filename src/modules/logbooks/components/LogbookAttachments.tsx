import React from 'react';
import { CheckCircle2, Download, FileText, Image as ImageIcon, Loader2, Paperclip, Trash2, Upload, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ALLOWED_TYPES_MESSAGE,
  MAX_ATTACHMENT_BYTES,
  isAllowedAttachmentType,
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
    attachments, isLoading, uploads, uploadFiles, removeAttachment, openAttachment, downloadAttachment,
    currentUserId,
  } = useLogbookAttachments({ entryId, logbookId, companyId, vesselId });
  const [sizeError, setSizeError] = React.useState<string | null>(null);
  const [typeError, setTypeError] = React.useState<string | null>(null);

  if (!entryId) {
    return (
      <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
        Save the entry first, then reopen it to attach photos, scans or PDFs.
      </div>
    );
  }

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);

    const unsupported = files.filter((file) => !isAllowedAttachmentType(file));
    if (unsupported.length > 0) {
      const names = unsupported.map((file) => `"${file.name}"`).join(', ');
      setTypeError(
        `${names} ${unsupported.length > 1 ? 'are' : 'is'} not a supported file type${unsupported.length > 1 ? 's' : ''}. ${ALLOWED_TYPES_MESSAGE}`,
      );
    } else {
      setTypeError(null);
    }

    const oversized = files
      .filter((file) => isAllowedAttachmentType(file))
      .filter((file) => file.size > MAX_ATTACHMENT_BYTES);
    if (oversized.length > 0) {
      const names = oversized
        .map((file) => `"${file.name}" (${formatSize(file.size)})`)
        .join(', ');
      setSizeError(
        `${names} ${oversized.length > 1 ? 'exceed' : 'exceeds'} the ${MAX_ATTACHMENT_MB} MB limit and ${oversized.length > 1 ? 'were' : 'was'} not attached. Please choose ${oversized.length > 1 ? 'smaller files' : 'a smaller file'}.`,
      );
    } else {
      setSizeError(null);
    }

    const allowed = files
      .filter((file) => isAllowedAttachmentType(file))
      .filter((file) => file.size <= MAX_ATTACHMENT_BYTES);
    if (allowed.length > 0) uploadFiles.mutate(allowed);
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
            {uploadFiles.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-1 h-4 w-4" />
            )}
            {uploadFiles.isPending ? 'Uploading...' : 'Add files'}
          </Button>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept="image/*,application/pdf,.pdf,.jpg,.jpeg,.png,.gif,.webp,.bmp,.heic,.heif,.svg"
          onChange={(event) => handleFiles(event.target.files)}
        />
      </div>

      {typeError && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {typeError}
        </p>
      )}

      {sizeError && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {sizeError}
        </p>
      )}

      {uploads.length > 0 && (
        <ul className="space-y-2" aria-live="polite">
          {uploads.map((upload) => (
            <li
              key={upload.key}
              className="space-y-1 rounded-md bg-muted/50 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  {upload.status === 'done' ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                  ) : upload.status === 'error' ? (
                    <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                  ) : (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                  )}
                  <span className="truncate">{upload.name}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {upload.status === 'uploading' && `${upload.progress}%`}
                  {upload.status === 'saving' && 'Saving...'}
                  {upload.status === 'done' && 'Attached'}
                  {upload.status === 'error' && 'Failed'}
                </span>
              </div>
              {upload.status === 'error' ? (
                <p className="text-xs text-destructive">{upload.error}</p>
              ) : (
                <Progress value={upload.progress} className="h-1.5" />
              )}
            </li>
          ))}
        </ul>
      )}

      {isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No files attached. PDFs and images (photos and scans) up to 25 MB each are supported.
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
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Download ${attachment.file_name}`}
                    onClick={() => downloadAttachment(attachment)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
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
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default LogbookAttachments;

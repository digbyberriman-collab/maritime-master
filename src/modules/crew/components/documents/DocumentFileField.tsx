import React from 'react';
import { FileText, Paperclip, Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { crewDocumentMimeType } from '@/lib/storage/crewDocuments';
import {
  DOCUMENT_FILE_ACCEPT,
  DOCUMENT_FILE_HINT,
  documentFileProblem,
  documentPreviewKind,
  fileSizeText,
} from '@/modules/crew/lib/documentUpload';

export interface DocumentFileFieldProps {
  /** The newly chosen file (not uploaded yet), or null. */
  file: File | null;
  onChange: (file: File | null) => void;
  /** The document's stored file on an edit: kept unless a new one is chosen. */
  existing?: { name: string | null; size: number | null } | null;
  /** A refusal to show at the field (the check, storage or the server's file fields). */
  error?: string | null;
  onError: (message: string | null) => void;
  /** Off while the storage helper is missing (D-01), with the sentence why. */
  disabledReason?: string | null;
  disabled?: boolean;
}

/** An object URL for a chosen file while it is shown; revoked when the file changes or the field goes. */
function useObjectUrl(file: File | null, wanted: boolean): string | null {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!file || !wanted || typeof URL.createObjectURL !== 'function') {
      setUrl(null);
      return undefined;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file, wanted]);
  return url;
}

/**
 * The file of a crew document (gap/04 C25; gap/08 UP1): choose or drop one
 * file, checked at once (at most 50 MB, the UP1 types, not empty) with the
 * sentence why when it is refused; a chosen image or PDF previews before it
 * is uploaded. Nothing is uploaded here: the dialog uploads on Save
 * (lib/documentUpload.ts), so cancelling leaves nothing behind.
 */
export const DocumentFileField: React.FC<DocumentFileFieldProps> = ({ file, onChange, existing, error, onError, disabledReason, disabled }) => {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const inputId = React.useId();
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const [dragging, setDragging] = React.useState(false);
  const mime = file ? crewDocumentMimeType(file) : null;
  const preview = documentPreviewKind(mime);
  const url = useObjectUrl(file, preview !== 'none');
  const off = Boolean(disabled || disabledReason);

  const take = (picked: File | null | undefined) => {
    if (!picked) return;
    const problem = documentFileProblem(picked);
    if (problem) {
      onError(problem);
      return;
    }
    onError(null);
    onChange(picked);
  };

  const clear = () => {
    onChange(null);
    onError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="min-w-0 space-y-2" data-document-file-field="">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <label htmlFor={inputId} className="type-body font-medium text-foreground">
          File
        </label>
        <span id={hintId} className="type-caption text-muted-foreground">
          {disabledReason ?? DOCUMENT_FILE_HINT}
        </span>
      </div>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={DOCUMENT_FILE_ACCEPT}
        className="sr-only"
        disabled={off}
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        aria-invalid={error ? true : undefined}
        onChange={(e) => take(e.target.files?.[0])}
      />
      <div
        className={cn(
          'flex min-w-0 flex-col gap-3 rounded-md border border-dashed p-3 transition-colors duration-quick ease-tide sm:flex-row sm:items-center',
          dragging ? 'border-primary bg-signal-muted' : error ? 'border-critical/60' : 'border-border',
          off && 'opacity-60',
        )}
        onDragOver={(e) => {
          if (off) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (off) return;
          e.preventDefault();
          setDragging(false);
          take(e.dataTransfer.files?.[0]);
        }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground" aria-hidden="true">
            {file ? <Paperclip className="size-4" /> : <FileText className="size-4" />}
          </span>
          <div className="min-w-0">
            {file ? (
              <>
                <p className="break-all type-body font-medium text-foreground" data-document-file-chosen="">
                  {file.name}
                </p>
                <p className="type-caption text-muted-foreground">
                  {fileSizeText(file.size)}
                  {existing?.name ? ` · replaces ${existing.name}` : ''}
                </p>
              </>
            ) : existing?.name ? (
              <>
                <p className="break-all type-body text-foreground">{existing.name}</p>
                <p className="type-caption text-muted-foreground">
                  {[fileSizeText(existing.size), 'kept unless you choose another'].filter(Boolean).join(' · ')}
                </p>
              </>
            ) : (
              <p className="type-body text-muted-foreground">No file chosen. Drop one here, or choose it.</p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={off}
            onClick={() => inputRef.current?.click()}
            className="[@media(pointer:coarse)]:h-11"
          >
            <Upload aria-hidden="true" />
            {file || existing?.name ? 'Choose another' : 'Choose file'}
          </Button>
          {file ? (
            <Button type="button" variant="ghost" onClick={clear} aria-label={`Remove ${file.name}`} className="[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
              <X aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="type-caption font-medium text-critical" data-document-file-error="">
          {error}
        </p>
      ) : null}
      {file && url && preview === 'image' ? (
        <img src={url} alt={`Preview of ${file.name}`} className="max-h-64 w-auto max-w-full rounded-md border border-border object-contain" />
      ) : null}
      {file && url && preview === 'pdf' ? (
        <iframe src={url} title={`Preview of ${file.name}`} className="h-64 w-full rounded-md border border-border bg-background" />
      ) : null}
    </div>
  );
};

export default DocumentFileField;

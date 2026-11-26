import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, ExternalLink, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { PageError } from '@/shared/components/states';
import { notify } from '@/shared/lib/notify';
import { downloadCrewDocument, getCrewDocumentSignedUrl, SIGNED_URL_TTL_SECONDS } from '@/lib/storage/crewDocuments';
import { crewDocumentKeys } from '@/modules/crew/hooks/useDocumentTypes';
import type { CrewDocumentView } from '@/modules/crew/hooks/useCrewDocuments';
import { documentFileMime, documentFileRef, documentPreviewKind, fileSizeText } from '@/modules/crew/lib/documentUpload';

export interface DocumentViewerProps {
  document: CrewDocumentView | null;
  companyId: string;
  onOpenChange: (open: boolean) => void;
}

/**
 * View a crew document's file (gap/04 C24 "View"): a short-lived signed URL
 * for the stored path (the bucket is private; D-X1-18), shown in place for
 * images and PDFs, with Open in a new tab and Download for every type. The
 * URL is asked for only while the viewer is open, and never kept longer than
 * it lives. A refusal or a missing object is an error with Try again.
 */
export const DocumentViewer: React.FC<DocumentViewerProps> = ({ document: doc, companyId, onOpenChange }) => {
  const ref = doc ? documentFileRef(doc) : null;
  const query = useQuery({
    queryKey: [...crewDocumentKeys.person(companyId, doc?.profileId), 'file', doc?.id ?? 'none', ref ?? 'none'] as const,
    queryFn: async () => {
      const url = await getCrewDocumentSignedUrl(ref);
      if (!url) throw new Error('This document has no stored file.');
      return url;
    },
    enabled: Boolean(doc && ref),
    // A signed URL lives SIGNED_URL_TTL_SECONDS; ask again well before that.
    staleTime: Math.max(60, SIGNED_URL_TTL_SECONDS - 600) * 1000,
    gcTime: Math.max(60, SIGNED_URL_TTL_SECONDS - 600) * 1000,
    retry: false,
  });
  const [downloading, setDownloading] = React.useState(false);
  if (!doc) return null;
  const mime = documentFileMime(doc);
  const preview = documentPreviewKind(mime);
  const name = doc.fileName ?? 'Document file';
  const size = fileSizeText(doc.fileSize);

  const download = async () => {
    if (!ref) return;
    setDownloading(true);
    try {
      await downloadCrewDocument(ref, name);
    } catch (error) {
      notify.error(error, { title: 'The file could not be downloaded' });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(92dvh,56rem)] w-[calc(100vw-1rem)] max-w-4xl flex-col gap-4 overflow-hidden p-4 sm:p-6"
        data-document-viewer={doc.id}
      >
        <DialogHeader className="min-w-0 pr-8 text-left">
          <DialogTitle className="type-title break-words">{doc.name}</DialogTitle>
          <DialogDescription className="break-all">
            {name}
            {size ? ` · ${size}` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border bg-muted/40">
          {!ref ? (
            <p className="p-6 type-body text-muted-foreground">This document has no file.</p>
          ) : query.error ? (
            <div className="p-4">
              <PageError
                variant="inline"
                error={query.error}
                onRetry={() => void query.refetch()}
                title="The file could not be opened"
                treatMissingAsOff={false}
              />
            </div>
          ) : !query.data ? (
            <div className="space-y-2 p-4" aria-busy="true" aria-label="Opening the file">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : preview === 'image' ? (
            <img src={query.data} alt={`${doc.name}, the uploaded file`} className="mx-auto block h-auto max-h-[70dvh] max-w-full object-contain" />
          ) : preview === 'pdf' ? (
            <iframe src={query.data} title={`${doc.name}, the uploaded file`} className="block h-[70dvh] w-full bg-background" />
          ) : (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <FileText aria-hidden="true" className="size-8 text-muted-foreground" />
              <p className="type-body text-muted-foreground">This file type opens in its own app. Use Open or Download.</p>
            </div>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {query.data ? (
            <Button asChild variant="outline" className="[@media(pointer:coarse)]:h-11">
              <a href={query.data} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden="true" />
                Open in a new tab
              </a>
            </Button>
          ) : null}
          {ref ? (
            <Button type="button" variant="outline" onClick={download} disabled={downloading} className="[@media(pointer:coarse)]:h-11">
              <Download aria-hidden="true" />
              {downloading ? 'Downloading…' : 'Download'}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DocumentViewer;

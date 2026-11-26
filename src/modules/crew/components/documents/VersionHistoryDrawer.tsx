import React from 'react';
import { format } from 'date-fns';
import { Eye, FileText, History, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, PageError } from '@/shared/components/states';
import type { CrewDocumentView } from '@/modules/crew/hooks/useCrewDocuments';
import type { CrewDocumentVersion, DocumentVersionsState } from '@/modules/crew/hooks/useDocumentVerification';
import { dayText, reviewedLine } from '@/modules/crew/lib/verification';
import { VerificationBadge, VerificationReview } from './VerificationBadge';

const COARSE = '[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11';
const NAME_NOT_AVAILABLE = 'Name not available';

/** "12 Nov 2026, 14:05" in the reader's time; null for a blank or invalid timestamp. */
function whenText(value: string | null | undefined): string | null {
  if (!value) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : format(at, 'd MMM yyyy, HH:mm');
}

export interface VersionHistoryDrawerProps {
  /** The current document (its newest values). */
  document: CrewDocumentView;
  versions: DocumentVersionsState;
  countryLabel?: (code: string | null) => string | null;
  onOpenChange: (open: boolean) => void;
  /** Opens an earlier version's file (the drawer closes first). */
  onViewFile?: (version: CrewDocumentVersion) => void;
}

/**
 * The renewal history of one crew document (gap/04 C30): the current
 * values on top, then every earlier version newest first, each with its
 * number, dates, issuing country, file, the verification it had and who
 * replaced it when (and why). Versions are kept by crew_document_renew and
 * TR9 renewals and read with the document's own visibility. A name that
 * cannot be read says so, never an invented one.
 *
 * States: loading; not set up (D-01: the versions table is missing); an
 * error with Try again; no earlier version yet. A Sheet from the right, full
 * width below 640 px; 44 px targets on coarse pointers.
 */
export const VersionHistoryDrawer: React.FC<VersionHistoryDrawerProps> = ({ document: doc, versions, countryLabel, onOpenChange, onViewFile }) => {
  const country = (code: string | null) => (countryLabel ? countryLabel(code) : code);
  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent side="right" hideClose className="flex w-full flex-col gap-0 p-0 sm:max-w-lg" aria-describedby="crew-document-history-description" data-version-history="">
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0 space-y-1">
            <p className="type-eyebrow flex items-center gap-1.5 text-muted-foreground">
              <History aria-hidden="true" className="size-3.5" />
              History
            </p>
            <SheetTitle className="break-words type-title">{doc.name}</SheetTitle>
            <SheetDescription id="crew-document-history-description" className="type-caption">
              Renewing a document keeps the replaced one here, with the verification it had.
            </SheetDescription>
          </div>
          <SheetClose asChild>
            <Button type="button" variant="ghost" size="icon" className={cn('shrink-0', COARSE)} aria-label="Close the history">
              <X aria-hidden="true" className="size-4" />
            </Button>
          </SheetClose>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <section aria-label="Current" className="rounded-md border border-border p-3" data-version="current">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="type-subtitle text-foreground">Current</p>
              <VerificationBadge doc={doc} />
            </div>
            <Facts
              number={doc.number}
              issueDate={doc.issueDate}
              expiryDate={doc.expiryDate}
              noExpiry={doc.noExpiry}
              country={country(doc.issuingCountryCode)}
              file={doc.hasFile ? doc.fileName ?? 'File attached' : null}
            />
            <VerificationReview doc={doc} />
          </section>
          <HistoryBody state={versions} documentId={doc.id} country={country} onViewFile={onViewFile} />
        </div>
      </SheetContent>
    </Sheet>
  );
};

const HistoryBody: React.FC<{
  state: DocumentVersionsState;
  documentId: string;
  country: (code: string | null) => string | null;
  onViewFile?: (version: CrewDocumentVersion) => void;
}> = ({ state, documentId, country, onViewFile }) => {
  switch (state.status) {
    case 'idle':
    case 'loading':
      return (
        <div role="status" aria-busy="true" className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <span className="sr-only">Loading the history</span>
        </div>
      );
    case 'not_applied':
      return <EmptyState kind="not-enabled" title="Document history is not set up yet" body="Earlier versions show here once the crew update is applied." compact />;
    case 'error':
      return <PageError variant="inline" error={state.error} onRetry={state.retry} title="The history could not load" treatMissingAsOff={false} />;
    case 'ready':
      return (
        <VersionList
          versions={state.versions.byDocument.get(documentId) ?? []}
          namesUnavailable={state.versions.namesUnavailable}
          country={country}
          onViewFile={onViewFile}
        />
      );
  }
};

/** The versions of one document, newest first. */
const VersionList: React.FC<{
  versions: readonly CrewDocumentVersion[];
  namesUnavailable: boolean;
  country: (code: string | null) => string | null;
  onViewFile?: (version: CrewDocumentVersion) => void;
}> = ({ versions, namesUnavailable, country, onViewFile }) => {
  if (versions.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No earlier versions"
        body="When this document is renewed, the replaced one is kept here."
        compact
        bordered
      />
    );
  }
  return (
    <>
      <ol aria-label="Earlier versions" className="space-y-3">
        {versions.map((v) => {
          const when = whenText(v.replacedAt);
          const by = v.replacedByName ?? (namesUnavailable ? NAME_NOT_AVAILABLE : null);
          return (
            <li key={v.id} className="rounded-md border border-border p-3" data-version={v.versionNo}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="type-subtitle text-foreground">Version {v.versionNo}</p>
                <VerificationBadge doc={{ verificationStatus: v.verificationStatus, verifiedByName: v.verifiedByName, verifiedAt: v.verifiedAt }} />
              </div>
              <p className="mt-0.5 type-caption text-muted-foreground">
                {[when ? `Replaced ${when}` : 'Replaced', by ? `by ${by}` : null].filter(Boolean).join(' ')}
                {v.reason ? ` · ${v.reason}` : ''}
              </p>
              <Facts
                number={v.number}
                issueDate={v.issueDate}
                expiryDate={v.expiryDate}
                noExpiry={v.noExpiry}
                country={country(v.issuingCountryCode)}
                file={v.hasFile ? v.fileName ?? 'File kept' : null}
              />
              {reviewedLine(v) ? <p className="mt-1.5 type-caption text-muted-foreground">{reviewedLine(v)}</p> : null}
              {v.verificationNote && v.verificationStatus !== 'unverified' ? (
                <p className="mt-0.5 break-words type-caption text-muted-foreground">Note: {v.verificationNote}</p>
              ) : null}
              {v.hasFile && onViewFile ? (
                <Button type="button" variant="outline" size="sm" className={cn('mt-2', COARSE)} onClick={() => onViewFile(v)} aria-label={`Open the file of version ${v.versionNo}`}>
                  <Eye aria-hidden="true" />
                  Open the file
                </Button>
              ) : null}
            </li>
          );
        })}
      </ol>
      {namesUnavailable ? <p className="type-caption text-muted-foreground">The names of the people who acted could not be read, so they show as not available.</p> : null}
    </>
  );
};

const Facts: React.FC<{
  number: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  noExpiry: boolean;
  country: string | null;
  file: string | null;
}> = ({ number, issueDate, expiryDate, noExpiry, country, file }) => (
  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
    <Fact label="Number" value={number} mono />
    <Fact label="Issuing country" value={country} />
    <Fact label="Issued" value={dayText(issueDate)} />
    <Fact label="Expires" value={noExpiry ? 'No expiry' : dayText(expiryDate)} />
    <div className="col-span-2 min-w-0">
      <dt className="type-caption text-muted-foreground">File</dt>
      <dd className={cn('truncate type-body', file ? 'text-foreground' : 'text-muted-foreground')} title={file ?? undefined}>
        {file ?? 'No file'}
      </dd>
    </div>
  </dl>
);

const Fact: React.FC<{ label: string; value: string | null; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="min-w-0">
    <dt className="type-caption text-muted-foreground">{label}</dt>
    <dd className={cn('truncate type-body', value ? 'text-foreground' : 'text-muted-foreground', mono && value ? 'type-mono' : null)} title={value ?? undefined}>
      {value ?? 'Not recorded'}
    </dd>
  </div>
);

export default VersionHistoryDrawer;

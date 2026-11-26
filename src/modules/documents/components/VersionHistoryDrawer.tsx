/**
 * The version history of one fleet document (gap/02 FD4, W1; X5 spec
 * X5-04B): every version the reader may see, newest first, each with its
 * label, major / minor and what that meant for acknowledgements, the date
 * it took effect, its file, who published it and when, and when a later
 * version superseded it. A withdrawn document says when, by whom and why.
 *
 * - Reads hooks/useFleetDocumentHistory (one document, its versions, its
 *   targets, the actors' names) only while open. Library readers see
 *   published and superseded versions; library editors also see the draft
 *   (RLS). A name that cannot be read says "Name not available", never an
 *   invented one.
 * - D-01: missing tables say "not set up yet"; an error is PageError with
 *   Retry; a document that is gone (or out of reach) says so.
 * - Editors get the next step for the document's state from the
 *   lifecycle table: finish the draft, upload a new version, withdraw.
 *
 * A Sheet from the right (full width below 640 px), tokens only, 44 px
 * targets on coarse pointers.
 */
import * as React from 'react';
import { FileText, History, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { EmptyState, PageError } from '@/shared/components/states';
import { StatusPill } from '@/shared/components/status';
import { useFleetDocumentHistory, type FleetDocumentHistory, type FleetDocumentVersionDetail } from '../hooks/useFleetDocumentHistory';
import { fleetDocumentActions } from '../lib/fleetDocumentMachine';
import { formatDateOnly, type LibraryRow, type LibraryVessel } from '../lib/fleetDocumentLibrary';
import { formatFileSize } from '../lib/fleetDocumentSchema';

const COARSE = '[@media(pointer:coarse)]:min-h-11';
const NAME_NOT_AVAILABLE = 'Name not available';

const WHEN = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** "12 Nov 2026, 14:05" in the reader's time; null for a blank or invalid timestamp. */
function formatWhen(value: string | null | undefined): string | null {
  if (!value) return null;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : WHEN.format(at);
}

export interface VersionHistoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  /** The library row the drawer was opened from. */
  document: LibraryRow | null;
  /** The vessels the reader reaches (to name the targets). */
  vessels: readonly LibraryVessel[];
  /** The reader may change the library (fleet.operations.fleet_documents.edit). */
  canEdit: boolean;
  /** Finish the draft or its draft version, or upload a new version. */
  onPublish?: (document: LibraryRow) => void;
  onWithdraw?: (document: LibraryRow) => void;
}

export function VersionHistoryDrawer({ open, onOpenChange, companyId, document, vessels, canEdit, onPublish, onWithdraw }: VersionHistoryDrawerProps) {
  const history = useFleetDocumentHistory(companyId, document?.id, { enabled: open && !!document });
  return (
    <Sheet open={open && !!document} onOpenChange={onOpenChange}>
      <SheetContent side="right" hideClose className="flex w-full flex-col gap-0 p-0 sm:max-w-lg" aria-describedby="version-history-description">
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0 space-y-1">
            <p className="type-eyebrow flex items-center gap-1.5 text-muted-foreground">
              <History aria-hidden="true" className="h-3.5 w-3.5" />
              Version history
            </p>
            <SheetTitle className="break-words font-display text-lg">{document?.title ?? 'Document'}</SheetTitle>
            <SheetDescription id="version-history-description" className="type-caption">
              {document ? [document.typeName, document.sectionName].filter(Boolean).join(' · ') : ''}
            </SheetDescription>
          </div>
          <SheetClose asChild>
            <Button type="button" variant="ghost" size="icon" className={cn('shrink-0', COARSE, '[@media(pointer:coarse)]:min-w-11')} aria-label="Close the version history">
              <X aria-hidden="true" className="h-4 w-4" />
            </Button>
          </SheetClose>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {document ? <HistoryBody state={history} row={document} vessels={vessels} /> : null}
        </div>
        {document && canEdit ? <HistoryActions row={document} onPublish={onPublish} onWithdraw={onWithdraw} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function HistoryActions({ row, onPublish, onWithdraw }: { row: LibraryRow; onPublish?: (row: LibraryRow) => void; onWithdraw?: (row: LibraryRow) => void }) {
  const actions = fleetDocumentActions(row.status);
  const canVersion = actions.includes('add_version') && !!onPublish;
  const canWithdraw = actions.includes('withdraw') && !!onWithdraw;
  if (!canVersion && !canWithdraw) return null;
  const publishLabel =
    row.status === 'draft' ? 'Finish publishing' : row.draft ? `Finish ${row.draft.label}` : 'Upload a new version';
  return (
    <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
      {canWithdraw ? (
        <Button type="button" variant="outline" className={COARSE} onClick={() => onWithdraw?.(row)}>
          Withdraw
        </Button>
      ) : null}
      {canVersion ? (
        <Button type="button" className={COARSE} onClick={() => onPublish?.(row)}>
          <Upload aria-hidden="true" className="h-4 w-4" />
          {publishLabel}
        </Button>
      ) : null}
    </div>
  );
}

function HistoryBody({ state, row, vessels }: { state: ReturnType<typeof useFleetDocumentHistory>; row: LibraryRow; vessels: readonly LibraryVessel[] }) {
  switch (state.state) {
    case 'idle':
    case 'loading':
      return (
        <div role="status" aria-busy="true" className="space-y-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <span className="sr-only">Loading the version history</span>
        </div>
      );
    case 'not_set_up':
      return <EmptyState kind="not-enabled" title="Fleet documents are not set up yet" body="The version history shows here once the library is set up." compact />;
    case 'not_found':
      return (
        <EmptyState
          icon={FileText}
          title="This document is no longer in the library"
          body="It may have been a draft that was deleted. Refresh the library to see the current documents."
          compact
        />
      );
    case 'error':
      return <PageError error={state.error} title="The version history could not load" onRetry={state.retry} variant="inline" />;
    case 'ready':
      return <HistoryList history={state.history} row={row} vessels={vessels} />;
  }
}

function HistoryList({ history, row, vessels }: { history: FleetDocumentHistory; row: LibraryRow; vessels: readonly LibraryVessel[] }) {
  const name = (userId: string | null) => (userId ? history.names[userId] ?? NAME_NOT_AVAILABLE : null);
  const doc = history.document;
  const targets =
    doc.target_mode === 'all_including_future'
      ? 'Every counted vessel, also ones added later'
      : history.targetVesselIds.length
        ? history.targetVesselIds.map((id) => vessels.find((v) => v.id === id)?.name ?? 'A vessel you do not reach').join(', ')
        : 'No vessels yet';
  const withdrawnAt = formatWhen(doc.withdrawn_at);

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-[5.75rem_minmax(0,1fr)] sm:grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Status</dt>
        <dd>
          <StatusPill domain="fleet_document" status={doc.status} />
        </dd>
        <dt className="text-muted-foreground">Vessels</dt>
        <dd className="break-words text-foreground">{targets}</dd>
        <dt className="text-muted-foreground">Acknowledge</dt>
        <dd className="text-foreground">{row.ackRequired ? 'Required; a minor version carries acknowledgements over' : 'Not needed'}</dd>
      </dl>

      {doc.status === 'withdrawn' ? (
        <section aria-label="Withdrawn" className="rounded-md border border-border bg-muted/40 p-3 text-sm">
          <p className="font-medium text-foreground">
            {[`Withdrawn${withdrawnAt ? ` ${withdrawnAt}` : ''}`, doc.withdrawn_by ? `by ${name(doc.withdrawn_by)}` : null].filter(Boolean).join(' ')}
          </p>
          {doc.withdrawn_reason ? <p className="mt-1 break-words text-muted-foreground">{doc.withdrawn_reason}</p> : null}
          <p className="type-caption mt-1 text-muted-foreground">Crew no longer see it on any vessel.</p>
        </section>
      ) : null}

      {history.versions.length ? (
        <ol aria-label="Versions" className="space-y-2">
          {history.versions.map((v) => (
            <VersionItem key={v.id} version={v} name={name} hasEarlier={history.versions.some((x) => x.version_no < v.version_no && x.state !== 'draft')} />
          ))}
        </ol>
      ) : (
        <EmptyState icon={FileText} title="No version yet" body="Upload the file to prepare the first version." compact bordered />
      )}
      {history.namesUnavailable ? (
        <p className="type-caption text-muted-foreground">The names of the people who acted could not be read, so they show as not available.</p>
      ) : null}
    </div>
  );
}

function VersionItem({
  version: v,
  name,
  hasEarlier,
}: {
  version: FleetDocumentVersionDetail;
  name: (userId: string | null) => string | null;
  hasEarlier: boolean;
}) {
  const published = formatWhen(v.published_at);
  const superseded = formatWhen(v.superseded_at);
  const saved = formatWhen(v.created_at);
  const kind =
    v.version_kind === 'major'
      ? hasEarlier
        ? 'Major: everyone acknowledges it again'
        : 'Major'
      : hasEarlier
        ? 'Minor: earlier acknowledgements carry over'
        : 'Minor';
  return (
    <li className={cn('rounded-lg border border-border bg-card p-3', v.state === 'published' && 'border-primary/40')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex min-w-0 items-baseline gap-2">
          <span className="break-all font-mono text-sm font-semibold text-foreground">{v.version_label}</span>
          <span className="type-caption text-muted-foreground">{`No. ${v.version_no.toLocaleString('en-GB')}`}</span>
        </p>
        <StatusPill domain="fleet_document" status={v.state} />
      </div>
      <dl className="mt-2 grid grid-cols-[5.75rem_minmax(0,1fr)] sm:grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Kind</dt>
        <dd className="text-foreground">{kind}</dd>
        <dt className="text-muted-foreground">Effective</dt>
        <dd className="tabular-nums text-foreground">{formatDateOnly(v.effective_date) ?? 'Not set'}</dd>
        <dt className="text-muted-foreground">File</dt>
        <dd className="break-words text-foreground">{[v.file_name, formatFileSize(v.size_bytes)].filter(Boolean).join(' · ')}</dd>
        {v.state === 'draft' ? (
          <>
            <dt className="text-muted-foreground">Saved</dt>
            <dd className="text-foreground">{[saved ?? 'Date not recorded', v.created_by ? `by ${name(v.created_by)}` : null, '· not published yet'].filter(Boolean).join(' ')}</dd>
          </>
        ) : (
          <>
            <dt className="text-muted-foreground">Published</dt>
            <dd className="text-foreground">{[published ?? 'Date not recorded', v.published_by ? `by ${name(v.published_by)}` : null].filter(Boolean).join(' ')}</dd>
          </>
        )}
        {v.state === 'superseded' ? (
          <>
            <dt className="text-muted-foreground">Superseded</dt>
            <dd className="text-foreground">{superseded ?? 'Date not recorded'}</dd>
          </>
        ) : null}
      </dl>
      {v.change_summary ? <p className="mt-2 break-words border-t border-border pt-2 text-sm text-muted-foreground">{v.change_summary}</p> : null}
    </li>
  );
}

export default VersionHistoryDrawer;

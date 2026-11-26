/**
 * Vessel › Safety › Fleet documents (`/v/:vesselCode/safety/fleet-documents`;
 * gap/02 FD9, W1; DECISIONS D-01, D-04, D-88, D-X5-04, D-X5-17; X5 spec
 * X5-05A). The documents the company publishes to this vessel, to open and
 * acknowledge.
 *
 * - Gate: `vessel.safety.fleet_documents.view_own` (the route guard uses
 *   the same key). Nothing is read until it is granted: while it loads the
 *   page is a skeleton, denied is AccessDenied (fail closed). The server
 *   answers only for vessels the caller reaches.
 * - One read (`fleet_document_vessel_documents`): every published document
 *   for this vessel, grouped by section (the library's order), with its
 *   type, version, effective date and the caller's own state: to
 *   acknowledge with its due date, overdue since, acknowledged on, or why
 *   they cannot sign. A document that needs no acknowledgement says so.
 *   Someone who is not on this vessel's crew reads the list with no state
 *   of their own, and the page says why.
 * - "To acknowledge" / "All documents" chips; the outstanding count in the
 *   summary line.
 * - A document opens in a side panel (`?doc=<id>`, the link the
 *   notifications use): its details, "Open document" (a five-minute signed
 *   URL of the private records bucket, D-X5-17) and the one-tap
 *   acknowledgement "I have read and understood this version". The
 *   acknowledgement's returned row is checked before it says so; a refusal
 *   is a sentence (already acknowledged, no longer required, blocked and
 *   why, out of reach).
 *
 * D-01: while the acknowledgement RPCs are missing the page says
 * "Acknowledgements are not set up yet"; any other error is PageError with
 * Retry; never sample rows. Tokens only; 44 px targets on coarse pointers;
 * usable at 390 px (rows stack, the panel fills the screen).
 */
import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, FileText, Info, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useCapability } from '@/lib/permissions/useCan';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVesselScope } from '@/app/router/scopes';
import { CountChips } from '@/shared/components/data';
import PageHeader from '@/shared/components/layout/PageHeader';
import { AccessDenied, EmptyState, PageEmpty, PageError, PageLoading } from '@/shared/components/states';
import { StatusPill } from '@/shared/components/status';
import { notify } from '@/shared/lib/notify';
import { formatFileSize } from '../constants';
import {
  ACK_METHOD_LABELS,
  ackDueShort,
  ackDueText,
  formatAckDate,
  isOutstanding,
  ownBlockedSentence,
} from '../lib/ackState';
import { formatDateOnly, formatUpdatedUtc } from '../lib/fleetDocumentLibrary';
import {
  ACKS_NOT_SET_UP,
  fleetDocumentAckKeys,
  openFleetDocumentFile,
  useAcknowledgeFleetDocument,
  useVesselFleetDocuments,
} from '../hooks/useFleetDocumentAcks';
import type { FleetDocumentVesselDocumentRow } from '../types/db.pending';
import { FLEET_DOCUMENT_DOC_PARAM, VESSEL_FLEET_DOCUMENTS_CAPS } from '../paths';

const COARSE = '[@media(pointer:coarse)]:min-h-11';
const ACKNOWLEDGE_LABEL = 'I have read and understood this version';

type Filter = 'outstanding' | 'all';

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

const VesselFleetDocumentsPage: React.FC = () => {
  const access = useCapability(VESSEL_FLEET_DOCUMENTS_CAPS.viewOwn);
  if (access.status === 'loading') return <PageLoading variant="list" label="Loading fleet documents" />;
  if (!access.allowed) {
    return <AccessDenied detail="Fleet documents need a signed-in account on this vessel. If you think you should see them, ask your account admin." />;
  }
  return <VesselFleetDocumentsBody />;
};

export default VesselFleetDocumentsPage;

// ─── Body ───────────────────────────────────────────────────────────────

interface Section {
  id: string;
  name: string;
  rows: FleetDocumentVesselDocumentRow[];
}

function groupBySection(rows: readonly FleetDocumentVesselDocumentRow[]): Section[] {
  const sections: Section[] = [];
  const byId = new Map<string, Section>();
  for (const row of rows) {
    let section = byId.get(row.section_id);
    if (!section) {
      section = { id: row.section_id, name: row.section_name, rows: [] };
      byId.set(row.section_id, section);
      sections.push(section);
    }
    section.rows.push(row);
  }
  return sections;
}

function VesselFleetDocumentsBody() {
  const scope = useVesselScope();
  const { profile, user } = useAuth();
  const companyId = profile?.company_id ?? null;
  const vessel = scope?.vessel ?? null;
  const documents = useVesselFleetDocuments(companyId, vessel?.id ?? null);
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>('all');

  const openId = params.get(FLEET_DOCUMENT_DOC_PARAM);
  const setOpenId = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set(FLEET_DOCUMENT_DOC_PARAM, id);
    else next.delete(FLEET_DOCUMENT_DOC_PARAM);
    setParams(next, { replace: true });
  };

  const rows = useMemo(() => (documents.state === 'ready' ? documents.data : []), [documents]);
  const outstanding = rows.filter((r) => isOutstanding(r.state));
  const overdue = outstanding.filter((r) => r.state === 'overdue').length;
  const onCrew = rows.length > 0 ? rows[0].caller_on_crew : null;
  const shown = filter === 'outstanding' ? outstanding : rows;
  const sections = useMemo(() => groupBySection(shown), [shown]);
  const opened = openId ? rows.find((r) => r.document_id === openId) ?? null : null;

  const refreshing = documents.state === 'ready' && documents.refreshing;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: fleetDocumentAckKeys.vessel(companyId, vessel?.id ?? null) });

  const header = (
    <PageHeader
      eyebrow={vessel?.name ?? 'Vessel'}
      title="Fleet documents"
      description="What the company publishes to this vessel. Open each document, then confirm you have read it."
      actions={
        <>
          {documents.state === 'ready' ? (
            <span className="type-caption tabular-nums text-muted-foreground" data-testid="vessel-fleet-documents-updated">
              {formatUpdatedUtc(documents.updatedAt)}
            </span>
          ) : null}
          <Button type="button" variant="outline" size="sm" className={COARSE} onClick={refresh} disabled={refreshing || documents.state === 'loading'}>
            <RefreshCw aria-hidden="true" className={cn('h-4 w-4', refreshing && 'motion-safe:animate-spin')} />
            Refresh
          </Button>
        </>
      }
    />
  );

  if (!vessel) {
    return (
      <div className="space-y-4">
        {header}
        <EmptyState title="Choose a vessel" body="Fleet documents are shown for one vessel. Pick a vessel in the switcher at the top." headingLevel={2} bordered />
      </div>
    );
  }

  let body: React.ReactNode;
  switch (documents.state) {
    case 'not_set_up':
      body = (
        <PageEmpty
          icon={FileText}
          title={ACKS_NOT_SET_UP}
          body="The documents the company publishes to this vessel, and your acknowledgements, appear here once fleet documents are set up for your account."
          headingLevel={2}
          bordered
        />
      );
      break;
    case 'error':
      body = <PageError error={documents.error} title="Fleet documents could not load" onRetry={documents.retry} headingLevel={2} treatMissingAsOff={false} />;
      break;
    case 'ready':
      body =
        rows.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Nothing published to this vessel yet"
            body="When the company publishes a document to this vessel, it appears here to read and acknowledge."
            headingLevel={2}
            bordered
          />
        ) : (
          <div className="space-y-6">
            <MySummary onCrew={onCrew} outstanding={outstanding.length} overdue={overdue} />
            {onCrew ? (
              <CountChips
                label="Show"
                activeId={filter}
                onChange={(id) => setFilter(id === 'outstanding' ? 'outstanding' : 'all')}
                chips={[
                  { id: 'all', label: 'All documents', count: rows.length },
                  { id: 'outstanding', label: 'To acknowledge', count: outstanding.length },
                ]}
              />
            ) : null}
            {sections.length === 0 ? (
              <EmptyState
                kind="filtered"
                title="Nothing to acknowledge"
                body="You have acknowledged every document published to this vessel."
                headingLevel={2}
                bordered
                compact
                action={
                  <Button type="button" variant="outline" size="sm" className={COARSE} onClick={() => setFilter('all')}>
                    Show all documents
                  </Button>
                }
              />
            ) : (
              sections.map((section) => (
                <section key={section.id} aria-labelledby={`fleet-docs-section-${section.id}`} className="space-y-2">
                  <h2 id={`fleet-docs-section-${section.id}`} className="type-title flex items-baseline gap-2 text-foreground">
                    {section.name}
                    <span className="type-caption tabular-nums text-muted-foreground">{plural(section.rows.length, 'document')}</span>
                  </h2>
                  <Card className="divide-y divide-border overflow-hidden">
                    {section.rows.map((row) => (
                      <DocumentRow key={row.document_id} row={row} onOpen={() => setOpenId(row.document_id)} />
                    ))}
                  </Card>
                </section>
              ))
            )}
          </div>
        );
      break;
    default:
      body = <PageLoading variant="list" label="Loading fleet documents" />;
  }

  return (
    <div className="space-y-6">
      {header}
      {body}
      <DocumentPanel
        row={opened}
        missing={documents.state === 'ready' && Boolean(openId) && !opened}
        companyId={companyId}
        userId={user?.id ?? null}
        vesselId={vessel.id}
        onClose={() => setOpenId(null)}
      />
    </div>
  );
}

// ─── Summary and rows ───────────────────────────────────────────────────

function MySummary({ onCrew, outstanding, overdue }: { onCrew: boolean | null; outstanding: number; overdue: number }) {
  if (onCrew === false) {
    return (
      <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" data-testid="vessel-fleet-documents-not-crew">
        <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        You are not on this vessel’s crew list, so nothing here needs your acknowledgement.
      </p>
    );
  }
  if (outstanding === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-foreground" data-testid="vessel-fleet-documents-summary">
        <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-success" />
        You are up to date: nothing to acknowledge.
      </p>
    );
  }
  return (
    <p className="text-sm text-foreground" data-testid="vessel-fleet-documents-summary">
      <span className="font-medium">{plural(outstanding, 'document')} to acknowledge</span>
      {overdue > 0 ? <span className="text-critical">, {overdue.toLocaleString('en-GB')} overdue</span> : null}.
    </p>
  );
}

function StateLine({ row }: { row: FleetDocumentVesselDocumentRow }) {
  if (!row.ack_required) return <span className="type-caption text-muted-foreground">No acknowledgement needed</span>;
  if (!row.state) return null;
  const due = ackDueShort(row.state, row.due_at, row.acknowledged_at);
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <StatusPill domain="document_ack" status={row.state} size="sm" />
      {due ? <span className={cn('type-caption tabular-nums', row.state === 'overdue' ? 'text-critical' : 'text-muted-foreground')}>{due}</span> : null}
    </span>
  );
}

function DocumentRow({ row, onOpen }: { row: FleetDocumentVesselDocumentRow; onOpen: () => void }) {
  const effective = formatDateOnly(row.effective_date);
  const outstanding = isOutstanding(row.state);
  return (
    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" data-testid="vessel-fleet-document-row">
      <div className="min-w-0 space-y-1">
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            'block max-w-full break-words text-left font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            COARSE,
          )}
        >
          {row.title}
        </button>
        <p className="type-caption text-muted-foreground">
          {/* The type is left out when the document is named after it (a single-document type). */}
          {[row.type_name.trim().toLowerCase() === row.title.trim().toLowerCase() ? null : row.type_name, row.version_label, effective ? `Effective ${effective}` : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <StateLine row={row} />
      </div>
      {/* The title opens the document; an outstanding one also gets the call to action (full width on a phone). */}
      <div className={cn('shrink-0 gap-2', outstanding ? 'flex' : 'hidden sm:flex')}>
        <Button
          type="button"
          size="sm"
          variant={outstanding ? 'default' : 'ghost'}
          className={cn(COARSE, 'w-full sm:w-auto')}
          onClick={onOpen}
          aria-label={outstanding ? `Read and acknowledge ${row.title}` : `View ${row.title}`}
        >
          {outstanding ? 'Read and acknowledge' : 'View'}
        </Button>
      </div>
    </div>
  );
}

// ─── The document panel ─────────────────────────────────────────────────

function DocumentPanel({
  row,
  missing,
  companyId,
  userId,
  vesselId,
  onClose,
}: {
  row: FleetDocumentVesselDocumentRow | null;
  missing: boolean;
  companyId: string | null;
  userId: string | null;
  vesselId: string;
  onClose: () => void;
}) {
  const open = Boolean(row) || missing;
  return (
    <Sheet open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <SheetContent side="right" hideClose className="flex w-full flex-col gap-0 p-0 sm:max-w-lg" aria-describedby="fleet-document-panel-description">
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0 space-y-1">
            <p className="type-eyebrow text-muted-foreground">{row ? `${row.section_name} › ${row.type_name}` : 'Fleet document'}</p>
            <SheetTitle className="break-words font-display text-lg">{row?.title ?? 'Document not found'}</SheetTitle>
            <SheetDescription id="fleet-document-panel-description" className="type-caption">
              {row ? `Version ${row.version_label}` : 'This document is not published to this vessel any more.'}
            </SheetDescription>
          </div>
          <SheetClose asChild>
            <Button type="button" variant="ghost" size="icon" className={cn('shrink-0', COARSE, '[@media(pointer:coarse)]:min-w-11')} aria-label="Close the document">
              <X aria-hidden="true" className="h-4 w-4" />
            </Button>
          </SheetClose>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {row ? (
            <DocumentDetails row={row} companyId={companyId} userId={userId} vesselId={vesselId} />
          ) : (
            <p className="text-sm text-muted-foreground">It may have been withdrawn or replaced. The list shows what is published now.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DocumentDetails({
  row,
  companyId,
  userId,
  vesselId,
}: {
  row: FleetDocumentVesselDocumentRow;
  companyId: string | null;
  userId: string | null;
  vesselId: string;
}) {
  const [opening, setOpening] = useState(false);
  const acknowledge = useAcknowledgeFleetDocument(companyId, userId);
  const effective = formatDateOnly(row.effective_date);
  const published = formatAckDate(row.published_at);

  const openFile = async () => {
    setOpening(true);
    try {
      await openFleetDocumentFile(row.storage_path);
    } catch (error) {
      notify.error(error, { title: 'The document could not be opened' });
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Version</dt>
        <dd className="text-foreground">
          {row.version_label} · {row.version_kind === 'minor' ? 'minor change' : 'major change'}
        </dd>
        {effective ? (
          <>
            <dt className="text-muted-foreground">Effective</dt>
            <dd className="tabular-nums text-foreground">{effective}</dd>
          </>
        ) : null}
        {published ? (
          <>
            <dt className="text-muted-foreground">Published</dt>
            <dd className="tabular-nums text-foreground">{published}</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">File</dt>
        <dd className="break-words text-foreground">
          {row.file_name} <span className="text-muted-foreground">· {formatFileSize(row.size_bytes)}</span>
        </dd>
      </dl>

      {row.change_summary ? (
        <div className="space-y-1">
          <h3 className="type-subtitle text-foreground">What changed</h3>
          <p className="whitespace-pre-line break-words text-sm text-muted-foreground">{row.change_summary}</p>
        </div>
      ) : null}
      {row.description ? (
        <div className="space-y-1">
          <h3 className="type-subtitle text-foreground">About this document</h3>
          <p className="whitespace-pre-line break-words text-sm text-muted-foreground">{row.description}</p>
        </div>
      ) : null}

      <Button type="button" variant="outline" className={cn(COARSE, 'w-full sm:w-auto')} onClick={() => void openFile()} disabled={opening} aria-busy={opening}>
        <ExternalLink aria-hidden="true" className="h-4 w-4" />
        {opening ? 'Opening…' : 'Open document'}
      </Button>

      <section aria-labelledby="fleet-document-ack-heading" className="space-y-3 border-t border-border pt-4">
        <h3 id="fleet-document-ack-heading" className="type-subtitle text-foreground">
          Your acknowledgement
        </h3>
        <AckBlock
          row={row}
          pending={acknowledge.isPending}
          onAcknowledge={() =>
            acknowledge.mutate({ versionId: row.version_id, vesselId, title: row.title, versionLabel: row.version_label })
          }
        />
      </section>
    </div>
  );
}

function AckBlock({ row, pending, onAcknowledge }: { row: FleetDocumentVesselDocumentRow; pending: boolean; onAcknowledge: () => void }) {
  if (!row.ack_required) return <p className="text-sm text-muted-foreground">No acknowledgement is needed for this document. Read it when you need it.</p>;
  if (!row.caller_on_crew || !row.state) {
    return <p className="text-sm text-muted-foreground">You are not on this vessel’s crew list, so this document does not need your acknowledgement.</p>;
  }
  if (row.state === 'acknowledged') {
    const on = formatAckDate(row.acknowledged_at);
    return (
      <div className="space-y-1">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-success" />
          {on ? `You acknowledged this version on ${on}.` : 'You acknowledged this version.'}
        </p>
        {row.method && row.method !== 'self' ? <p className="type-caption text-muted-foreground">{ACK_METHOD_LABELS[row.method]}.</p> : null}
      </div>
    );
  }
  if (row.state === 'blocked') {
    return (
      <p className="rounded-md border border-warning/25 bg-warning-muted px-3 py-2 text-sm text-foreground" role="note">
        {ownBlockedSentence(row.blocked_reason)}
      </p>
    );
  }
  if (row.state === 'not_required') return <p className="text-sm text-muted-foreground">This version does not need your acknowledgement.</p>;
  const due = ackDueText(row.state, row.due_at, row.acknowledged_at);
  return (
    <div className="space-y-3">
      {due ? (
        <p className={cn('flex flex-wrap items-center gap-2 text-sm', row.state === 'overdue' ? 'text-critical' : 'text-foreground')}>
          <StatusPill domain="document_ack" status={row.state} size="sm" />
          <span className="tabular-nums">{due}</span>
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Acknowledging records that you have read and understood version {row.version_label} of this document. Open it first.
      </p>
      <Button type="button" className={cn(COARSE, 'w-full sm:w-auto')} onClick={onAcknowledge} disabled={pending} aria-busy={pending} data-testid="fleet-document-acknowledge">
        <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
        {pending ? 'Recording…' : ACKNOWLEDGE_LABEL}
      </Button>
    </div>
  );
}

/**
 * "To acknowledge": the caller's own outstanding fleet documents (gap/02
 * FD9, W1 "must-read inbox on the crew home and the vessel dashboard";
 * X5 spec X5-05A), from `fleet_document_my_pending`.
 *
 * - `variant="home"` (the vessel home's slot, one vessel): always shown
 *   once the caller may open fleet documents, with an empty state
 *   ("Nothing to acknowledge") and a link to the vessel's Fleet documents
 *   page; "Acknowledgements are not set up yet" while the RPC is missing
 *   (D-01); an error with Retry otherwise.
 * - `variant="fleet"` (the fleet dashboard's tile, every vessel whose crew
 *   the caller is on): shown only when the caller has something to
 *   acknowledge, since most shore users have nothing; while the RPC is
 *   missing or the list is empty it renders nothing (the documented
 *   fallback); a failed read still says so with Retry.
 *
 * Each row opens the document on its vessel's page (`?doc=<id>`), where the
 * acknowledgement is made: title, section and version, the vessel on the
 * fleet tile, the state pill and its due date, overdue first. Gate:
 * `vessel.safety.fleet_documents.view_own` (deny while loading: nothing).
 * Tokens only; 44 px targets on coarse pointers; one column at 390 px.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, FileText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useCapability } from '@/lib/permissions/useCan';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { vesselPath } from '@/modules/vessels/lib/vesselCode';
import { PageError } from '@/shared/components/states';
import { StatusPill } from '@/shared/components/status';
import { ackDueShort } from '../lib/ackState';
import { ACKS_NOT_SET_UP, useMyPendingFleetDocuments } from '../hooks/useFleetDocumentAcks';
import type { FleetDocumentMyPendingRow } from '../types/db.pending';
import { DOCUMENTS_VESSEL_PATHS, FLEET_DOCUMENT_DOC_PARAM, VESSEL_FLEET_DOCUMENTS_CAPS } from '../paths';

const COARSE = '[@media(pointer:coarse)]:min-h-11';
const DEFAULT_LIMIT = 5;

export interface PendingFleetDocumentsCardProps {
  /** The vessel home's vessel; null on the fleet dashboard (every vessel whose crew the caller is on). */
  vesselId: string | null;
  /** The vessel home's code (its links); the fleet tile reads each row's own. */
  vesselCode?: string | null;
  variant: 'home' | 'fleet';
  /** Rows shown before "View all" (default 5). */
  limit?: number;
  className?: string;
}

const docPath = (code: string, documentId: string) =>
  vesselPath(code, `${DOCUMENTS_VESSEL_PATHS.fleetDocuments}?${FLEET_DOCUMENT_DOC_PARAM}=${encodeURIComponent(documentId)}`);

export function PendingFleetDocumentsCard({ vesselId, vesselCode = null, variant, limit = DEFAULT_LIMIT, className }: PendingFleetDocumentsCardProps) {
  const access = useCapability(VESSEL_FLEET_DOCUMENTS_CAPS.viewOwn);
  const { profile, user } = useAuth();
  const pending = useMyPendingFleetDocuments(profile?.company_id ?? null, user?.id ?? null, vesselId, { enabled: access.allowed });

  if (!access.allowed) return null;
  const fleet = variant === 'fleet';
  const headingId = fleet ? 'pending-documents-fleet' : 'pending-documents-vessel';
  const pagePath = vesselCode ? vesselPath(vesselCode, DOCUMENTS_VESSEL_PATHS.fleetDocuments) : null;

  if (pending.state === 'idle' || pending.state === 'loading') {
    if (fleet) return null;
    return (
      <section aria-labelledby={headingId} className={cn('space-y-3', className)} aria-busy="true">
        <h2 id={headingId} className="type-title text-foreground">
          To acknowledge
        </h2>
        <Skeleton className="h-20" />
        <span className="sr-only">Loading your documents to acknowledge</span>
      </section>
    );
  }
  if (pending.state === 'not_set_up') {
    if (fleet) return null;
    return (
      <section aria-labelledby={headingId} className={cn('space-y-3', className)} data-testid="pending-fleet-documents">
        <h2 id={headingId} className="type-title text-foreground">
          To acknowledge
        </h2>
        <Card className="flex items-start gap-3 px-4 py-3">
          <FileText aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-foreground">{ACKS_NOT_SET_UP}</p>
            <p className="type-caption text-muted-foreground">The documents the company publishes to this vessel for you to read appear here once fleet documents are set up.</p>
          </div>
        </Card>
      </section>
    );
  }
  if (pending.state === 'error') {
    return (
      <section aria-labelledby={headingId} className={cn('space-y-3', className)} data-testid="pending-fleet-documents">
        <h2 id={headingId} className="type-title text-foreground">
          To acknowledge
        </h2>
        <PageError variant="inline" title="Your documents to acknowledge could not load" error={pending.error} onRetry={pending.retry} headingLevel={3} treatMissingAsOff={false} />
      </section>
    );
  }

  const rows = pending.data;
  if (rows.length === 0 && fleet) return null;
  const overdue = rows.filter((r) => r.state === 'overdue').length;
  const shown = rows.slice(0, Math.max(1, limit));
  const vesselCodes = new Set(rows.map((r) => r.vessel_code).filter((c): c is string => Boolean(c)));
  const allPath = pagePath ?? (vesselCodes.size === 1 ? vesselPath([...vesselCodes][0], DOCUMENTS_VESSEL_PATHS.fleetDocuments) : null);

  return (
    <section aria-labelledby={headingId} className={cn('space-y-3', className)} data-testid="pending-fleet-documents">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={headingId} className="type-title flex items-baseline gap-2 text-foreground">
          To acknowledge
          {rows.length > 0 ? (
            <span className="type-caption tabular-nums text-muted-foreground">
              {rows.length.toLocaleString('en-GB')}
              {overdue > 0 ? <span className="text-critical"> · {overdue.toLocaleString('en-GB')} overdue</span> : null}
            </span>
          ) : null}
        </h2>
        {allPath ? (
          <Link to={allPath} className={cn('type-caption inline-flex items-center text-primary underline-offset-4 hover:underline', COARSE)}>
            {rows.length > shown.length ? `View all ${rows.length.toLocaleString('en-GB')}` : 'Fleet documents'}
          </Link>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <Card className="flex items-center gap-2 px-4 py-3 text-sm text-foreground">
          <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0 text-success" />
          Nothing to acknowledge. You have read every document published to you.
        </Card>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {shown.map((row) => (
            <PendingRow key={`${row.document_id}:${row.vessel_id}`} row={row} code={row.vessel_code ?? vesselCode} showVessel={fleet} />
          ))}
        </Card>
      )}
    </section>
  );
}

function PendingRow({ row, code, showVessel }: { row: FleetDocumentMyPendingRow; code: string | null; showVessel: boolean }) {
  const due = ackDueShort(row.state, row.due_at, null);
  const meta = [showVessel ? row.vessel_name : null, row.section, row.version_label].filter(Boolean).join(' · ');
  const title = code ? (
    <Link
      to={docPath(code, row.document_id)}
      className={cn(
        'block break-words font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        COARSE,
        '[@media(pointer:coarse)]:flex [@media(pointer:coarse)]:items-center',
      )}
    >
      {row.title}
    </Link>
  ) : (
    <span className="block break-words font-medium text-foreground">{row.title}</span>
  );
  return (
    <div className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4" data-testid="pending-fleet-document">
      <div className="min-w-0">
        {title}
        <p className="type-caption text-muted-foreground">{meta}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <StatusPill domain="document_ack" status={row.state} size="sm" />
        {due ? <span className={cn('type-caption tabular-nums', row.state === 'overdue' ? 'text-critical' : 'text-muted-foreground')}>{due}</span> : null}
      </div>
    </div>
  );
}

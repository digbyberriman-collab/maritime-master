import React from 'react';
import { Eye, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ExpiryPill, StatusPill } from '@/shared/components/status';
import { formatDay } from '@/modules/crew/hooks/useCrewProfile';
import type { CrewDocumentView } from '@/modules/crew/hooks/useCrewDocuments';
import { documentBadges } from '@/modules/crew/lib/documentState';
import { VerificationBadge, VerificationReview } from './VerificationBadge';

/** The expiry cell: the date, "No expiry" with the tick, or "Not recorded". */
function expiryText(doc: Pick<CrewDocumentView, 'expiryDate' | 'noExpiry'>): string {
  if (doc.noExpiry) return 'No expiry';
  return formatDay(doc.expiryDate) ?? 'Not recorded';
}

export interface DocumentRowProps {
  doc: CrewDocumentView;
  /** The issuing country in words (with its flag when the country list is loaded), else the code. */
  countryLabel: (code: string | null) => string | null;
  /** Opens the viewer; shown when the document has a file. */
  onView: (doc: CrewDocumentView) => void;
  /** Opens the edit dialog; null hides Edit (read-only, or not the viewer's to change). */
  onEdit: ((doc: CrewDocumentView) => void) | null;
  /** X1-05: the review line under the row (verify, renew, alerts off, history; why alerts are off). */
  footer?: React.ReactNode;
}

/**
 * One crew document (gap/04 C24): its state (the expiry pill, "Expiry
 * unknown" for a missing date, then no file, endorsement and alerts off),
 * the type's name and abbreviation, number, issuing country, expiry or "No
 * expiry", the verification badge (X1-05 VerificationBadge), View, Edit,
 * who reviewed it when, and the review footer the tab passes. A legacy row
 * (the D-01 fallback) has no verification yet and shows none.
 */
export const DocumentRow: React.FC<DocumentRowProps> = ({ doc, countryLabel, onView, onEdit, footer }) => {
  const badges = documentBadges(doc.state);
  const country = countryLabel(doc.issuingCountryCode);
  // The abbreviation (else the code) after the name, unless the name already says it.
  const short = doc.abbreviation ?? doc.code;
  const abbreviation = short && !doc.name.toLowerCase().includes(short.toLowerCase()) ? short : null;
  return (
    <li
      className="min-w-0 py-3 first:pt-1 last:pb-1"
      data-document-row={doc.id}
      data-document-state={doc.state.state}
      data-legacy={doc.legacy ? 'true' : undefined}
    >
      <div className="flex min-w-0 flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-[2_1_16rem]">
          <p className="break-words type-body font-medium text-foreground">
            {doc.name}
            {abbreviation ? <span className="ml-2 type-mono text-muted-foreground">{abbreviation}</span> : null}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {badges.map((badge) =>
              badge.kind === 'expiry' ? (
                <ExpiryPill key="expiry" bucket={badge.bucket} daysRemaining={badge.daysRemaining} noExpiry={doc.noExpiry} expiresOn={doc.expiryDate} windowDays={doc.state.windowDays} />
              ) : badge.kind === 'expiry_unknown' ? (
                <ExpiryPill key="expiry" expiresOn={undefined} />
              ) : (
                <StatusPill key={badge.key} domain="crew_document_state" status={badge.key} />
              ),
            )}
            {!doc.legacy ? <VerificationBadge doc={doc} /> : null}
          </div>
        </div>
        <dl className="grid min-w-0 flex-[3_1_18rem] grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="type-caption text-muted-foreground">Number</dt>
            <dd className={cn('truncate type-body', doc.number ? 'type-mono text-foreground' : 'text-muted-foreground')} title={doc.number ?? undefined}>
              {doc.number ?? 'Not recorded'}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="type-caption text-muted-foreground">Issuing country</dt>
            <dd className={cn('truncate type-body', country ? 'text-foreground' : 'text-muted-foreground')} title={country ?? undefined}>
              {country ?? 'Not recorded'}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="type-caption text-muted-foreground">Expires</dt>
            <dd className={cn('type-body tabular-nums', doc.noExpiry || doc.expiryDate ? 'text-foreground' : 'text-muted-foreground')}>{expiryText(doc)}</dd>
          </div>
        </dl>
        <div className="flex shrink-0 items-center gap-2 sm:w-44 sm:justify-end">
          {doc.hasFile ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onView(doc)}
              aria-label={`View ${doc.name}`}
              className="[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:min-w-11"
            >
              <Eye aria-hidden="true" />
              View
            </Button>
          ) : null}
          {onEdit ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onEdit(doc)}
              aria-label={`Edit ${doc.name}`}
              className="[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:min-w-11"
            >
              <Pencil aria-hidden="true" />
              Edit
            </Button>
          ) : null}
        </div>
      </div>
      {!doc.legacy ? <VerificationReview doc={doc} /> : null}
      {footer}
    </li>
  );
};

export default DocumentRow;

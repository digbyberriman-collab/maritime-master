import React from 'react';
import { cn } from '@/lib/utils';
import { StatusPill } from '@/shared/components/status';
import type { CrewDocumentVerificationStatus } from '@/modules/crew/types/db.pending';
import { reviewedLine } from '@/modules/crew/lib/verification';

/** What the badge and the review line need of a document. */
export interface VerificationOf {
  verificationStatus: CrewDocumentVerificationStatus;
  verifiedByName: string | null;
  verifiedAt: string | null;
  verificationNote?: string | null;
}

export interface VerificationBadgeProps {
  doc: VerificationOf;
  className?: string;
}

/**
 * A crew document's verification (gap/04 C27, W4): the StatusPill of the
 * crew_document_verification domain (Not yet verified, Verified,
 * Conditionally approved in amber, Rejected), titled with "Reviewed by
 * <name> on <date>" once someone has decided. Colour always comes with the
 * words.
 */
export const VerificationBadge: React.FC<VerificationBadgeProps> = ({ doc, className }) => {
  const reviewed = reviewedLine(doc);
  return (
    <StatusPill
      domain="crew_document_verification"
      status={doc.verificationStatus}
      title={reviewed ?? undefined}
      data-verification={doc.verificationStatus}
      className={className}
    />
  );
};

export interface VerificationReviewProps {
  doc: VerificationOf;
  className?: string;
}

/**
 * The review under a document: "Reviewed by <name> on <date>" and the
 * reviewer's note (a condition, or why it was sent back). Nothing while the
 * document has not been reviewed.
 */
export const VerificationReview: React.FC<VerificationReviewProps> = ({ doc, className }) => {
  const reviewed = reviewedLine(doc);
  const note = doc.verificationStatus !== 'unverified' ? doc.verificationNote?.trim() || null : null;
  if (!reviewed && !note) return null;
  return (
    <div className={cn('min-w-0', className)}>
      {reviewed ? (
        <p className="mt-1.5 type-caption text-muted-foreground" data-document-reviewed="">
          {reviewed}
        </p>
      ) : null}
      {note ? <p className="mt-0.5 break-words type-caption text-muted-foreground">Note: {note}</p> : null}
    </div>
  );
};

export default VerificationBadge;

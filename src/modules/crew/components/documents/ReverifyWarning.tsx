import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { CrewDocumentVerificationStatus } from '@/modules/crew/types/db.pending';
import { REVERIFY_HINT, REVERIFY_WARNING, REVERIFY_WARNING_DETAIL, isReviewed } from '@/modules/crew/lib/verification';

export interface ReverifyWarningProps {
  /** The document's verification before the change. */
  status: CrewDocumentVerificationStatus;
  /** The change touches the number, a date, the No-expiry tick, the issuing country, the type or the file. */
  material: boolean;
  className?: string;
}

/**
 * Before an edit of a reviewed document is saved (gap/04 W4, T-139): while
 * nothing material has changed, a calm hint says which changes send it back
 * for verification; once one has, a warning says "This document will need
 * to be verified again." The guard does the reset on the server either way;
 * this says so before the person saves. Nothing for an unverified document.
 */
export const ReverifyWarning: React.FC<ReverifyWarningProps> = ({ status, material, className }) => {
  if (!isReviewed(status)) return null;
  if (!material) {
    return (
      <Alert variant="info" className={className} data-reverify="hint">
        <Info aria-hidden="true" className="size-4" />
        <AlertDescription>{REVERIFY_HINT}</AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert variant="warning" className={className} data-reverify="warning" role="status" aria-live="polite">
      <AlertTriangle aria-hidden="true" className="size-4" />
      <AlertTitle>{REVERIFY_WARNING}</AlertTitle>
      <AlertDescription>{REVERIFY_WARNING_DETAIL}</AlertDescription>
    </Alert>
  );
};

export default ReverifyWarning;

import React from 'react';
import { Link } from 'react-router-dom';
import { Portal as TooltipPortal } from '@radix-ui/react-tooltip';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dot } from './ComplianceCells';
import { dotsSentence } from './cellLook';
import type { CrewListComplianceState } from './crewListCompliance';

/** A neutral dash with the reason (the column before or without compliance). */
const Dash: React.FC<{ reason: string; busy?: boolean }> = ({ reason, busy }) => (
  <span
    className="inline-flex items-center gap-1.5 text-muted-foreground"
    aria-label={`Documents and qualifications: ${busy ? 'checking' : 'not shown'}. ${reason}`}
    aria-busy={busy || undefined}
    title={reason}
    data-compliance-dots={busy ? 'loading' : 'off'}
  >
    <span aria-hidden="true">–</span>
    <span aria-hidden="true">–</span>
  </span>
);

/**
 * The two dots of a crew list row (gap/04 C5): documents, then STCW and
 * qualifications, each a circle with its own icon (all held, needs a look
 * soon, missing or expired, nothing required), and a tooltip listing the
 * reasons. The pair is a link to the person's documents when the reader may
 * open profiles, else a focusable button, so keyboard and touch reach the
 * reasons too.
 */
export const ComplianceDotsCell: React.FC<{ profileId: string; name: string; state: CrewListComplianceState }> = ({ profileId, name, state }) => {
  if (state.status === 'loading') return <Dash reason="Checking compliance" busy />;
  if (state.status === 'off') return <Dash reason={state.reason} />;
  const summary = state.byProfile.get(profileId);
  if (!summary) return <Dash reason="Not checked: this person is not on the vessel's crew today." />;
  const sentence = dotsSentence(summary);
  const dots = (
    <>
      <Dot dot={summary.dotDocuments} />
      <Dot dot={summary.dotQualifications} />
    </>
  );
  const href = state.profileHref?.(profileId) ?? null;
  const className =
    'focus-ring inline-flex items-center gap-1 rounded-full p-0.5 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 [@media(pointer:coarse)]:justify-center';
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          {href ? (
            <Link to={href} className={className} aria-label={`${name}, compliance. ${sentence} Open their documents.`} data-compliance-dots="ready" data-dots={`${summary.dotDocuments}:${summary.dotQualifications}`}>
              {dots}
            </Link>
          ) : (
            <button type="button" className={className} aria-label={`${name}, compliance. ${sentence}`} data-compliance-dots="ready" data-dots={`${summary.dotDocuments}:${summary.dotQualifications}`}>
              {dots}
            </button>
          )}
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent side="top" align="start" className="max-w-xs text-left">
            {sentence}
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );
};

export default ComplianceDotsCell;

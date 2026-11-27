/**
 * Pieces the fleet crew reports share (gap/02 R5, R9, R10, R11; X5-10A):
 *
 * - `ShownVesselsToolbar`: the "Vessels shown" filter in the report's
 *   filter bar (it applies itself, D-X5-09);
 * - `CoverageNote`: which vessels the report does not count and why, in
 *   words (no access, or the module switched off), so a missing vessel is
 *   never read as "nothing to report";
 * - `NotCoveredDash`: the "–" a cell shows for a vessel that is not covered,
 *   never 0;
 * - `CrewReportGate`: the page states before there is data: the vessels
 *   could not load (error with Retry), the report is not set up yet (D-01),
 *   or there are no vessels to report on.
 *
 * Tokens only; 44 px targets on coarse pointers.
 */
import React from 'react';
import { Info, type LucideIcon } from 'lucide-react';
import { EmptyState, PageEmpty, PageError } from '@/shared/components/states';
import { FleetVesselsFilter } from '@/modules/fleet';
import type { ShownReportScope } from '../hooks/useShownReportScope';
import { coverageReason, notCovered } from '../lib/crewReports';
import type { ReportVesselCoverage } from '../types/db.pending';

export function ShownVesselsToolbar({ ready }: { ready: ShownReportScope['ready'] }) {
  if (!ready) return null;
  return (
    <FleetVesselsFilter
      vessels={ready.vessels}
      selectedIds={ready.shownIds}
      countedIds={ready.countedIds}
      fleetGroups={ready.fleetGroups}
      droppedCodes={ready.droppedCodes}
      onApply={ready.setShown}
    />
  );
}

/** "Not covered: GAME CHANGER (Hours of rest is switched off on this vessel)". Nothing when every vessel is covered. */
export function CoverageNote({ vessels, moduleName }: { vessels: readonly ReportVesselCoverage[]; moduleName: string }) {
  const missing = notCovered(vessels);
  if (missing.length === 0) return null;
  return (
    <p role="note" className="flex items-start gap-2 text-sm text-muted-foreground">
      <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        <span className="font-medium text-foreground">Not covered: </span>
        {missing.map((v, i) => (
          <React.Fragment key={v.vessel_id}>
            {i > 0 ? '; ' : null}
            {v.vessel_name} ({coverageReason(v.state, moduleName)})
          </React.Fragment>
        ))}
        . These vessels are left out of every number here.
      </span>
    </p>
  );
}

export function NotCoveredDash({ label }: { label: string }) {
  return (
    <span className="text-muted-foreground" title="Not covered">
      <span aria-hidden="true">–</span>
      <span className="sr-only">{`${label}: not covered`}</span>
    </span>
  );
}

export interface CrewReportGateProps {
  shown: ShownReportScope['shown'];
  /** The report read's state. */
  state: 'idle' | 'loading' | 'ready' | 'error' | 'not_set_up' | 'no_vessels';
  notSetUp: { icon: LucideIcon; title: string; body: string };
  noVessels: { title: string; body: string };
}

/** The body for the states without report data, or null when the report renders its own body. */
export function CrewReportGate({ shown, state, notSetUp, noVessels }: CrewReportGateProps): React.ReactElement | null {
  if (shown.status === 'error') {
    return <PageError error={shown.error} title="Your vessels could not load" onRetry={shown.retry} headingLevel={2} />;
  }
  if (state === 'not_set_up') {
    return <PageEmpty icon={notSetUp.icon} title={notSetUp.title} body={notSetUp.body} headingLevel={2} bordered />;
  }
  if (state === 'no_vessels') {
    return <EmptyState title={noVessels.title} body={noVessels.body} headingLevel={2} bordered />;
  }
  return null;
}

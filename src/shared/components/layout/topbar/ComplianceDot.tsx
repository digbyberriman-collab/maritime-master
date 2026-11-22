/**
 * The worst open alert of a vessel as a dot (gap/10 top bar element 2;
 * spec §6.1). The colour comes from the one alert tone map (D-57): RED is
 * destructive, ORANGE orange, YELLOW amber, GREEN success. No summary yet
 * (loading, error) or no open alert: no dot. When the summary was cut at the
 * row cap, a vessel missing from it says so instead of implying "no alerts".
 */
import React from 'react';
import { cn } from '@/lib/utils';
import { ALERT_SEVERITY_TONE } from '@/modules/notifications/lib/alertSeverityTone';
import type { VesselAlertSummary } from './useVesselAlertSummary';
import { alertSummaryLabel } from './vesselSwitcherModel';

export interface ComplianceDotProps {
  summary: VesselAlertSummary;
  vesselId: string;
  className?: string;
}

const ComplianceDot: React.FC<ComplianceDotProps> = ({ summary, vesselId, className }) => {
  if (summary.status !== 'ready') return null;
  const entry = summary.byVessel.get(vesselId);
  if (!entry) {
    return summary.truncated ? <span className="sr-only">Alert summary incomplete</span> : null;
  }
  return (
    <span data-compliance={entry.worst} className={cn('inline-flex shrink-0 items-center', className)}>
      <span aria-hidden="true" className={cn('size-2 rounded-full bg-current', ALERT_SEVERITY_TONE[entry.worst].text)} />
      <span className="sr-only">{alertSummaryLabel(entry.open, entry.worst, summary.truncated)}</span>
    </span>
  );
};

export default ComplianceDot;

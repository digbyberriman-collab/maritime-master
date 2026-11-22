import React from 'react';
import { FileText, Clock, CalendarX, ShieldAlert, Wrench, Euro } from 'lucide-react';
import { KpiGrid, KpiTile, type KpiTileState } from '@/shared/components/data';

export interface FleetKpiValue {
  value: number;
  sub: string;
}

/** Counts the fleet summary RPC actually returns. */
export interface FleetKPI {
  documentAlerts: FleetKpiValue;
  safety: FleetKpiValue;
  technical: FleetKpiValue;
}

interface FleetKPITilesProps {
  /** `null` while the summaries load (or when they failed, with `error`). */
  kpi: FleetKPI | null;
  error?: boolean;
  onRetry?: () => void;
}

/** Sources the fleet summary does not carry yet: the tile says so instead of showing a made-up 0. */
const NOT_IN_SUMMARY = 'Not in the fleet summary yet';

/**
 * Fleet KPI row (gap/10 DS13, §A.9) on `KpiTile`: loading skeletons, "0 · All
 * clear" only for a real zero, an alert bar in the tile's tone when there is
 * something to do, and "—" with the reason for Hours of Rest, Leave and
 * Accounting, which `get_vessel_dashboard_summary` does not report.
 */
export const FleetKPITiles: React.FC<FleetKPITilesProps> = ({ kpi, error = false, onRetry }) => {
  const state: KpiTileState | undefined = error ? 'error' : kpi ? undefined : 'loading';
  return (
    <section aria-label="Fleet indicators">
      <KpiGrid>
        <KpiTile
          label="Document alerts"
          icon={FileText}
          value={kpi?.documentAlerts.value}
          sub={kpi?.documentAlerts.sub}
          zeroLabel="All documents in date"
          tone={kpi && kpi.documentAlerts.value > 0 ? 'warn' : undefined}
          state={state}
          onRetry={onRetry}
        />
        <KpiTile label="Hours of rest" icon={Clock} state="not-enabled" notEnabledReason={NOT_IN_SUMMARY} />
        <KpiTile label="Leave overdue" icon={CalendarX} state="not-enabled" notEnabledReason={NOT_IN_SUMMARY} />
        <KpiTile
          label="Safety"
          icon={ShieldAlert}
          value={kpi?.safety.value}
          sub={kpi?.safety.sub}
          tone={kpi && kpi.safety.value > 0 ? 'danger' : undefined}
          state={state}
          onRetry={onRetry}
        />
        <KpiTile
          label="Technical"
          icon={Wrench}
          value={kpi?.technical.value}
          sub={kpi?.technical.sub}
          tone={kpi && kpi.technical.value > 0 ? 'warn' : undefined}
          state={state}
          onRetry={onRetry}
        />
        <KpiTile label="Accounting" icon={Euro} state="not-enabled" notEnabledReason={NOT_IN_SUMMARY} />
      </KpiGrid>
    </section>
  );
};

export default FleetKPITiles;

/**
 * The "Vessels shown" a fleet report reads for (D-X5-09): the fleet module's
 * `useFleetVesselsShown`, turned into the report hooks' scope. The default
 * selection (every counted vessel) is fleet-wide (sent as NULL); any other
 * choice is the explicit ids. `vesselsParam` is the `?vessels=` to carry
 * into the back link and "Switch report" (only for a non-default choice).
 */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { VESSELS_SHOWN_PARAM, useFleetVesselsShown } from '@/modules/fleet';
import type { ReportScope } from './useReportData';

export function useShownReportScope() {
  const shown = useFleetVesselsShown();
  const [params] = useSearchParams();
  const ready = shown.status === 'ready' ? shown : null;
  const scope = useMemo<ReportScope | null>(
    () => (ready ? { companyId: ready.companyId, vesselIds: ready.shownIds, fleetWide: ready.isDefault } : null),
    [ready],
  );
  const vesselsParam = ready && !ready.isDefault ? params.get(VESSELS_SHOWN_PARAM) : null;
  return { shown, ready, scope, vesselsParam };
}

export type ShownReportScope = ReturnType<typeof useShownReportScope>;

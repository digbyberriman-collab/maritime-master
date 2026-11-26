/**
 * The crew list's compliance (gap/04 C5; X1-06B): the vessel's summaries
 * (crew_vessel_compliance) for the list to merge by profile id, and why
 * there are none when there are none.
 */
import React from 'react';
import { useCan } from '@/lib/permissions/useCan';
import { useScope } from '@/app/router/scopeContext';
import { useScopedPath } from '@/app/router/scopes';
import { CREW_CAPS, CREW_ROOT } from '@/modules/crew/paths';
import { COMPLIANCE_NOT_SET_UP_NOTICE } from '@/modules/crew/lib/compliance';
import { useVesselCompliance, type CrewComplianceSummary } from '@/modules/crew/hooks/useVesselCompliance';

/** What the crew list's Compliance column knows. */
export type CrewListComplianceState =
  | { status: 'off'; reason: string }
  | { status: 'loading' }
  | { status: 'ready'; byProfile: ReadonlyMap<string, CrewComplianceSummary>; profileHref: ((profileId: string) => string) | null };

const NO_ACCESS = 'Seeing compliance needs crew compliance access on this vessel.';
const FAILED = 'Compliance could not load. Reload the page to try again.';

/**
 * The crew list's compliance (gap/04 C5): the vessel's summaries
 * (crew_vessel_compliance), merged into the list by profile id. Asked only
 * with crew_compliance.view on the route vessel (false while loading). Not
 * applied (D-01), refused or failed: every row keeps a dash that says why.
 */
export function useCrewListCompliance(): CrewListComplianceState {
  const scope = useScope();
  const vessel = scope.scope === 'vessel' ? scope.vessel ?? null : null;
  const vesselId = vessel?.id ?? null;
  const canView = useCan(CREW_CAPS.complianceView, { vesselId });
  const canProfiles = useCan(CREW_CAPS.profilesView, { vesselId });
  const scopedPath = useScopedPath();
  const state = useVesselCompliance(vesselId, { companyId: vessel?.company_id ?? null, enabled: canView, detail: 'summary' });
  const byProfile = state.status === 'ready' ? state.compliance.byProfile : null;
  const deniedNotice = state.status === 'denied' ? state.notice : null;
  const profileHref = React.useMemo(
    () => (canProfiles ? (profileId: string) => scopedPath(`${CREW_ROOT}/people/${profileId}/documents`) : null),
    [canProfiles, scopedPath],
  );
  // Stable while nothing changes, so the table's columns are not rebuilt on every render.
  return React.useMemo<CrewListComplianceState>(() => {
    if (!vesselId || !canView) return { status: 'off', reason: NO_ACCESS };
    if (byProfile) return { status: 'ready', byProfile, profileHref };
    if (state.status === 'not_set_up') return { status: 'off', reason: COMPLIANCE_NOT_SET_UP_NOTICE };
    if (deniedNotice !== null) return { status: 'off', reason: deniedNotice };
    if (state.status === 'error') return { status: 'off', reason: FAILED };
    return { status: 'loading' };
  }, [vesselId, canView, byProfile, profileHref, state.status, deniedNotice]);
}

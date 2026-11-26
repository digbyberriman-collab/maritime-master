/**
 * The Hours of rest month, gated on the vessel it writes to (D-109, D-X1-21;
 * gap/10 W4; DECISIONS C13, D-63, D-04, D-86). The personal page
 * (/me/hours-of-rest) and the legacy /crew/work-rest render the month of
 * one vessel. That vessel's module settings decide, with the same rule as
 * the vessel route gate for /v/:code/crew/hours-of-rest, which checks both
 * `crew` and `crew_hor`:
 *
 * - loading: the page's loading state, with nothing to edit (no Save, Submit
 *   or Sign), and the month is not opened (its read creates the draft);
 * - an error other than a missing table: the error with Try again;
 * - the whole Crew module off (`crew`, or its start date still to come):
 *   "Hours of rest is off for DRAAK" (D-X1-21, closing the Phase 1 round 3
 *   open item: the personal page no longer stays open for a vessel whose
 *   crew pages are closed);
 * - Hours of Rest off (`crew_hor`, or `enabled_from` still to come, D-63):
 *   ModuleOff ("Hours of Rest is switched off for DRAAK");
 * - both on, or the settings table not there yet (D-01): the month.
 *
 * The profile's Hours of rest tab needs no gate of its own: it sits under
 * the vessel route gate (the Hours of Rest leaf covers
 * crew/people/<person>/hours-of-rest).
 */
import React, { useMemo } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { usePageLocationOverride, type PageLocationOverride } from '@/shared/components/layout/pageLocationOverride';
import { EmptyState, ModuleOff, PageError, PageLoading } from '@/shared/components/states';
import { useVesselModuleSettings } from '@/modules/vessels/hooks/useVesselModuleSettings';
import { localIsoDate, resolveModuleSettings } from '@/modules/vessels/lib/moduleSettings';

/** The vessel module setting that governs Hours of Rest. */
export const HOURS_OF_REST_SETTING = 'crew_hor';
/** The Crew module, which closes Hours of Rest with it (D-X1-21). */
export const CREW_SETTING = 'crew';

/** The module's name when the vessel does not rename it (as the vessel tree calls it). */
const DEFAULT_MODULE_NAME = 'Hours of Rest';

export interface PersonalHorGateProps {
  /** The vessel the month logs against. */
  vesselId: string;
  /** Its name for the off states; without one they name no vessel. */
  vesselName?: string | null;
  children: React.ReactNode;
}

/** Names the page header after the gate's state, as the vessel route gate does. */
const GateLocation: React.FC<PageLocationOverride> = ({ title, crumbs }) => {
  usePageLocationOverride({ title, crumbs });
  return null;
};

export const PersonalHorGate: React.FC<PersonalHorGateProps> = ({ vesselId, vesselName, children }) => {
  const { state, retry } = useVesselModuleSettings(vesselId);
  const today = localIsoDate();
  const resolver = useMemo(() => resolveModuleSettings(state, today), [state, today]);

  if (state.status === 'loading') {
    return (
      <DashboardLayout>
        <PageLoading variant="detail" label="Loading hours…" />
      </DashboardLayout>
    );
  }
  if (state.status === 'error') {
    const title = "This vessel's modules could not load";
    return (
      <DashboardLayout>
        <GateLocation title={title} />
        <PageError title={title} error={state.message} onRetry={retry} headingLevel={1} treatMissingAsOff={false} />
      </DashboardLayout>
    );
  }
  if (!resolver.isModuleOn(CREW_SETTING)) {
    const crewName = resolver.labelFor(CREW_SETTING) ?? 'Crew';
    const title = vesselName ? `Hours of rest is off for ${vesselName}` : 'Hours of rest is off for this vessel';
    return (
      <DashboardLayout>
        <GateLocation title="Hours of rest is off" crumbs="page" />
        <EmptyState
          kind="not-enabled"
          title={title}
          body={`${crewName} is switched off for this vessel, and its hours of rest with it. Ask an account admin to switch it on if this vessel needs it.`}
          headingLevel={1}
        />
      </DashboardLayout>
    );
  }
  if (!resolver.isModuleOn(HOURS_OF_REST_SETTING)) {
    const moduleName = resolver.labelFor(HOURS_OF_REST_SETTING) ?? DEFAULT_MODULE_NAME;
    return (
      <DashboardLayout>
        <GateLocation title={`${moduleName} is switched off`} crumbs="page" />
        <ModuleOff moduleName={moduleName} vesselName={vesselName ?? undefined} headingLevel={1} />
      </DashboardLayout>
    );
  }
  return <>{children}</>;
};

export default PersonalHorGate;

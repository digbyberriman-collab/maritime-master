/**
 * The Hours of rest month, gated on the vessel it writes to (D-109; gap/10
 * W4; DECISIONS C13, D-63, D-04, D-86). The personal page (/me/hours-of-rest)
 * and the legacy /crew/work-rest render the same month, which logs against
 * one vessel: the selected one, else the crew member's current assignment.
 * That vessel's `crew_hor` setting decides, as the vessel route gate does
 * for /v/:code/crew/hours-of-rest:
 *
 * - loading: the page's loading state, with nothing to edit (no Save, Submit
 *   or Sign), and the month is not opened (its read creates the draft);
 * - an error other than a missing table: the error with Try again;
 * - off (`enabled = false`, or `enabled_from` still to come, D-63):
 *   ModuleOff ("Hours of Rest is switched off for DRAAK") inside the shell;
 * - on, or the settings table not there yet (D-01): the month.
 */
import React, { useMemo } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { usePageLocationOverride, type PageLocationOverride } from '@/shared/components/layout/pageLocationOverride';
import { ModuleOff, PageError, PageLoading } from '@/shared/components/states';
import { useVesselModuleSettings } from '@/modules/vessels/hooks/useVesselModuleSettings';
import { localIsoDate, resolveModuleSettings } from '@/modules/vessels/lib/moduleSettings';

/** The vessel module setting that governs Hours of Rest. */
export const HOURS_OF_REST_SETTING = 'crew_hor';

/** The module's name when the vessel does not rename it (as the vessel tree calls it). */
const DEFAULT_MODULE_NAME = 'Hours of Rest';

export interface PersonalHorGateProps {
  /** The vessel the month logs against. */
  vesselId: string;
  /** Its name for ModuleOff; without one the state names no vessel. */
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

/**
 * The scope control (gap/10 top bar element 2, IA3, W2; spec §6.1).
 *
 *   fleet reach, ≥ 1 vessel        [Fleet │ Vessel ● ● ▾]   (chevron with ≥ 2 vessels)
 *   fleet reach, no vessel         [Fleet]
 *   no fleet reach, ≥ 2 vessels    [Vessel ● ● ▾]
 *   no fleet reach, one vessel     the vessel's name and marks, no button chrome
 *   neither                        nothing
 *
 * Fail closed: a skeleton until the scope access has loaded. The Fleet
 * segment needs fleet reach (D-26, the rule the nav applies to every fleet
 * node; never the legacy module map), so a vessel-only user is never offered
 * a Fleet view they cannot open (deferred item 1). The vessel segment shows
 * the vessel in scope, else the last one opened (useShellVessel); inside the vessel scope it goes to
 * that vessel's home, elsewhere it opens the vessel through the vessel switch
 * (so a switched-off module is never the landing page). In a workspace a chip
 * names the workspace and neither segment is lit. The chip shows at every
 * width (a short label below 640 px) and is the part that gives way: below
 * 1024 px the control beside it takes its compact form (the Fleet globe
 * without its word, the vessel's code) and never shrinks, so its marks and
 * the switcher's chevron are never clipped (D-70).
 */
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Globe, Ship } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { vesselPath } from '@/modules/vessels/lib/vesselCode';
import { useLatestVesselPositions } from '@/modules/dashboard/hooks/useLatestVesselPositions';
import { useScopeAccess } from '@/app/router/useScopeAccess';
import { useScope } from '@/app/router/scopeContext';
import { useNavAccess } from '@/app/nav/navAccess';
import { useVesselSwitch } from '@/app/nav/useVesselSwitch';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import { WORKSPACE_SCOPE_LABELS, WORKSPACE_SCOPE_SHORT_LABELS } from '@/app/shell/apps';
import AisMark from './AisMark';
import ComplianceDot from './ComplianceDot';
import VesselSwitcher from './VesselSwitcher';
import { useFleetTarget } from './useFleetTarget';
import { useVesselAlertSummary } from './useVesselAlertSummary';
import { useVesselSwitcherAvailable } from './useVesselSwitcherAvailable';
import { useShellVessel } from './useShellVessel';

const segmented =
  'flex h-9 min-w-0 items-stretch gap-0.5 rounded-md border border-border bg-background/40 p-0.5 [@media(pointer:coarse)]:h-11';

const segment = (active: boolean) =>
  cn(
    'inline-flex min-w-0 items-center justify-center gap-1.5 rounded-[calc(var(--radius)-4px)] px-2 text-sm font-medium transition-colors duration-quick ease-tide sm:px-2.5 [@media(pointer:coarse)]:min-w-11',
    // Touch: the segment sits inside the 44 px control's border and padding;
    // its hit area reaches the control's full height (D-35).
    "relative [@media(pointer:coarse)]:after:absolute [@media(pointer:coarse)]:after:inset-x-0 [@media(pointer:coarse)]:after:-inset-y-[3px] [@media(pointer:coarse)]:after:content-['']",
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
    active
      ? 'bg-signal-muted text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.4)]'
      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
  );

/**
 * The vessel's name in the display face, truncating; below 640 px its
 * three-letter code instead (D-03), so the control never pushes the account
 * button off a phone screen. `compact` (a workspace chip shares the row)
 * keeps the code up to 1024 px, where the touch controls and the chip leave
 * too little room for a readable name (D-70). Screen readers always get the
 * full name.
 */
const VesselName: React.FC<{ name: string; code: string; compact?: boolean; className?: string }> = ({
  name,
  code,
  compact = false,
  className,
}) => (
  <>
    <span
      aria-hidden="true"
      className={cn('font-display text-[0.9375rem] font-semibold tracking-wide', compact ? 'lg:hidden' : 'sm:hidden', className)}
    >
      {code}
    </span>
    <span className={cn('sr-only', compact ? 'lg:hidden' : 'sm:hidden')}>{name}</span>
    <span
      className={cn(
        'hidden min-w-[3ch] max-w-[14rem] truncate font-display text-[0.9375rem] font-semibold',
        compact ? 'lg:inline' : 'sm:inline',
        className,
      )}
    >
      {name}
    </span>
  </>
);

const ScopeControl: React.FC<{ className?: string }> = ({ className }) => {
  const access = useScopeAccess();
  const { fleetReach, vesselReach } = useNavAccess();
  const { vessels, loading: vesselsLoading, getVesselCodeById } = useVessel();
  const scope = useScope();
  const navigate = useNavigate();
  const switchTo = useVesselSwitch();
  const fleetTarget = useFleetTarget();
  const switcherAvailable = useVesselSwitcherAvailable();
  const ready = access.ready && !vesselsLoading;

  const inVesselScope = scope.scope === 'vessel' && Boolean(scope.vessel);
  const vessel = useShellVessel();
  const vesselCode = vessel ? getVesselCodeById(vessel.id) : null;
  const reachableIds = React.useMemo(() => (ready ? vessels.map((v) => v.id) : []), [ready, vessels]);
  const alerts = useVesselAlertSummary(reachableIds);
  const positions = useLatestVesselPositions(ready && vessel ? [vessel.id] : []);
  const positionStatus = positions.isError ? 'error' : positions.data ? 'ready' : 'loading';

  const workspaceLabel = scope.scope === 'workspace' && scope.workspace ? WORKSPACE_SCOPE_LABELS[scope.workspace] ?? null : null;
  const workspaceShort = scope.workspace ? WORKSPACE_SCOPE_SHORT_LABELS[scope.workspace] ?? workspaceLabel : workspaceLabel;
  // Shown at every width; below 1024 px it is the part of the row that truncates.
  const chip = workspaceLabel ? (
    <span
      data-testid={SHELL_TEST_IDS.scopeWorkspaceChip}
      title={workspaceLabel}
      className="type-caption inline-flex min-w-0 max-w-[5.5rem] shrink items-center rounded-sm bg-muted px-1.5 py-1 text-foreground sm:max-w-[9rem] sm:px-2 lg:max-w-none lg:shrink-0"
    >
      <span aria-hidden="true" className="truncate sm:hidden">
        {workspaceShort}
      </span>
      <span className="sr-only sm:hidden">{workspaceLabel}</span>
      <span className="hidden truncate sm:block">{workspaceLabel}</span>
    </span>
  ) : null;
  const compact = Boolean(chip);

  if (!ready) {
    return (
      <div data-testid={SHELL_TEST_IDS.scopeControl} aria-busy="true" className={cn('flex min-w-0 items-center', className)}>
        <Skeleton className="h-9 w-36 rounded-md sm:w-48" />
        <span className="sr-only">Loading your vessels</span>
      </div>
    );
  }

  const showFleet = fleetReach;
  const showVessel = vesselReach && Boolean(vessel && vesselCode);
  if (!showFleet && !showVessel) {
    return chip ? <div className={cn('flex min-w-0 items-center gap-2', className)}>{chip}</div> : null;
  }

  const marks =
    vessel ? (
      <>
        <AisMark status={positionStatus} position={positions.data?.get(vessel.id) ?? null} />
        <ComplianceDot summary={alerts} vesselId={vessel.id} />
      </>
    ) : null;

  // One vessel and no fleet reach: a plain label, no control chrome.
  if (!showFleet && vessels.length === 1 && vessel && vesselCode) {
    const label = (
      <>
        <Ship className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
        <VesselName name={vessel.name} code={vesselCode} compact={compact} className="text-foreground" />
        {marks}
      </>
    );
    return (
      <div data-testid={SHELL_TEST_IDS.scopeControl} className={cn('flex min-w-0 items-center gap-2', className)}>
        {inVesselScope ? (
          <span data-testid={SHELL_TEST_IDS.scopeVessel} className="flex min-w-0 items-center gap-1.5 px-1">
            {label}
          </span>
        ) : (
          <Link
            to={vesselPath(vesselCode)}
            data-testid={SHELL_TEST_IDS.scopeVessel}
            className="flex min-h-11 min-w-0 items-center gap-1.5 rounded-md px-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {label}
          </Link>
        )}
        {chip}
      </div>
    );
  }

  const fleetActive = scope.scope === 'fleet';
  const segments = (
    <>
      {showFleet && (
        <Link
          to={fleetTarget}
          data-testid={SHELL_TEST_IDS.scopeFleet}
          aria-current={fleetActive ? 'true' : undefined}
          className={cn(segment(fleetActive), 'shrink-0')}
        >
          <Globe className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          {/* Beside a chip the word waits for 1024 px too, leaving the chip room to be read (D-70). */}
          <span className={compact ? 'hidden lg:inline' : 'hidden sm:inline'}>Fleet</span>
          <span className={compact ? 'sr-only lg:hidden' : 'sr-only sm:hidden'}>Fleet</span>
        </Link>
      )}
      {showVessel && vessel && vesselCode && (
        <button
          type="button"
          data-testid={SHELL_TEST_IDS.scopeVessel}
          aria-current={inVesselScope ? 'true' : undefined}
          onClick={() => (inVesselScope ? navigate(vesselPath(vesselCode)) : switchTo({ id: vessel.id, code: vesselCode }))}
          title={inVesselScope ? `${vessel.name} home` : `Open ${vessel.name}`}
          className={cn(segment(inVesselScope), compact ? 'shrink-0 lg:shrink' : 'min-w-0')}
        >
          <Ship className="hidden h-4 w-4 shrink-0 sm:block" strokeWidth={1.75} aria-hidden="true" />
          <VesselName
            name={vessel.name}
            code={vesselCode}
            compact={compact}
            className={inVesselScope ? 'text-primary' : 'text-foreground'}
          />
          {marks}
        </button>
      )}
    </>
  );

  // Beside a chip, below 1024 px, the control keeps its full width (the chip gives way).
  const segmentedClass = cn(segmented, compact && 'shrink-0 lg:shrink');
  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      {switcherAvailable && showVessel ? (
        <VesselSwitcher
          currentVesselId={vessel?.id ?? null}
          alerts={alerts}
          className={segmentedClass}
        >
          <div data-testid={SHELL_TEST_IDS.scopeControl} role="group" aria-label="Scope" className="flex min-w-0 items-stretch gap-0.5">
            {segments}
          </div>
        </VesselSwitcher>
      ) : (
        <div data-testid={SHELL_TEST_IDS.scopeControl} role="group" aria-label="Scope" className={segmentedClass}>
          {segments}
        </div>
      )}
      {chip}
    </div>
  );
};

export default ScopeControl;

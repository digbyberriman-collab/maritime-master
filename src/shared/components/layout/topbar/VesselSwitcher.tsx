/**
 * The vessel switcher (gap/10 top bar element 3, IA4, IA23; spec §6.2): a
 * popover anchored to the scope control, opened by its chevron, `g v` or
 * `ShellActions.openVesselSwitcher`. A searchable list (name, code, IMO):
 * "All vessels — Fleet overview" for fleet users, Recent, the fleet groups,
 * Other vessels. Each row shows the code chip, the open-alert pill and the
 * AIS mark; the current vessel is ticked.
 *
 * Choosing a vessel goes through `useVesselSwitch()`, which keeps the user's
 * place when it can. The row shows a spinner until the navigation lands; the
 * popover then closes and focus goes back to the chevron. Only shown with at
 * least two vessels in reach (the caller checks `useVesselSwitcherAvailable`).
 */
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Check, ChevronDown, Globe, Loader2 } from 'lucide-react';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { StatusPill } from '@/shared/components/status';
import { cn } from '@/lib/utils';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { useLatestVesselPositions } from '@/modules/dashboard/hooks/useLatestVesselPositions';
import { useNavAccess } from '@/app/nav/navAccess';
import { useVesselSwitch } from '@/app/nav/useVesselSwitch';
import { useRecentVessels } from '@/app/nav/recentVessels';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import { useShellSurface } from '@/app/shell/shellUi';
import AisMark from './AisMark';
import { FLEET_HOME } from './useFleetTarget';
import { useFleetGroups } from './useFleetGroups';
import type { VesselAlertSummary } from './useVesselAlertSummary';
import {
  alertSummaryLabel,
  buildSwitcherGroups,
  severityTone,
  switcherFilter,
  type SwitcherVessel,
} from './vesselSwitcherModel';

export interface VesselSwitcherProps {
  /** The vessel the scope control shows (in scope, else the last one). */
  currentVesselId: string | null;
  /** The shared open-alert summary (one query for the control and the list). */
  alerts: VesselAlertSummary;
  /** The scope control's segments, which the popover is anchored to. */
  children: React.ReactNode;
  className?: string;
}

const ALL_VESSELS = 'all-vessels';

const SwitcherPanel: React.FC<{
  vessels: readonly SwitcherVessel[];
  currentVesselId: string | null;
  pendingId: string | null;
  alerts: VesselAlertSummary;
  onSelect: (target: SwitcherVessel | typeof ALL_VESSELS) => void;
}> = ({ vessels, currentVesselId, pendingId, alerts, onSelect }) => {
  const { fleetReach } = useNavAccess();
  const recentIds = useRecentVessels();
  const groupsState = useFleetGroups();
  const ids = React.useMemo(() => vessels.map((v) => v.id), [vessels]);
  // Positions for every vessel only while the list is open (D-38: one request each).
  const positions = useLatestVesselPositions(ids);
  const positionStatus = positions.isError ? 'error' : positions.data ? 'ready' : 'loading';
  const groups = React.useMemo(
    () => buildSwitcherGroups({ vessels, recentIds, groups: groupsState.status === 'ready' ? groupsState.groups : [] }),
    [vessels, recentIds, groupsState],
  );

  return (
    <Command label="Switch vessel" filter={switcherFilter} className="bg-transparent">
      <CommandInput placeholder="Search by name, code or IMO" aria-label="Search vessels by name, code or IMO" />
      <CommandList className="max-h-[min(24rem,60dvh)] p-1">
        <CommandEmpty>No vessel matches.</CommandEmpty>
        {fleetReach && (
          <>
            <CommandGroup>
              <CommandItem
                value={ALL_VESSELS}
                keywords={['All vessels', 'Fleet overview', 'fleet']}
                onSelect={() => onSelect(ALL_VESSELS)}
                className="min-h-10 gap-2.5 [@media(pointer:coarse)]:min-h-11"
              >
                <Globe className="h-[18px] w-[18px] shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">
                  All vessels <span className="text-muted-foreground">— Fleet overview</span>
                </span>
                {pendingId === ALL_VESSELS && <Loader2 className="h-4 w-4 shrink-0 motion-safe:animate-spin" aria-label="Opening" />}
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}
        {groups.map((group) => (
          <CommandGroup
            key={group.id}
            heading={group.heading}
            className="[&_[cmdk-group-heading]]:type-eyebrow [&_[cmdk-group-heading]]:text-muted-foreground"
          >
            {group.vessels.map((vessel) => {
              const count = alerts.status === 'ready' ? alerts.byVessel.get(vessel.id) : undefined;
              const current = vessel.id === currentVesselId;
              const pending = pendingId === vessel.id;
              return (
                <CommandItem
                  key={`${group.id}:${vessel.id}`}
                  value={`${group.id}:${vessel.id}`}
                  keywords={[vessel.name, vessel.code, vessel.imo ?? '']}
                  onSelect={() => onSelect(vessel)}
                  aria-current={current ? 'true' : undefined}
                  className="min-h-10 gap-2.5 [@media(pointer:coarse)]:min-h-11"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="truncate font-display text-[0.9375rem] font-semibold">{vessel.name}</span>
                    <span className="type-mono shrink-0 rounded-sm border border-input px-1 uppercase leading-4 text-muted-foreground">
                      {vessel.code}
                    </span>
                  </span>
                  {count && count.open > 0 && (
                    <StatusPill
                      tone={severityTone(count.worst)}
                      icon={null}
                      aria-label={alertSummaryLabel(count.open, count.worst, alerts.truncated)}
                    >
                      {alerts.truncated ? `${count.open}+` : count.open}
                    </StatusPill>
                  )}
                  <AisMark status={positionStatus} position={positions.data?.get(vessel.id) ?? null} tooltip={false} />
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {pending ? (
                      <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-label="Opening" />
                    ) : current ? (
                      <Check className="h-4 w-4 text-primary" strokeWidth={2} aria-label="Current vessel" />
                    ) : null}
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  );
};

const VesselSwitcher: React.FC<VesselSwitcherProps> = ({ currentVesselId, alerts, children, className }) => {
  const [open, setOpen] = useShellSurface('vesselSwitcher');
  const { vessels, getVesselCodeById } = useVessel();
  const switchTo = useVesselSwitch();
  const navigate = useNavigate();
  const location = useLocation();
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const pendingRef = React.useRef<string | null>(null);

  const rows = React.useMemo<SwitcherVessel[]>(
    () =>
      vessels.map((v) => ({
        id: v.id,
        name: v.name,
        code: getVesselCodeById(v.id) ?? '',
        imo: v.imo_number,
        fleetGroupId: v.fleet_group_id ?? null,
      })),
    [vessels, getVesselCodeById],
  );

  // A selection lands as a navigation: then close, which returns focus to the chevron.
  React.useEffect(() => {
    if (!pendingRef.current) return;
    pendingRef.current = null;
    setPendingId(null);
    setOpen(false);
  }, [location.key, setOpen]);

  const onOpenChange = (next: boolean) => {
    if (!next) {
      pendingRef.current = null;
      setPendingId(null);
    }
    setOpen(next);
  };

  const onSelect = (target: SwitcherVessel | typeof ALL_VESSELS) => {
    if (target === ALL_VESSELS) {
      if (location.pathname === FLEET_HOME) return onOpenChange(false);
      pendingRef.current = ALL_VESSELS;
      setPendingId(ALL_VESSELS);
      navigate(FLEET_HOME);
      return;
    }
    if (target.id === currentVesselId && location.pathname.startsWith('/v/')) return onOpenChange(false);
    if (!target.code) return;
    pendingRef.current = target.id;
    setPendingId(target.id);
    switchTo({ id: target.id, code: target.code });
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <div className={className}>
          {children}
          <PopoverTrigger asChild>
            <button
              type="button"
              data-testid={SHELL_TEST_IDS.vesselSwitcherTrigger}
              aria-label="Switch vessel"
              aria-haspopup="dialog"
              title="Switch vessel (G then V)"
              className={cn(
                'inline-flex w-7 shrink-0 items-center justify-center rounded-[calc(var(--radius)-4px)] text-muted-foreground transition-colors duration-quick ease-tide',
                'hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground [@media(pointer:coarse)]:w-11',
                // Touch: the hit area reaches the scope control's full 44 px height (D-35).
                "relative [@media(pointer:coarse)]:after:absolute [@media(pointer:coarse)]:after:inset-x-0 [@media(pointer:coarse)]:after:-inset-y-[3px] [@media(pointer:coarse)]:after:content-['']",
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
              )}
            >
              <ChevronDown
                className="h-4 w-4 transition-transform duration-quick ease-tide motion-reduce:transition-none [[data-state=open]>&]:rotate-180"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </button>
          </PopoverTrigger>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={6}
        data-testid={SHELL_TEST_IDS.vesselSwitcher}
        aria-label="Switch vessel"
        className="w-[min(22rem,calc(100vw-2rem))] overflow-hidden p-0"
      >
        <SwitcherPanel vessels={rows} currentVesselId={currentVesselId} pendingId={pendingId} alerts={alerts} onSelect={onSelect} />
      </PopoverContent>
    </Popover>
  );
};

export default VesselSwitcher;

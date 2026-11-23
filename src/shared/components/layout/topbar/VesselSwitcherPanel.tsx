/**
 * The vessel switcher's list (gap/10 top bar element 3, IA4; spec §6.2): a
 * searchable cmdk list (name, code, IMO) with "All vessels — Fleet overview"
 * for fleet users, Recent, the fleet groups and Other vessels. Each row shows
 * the code chip, the open-alert pill and the AIS mark; the current vessel is
 * ticked, a pending one spins.
 *
 * A lazy chunk (with cmdk), loaded by ./VesselSwitcher.tsx when the switcher
 * opens or is about to (hover, focus or press on its chevron), so cmdk stays
 * out of the entry bundle (I6). When the chunk arrives after the popover has
 * opened (the first open), focus moves from the popover to the search box,
 * where it would have started had the list been there.
 */
import React from 'react';
import { Check, Globe, Loader2 } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { StatusPill } from '@/shared/components/status';
import { useLatestVesselPositions } from '@/modules/dashboard/hooks/useLatestVesselPositions';
import { useNavAccess } from '@/app/nav/navAccess';
import { useRecentVessels } from '@/app/nav/recentVessels';
import AisMark from './AisMark';
import { useFleetGroups } from './useFleetGroups';
import type { VesselAlertSummary } from './useVesselAlertSummary';
import {
  ALL_VESSELS,
  alertSummaryLabel,
  buildSwitcherGroups,
  severityTone,
  switcherFilter,
  type SwitcherTarget,
  type SwitcherVessel,
} from './vesselSwitcherModel';

export interface VesselSwitcherPanelProps {
  vessels: readonly SwitcherVessel[];
  currentVesselId: string | null;
  pendingId: string | null;
  alerts: VesselAlertSummary;
  onSelect: (target: SwitcherTarget) => void;
}

const VesselSwitcherPanel: React.FC<VesselSwitcherPanelProps> = ({ vessels, currentVesselId, pendingId, alerts, onSelect }) => {
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
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const active = document.activeElement;
    // Only if focus is still on the popover itself (or lost): never steal it from elsewhere.
    if (!active || active === document.body || active === input.closest('[role="dialog"]')) input.focus();
  }, []);

  return (
    <Command label="Switch vessel" filter={switcherFilter} className="bg-transparent">
      <CommandInput ref={inputRef} placeholder="Search by name, code or IMO" aria-label="Search vessels by name, code or IMO" />
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

export default VesselSwitcherPanel;

import React from 'react';
import { Plane } from 'lucide-react';
import { StatusPill } from '@/shared/components/status';
import { Portal as TooltipPortal } from '@radix-ui/react-tooltip';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { crewStatusDetailText, type CrewListRow } from '@/modules/crew/lib/crewListModel';

/** The tooltip of the Pending login chip (D-199). */
export const PENDING_LOGIN_HELP = 'Added without a sign-in. Their assignment starts when they accept an invitation.';

/**
 * A crew member's derived status (statusTone `crew_status`) with its reason
 * underneath, so the meaning is in words as well as the colour.
 */
export const CrewStatusPill: React.FC<{ row: CrewListRow; vesselName: (id: string) => string | null }> = ({ row, vesselName }) => {
  const detail = crewStatusDetailText(row, vesselName);
  return (
    <div className="flex min-w-0 flex-col items-start gap-0.5" data-crew-status={row.status}>
      <StatusPill domain="crew_status" status={row.status} />
      {detail ? <span className="line-clamp-2 max-w-[14rem] type-caption text-muted-foreground">{detail}</span> : null}
    </div>
  );
};

/**
 * "Pending login" (statusTone `crew_status.pending_login`): a person added
 * without a sign-in (D-199). The chip is a focusable button, so its
 * explanation reaches keyboard and touch users, not only a hover.
 */
export const PendingLoginChip: React.FC = () => (
  <TooltipProvider delayDuration={200}>
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11"
          aria-label={`Pending login. ${PENDING_LOGIN_HELP}`}
          data-pending-login=""
        >
          <StatusPill domain="crew_status" status="pending_login" />
        </button>
      </TooltipTrigger>
      {/* Portalled: the table scrolls inside its card, which would clip it. */}
      <TooltipPortal>
        <TooltipContent side="top" align="start" className="max-w-xs">
          {PENDING_LOGIN_HELP}
        </TooltipContent>
      </TooltipPortal>
    </Tooltip>
  </TooltipProvider>
);

/** The travel icon: a travel movement of the person is dated today (frp_travel_movements). */
export const TravelTodayIcon: React.FC = () => (
  <span className="inline-flex items-center gap-1 type-caption text-info" data-travel-today="">
    <Plane aria-hidden="true" className="size-3.5" />
    <span>Travel today</span>
  </span>
);

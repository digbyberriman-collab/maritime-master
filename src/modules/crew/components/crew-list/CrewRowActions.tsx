import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightLeft, Clock, Edit, KeyRound, LogOut, MailPlus, MoreHorizontal, Send, Ship, UserCheck, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Portal as TooltipPortal } from '@radix-ui/react-tooltip';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { CrewListRow } from '@/modules/crew/lib/crewListModel';
import { ROW_BUTTON } from './CrewTable';

/** What the viewer may do on the list (useCan answers, computed once by the page). */
export interface CrewRowPermissions {
  /** vessel.crew.hours_of_rest.view: anyone's month; own month always. */
  hoursOfRest: boolean;
  /** vessel.crew.crew_assignments.assign: transfer and sign off. */
  assign: boolean;
  /** vessel.crew.crew_profiles.edit. */
  edit: boolean;
  /** admin.access.users_access.assign: invite and resend. */
  invite: boolean;
  /** admin.access.users_access.admin: reset account, access on / off, reallocate. */
  accessAdmin: boolean;
}

export type CrewRowAction = 'transfer' | 'edit' | 'sign_off' | 'reset' | 'toggle' | 'reallocate' | 'invite';

export const PENDING_TRANSFER_REASON = 'Not on board yet: they are assigned once their login is linked, and can be transferred after that.';
export const PENDING_SIGN_OFF_REASON = 'Not on board yet: there is no assignment to end.';
export const NO_LOGIN_HOR_REASON = 'No hours of rest without a sign-in.';

interface CrewRowActionsProps {
  row: CrewListRow;
  /** The signed-in user's login id (own hours of rest are always open). */
  currentUserId: string | null;
  can: CrewRowPermissions;
  /** The link to a person's month of hours of rest (scope-relative path builder). */
  hoursOfRestPath: (userId: string) => string;
  /** Invite / Resend from the overflow menu (the invitation column is hidden in the basic list). */
  inviteFromMenu: { label: 'Invite' | 'Resend' } | null;
  onAction: (action: CrewRowAction, row: CrewListRow) => void;
}

/** A disabled icon button that still says why: focusable, with the reason as its description and tooltip. */
const DisabledAction: React.FC<{ label: string; reason: string; icon: React.ReactNode }> = ({ label, reason, icon }) => {
  const id = React.useId();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 [@media(pointer:coarse)]:size-11"
          aria-disabled="true"
          aria-label={label}
          aria-describedby={id}
          onClick={(event) => event.preventDefault()}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      {/* Portalled: the table scrolls inside its card, which would clip it. */}
      <TooltipPortal>
        <TooltipContent className="max-w-xs">{reason}</TooltipContent>
      </TooltipPortal>
      <span id={id} className="sr-only">
        {reason}
      </span>
    </Tooltip>
  );
};

/**
 * The row's actions (gap/04 C8): Hours of rest and Transfer as icon buttons
 * (View profile arrives with the routed profile, X1-03), then an overflow
 * menu with Edit, Sign off, Reset account, access on / off and Reallocate,
 * each shown only when the viewer may use it (useCan). A pending placement
 * has no assignment yet (D-225): Transfer and Sign off say why they are not
 * available instead of failing.
 */
export const CrewRowActions: React.FC<CrewRowActionsProps> = ({ row, currentUserId, can, hoursOfRestPath, inviteFromMenu, onAction }) => {
  const pending = row.placementKind === 'pending_placement';
  const own = Boolean(row.userId) && row.userId === currentUserId;
  const name = row.displayName;
  const showHor = can.hoursOfRest || own;
  const hasLogin = Boolean(row.userId);
  const menuItems: React.ReactNode[] = [];

  if (can.edit) {
    menuItems.push(
      <DropdownMenuItem key="edit" onSelect={() => onAction('edit', row)}>
        <Edit aria-hidden="true" />
        Edit
      </DropdownMenuItem>,
    );
  }
  if (can.assign) {
    menuItems.push(
      <DropdownMenuItem key="sign_off" disabled={pending} onSelect={() => onAction('sign_off', row)}>
        <LogOut aria-hidden="true" />
        <span className="flex flex-col">
          Sign off
          {pending ? <span className="type-caption text-muted-foreground">{PENDING_SIGN_OFF_REASON}</span> : null}
        </span>
      </DropdownMenuItem>,
    );
  }
  if (inviteFromMenu && can.invite) {
    menuItems.push(
      <DropdownMenuItem key="invite" onSelect={() => onAction('invite', row)}>
        {inviteFromMenu.label === 'Invite' ? <MailPlus aria-hidden="true" /> : <Send aria-hidden="true" />}
        {inviteFromMenu.label}
      </DropdownMenuItem>,
    );
  }
  if (can.accessAdmin) {
    menuItems.push(
      <DropdownMenuSeparator key="sep" />,
      <DropdownMenuLabel key="label" className="type-caption text-muted-foreground">
        Account
      </DropdownMenuLabel>,
      <DropdownMenuItem key="reset" disabled={!hasLogin} onSelect={() => onAction('reset', row)}>
        <KeyRound aria-hidden="true" />
        Reset account
      </DropdownMenuItem>,
      <DropdownMenuItem key="toggle" disabled={!hasLogin} onSelect={() => onAction('toggle', row)}>
        {row.loginState === 'disabled' ? <UserCheck aria-hidden="true" /> : <UserX aria-hidden="true" />}
        {row.loginState === 'disabled' ? 'Turn access on' : 'Turn access off'}
      </DropdownMenuItem>,
      <DropdownMenuItem key="reallocate" onSelect={() => onAction('reallocate', row)}>
        <Ship aria-hidden="true" />
        Reallocate vessel
      </DropdownMenuItem>,
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center justify-end gap-1">
        {showHor ? (
          hasLogin ? (
            <Button asChild variant="ghost" size="icon" className="size-8 [@media(pointer:coarse)]:size-11">
              <Link to={hoursOfRestPath(row.userId as string)} aria-label={`Hours of rest: ${name}`}>
                <Clock aria-hidden="true" />
              </Link>
            </Button>
          ) : (
            <DisabledAction label={`Hours of rest: ${name}`} reason={NO_LOGIN_HOR_REASON} icon={<Clock aria-hidden="true" />} />
          )
        ) : null}
        {can.assign ? (
          pending ? (
            <DisabledAction label={`Transfer ${name}`} reason={PENDING_TRANSFER_REASON} icon={<ArrowRightLeft aria-hidden="true" />} />
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 [@media(pointer:coarse)]:size-11"
              aria-label={`Transfer ${name}`}
              onClick={() => onAction('transfer', row)}
            >
              <ArrowRightLeft aria-hidden="true" />
            </Button>
          )
        ) : null}
        {menuItems.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className={`size-8 ${ROW_BUTTON} [@media(pointer:coarse)]:size-11`} aria-label={`More actions for ${name}`}>
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {menuItems}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </TooltipProvider>
  );
};

export default CrewRowActions;

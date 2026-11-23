import React from 'react';
import { Loader2 } from 'lucide-react';
import { StatusPill } from '@/shared/components/status';
import type { AccountState, InvitationCell } from '../lib/invitationStatus';

/**
 * The account pill (`statusTone('crew_account', …)`): Active, Disabled, or
 * Not joined for someone invited or not yet invited (the invitation status
 * says which, so the two never repeat each other).
 */
export const AccountStatusPill: React.FC<{ account: AccountState; className?: string }> = ({ account, className }) => (
  <StatusPill domain="crew_account" status={account === 'invited' || account === 'not_invited' ? 'not_joined' : account} className={className} />
);

/**
 * The invitation status (`statusTone('invitation', …)`) with its note: the
 * legacy "sent before delivery tracking" caveat, or why the last send
 * failed. Unknown while loading or after a failed read: a muted line, never
 * a guessed status.
 */
export const InvitationStatus: React.FC<{ cell: InvitationCell; loading?: boolean }> = ({ cell, loading }) => {
  if (cell.status === 'unknown') {
    return loading ? (
      <span className="inline-flex items-center gap-1.5 type-body-sm text-muted-foreground" aria-busy="true">
        <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
        Checking…
      </span>
    ) : (
      <span className="type-body-sm text-muted-foreground">Status unavailable</span>
    );
  }
  if (cell.status === 'none') return <span className="type-body-sm text-muted-foreground">No invitation on record</span>;
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <StatusPill domain="invitation" status={cell.status} />
      {cell.note ? <p className="max-w-[16rem] type-caption text-muted-foreground">{cell.note}</p> : null}
    </div>
  );
};

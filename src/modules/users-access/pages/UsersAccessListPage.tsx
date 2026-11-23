import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, Loader2, MailPlus, MoreHorizontal, RefreshCw, Send, Settings2, Users } from 'lucide-react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import PageHeader from '@/shared/components/layout/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { DataTable, type DataTableColumn, type DataTableFilter } from '@/shared/components/data';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useCan } from '@/lib/permissions/useCan';
import { useUsersWithAccess, type UserAccessRow } from '../hooks/useUsersWithAccess';
import { useInvitationActions, useInvitationStatuses } from '../hooks/useInvitations';
import { invitationCell, type InvitationCell } from '../lib/invitationStatus';
import { PresetBadge } from '../components/PresetBadge';
import { ModulePermChip } from '../components/ModulePermChip';
import { AccountStatusPill, InvitationStatus } from '../components/InvitationStatus';

interface Row extends UserAccessRow {
  name: string;
  invitation: InvitationCell;
}

const NOUN = { one: 'person', other: 'people' };

const FILTERS: DataTableFilter<Row>[] = [
  { id: 'not_joined', label: 'Not joined', predicate: (r) => r.account === 'invited' || r.account === 'not_invited' },
  { id: 'send_failed', label: 'Send failed', predicate: (r) => r.invitation.status === 'send_failed' },
  { id: 'disabled', label: 'Disabled', predicate: (r) => r.account === 'disabled' },
];

/** 44 px on touch screens (D-35). */
const ROW_BUTTON = '[@media(pointer:coarse)]:min-h-11';

/**
 * Users & Access (gap/03 B7; Phase 2 spec §B.3): everyone in the company
 * with their real account status (never assumed active), the honest
 * invitation status (Pending, Sent, Send failed, Accepted, Expired, Revoked;
 * "Invited" from the profile when no invitation row is visible), and
 * invite / resend / revoke actions for people who may use them.
 */
const UsersAccessListPage: React.FC = () => {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { data: people = [], isLoading, error, refetch } = useUsersWithAccess();
  const profileIds = useMemo(() => people.map((p) => p.profileId), [people]);
  const invitations = useInvitationStatuses(companyId, profileIds);
  const canAssign = useCan('admin.access.users_access.assign');
  const canAdmin = useCan('admin.access.users_access.admin');
  const actions = useInvitationActions();
  const [selected, setSelected] = useState<string[]>([]);
  const [revokeTarget, setRevokeTarget] = useState<{ invitationId: string; name: string } | null>(null);

  const rows = useMemo<Row[]>(() => {
    const now = new Date();
    return people.map((p) => ({
      ...p,
      name: `${p.firstName} ${p.lastName}`.trim() || p.email,
      invitation: invitationCell(p.account, invitations.byProfile.get(p.profileId), invitations.source, now),
    }));
  }, [people, invitations.byProfile, invitations.source]);

  const invitableSelected = useMemo(
    () => rows.filter((r) => selected.includes(r.profileId) && (r.invitation.canInvite || r.invitation.canResend)).map((r) => r.profileId),
    [rows, selected],
  );

  const columns = useMemo<DataTableColumn<Row>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        value: (r) => r.name.toLowerCase(),
        sticky: true,
        minWidth: 180,
        cell: (r) => (
          <div className="flex min-w-0 flex-col items-start gap-1">
            <span className="font-medium text-foreground">{r.name}</span>
            <AccountStatusPill account={r.account} />
            {/* Phones: the invitation status sits under the name (the column shows from 768 px). */}
            <div className="md:hidden" data-mobile-invitation="">
              <InvitationStatus cell={r.invitation} loading={invitations.source === 'loading'} />
            </div>
          </div>
        ),
      },
      {
        id: 'position',
        header: 'Position',
        value: (r) => r.position,
        emptyReason: 'No current assignment',
        minWidth: 140,
        className: 'hidden md:table-cell',
        headerClassName: 'hidden md:table-cell',
      },
      {
        id: 'invitation',
        header: 'Invitation',
        value: (r) => r.invitation.status,
        searchable: false,
        minWidth: 170,
        className: 'hidden md:table-cell',
        headerClassName: 'hidden md:table-cell',
        cell: (r) => <InvitationStatus cell={r.invitation} loading={invitations.source === 'loading'} />,
      },
      {
        id: 'preset',
        header: 'Access preset',
        value: (r) => r.preset,
        searchable: false,
        className: 'hidden lg:table-cell',
        headerClassName: 'hidden lg:table-cell',
        cell: (r) => <PresetBadge preset={r.preset} />,
      },
      {
        id: 'modules',
        header: 'Module access',
        sortable: false,
        searchable: false,
        minWidth: 200,
        emptyReason: 'No module overrides',
        className: 'hidden xl:table-cell',
        headerClassName: 'hidden xl:table-cell',
        cell: (r) => {
          const chips = r.chips.filter((c) => c.level !== 'none');
          if (!chips.length) return null;
          return (
            <div className="flex min-w-0 flex-wrap gap-1">
              {chips.map((c) => (
                <ModulePermChip key={c.label} label={c.label} level={c.level} />
              ))}
            </div>
          );
        },
      },
    ],
    [invitations.source],
  );

  const rowActions = (r: Row) => {
    const busy = actions.invitingProfileId === r.profileId;
    const target = { profileId: r.profileId, name: r.name, email: r.email };
    const canSend = canAssign && (r.invitation.canInvite || r.invitation.canResend);
    const canRevokeRow = canAdmin && r.invitation.canRevoke && Boolean(r.invitation.invitationId);
    const editLink = r.userId ? `/users-access/${r.userId}` : null;
    // One visible action (send, else edit); the rest, revoke included, in a menu.
    const menuEdit = editLink && canSend;
    return (
      <div className="flex items-center justify-end gap-1">
        {canSend ? (
          <Button
            variant="outline"
            size="sm"
            className={ROW_BUTTON}
            disabled={busy || actions.bulkPending}
            onClick={() => void actions.inviteOne(target)}
            aria-label={`${r.invitation.canInvite ? 'Invite' : 'Resend the invitation to'} ${r.name}`}
          >
            {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : r.invitation.canInvite ? <MailPlus aria-hidden="true" /> : <Send aria-hidden="true" />}
            {/* Icon only on phones, so the row keeps its actions in view. */}
            <span className="max-sm:sr-only">{r.invitation.canInvite ? 'Invite' : 'Resend'}</span>
          </Button>
        ) : editLink ? (
          <Button asChild variant="ghost" size="sm" className={ROW_BUTTON}>
            <Link to={`/users-access/${r.userId}`} aria-label={`Edit access for ${r.name}`}>
              <Settings2 aria-hidden="true" />
              <span className="max-sm:sr-only">Edit</span>
            </Link>
          </Button>
        ) : null}
        {menuEdit || canRevokeRow ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8 [@media(pointer:coarse)]:size-11" aria-label={`More actions for ${r.name}`}>
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {menuEdit ? (
                <DropdownMenuItem asChild>
                  <Link to={editLink}>
                    <Settings2 aria-hidden="true" />
                    Edit access
                  </Link>
                </DropdownMenuItem>
              ) : null}
              {canRevokeRow ? (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  disabled={actions.revokePending}
                  onSelect={() => setRevokeTarget({ invitationId: r.invitation.invitationId as string, name: r.name })}
                >
                  <Ban aria-hidden="true" />
                  Revoke invitation
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 p-4 lg:p-6">
        <PageHeader
          title="Users & Access"
          description="Who can sign in to STORM, their invitations, and what they can see and do."
          actions={
            canAssign && selected.length > 0 ? (
              <Button
                variant="signal"
                onClick={() => void actions.inviteMany(invitableSelected).then(() => setSelected([]))}
                disabled={invitableSelected.length === 0 || actions.bulkPending}
              >
                {actions.bulkPending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <MailPlus aria-hidden="true" />}
                {invitableSelected.length === 0 ? 'Nobody selected can be invited' : `Invite selected (${invitableSelected.length})`}
              </Button>
            ) : null
          }
        />

        {invitations.source === 'table-missing' ? (
          <Alert variant="info" data-invitations-notice="not-tracked">
            <AlertTitle>Invitation delivery tracking is not set up yet</AlertTitle>
            <AlertDescription>
              Statuses come from each profile. &ldquo;Invited&rdquo; means an invitation was requested, not that the email
              arrived. Sending works, and STORM says straight away if an email could not be sent.
            </AlertDescription>
          </Alert>
        ) : null}
        {invitations.source === 'error' ? (
          <Alert variant="warning" data-invitations-notice="error">
            <AlertTitle>Invitation statuses could not be loaded</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>Invite and resend are hidden until STORM knows each status.</span>
              <Button variant="outline" size="sm" className={ROW_BUTTON} onClick={invitations.refetch}>
                <RefreshCw aria-hidden="true" />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        <DataTable<Row>
          label="Users and access"
          noun={NOUN}
          data={rows}
          columns={columns}
          getRowId={(r) => r.profileId}
          rowLabel={(r) => r.name}
          isLoading={isLoading}
          error={error}
          onRetry={() => void refetch()}
          empty={{ title: 'No people yet', body: 'People appear here once they are added to the crew list.', icon: Users }}
          searchPlaceholder="Search people…"
          searchText={(r) => [r.name, r.position, r.email].filter(Boolean).join(' ')}
          filters={FILTERS}
          allLabel="Everyone"
          defaultSort={{ columnId: 'name', direction: 'asc' }}
          selectable={canAssign}
          selectedIds={selected}
          onSelectionChange={setSelected}
          rowActions={rowActions}
        />
      </div>

      <AlertDialog open={revokeTarget !== null} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this invitation?</AlertDialogTitle>
            <AlertDialogDescription>
              The link sent to {revokeTarget?.name} stops working. You can send a new invitation later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (revokeTarget) actions.revoke(revokeTarget);
                setRevokeTarget(null);
              }}
            >
              Revoke invitation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default UsersAccessListPage;

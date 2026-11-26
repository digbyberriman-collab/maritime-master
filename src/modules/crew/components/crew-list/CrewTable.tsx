import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { Loader2, MailPlus, Send, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn, type DataTableFilter } from '@/shared/components/data';
import type { TableSort } from '@/shared/components/data/tableModel';
import { statusLabel } from '@/shared/components/status';
import { InvitationStatus } from '@/modules/users-access/components/InvitationStatus';
import { crewInvitationCell } from '@/modules/crew/hooks/useVesselCrewList';
import {
  compareByName,
  crewSearchText,
  positionLabel,
  STATUS_CHIP_ORDER,
  type CrewListRow,
  type CrewListSort,
  type SortDirection,
} from '@/modules/crew/lib/crewListModel';
import { CrewStatusPill, PendingLoginChip, TravelTodayIcon } from './CrewStatusPill';
import { ComplianceDotsCell } from '@/modules/crew/components/compliance/ComplianceDots';
import { useCrewListCompliance } from '@/modules/crew/components/compliance/crewListCompliance';

const NOUN = { one: 'crew member', other: 'crew members' };

/** 44 px on touch screens (D-35). */
export const ROW_BUTTON = '[@media(pointer:coarse)]:min-h-11';

/** The URL sorts and the table columns that carry them. */
const SORT_COLUMN: Readonly<Record<CrewListSort, string>> = { rank: 'position', name: 'name', join: 'joined' };
const COLUMN_SORT: Readonly<Record<string, CrewListSort>> = { position: 'rank', name: 'name', joined: 'join' };

const FILTERS: DataTableFilter<CrewListRow>[] = STATUS_CHIP_ORDER.map((status) => ({
  id: status,
  label: statusLabel('crew_status', status),
  predicate: (row: CrewListRow) => row.status === status,
}));

const fmtDay = (day: string | null) => {
  if (!day) return null;
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  return y && m && d ? format(new Date(y, m - 1, d), 'd MMM yyyy') : null;
};

export interface CrewTableProps {
  rows: readonly CrewListRow[];
  isLoading: boolean;
  error?: unknown;
  onRetry?: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  status: string | null;
  onStatusChange: (status: string | null) => void;
  sort: CrewListSort;
  dir: SortDirection;
  onSortChange: (sort: CrewListSort, dir: SortDirection) => void;
  /** Page-level filters outside the table are active (the department). */
  hasExternalFilters: boolean;
  onClearFilters: () => void;
  /** Extra controls next to the search (the department select). */
  toolbar?: React.ReactNode;
  selectable: boolean;
  selectedIds: readonly string[];
  onSelectionChange: (ids: string[]) => void;
  rowActions: (row: CrewListRow) => React.ReactNode;
  /** Name of a vessel id (the transfer's other vessel). */
  vesselName: (id: string) => string | null;
  /** The server knows the invitations (not the basic D-01 list). */
  showInvitations: boolean;
  /** Invite / Resend from the row, when the viewer may (users_access.assign). */
  canInvite: boolean;
  onInvite: (row: CrewListRow) => void;
  invitingProfileId: string | null;
  inviteBusy: boolean;
  empty: { title: string; body: string; action?: React.ReactNode };
}

/**
 * The vessel's crew (gap/04 C3, C4, C7, C8) on the register table: name
 * (with Pending login and Travel today), position (the vessel's rank
 * order), department, the derived status with its reason, the two
 * compliance dots (X1-06B: documents, then STCW and qualifications, from
 * crew_vessel_compliance merged by profile id, a tooltip listing the
 * reasons; a dash that says why while compliance is not set up or not the
 * reader's), the invitation status with Invite / Resend, and the join date. Below 768 px the table scrolls inside
 * its card with the name column held in view; the page never scrolls
 * sideways.
 */
export const CrewTable: React.FC<CrewTableProps> = ({
  rows,
  isLoading,
  error,
  onRetry,
  search,
  onSearchChange,
  status,
  onStatusChange,
  sort,
  dir,
  onSortChange,
  hasExternalFilters,
  onClearFilters,
  toolbar,
  selectable,
  selectedIds,
  onSelectionChange,
  rowActions,
  vesselName,
  showInvitations,
  canInvite,
  onInvite,
  invitingProfileId,
  inviteBusy,
  empty,
}) => {
  const compliance = useCrewListCompliance();
  const columns = useMemo<DataTableColumn<CrewListRow>[]>(() => {
    const list: DataTableColumn<CrewListRow>[] = [
      {
        id: 'name',
        header: 'Name',
        sticky: true,
        minWidth: 190,
        compare: compareByName,
        cell: (row) => (
          <div className="flex min-w-0 flex-col items-start gap-1">
            <span className="max-w-[16rem] truncate font-medium text-foreground">{row.displayName}</span>
            {row.preferredName ? <span className="type-caption text-muted-foreground">Known as {row.preferredName}</span> : null}
            {row.loginState === 'pending_login' || row.travelToday ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {row.loginState === 'pending_login' ? <PendingLoginChip /> : null}
                {row.travelToday ? <TravelTodayIcon /> : null}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        id: 'position',
        header: 'Position',
        headerLabel: 'rank',
        minWidth: 150,
        // The vessel's rank order; titles that map to no position stay last either way.
        value: (row) => row.sortOrder,
        emptyReason: 'No position recorded',
        // The department sits under the title (the department filter is in the toolbar): one column
        // fewer keeps the row actions in view at 1440 px.
        cell: (row) => {
          const label = positionLabel(row);
          if (!label) return null;
          const recordedAs = row.positionName && row.positionText && row.positionText !== row.positionName ? row.positionText : null;
          return (
            <div className="flex min-w-0 flex-col">
              <span className="truncate">{label}</span>
              {row.departmentLabel || recordedAs ? (
                <span className="truncate type-caption text-muted-foreground">
                  {[row.departmentLabel, recordedAs ? `recorded as ${recordedAs}` : null].filter(Boolean).join(' · ')}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        minWidth: 150,
        sortable: false,
        cell: (row) => <CrewStatusPill row={row} vesselName={vesselName} />,
      },
      {
        id: 'compliance',
        header: 'Compliance',
        headerLabel: 'documents and qualifications',
        sortable: false,
        cell: (row) => <ComplianceDotsCell profileId={row.profileId} name={row.displayName} state={compliance} />,
      },
    ];
    if (showInvitations) {
      list.push({
        id: 'invitation',
        header: 'Invitation',
        minWidth: 170,
        sortable: false,
        cell: (row) => {
          const cell = crewInvitationCell(row);
          const sent = fmtDay(row.invitation?.lastSentAt ?? null);
          const can = canInvite && (cell.canInvite || cell.canResend);
          const busy = invitingProfileId === row.profileId;
          return (
            <div className="flex min-w-0 flex-col items-start gap-1">
              {cell.status === 'none' ? (
                // No invitation row and nothing to invite: say what the crew list reader needs (the login), not the absence of a record.
                <span className="type-body-sm text-muted-foreground">{row.loginState === 'disabled' ? 'Access off' : 'Has a login'}</span>
              ) : (
                <InvitationStatus cell={cell} />
              )}
              {sent ? <span className="type-caption text-muted-foreground">Last sent {sent}</span> : null}
              {can ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={ROW_BUTTON}
                  disabled={busy || inviteBusy}
                  onClick={() => onInvite(row)}
                  aria-label={`${cell.canInvite ? 'Invite' : 'Resend the invitation to'} ${row.displayName}`}
                >
                  {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : cell.canInvite ? <MailPlus aria-hidden="true" /> : <Send aria-hidden="true" />}
                  {cell.canInvite ? 'Invite' : 'Resend'}
                </Button>
              ) : null}
            </div>
          );
        },
      });
    }
    list.push({
      id: 'joined',
      header: 'Joined',
      kind: 'date',
      value: (row) => row.joinDate,
      sortDescFirst: true,
      emptyReason: 'No join date',
      cell: (row) => fmtDay(row.joinDate),
    });
    return list;
  }, [showInvitations, canInvite, invitingProfileId, inviteBusy, onInvite, vesselName, compliance]);

  const tableSort: TableSort = { columnId: SORT_COLUMN[sort], direction: dir };

  return (
    <DataTable<CrewListRow>
      label="Crew list"
      noun={NOUN}
      data={rows}
      columns={columns}
      getRowId={(row) => row.profileId}
      rowLabel={(row) => row.displayName}
      isLoading={isLoading}
      error={error}
      onRetry={onRetry}
      empty={{ title: empty.title, body: empty.body, icon: Users, action: empty.action }}
      searchPlaceholder="Search name or position"
      searchText={crewSearchText}
      search={search}
      onSearchChange={onSearchChange}
      filters={FILTERS}
      allLabel="Total"
      activeFilter={status}
      onActiveFilterChange={onStatusChange}
      sort={tableSort}
      onSortChange={(next) => {
        const mapped = COLUMN_SORT[next.columnId];
        if (mapped) onSortChange(mapped, next.direction);
      }}
      hasExternalFilters={hasExternalFilters}
      onClearFilters={onClearFilters}
      toolbar={toolbar}
      selectable={selectable}
      selectedIds={selectedIds}
      onSelectionChange={onSelectionChange}
      rowActions={rowActions}
      summary={({ shown, total, selected }) =>
        `Showing ${shown} of ${total} ${total === 1 ? NOUN.one : NOUN.other}${selected ? ` · ${selected} selected` : ''}`
      }
    />
  );
};

export default CrewTable;

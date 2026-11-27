import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Download, FileText, ListOrdered, Loader2, MoreHorizontal, RefreshCw, Upload, UserPlus } from 'lucide-react';
import PageHeader from '@/shared/components/layout/PageHeader';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AccessDenied, PageEmpty, PageError, PageLoading } from '@/shared/components/states';
import { useCan, useCapability } from '@/lib/permissions/useCan';
import { useScope } from '@/app/router/scopeContext';
import { useScopedPath } from '@/app/router/scopes';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useAdminActions } from '@/modules/auth/hooks/useAdminActions';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { useInvitationActions } from '@/modules/users-access/hooks/useInvitations';
import { accountStateOf, invitationCell } from '@/modules/users-access/lib/invitationStatus';
import { supabase } from '@/integrations/supabase/client';
import { notify } from '@/shared/lib/notify';
import { runExport, notifyExportResult, type ExportColumn } from '@/lib/export';
import { statusLabel } from '@/shared/components/status';
import { useQueryClient } from '@tanstack/react-query';
import { CREW_CAPS, CREW_ROOT } from '@/modules/crew/paths';
import { useCrew, type CrewMember } from '@/modules/crew/hooks/useCrew';
import { crewKeys } from '@/modules/crew/hooks/crewKeys';
import {
  crewInvitationCell, useCrewMemberForEdit, useCrewNumbers, useFallbackLeaveCodes, useVesselCrewList, type CrewListVessel,
} from '@/modules/crew/hooks/useVesselCrewList';
import {
  crewStatusDetailText,
  departmentOptions,
  filterByDepartment,
  fromLegacyCrew,
  localDay,
  parseCrewListParams,
  parseMovementRange,
  positionLabel,
  sortCrewRows,
  toCrewMemberStub,
  withCrewListParams,
  withCrewNumbers,
  withMovementRange,
  type CrewListParams,
  type CrewListRow,
  type MovementRange,
} from '@/modules/crew/lib/crewListModel';
import { CrewTable } from '@/modules/crew/components/crew-list/CrewTable';
import { CrewListToolbar } from '@/modules/crew/components/crew-list/CrewListToolbar';
import { CrewRowActions, type CrewRowAction, type CrewRowPermissions } from '@/modules/crew/components/crew-list/CrewRowActions';
import { CrewBulkBar } from '@/modules/crew/components/crew-list/CrewBulkBar';

// Heavy pieces load only when opened (gap/00 I6; X1 spec §3 UI).
const PositionsDrawer = lazy(() => import('@/modules/crew/components/PositionsDrawer'));
const MovementsTab = lazy(() => import('@/modules/crew/components/crew-list/MovementsTab'));
const CrewListReportDialog = lazy(() => import('@/modules/crew/components/crew-list/CrewListReportDialog'));
const ImportCrewCSVModal = lazy(() => import('@/modules/crew/components/ImportCrewCSVModal'));
const FullCrewEditModal = lazy(() => import('@/modules/crew/components/FullCrewEditModal'));
const TransferCrewModal = lazy(() => import('@/modules/crew/components/TransferCrewModal'));
const SignOffDialog = lazy(() => import('@/modules/crew/components/SignOffDialog'));
const AdminPinModal = lazy(() => import('@/modules/crew/components/AdminPinModal'));
const ResetAccountModal = lazy(() => import('@/modules/crew/components/ResetAccountModal'));
const ToggleAccessModal = lazy(() => import('@/modules/crew/components/ToggleAccessModal'));
const ReallocateVesselModal = lazy(() => import('@/modules/crew/components/ReallocateVesselModal'));

const POSITIONS_PARAM = 'positions';
const EMPTY_ROWS: CrewListRow[] = [];

/** The D-01 notice while crew_vessel_list is not applied (X1 spec X1-02 §5). */
export const BASIC_LIST_NOTICE = 'Showing the basic crew list. Movements and invitation status appear once the crew update is applied.';

/** A failed crew-number read (not a missing table): the list stands, the numbers are left out. */
export const CREW_NUMBERS_NOTICE = 'Crew numbers could not be loaded, so they are not shown or searched.';

const LOGIN_LABEL: Record<CrewListRow['loginState'], string> = { active: 'Active', pending_login: 'Pending login', disabled: 'Disabled' };

type RowDialog = { kind: Exclude<CrewRowAction, 'invite'>; row: CrewListRow } | null;
type AdminAction = 'reset' | 'toggle' | 'reallocate';

interface RouteVessel extends CrewListVessel {
  name: string;
  code: string | null;
  imo_number: string | null;
  flag_state: string | null;
  vessel_type: string | null;
  gross_tonnage: number | null;
}

/**
 * The vessel crew list (gap/04 C3, C4, C7, C8, C9, C11, C13; X1-02): one
 * list of the route vessel's crew, read on the server with one gate
 * (crew_vessel_list), the status derived per person and day, the
 * invitation state, row and bulk actions, the Movements tab and the crew
 * list report as at a day. It replaces the crew list and the crew roster.
 *
 * Gate: vessel.crew.crew_list.view on the route vessel (the route guard
 * checks it too): nothing is read while it loads, AccessDenied when
 * denied. D-01: while the server list is not applied the page shows the
 * basic list (the legacy rows of the vessel) with a notice; any other
 * error is an error with Retry.
 */
const CrewListPage: React.FC = () => {
  const scope = useScope();
  const vessel = scope.scope === 'vessel' ? scope.vessel ?? null : null;
  const gate = useCapability(CREW_CAPS.crewListView, { vesselId: vessel?.id ?? null });

  if (!vessel) {
    return <PageEmpty title="Choose a vessel" body="The crew list belongs to a vessel. Open it from a vessel's Crew tab." />;
  }
  if (gate.status === 'loading') return <PageLoading />;
  if (!gate.allowed) {
    return <AccessDenied title="You can't see this crew list" detail="Seeing a vessel's crew needs crew list access on that vessel. Ask your fleet manager for it." />;
  }
  const routeVessel: RouteVessel = {
    id: vessel.id,
    companyId: vessel.company_id,
    name: vessel.name,
    code: scope.vesselCode ?? vessel.code ?? null,
    imo_number: vessel.imo_number ?? null,
    flag_state: vessel.flag_state ?? null,
    vessel_type: vessel.vessel_type ?? null,
    gross_tonnage: vessel.gross_tonnage ?? null,
  };
  return <CrewListBody key={vessel.id} vessel={routeVessel} />;
};

const CrewListBody: React.FC<{ vessel: RouteVessel }> = ({ vessel }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { vessels } = useVessel();
  const scopedPath = useScopedPath();
  const [today] = useState(() => localDay(new Date()));
  const params = useMemo(() => parseCrewListParams(searchParams), [searchParams]);
  const range = useMemo(() => parseMovementRange(searchParams, today), [searchParams, today]);
  const setParams = useCallback(
    (patch: Partial<CrewListParams>) => setSearchParams((current) => withCrewListParams(current, patch), { replace: true }),
    [setSearchParams],
  );
  const setRange = useCallback(
    (next: MovementRange) => setSearchParams((current) => withMovementRange(current, next, today), { replace: true }),
    [setSearchParams, today],
  );
  const positionsOpen = searchParams.get(POSITIONS_PARAM) === '1';
  const setPositionsOpen = (open: boolean) =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (open) next.set(POSITIONS_PARAM, '1');
        else next.delete(POSITIONS_PARAM);
        return next;
      },
      { replace: true },
    );

  // Capabilities on this vessel (useCan fails closed while loading).
  const ctx = { vesselId: vessel.id };
  const canCreate = useCan(CREW_CAPS.profilesCreate, ctx);
  const canEdit = useCan(CREW_CAPS.profilesEdit, ctx);
  const canViewProfiles = useCan(CREW_CAPS.profilesView, ctx);
  const canAssign = useCan(CREW_CAPS.assignmentsAssign, ctx);
  const canHor = useCan(CREW_CAPS.horView, ctx);
  const canExport = useCan(CREW_CAPS.crewListExport, ctx);
  const canInvite = useCan('admin.access.users_access.assign', ctx);
  const canAccessAdmin = useCan('admin.access.users_access.admin', ctx);

  // ---------------------------------------------------------------- data
  const list = useVesselCrewList(vessel, today);
  const basic = list.status === 'fallback';
  const crew = useCrew(vessel.id, { enabled: basic });
  const legacyUserIds = useMemo(
    () => (basic ? crew.crew.filter((m) => m.current_assignment?.vessel_id === vessel.id && m.user_id).map((m) => m.user_id as string) : []),
    [basic, crew.crew, vessel.id],
  );
  const leaveCodes = useFallbackLeaveCodes(vessel.companyId, legacyUserIds, today, { enabled: basic && !crew.isLoading && !crew.error });

  const serverRows = list.status === 'ready' ? list.rows : null;
  const leaveCodeMap = leaveCodes.status === 'ready' ? leaveCodes.byUserId : null;
  const listRows = useMemo<CrewListRow[]>(() => {
    if (serverRows) return serverRows;
    if (!basic || crew.isLoading || !leaveCodeMap) return EMPTY_ROWS;
    const mapped = crew.crew
      .map((m) => fromLegacyCrew(m, { vesselId: vessel.id, today, leaveCodeByUserId: leaveCodeMap, includeEmail: canViewProfiles }))
      .filter((r): r is CrewListRow => r !== null);
    return sortCrewRows(mapped, 'rank', 'asc');
  }, [serverRows, basic, crew.isLoading, crew.crew, leaveCodeMap, vessel.id, today, canViewProfiles]);
  // Crew numbers come from their own read (D-272), for both sources; the list never waits for them.
  const profileIds = useMemo(() => listRows.map((r) => r.profileId), [listRows]);
  const crewNumbers = useCrewNumbers(vessel.companyId, vessel.id, profileIds);
  const numberMap = crewNumbers.status === 'ready' ? crewNumbers.byProfileId : null;
  const rows = useMemo<CrewListRow[]>(() => (numberMap ? withCrewNumbers(listRows, numberMap) : listRows), [listRows, numberMap]);

  const isLoading =
    list.status === 'loading' || list.status === 'idle' || (basic && (crew.isLoading || leaveCodes.status === 'loading' || leaveCodes.status === 'idle'));
  const error = list.status === 'error' ? list.error : basic ? crew.error ?? (leaveCodes.status === 'error' ? leaveCodes.error : null) : null;
  const retry = () => {
    if (list.status === 'error') list.retry();
    else if (basic) {
      void crew.refetch();
      if (leaveCodes.status === 'error') leaveCodes.retry();
    }
  };
  const refreshList = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: crewKeys.vessel(vessel.companyId, vessel.id) });
    void queryClient.invalidateQueries({ queryKey: ['crew'] });
  }, [queryClient, vessel.companyId, vessel.id]);

  const departments = useMemo(() => departmentOptions(rows), [rows]);
  const shown = useMemo(() => filterByDepartment(rows, params.dept), [rows, params.dept]);
  const vesselName = useCallback((id: string) => vessels.find((v) => v.id === id)?.name ?? null, [vessels]);

  // ---------------------------------------------------------------- selection and invitations
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  useEffect(() => {
    // Keep only people still on the list.
    setSelectedIds((current) => {
      const kept = current.filter((id) => rows.some((r) => r.profileId === id));
      return kept.length === current.length ? current : kept;
    });
  }, [rows]);
  const selectedRows = useMemo(() => rows.filter((r) => selectedIds.includes(r.profileId)), [rows, selectedIds]);
  const invitations = useInvitationActions();
  const cellFor = useCallback(
    (row: CrewListRow) => (basic ? invitationCell(accountStateOf(row.accountStatus, Boolean(row.userId)), undefined, 'table-missing') : crewInvitationCell(row)),
    [basic],
  );
  const invitableSelected = useMemo(
    () => selectedRows.filter((r) => {
      const cell = cellFor(r);
      return cell.canInvite || cell.canResend;
    }),
    [selectedRows, cellFor],
  );
  const inviteRow = useCallback(
    (row: CrewListRow) => void invitations.inviteOne({ profileId: row.profileId, name: `${row.firstName} ${row.lastName}`.trim(), email: row.email ?? '' }),
    [invitations],
  );

  // ---------------------------------------------------------------- exports
  const [exporting, setExporting] = useState(false);
  const exportRows = async (target: readonly CrewListRow[]) => {
    const columns: ExportColumn<CrewListRow>[] = [
      { key: 'name', header: 'Name', value: (r) => r.displayName },
      { key: 'preferred_name', header: 'Preferred name', value: (r) => r.preferredName },
      { key: 'position', header: 'Position', value: (r) => positionLabel(r) },
      { key: 'recorded_title', header: 'Recorded title', value: (r) => r.positionText },
      { key: 'department', header: 'Department', value: (r) => r.departmentLabel },
      { key: 'status', header: 'Status', value: (r) => statusLabel('crew_status', r.status) },
      { key: 'status_detail', header: 'Status detail', value: (r) => crewStatusDetailText(r, vesselName) },
      { key: 'joined', header: 'Joined', kind: 'date', value: (r) => r.joinDate },
      { key: 'leaves', header: 'Leaves', kind: 'date', value: (r) => r.leaveDate },
      { key: 'nationality', header: 'Nationality', value: (r) => r.nationality },
      ...(canViewProfiles ? [{ key: 'email', header: 'Email', value: (r: CrewListRow) => r.email }] : []),
      { key: 'login', header: 'Login', value: (r) => LOGIN_LABEL[r.loginState] },
      ...(!basic ? [{ key: 'invitation', header: 'Invitation', value: (r: CrewListRow) => (r.invitation ? statusLabel('invitation', r.invitation.status) : null) }] : []),
    ];
    setExporting(true);
    try {
      const result = await runExport({
        format: 'csv',
        kind: 'Crew list',
        sourceKey: 'crew.crew_roster',
        legacyUnlogged: true,
        personalData: true,
        vesselId: vessel.id,
        vesselCode: vessel.code,
        columns,
        rows: target,
        params: { as_at: today, rows: target.length, dept: params.dept, status: params.status },
      });
      notifyExportResult(result);
    } finally {
      setExporting(false);
    }
  };

  // ---------------------------------------------------------------- dialogs
  // Add crew opens its own page (X1-03B; lib/addCrewSchema ADD_CREW_PATH, kept as a literal so the
  // list's chunk does not carry the form). CrewFormModal stays only for callers outside this list.
  const navigate = useNavigate();
  const openAddCrew = () => navigate(scopedPath(`${CREW_ROOT}/new`));
  const [importOpen, setImportOpen] = useState(false);
  const [report, setReport] = useState<{ only: string[] | null } | null>(null);
  const [rowDialog, setRowDialog] = useState<RowDialog>(null);
  const [pinFor, setPinFor] = useState<{ action: AdminAction; row: CrewListRow } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const { isConfirmed } = useAdminActions();
  const editMember = useCrewMemberForEdit(vessel.companyId, rowDialog?.kind === 'edit' ? rowDialog.row.profileId : null);
  const stub = useMemo<CrewMember | null>(() => (rowDialog ? toCrewMemberStub(rowDialog.row, vessel) : null), [rowDialog, vessel]);
  useEffect(() => {
    if (rowDialog?.kind === 'edit' && editMember.error) {
      notify.error(editMember.error, { title: 'This crew member could not be opened' });
      setRowDialog(null);
    }
  }, [rowDialog, editMember.error]);

  const onRowAction = (action: CrewRowAction, row: CrewListRow) => {
    if (action === 'invite') {
      inviteRow(row);
      return;
    }
    if (action === 'reset' || action === 'toggle' || action === 'reallocate') {
      if (isConfirmed()) setRowDialog({ kind: action, row });
      else setPinFor({ action, row });
      return;
    }
    setRowDialog({ kind: action, row });
  };
  const closeRowDialog = () => setRowDialog(null);
  /** Access and vessel changes alter the list: refresh it when their dialog closes. */
  const closeAndRefresh = (open: boolean) => {
    if (open) return;
    closeRowDialog();
    refreshList();
  };

  const syncAirtable = async () => {
    setSyncing(true);
    try {
      const { data, error: syncError } = await supabase.functions.invoke('airtable-sync', { body: { action: 'two_way' } });
      if (syncError) throw syncError;
      const body = (data ?? {}) as { error?: unknown; imported?: unknown; exported?: unknown; errored?: unknown };
      if (typeof body.error === 'string') throw new Error(body.error);
      if (typeof body.imported !== 'number' || typeof body.exported !== 'number') {
        notify.warning('Airtable sync not confirmed', { description: 'The sync did not report what it changed. Check the list before syncing again.' });
      } else {
        notify.success('Airtable sync finished', {
          description: `Imported ${body.imported}, exported ${body.exported}${typeof body.errored === 'number' && body.errored > 0 ? `, ${body.errored} with errors` : ''}.`,
        });
      }
      refreshList();
    } catch (syncFailure) {
      notify.error(syncFailure, { title: 'Airtable sync failed' });
    } finally {
      setSyncing(false);
    }
  };

  const permissions: CrewRowPermissions = { hoursOfRest: canHor, assign: canAssign, edit: canEdit, invite: canInvite, accessAdmin: canAccessAdmin };
  const hoursOfRestPath = useCallback((userId: string) => scopedPath(`crew/people/${userId}/hours-of-rest`), [scopedPath]);
  const rowActions = (row: CrewListRow) => {
    const cell = cellFor(row);
    const inviteFromMenu = basic && (cell.canInvite || cell.canResend) ? { label: cell.canInvite ? ('Invite' as const) : ('Resend' as const) } : null;
    return (
      <CrewRowActions
        row={row}
        currentUserId={user?.id ?? null}
        can={permissions}
        hoursOfRestPath={hoursOfRestPath}
        inviteFromMenu={inviteFromMenu}
        onAction={onRowAction}
      />
    );
  };

  const header = (
    <PageHeader
      eyebrow={vessel.name}
      title="Crew list"
      description="Everyone on this vessel's crew today: on board, on leave, joining or transferring."
      actions={
        <>
          {canExport ? (
            <Button variant="outline" onClick={() => setReport({ only: null })} disabled={isLoading || Boolean(error)}>
              <FileText aria-hidden="true" />
              Crew list report
            </Button>
          ) : null}
          {canCreate ? (
            <Button variant="signal" onClick={openAddCrew}>
              <UserPlus aria-hidden="true" />
              Add crew
            </Button>
          ) : null}
          <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More crew list actions" data-crew-more="">
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {canCreate ? (
                  <>
                    <DropdownMenuItem onSelect={() => setImportOpen(true)}>
                      <Upload aria-hidden="true" />
                      Import CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={syncing} onSelect={() => void syncAirtable()}>
                      {syncing ? <Loader2 aria-hidden="true" className="animate-spin" /> : <RefreshCw aria-hidden="true" />}
                      {syncing ? 'Syncing Airtable…' : 'Sync Airtable'}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                ) : null}
                <DropdownMenuItem onSelect={() => setPositionsOpen(true)}>
                  <ListOrdered aria-hidden="true" />
                  Positions
                </DropdownMenuItem>
                {canExport ? (
                  <DropdownMenuItem disabled={exporting || isLoading || shown.length === 0} onSelect={() => void exportRows(shown)}>
                    <Download aria-hidden="true" />
                    Export list (CSV)
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    />
  );

  return (
    <div className="min-w-0 space-y-4" data-crew-list-source={basic ? 'basic' : list.status === 'ready' ? 'server' : list.status}>
      {header}

      {basic ? (
        <Alert variant="info" data-crew-list-notice="basic">
          <AlertDescription>{BASIC_LIST_NOTICE}</AlertDescription>
        </Alert>
      ) : null}
      {crewNumbers.status === 'error' && params.tab === 'crew' ? (
        <p role="status" className="flex flex-wrap items-center gap-x-2 gap-y-1 type-body-sm text-muted-foreground" data-crew-list-notice="crew-numbers">
          {CREW_NUMBERS_NOTICE}
          <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={crewNumbers.retry}>
            Try again
          </Button>
        </p>
      ) : null}

      <Tabs value={params.tab} onValueChange={(value) => setParams({ tab: value === 'movements' ? 'movements' : 'crew' })}>
        <TabsList aria-label="Crew list views">
          <TabsTrigger value="crew">Crew</TabsTrigger>
          <TabsTrigger value="movements">Movements</TabsTrigger>
        </TabsList>
      </Tabs>

      {params.tab === 'movements' ? (
        <Suspense fallback={<PageLoading />}>
          <MovementsTab
            vessel={vessel}
            range={range}
            onRangeChange={setRange}
            notSetUp={basic}
            listPending={list.status === 'idle' || list.status === 'loading'}
            canExport={canExport}
          />
        </Suspense>
      ) : error && !isLoading ? (
        <PageError error={error} onRetry={retry} title="The crew list could not load" treatMissingAsOff={false} />
      ) : (
        <div className="space-y-3">
          <CrewBulkBar
            selectedCount={selectedRows.length}
            invitableCount={invitableSelected.length}
            canExport={canExport}
            canInvite={canInvite}
            exporting={exporting}
            inviting={invitations.bulkPending}
            onExport={() => void exportRows(selectedRows)}
            onInvite={() => void invitations.inviteMany(invitableSelected.map((r) => r.profileId)).then(() => setSelectedIds([]))}
            onReport={() => setReport({ only: selectedRows.map((r) => r.profileId) })}
            onClear={() => setSelectedIds([])}
          />
          <CrewTable
            rows={shown}
            isLoading={isLoading}
            search={params.q}
            onSearchChange={(q) => setParams({ q })}
            status={params.status}
            onStatusChange={(status) => setParams({ status: (status as CrewListParams['status']) ?? null })}
            sort={params.sort}
            dir={params.dir}
            onSortChange={(sort, dir) => setParams({ sort, dir })}
            hasExternalFilters={params.dept !== null}
            onClearFilters={() => setParams({ dept: null, q: '', status: null })}
            toolbar={<CrewListToolbar departments={departments} department={params.dept} onDepartmentChange={(dept) => setParams({ dept })} />}
            selectable={canExport || canInvite}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            rowActions={rowActions}
            vesselName={vesselName}
            showInvitations={!basic}
            canInvite={canInvite}
            onInvite={inviteRow}
            invitingProfileId={invitations.invitingProfileId}
            inviteBusy={invitations.bulkPending}
            empty={{
              title: `No crew on ${vessel.name} yet`,
              body: 'People appear here once they are assigned to this vessel or added to its crew.',
              action: canCreate ? (
                <Button size="sm" onClick={openAddCrew}>
                  <UserPlus aria-hidden="true" />
                  Add crew
                </Button>
              ) : undefined,
            }}
          />
        </div>
      )}

      <Suspense fallback={null}>
        {positionsOpen ? (
          <PositionsDrawer open onOpenChange={setPositionsOpen} vessel={{ id: vessel.id, companyId: vessel.companyId, name: vessel.name }} />
        ) : null}
        {report ? (
          <CrewListReportDialog
            open
            onOpenChange={(open) => !open && setReport(null)}
            vessel={vessel}
            today={today}
            basicRows={basic ? rows : null}
            onlyProfileIds={report.only}
          />
        ) : null}
        {importOpen ? <ImportCrewCSVModal isOpen onClose={() => setImportOpen(false)} onSuccess={refreshList} /> : null}
        {rowDialog?.kind === 'edit' ? (
          editMember.data ? (
            <FullCrewEditModal
              isOpen
              onClose={closeRowDialog}
              crewMember={editMember.data}
              onSubmit={async (data) => {
                await crew.updateCrewMember.mutateAsync(data);
                refreshList();
              }}
              isLoading={crew.updateCrewMember.isPending}
            />
          ) : (
            <Dialog open onOpenChange={(open) => !open && closeRowDialog()}>
              <DialogContent className="max-w-sm" aria-busy="true">
                <DialogHeader>
                  <DialogTitle>Opening {rowDialog.row.displayName}</DialogTitle>
                  <DialogDescription className="inline-flex items-center gap-2">
                    <Loader2 aria-hidden="true" className="size-4 animate-spin" /> Loading the crew record…
                  </DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>
          )
        ) : null}
        {rowDialog?.kind === 'transfer' && stub ? (
          <TransferCrewModal
            isOpen
            onClose={closeRowDialog}
            crewMember={stub}
            onSubmit={async (data) => {
              await crew.transferCrew.mutateAsync(data);
              refreshList();
            }}
            isLoading={crew.transferCrew.isPending}
          />
        ) : null}
        {rowDialog?.kind === 'sign_off' && stub ? (
          <SignOffDialog
            isOpen
            onClose={closeRowDialog}
            crewMember={stub}
            onConfirm={async (data) => {
              await crew.signOffCrew.mutateAsync(data);
              refreshList();
              closeRowDialog();
            }}
            isLoading={crew.signOffCrew.isPending}
          />
        ) : null}
        {pinFor ? (
          <AdminPinModal
            open
            onOpenChange={(open) => !open && setPinFor(null)}
            onConfirmed={() => {
              setRowDialog({ kind: pinFor.action, row: pinFor.row });
              setPinFor(null);
            }}
            title="Confirm admin action"
            description="Enter your 6-digit admin PIN to continue with this account action."
          />
        ) : null}
        {rowDialog?.kind === 'reset' && stub ? <ResetAccountModal open onOpenChange={(open) => !open && closeRowDialog()} crewMember={stub} /> : null}
        {rowDialog?.kind === 'toggle' && stub ? <ToggleAccessModal open onOpenChange={closeAndRefresh} crewMember={stub} /> : null}
        {rowDialog?.kind === 'reallocate' && stub ? <ReallocateVesselModal open onOpenChange={closeAndRefresh} crewMember={stub} /> : null}
      </Suspense>
    </div>
  );
};

export default CrewListPage;

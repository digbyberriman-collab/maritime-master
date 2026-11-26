import React, { Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Info, ListChecks, Loader2, MoreHorizontal, Plus, Scale, ShieldPlus, Trash2, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MatrixGrid, MatrixToggleCell, type ChipFilter, type MatrixColumn } from '@/shared/components/data';
import { AccessDenied, EmptyState, PageEmpty, PageError, PageLoading } from '@/shared/components/states';
import { notify } from '@/shared/lib/notify';
import { useCan } from '@/lib/permissions/useCan';
import { CREW_CAPS } from '@/modules/crew/paths';
import {
  cellKey,
  complianceRefusalMessage,
  useRequirementsConfig,
  useRequirementsConfigActions,
  type RequirementsConfig,
  type RequirementsRow,
} from '@/modules/crew/hooks/useRequirementsConfig';
import { COMPLIANCE_NOT_SET_UP_NOTICE, COMPLIANCE_TABS } from '@/modules/crew/lib/compliance';
import {
  STATUS_VIEW_LABEL,
  changesToCells,
  groupLabel,
  positionGroups,
  rowSummary,
  sortConfigRows,
  sortPositions,
} from '@/modules/crew/lib/complianceModel';
import { PassengerShipToggle } from './PassengerShipToggle';
import type { ComplianceVessel } from './ComplianceStatusTab';

const AddQualificationDialog = React.lazy(() => import('./AddQualificationDialog'));
const EquivalenceDrawer = React.lazy(() => import('./EquivalenceDrawer'));

const COARSE = '[@media(pointer:coarse)]:h-11';
const NOUN = { one: 'requirement', other: 'requirements' };

/** Read-only notice for readers without crew compliance administration. */
export const CONFIG_READ_ONLY_NOTICE = "You can see this vessel's requirements. Changing them needs crew compliance administration on this vessel.";

type RowAction = { kind: 'require_all' | 'clear_all' | 'delete'; row: RequirementsRow };

/** The row header: the name, its group, "N options · held by X" and the row's actions. */
const RowHeader: React.FC<{ row: RequirementsRow; canEdit: boolean; busy: boolean; onAction: (a: RowAction) => void }> = ({ row, canEdit, busy, onAction }) => {
  const options = row.options.map((o) => o.abbreviation || o.code || o.name).filter(Boolean);
  return (
    <div className="flex min-w-0 items-start justify-between gap-1" data-requirement-row={row.id}>
      <div className="min-w-0">
        <p className="max-w-[8.5rem] truncate font-medium text-foreground sm:max-w-[16rem]" title={row.label}>
          {row.label}
        </p>
        {/* What matters first (options, held by); the group, which the order already shows, last. */}
        <p
          className="max-w-[8.5rem] truncate type-caption font-normal text-muted-foreground sm:max-w-[16rem]"
          title={`${options.join(', ')} · ${groupLabel(row.groupKey)}`}
        >
          {rowSummary(row)} · {groupLabel(row.groupKey)}
        </p>
      </div>
      {canEdit ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={busy}
              aria-label={`Actions for ${row.label}`}
              className="h-7 w-7 shrink-0 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
            >
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onSelect={() => onAction({ kind: 'require_all', row })}>
              <ListChecks aria-hidden="true" />
              Require for all positions
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAction({ kind: 'clear_all', row })}>
              <X aria-hidden="true" />
              Clear all positions
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onAction({ kind: 'delete', row })} className="text-critical focus:text-critical">
              <Trash2 aria-hidden="true" />
              Remove the requirement
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
};

/** Chips that filter the rows by the profile tab they count on. */
const TAB_FILTERS: ReadonlyArray<ChipFilter<RequirementsRow>> = COMPLIANCE_TABS.map((t) => ({
  id: t,
  label: STATUS_VIEW_LABEL[t],
  predicate: (row: RequirementsRow) => row.tab === t,
}));

const ConfigReady: React.FC<{ config: RequirementsConfig; vessel: ComplianceVessel; canEdit: boolean; canEditCompany: boolean; positionsHref: string }> = ({
  config,
  vessel,
  canEdit,
  canEditCompany,
  positionsHref,
}) => {
  const actions = useRequirementsConfigActions(config.companyId, config.vesselId);
  const [addOpen, setAddOpen] = React.useState(false);
  const [rulesOpen, setRulesOpen] = React.useState(false);
  const [pending, setPending] = React.useState<RowAction | null>(null);
  const [busyRow, setBusyRow] = React.useState<string | null>(null);
  const [stcwConfirm, setStcwConfirm] = React.useState(false);

  const rows = React.useMemo(() => sortConfigRows(config.rows), [config.rows]);
  const positions = React.useMemo(() => sortPositions(config.positions), [config.positions]);
  const columns = React.useMemo<MatrixColumn[]>(
    () =>
      positions.map((p) => ({
        id: p.positionId,
        label: p.name,
        sublabel: p.isListed ? undefined : 'Not listed',
        // The cells' accessible context ("Personal survival techniques, Bosun"); the group header names the department.
        title: p.isListed ? p.name : `${p.name} (not listed on the vessel)`,
        group: p.departmentKey,
        width: 96,
      })),
    [positions],
  );
  const groups = React.useMemo(() => positionGroups(positions), [positions]);

  const runRowAction = async (a: RowAction) => {
    setPending(null);
    setBusyRow(a.row.id);
    try {
      if (a.kind === 'delete') {
        await actions.deleteRow.mutateAsync({ vesselId: config.vesselId, rowId: a.row.id });
        notify.success(`${a.row.label} removed`);
      } else {
        const ticks = await actions.bulkRow.mutateAsync({ vesselId: config.vesselId, rowId: a.row.id, action: a.kind });
        notify.success(a.kind === 'clear_all' ? `${a.row.label}: every tick cleared` : `${a.row.label}: required for ${ticks} positions`);
      }
    } catch (error) {
      notify.error(complianceRefusalMessage(error), { title: a.kind === 'delete' ? 'The requirement was not removed' : 'The positions were not changed' });
    } finally {
      setBusyRow(null);
    }
  };

  const addStcw = async () => {
    setStcwConfirm(false);
    try {
      const added = await actions.addStcwBasic.mutateAsync(config.vesselId);
      notify.success('STCW basic set added', {
        description:
          added.rows_added === 0 && added.cells_added === 0
            ? 'Every listed position already required the four basic safety certificates.'
            : `${added.rows_added} requirements added, ${added.cells_added} position ticks set.`,
      });
    } catch (error) {
      notify.error(complianceRefusalMessage(error), { title: 'The STCW basic set was not added' });
    }
  };

  const toolbarActions = (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => setRulesOpen(true)} className={COARSE} data-open-equivalences="">
        <Scale aria-hidden="true" />
        Equivalences
      </Button>
      {canEdit ? (
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => setStcwConfirm(true)} disabled={actions.addStcwBasic.isPending} className={COARSE}>
            {actions.addStcwBasic.isPending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <ShieldPlus aria-hidden="true" />}
            Add STCW basic set
          </Button>
          <Button type="button" size="sm" onClick={() => setAddOpen(true)} className={COARSE} data-add-requirement="">
            <Plus aria-hidden="true" />
            Add requirement
          </Button>
        </>
      ) : null}
    </div>
  );

  let matrix: React.ReactNode;
  if (positions.length === 0) {
    matrix = (
      <PageEmpty
        bordered
        headingLevel={3}
        title="No positions on this vessel yet"
        body="Requirements are ticked per position. List the vessel's positions first, from the crew list's Positions."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to={positionsHref}>Open positions</Link>
          </Button>
        }
      />
    );
  } else if (rows.length === 0) {
    matrix = (
      <EmptyState
        bordered
        headingLevel={3}
        title="No requirements yet"
        body={
          canEdit
            ? 'Start with the four STCW basic safety certificates for every position, or add a requirement of your own.'
            : 'No requirements are set for this vessel yet.'
        }
        action={
          canEdit ? (
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" variant="outline" onClick={() => setStcwConfirm(true)} className={COARSE}>
                <ShieldPlus aria-hidden="true" />
                Add STCW basic set
              </Button>
              <Button type="button" onClick={() => setAddOpen(true)} className={COARSE}>
                <Plus aria-hidden="true" />
                Add requirement
              </Button>
            </div>
          ) : undefined
        }
      />
    );
  } else {
    matrix = (
      <MatrixGrid<RequirementsRow, boolean>
        label="Required qualifications"
        noun={NOUN}
        rows={rows}
        getRowId={(r) => r.id}
        rowLabel={(r) => r.label}
        renderRowHeader={(r) => <RowHeader row={r} canEdit={canEdit} busy={busyRow === r.id} onAction={setPending} />}
        rowHeader="Requirement"
        columns={columns}
        groups={groups}
        labelMode="wrap"
        getValue={(r, c) => config.ticked.has(cellKey(r.id, c.id))}
        renderCell={(context) => <MatrixToggleCell context={context} />}
        editable={canEdit}
        onSave={
          canEdit
            ? async (changes) => {
                const cells = changesToCells(changes);
                if (cells.length === 0) return;
                try {
                  await actions.setCells.mutateAsync({ vesselId: config.vesselId, cells });
                } catch (error) {
                  // MatrixGrid keeps the edits staged and shows this sentence in its review dialog.
                  throw new Error(complianceRefusalMessage(error));
                }
              }
            : undefined
        }
        formatValue={(v) => (v ? 'Required' : 'Not required')}
        searchPlaceholder="Search requirements"
        filters={TAB_FILTERS}
        allLabel="All"
        legend={
          <span className="inline-flex items-center gap-1.5">
            Ticked: the position must hold it. Any one option of a requirement satisfies it.
          </span>
        }
      />
    );
  }

  return (
    <div className="min-w-0 space-y-4" data-compliance-config={canEdit ? 'edit' : 'read-only'}>
      {!canEdit ? (
        <Alert variant="info" data-config-notice="read-only">
          <Info aria-hidden="true" className="size-4" />
          <AlertDescription>{CONFIG_READ_ONLY_NOTICE}</AlertDescription>
        </Alert>
      ) : null}
      <PassengerShipToggle companyId={config.companyId} vesselId={config.vesselId} vesselName={vessel.name} settings={config.settings} canEdit={canEdit} />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="type-subtitle text-foreground">Required qualifications</h2>
        {toolbarActions}
      </div>
      {matrix}

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.kind === 'delete'
                ? `Remove ${pending.row.label}?`
                : pending?.kind === 'clear_all'
                  ? `Clear every position for ${pending.row.label}?`
                  : `Require ${pending?.row.label ?? 'it'} for every position?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.kind === 'delete'
                ? 'The requirement, its options and its ticks are removed from this vessel. Documents already held stay on the profiles.'
                : pending?.kind === 'clear_all'
                  ? 'No position on this vessel will require it any more. The requirement and its options stay.'
                  : 'Every position listed on this vessel will require it.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pending && void runRowAction(pending)}>
              {pending?.kind === 'delete' ? 'Remove' : pending?.kind === 'clear_all' ? 'Clear all' : 'Require all'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={stcwConfirm} onOpenChange={setStcwConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add the STCW basic set?</AlertDialogTitle>
            <AlertDialogDescription>
              Personal survival techniques, fire prevention and fire fighting, elementary first aid, and personal safety and social
              responsibilities, required for every listed position. A requirement already there is not added twice.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void addStcw()}>Add the set</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Suspense fallback={null}>
        {addOpen ? <AddQualificationDialog config={config} vesselName={vessel.name} onOpenChange={setAddOpen} /> : null}
        {rulesOpen ? <EquivalenceDrawer companyId={config.companyId} vesselId={config.vesselId} canEdit={canEditCompany} onOpenChange={setRulesOpen} /> : null}
      </Suspense>
    </div>
  );
};

/**
 * The Configuration tab of Crew Compliance (gap/04 C33, C34, C13, W5 §1):
 * the vessel's requirements (rows, grouped) by its positions (columns, by
 * department) with ticks; each row shows its options and who holds it, and
 * offers Require for all / Clear all / Remove. Ticks are staged and saved
 * together after Review & save (crew_requirement_cell_set, which must
 * confirm every cell). Add requirement, Add STCW basic set, the
 * equivalence rules, Passenger ship and the crew settings sit around it.
 *
 * Edits need crew_compliance.admin on the vessel: the server's answer
 * (can_admin) and useCan both; otherwise everything reads, with a notice.
 * D-01: not applied, PageEmpty; a refusal, AccessDenied; any other error,
 * an error with Retry.
 */
export const ComplianceConfigTab: React.FC<{ vessel: ComplianceVessel; positionsHref: string }> = ({ vessel, positionsHref }) => {
  const config = useRequirementsConfig(vessel.id, { companyId: vessel.companyId });
  const canAdmin = useCan(CREW_CAPS.complianceAdmin, { vesselId: vessel.id });
  const canAdminCompany = useCan(CREW_CAPS.complianceAdmin);

  if (config.status === 'idle' || config.status === 'loading') return <PageLoading variant="list" rows={6} label="Loading the configuration" />;
  if (config.status === 'not_set_up') {
    return <PageEmpty icon={ShieldPlus} title="Crew compliance is not set up yet" body={COMPLIANCE_NOT_SET_UP_NOTICE} data-compliance-state="not-set-up" />;
  }
  if (config.status === 'denied') {
    return <AccessDenied title="You can't see this vessel's requirements" detail={config.notice} backTo={null} headingLevel={2} />;
  }
  if (config.status === 'error') {
    return <PageError error={config.error} onRetry={config.retry} title="The configuration could not load" treatMissingAsOff={false} headingLevel={2} />;
  }
  return (
    <ConfigReady
      config={config.config}
      vessel={vessel}
      canEdit={config.config.canAdmin && canAdmin}
      canEditCompany={config.config.canAdminCompany && canAdminCompany}
      positionsHref={positionsHref}
    />
  );
};

export default ComplianceConfigTab;

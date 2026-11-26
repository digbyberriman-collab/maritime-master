/**
 * Vessel › Crew › Crew Training (`/v/:vesselCode/crew/training`; gap/04
 * C62; gap/02 W3; D-X1-7; X5 spec X5-07B). The training register of this
 * vessel's crew: who, which course, when, what it costs and where each
 * application stands, for the scope's vessel only (the vessel comes from
 * the URL, never a name filter).
 *
 * - Gate: `vessel.crew.crew_training.view` on this vessel (the route guard
 *   uses the same key); nothing is read while it loads and denied is
 *   AccessDenied. The leaf is hidden where the vessel's `crew_training`
 *   module setting is off.
 * - Phase chips (upcoming, in progress, completed, not scheduled), a
 *   status filter and search; a DataTable from 768 px, cards below.
 * - A row opens the application. The steps offered are the ones the
 *   viewer's capabilities on this vessel suggest (head of department's
 *   approve, the final approval, the fleet training parts); the server
 *   checks the office and refuses in words. `?application=<id>` opens one
 *   from a notification.
 * - Export (CSV / Excel) of the rows shown, vessel-scoped and logged
 *   first (personal data, D-X5-12), with `vessel.crew.crew_training.export`.
 * - "Manage courses" opens Fleet › Training › Catalogue for readers with
 *   fleet reach and fleet training access.
 *
 * Drafts stay with the applicant and voided applications are left out
 * (TR6). D-01: reads only live columns (the stage start apart); errors
 * are PageError with Retry, never sample rows.
 */
import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookOpen, GraduationCap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNavAccess } from '@/app/nav/navAccess';
import { useVesselScope } from '@/app/router/scopes';
import { runExport } from '@/lib/export';
import { useCan, useCapability } from '@/lib/permissions/useCan';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { CountChips, DataTable, SearchField, type DataTableFilter } from '@/shared/components/data';
import { ExportMenu } from '@/shared/components/data/ExportMenu';
import { TABLET_MIN_WIDTH, useMinWidth } from '@/shared/components/data/useMinWidth';
import PageHeader from '@/shared/components/layout/PageHeader';
import { AccessDenied, EmptyState, PageEmpty, PageError, PageLoading } from '@/shared/components/states';
import { useQueryClient } from '@tanstack/react-query';
import ApplicationDetailModal from '../components/ApplicationDetailModal';
import { registerColumns, registerExportColumns, type RegisterContext } from '../components/training/registerColumns';
import { RegisterCards } from '../components/training/RegisterCards';
import {
  STATUS_GROUPS,
  STATUS_GROUP_LABELS,
  STATUS_GROUP_STATUSES,
  TRAINING_PHASES,
  TRAINING_PHASE_LABELS as PHASE_LABELS,
  byStartDateDesc,
  crewName,
  plural,
  todayLocal,
  trainingPhase,
  type FleetApplicationRow,
  type StatusGroup,
  type TrainingPhase,
} from '../components/training/fleetTrainingModel';
import { COARSE, FreshnessActions } from '../components/training/TrainingParts';
import { useTrainingRegister } from '../components/training/useFleetTrainingData';
import { useCategoryLabels, usePolicyExtras } from '../hooks/useProgramSettings';
import { isFinalStage, isHodStage, pendingFinalApprovers, type ApplicationActor, type FinalApprovalMode } from '../lib/applicationMachine';
import { TRAINING_CAPS, TRAINING_REGISTER_PARAMS, VESSEL_CREW_TRAINING_CAPS, fleetTrainingPath } from '../paths';

const ALL = '__all__';

const CrewTraining: React.FC = () => {
  const scope = useVesselScope();
  const vesselId = scope?.vessel.id ?? null;
  const access = useCapability(VESSEL_CREW_TRAINING_CAPS.view, { vesselId });
  if (!scope) {
    return <EmptyState title="Choose a vessel" body="Crew training is shown for one vessel. Pick a vessel in the switcher at the top." headingLevel={1} bordered />;
  }
  if (access.status === 'loading') return <PageLoading variant="list" label="Loading crew training" />;
  if (!access.allowed) {
    return <AccessDenied detail="Crew training needs access to this vessel's crew training. If you think you should see it, ask your account admin." />;
  }
  return <CrewTrainingBody vesselId={scope.vessel.id} vesselName={scope.vessel.name} vesselCode={scope.code} />;
};

export default CrewTraining;

/** The parts the viewer may play on one application here, as far as their capabilities on the vessel say (the server decides). */
function rolesFor(
  row: FleetApplicationRow,
  caps: { approve: boolean; finalApprove: boolean; trainingAdmin: boolean; trainingEdit: boolean },
  mode: FinalApprovalMode,
): ApplicationActor[] {
  const roles: ApplicationActor[] = [];
  if (caps.approve && isHodStage(row.status)) roles.push('hod');
  if (caps.finalApprove && isFinalStage(row.status)) {
    const pending = pendingFinalApprovers(mode, row);
    if (pending[0]) roles.push(pending[0]);
  }
  if (caps.trainingAdmin) roles.push('training_admin');
  if (caps.trainingEdit || caps.trainingAdmin) roles.push('training_editor');
  return roles;
}

function CrewTrainingBody({ vesselId, vesselName, vesselCode }: { vesselId: string; vesselName: string; vesselCode: string }) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const queryClient = useQueryClient();
  const wide = useMinWidth(TABLET_MIN_WIDTH);
  const [params, setParams] = useSearchParams();
  const today = todayLocal();
  const labels = useCategoryLabels();
  const extras = usePolicyExtras();
  const mode = extras.data?.final_approval_mode ?? 'both';
  const nav = useNavAccess();

  const caps = {
    approve: useCan(VESSEL_CREW_TRAINING_CAPS.approve, { vesselId }),
    finalApprove: useCan(VESSEL_CREW_TRAINING_CAPS.finalApprove, { vesselId }),
    trainingAdmin: useCan(TRAINING_CAPS.admin),
    trainingEdit: useCan(TRAINING_CAPS.edit),
  };
  const canExport = useCan(VESSEL_CREW_TRAINING_CAPS.export, { vesselId });
  const canOpenFleet = useCan(TRAINING_CAPS.view) && nav.fleetReach;

  const register = useTrainingRegister(companyId, vesselId);
  const [search, setSearch] = useState('');
  const [phase, setPhase] = useState<TrainingPhase | null>(null);
  const [group, setGroup] = useState<StatusGroup | null>(null);

  const ctx = useMemo<RegisterContext>(() => ({ showVessel: false, vesselName: () => vesselName, categoryLabels: labels, mode, today }), [vesselName, labels, mode, today]);
  const columns = useMemo(() => registerColumns(ctx), [ctx]);
  const rows = useMemo(() => (register.status === 'ready' ? register.rows : []), [register]);
  const byGroup = useMemo(
    () => (group ? rows.filter((r) => (STATUS_GROUP_STATUSES[group] as readonly string[]).includes(r.status)) : rows),
    [rows, group],
  );
  const phaseFilters = useMemo<DataTableFilter<FleetApplicationRow>[]>(
    () => TRAINING_PHASES.map((p) => ({ id: p, label: PHASE_LABELS[p], predicate: (r) => trainingPhase(r, today) === p })),
    [today],
  );
  const q = search.trim().toLowerCase();
  const narrowRows = byGroup.filter(
    (r) =>
      (!phase || trainingPhase(r, today) === phase) &&
      (!q || [r.course_name, r.application_number, r.course_provider, crewName(r.crew_member), r.crew_member?.department].some((v) => v?.toLowerCase().includes(q))),
  );

  const openId = params.get(TRAINING_REGISTER_PARAMS.application);
  const setOpenId = (id: string | null) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (id) next.set(TRAINING_REGISTER_PARAMS.application, id);
        else next.delete(TRAINING_REGISTER_PARAMS.application);
        return next;
      },
      { replace: true },
    );
  const opened = openId ? rows.find((r) => r.id === openId) ?? null : null;
  const viewerRoles = opened ? rolesFor(opened, caps, mode) : [];

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['crew-training-all', companyId] });
    void queryClient.invalidateQueries({ queryKey: ['development-application-lifecycle', companyId] });
  };

  const header = (
    <PageHeader
      eyebrow={vesselName}
      title="Crew training"
      description="Training applications of this vessel's crew: the course, when it runs, what it costs and where each one stands."
      actions={
        <>
          <FreshnessActions
            updatedAt={register.status === 'ready' ? register.updatedAt : null}
            refreshing={register.status === 'ready' && register.refreshing}
            onRefresh={refresh}
            testId="crew-training-updated"
          />
          {canOpenFleet ? (
            <Button asChild variant="outline" size="sm" className={COARSE}>
              <Link to={fleetTrainingPath('catalogue')}>
                <BookOpen aria-hidden="true" className="h-4 w-4" />
                Manage courses
              </Link>
            </Button>
          ) : null}
        </>
      }
    />
  );

  if (register.status === 'loading') {
    return (
      <div className="space-y-4">
        {header}
        <PageLoading variant="list" rows={8} label="Loading crew training" />
      </div>
    );
  }
  if (register.status === 'error') {
    return (
      <div className="space-y-4">
        {header}
        <PageError error={register.error} title="This vessel's training applications could not be loaded" onRetry={register.retry} treatMissingAsOff={false} />
      </div>
    );
  }

  const shownRows = wide ? byGroup : narrowRows;
  const exportMenu = (exportRows: readonly FleetApplicationRow[]) => (
    <ExportMenu
      formats={['csv', 'xlsx']}
      disabledReason={!canExport ? 'Exporting needs crew training export access on this vessel' : exportRows.length === 0 ? 'Nothing to export with these filters' : null}
      onExport={(format) =>
        runExport({
          format,
          kind: 'Crew training',
          sourceKey: 'development.vessel_crew_training',
          personalData: true,
          vesselId,
          vesselCode,
          columns: registerExportColumns(ctx),
          rows: exportRows,
          params: { status: group, phase, searched: Boolean(q) },
        })
      }
    />
  );

  const statusSelect = (
    <div className="flex items-center gap-2">
      <Label htmlFor="crew-training-status" className="type-caption shrink-0 text-muted-foreground">
        Status
      </Label>
      <Select value={group ?? ALL} onValueChange={(v) => setGroup(v === ALL ? null : (v as StatusGroup))}>
        <SelectTrigger id="crew-training-status" className={`h-9 w-full sm:w-52 ${COARSE}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Any status</SelectItem>
          {STATUS_GROUPS.map((g) => (
            <SelectItem key={g} value={g}>
              {STATUS_GROUP_LABELS[g]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-4">
      {header}
      {rows.length === 0 ? (
        <PageEmpty
          icon={GraduationCap}
          title="No training applications on this vessel yet"
          body="Applications appear here once this vessel's crew submit them. Drafts stay with the crew member until they are submitted."
          headingLevel={2}
          bordered
        />
      ) : wide ? (
        <DataTable
          label={`Crew training on ${vesselName}`}
          noun={{ one: 'application', other: 'applications' }}
          data={shownRows}
          columns={columns}
          getRowId={(r) => r.id}
          rowLabel={(r) => `${r.course_name}, ${crewName(r.crew_member)}`}
          onRowClick={(r) => setOpenId(r.id)}
          filters={phaseFilters}
          allLabel="All"
          searchPlaceholder="Search crew, course or number"
          toolbar={statusSelect}
          toolbarEnd={({ rows: visible }) => exportMenu(visible)}
          hasExternalFilters={group !== null}
          onClearFilters={() => setGroup(null)}
          defaultSort={{ columnId: 'dates', direction: 'desc' }}
          maxHeight="70vh"
        />
      ) : (
        <div className="space-y-3">
          <SearchField value={search} onChange={setSearch} placeholder="Search crew, course or number" className="sm:w-full" />
          <CountChips
            label="Phase"
            chips={[
              { id: ALL, label: 'All', count: byGroup.length },
              ...TRAINING_PHASES.map((p) => ({ id: p, label: PHASE_LABELS[p], count: byGroup.filter((r) => trainingPhase(r, today) === p).length })),
            ]}
            activeId={phase ?? ALL}
            onChange={(id) => setPhase(id === ALL ? null : (id as TrainingPhase))}
          />
          {statusSelect}
          <div className="flex items-center justify-between gap-2">
            <span className="type-caption text-muted-foreground">
              {plural(narrowRows.length, 'application')} of {rows.length.toLocaleString('en-GB')}
            </span>
            {exportMenu(narrowRows)}
          </div>
          {narrowRows.length === 0 ? (
            <PageEmpty
              filtered
              onClearFilters={() => {
                setSearch('');
                setPhase(null);
                setGroup(null);
              }}
              title="No applications match these filters"
              headingLevel={2}
              bordered
            />
          ) : (
            <RegisterCards rows={byStartDateDesc(narrowRows)} ctx={ctx} onOpen={(r) => setOpenId(r.id)} label={`Crew training on ${vesselName}`} />
          )}
        </div>
      )}
      <ApplicationDetailModal open={Boolean(opened)} onOpenChange={(next) => !next && setOpenId(null)} application={opened} viewerRoles={viewerRoles} />
    </div>
  );
}

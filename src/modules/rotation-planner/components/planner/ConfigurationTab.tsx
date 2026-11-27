import React from 'react';
import { Link } from 'react-router-dom';
import { Info, Loader2, Lock, UsersRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PageEmpty, PageError } from '@/shared/components/states';
import { StatusPill } from '@/shared/components/status';
import { notify } from '@/shared/lib/notify';
import { useScopedPath } from '@/app/router/scopes';
import { Segmented } from '@/modules/crew/components/compliance/Segmented';
import { usePositions, useSaveVesselPositions } from '@/modules/crew/hooks/usePositions';
import { groupByDepartment, manningProblem, parseCount, positionRefusalMessage, rankSort } from '@/modules/crew/lib/positions';
import type { VesselPosition } from '@/modules/crew/types/domain';
import type { CrewPositionSaveRow } from '@/modules/crew/types/db.pending';
import type { LeaveType } from '../../lib/leaveTypes';
import { manningBand, type ManningBand } from '../../lib/manning';
import { PlannerRefusalError, type LeaveHodStep } from '../../lib/periods';
import { useManningByDay } from '../../hooks/useManningByDay';
import { useLeaveRequestMutations, useLeaveSettings } from '../../hooks/useLeaveRequests';
import { LeaveLegend } from './LeaveLegend';
import type { PlannerAccess, PlannerVessel } from './usePlannerContext';

const COARSE = '[@media(pointer:coarse)]:h-11';

/** Staged min / max text per position (what the inputs hold). */
type Staged = Record<string, { min: string; max: string }>;

/** The read only notice without crew_compliance.admin. */
export const MANNING_READ_ONLY = 'Changing the manning needs crew compliance administration on this vessel.';

const HOD_STEP_TEXT: Readonly<Record<LeaveHodStep, string>> = {
  off: 'Leave approvers decide requests directly.',
  nudge: 'The head of department may review a request first; approvers can decide without it.',
  required: 'The head of department reviews every request before an approver decides it (the Master and fleet office may decide first).',
};

export interface ConfigurationTabProps {
  vessel: PlannerVessel;
  access: PlannerAccess;
  types: readonly LeaveType[];
  today: string;
}

/**
 * Planner configuration (gap/04 C49, C51, C52; X1-09B): Position manning,
 * "Required on board" and an optional maximum per position grouped by
 * department (position_manning through crew_vessel_positions_save, the same
 * store as the crew list's positions drawer), with the positions nobody is
 * aboard for listed apart; the vessel's leave approval step (crew_leave_settings,
 * for leave approvers); and the leave types' legend.
 *
 * Manning edits need crew_compliance.admin (the RPC's gate); the step needs
 * leave approval. Without them each section is read only, with a notice.
 * D-01: positions not set up shows PageEmpty with a pointer to the crew list.
 */
export const ConfigurationTab: React.FC<ConfigurationTabProps> = ({ vessel, access, types, today }) => {
  const positions = usePositions(vessel);
  const manning = useManningByDay(vessel, today, today);
  const save = useSaveVesselPositions(vessel);
  const [staged, setStaged] = React.useState<Staged>({});
  const scopedPath = useScopedPath();

  const aboardToday = React.useMemo(() => {
    const map = new Map<string, { aboard: number; qualified: number }>();
    if (manning.status === 'ready') for (const r of manning.rows) if (r.positionId) map.set(r.positionId, { aboard: r.aboard, qualified: r.qualified });
    return map;
  }, [manning]);

  if (positions.status === 'not-set-up') {
    return <PageEmpty title="Positions are not set up yet" body="Position manning arrives with the crew positions update. Until then the planner has no minimums to check against." />;
  }
  if (positions.status === 'error') {
    return <PageError error={positions.error} onRetry={positions.retry} title="The positions could not load" treatMissingAsOff={false} headingLevel={2} />;
  }

  const listed = positions.status === 'ready' ? positions.positions.filter((p) => p.isListed).sort(rankSort) : [];
  const aboardOf = (p: VesselPosition) => aboardToday.get(p.positionId)?.aboard ?? p.holderCount;
  const withCrew = listed.filter((p) => aboardOf(p) > 0);
  const nobody = listed.filter((p) => aboardOf(p) === 0);

  const valueOf = (p: VesselPosition) => staged[p.positionId] ?? { min: String(p.minOnBoard), max: p.maxOnBoard === null ? '' : String(p.maxOnBoard) };
  const problemOf = (p: VesselPosition): string | null => {
    const v = valueOf(p);
    const min = parseCount(v.min);
    const max = parseCount(v.max);
    if (min === null) return 'Give a minimum (0 for none).';
    if (Number.isNaN(min) || Number.isNaN(max ?? 0)) return 'Use whole numbers.';
    return manningProblem(min, max);
  };
  const changed = listed.filter((p) => {
    const v = staged[p.positionId];
    if (!v) return false;
    return parseCount(v.min) !== p.minOnBoard || parseCount(v.max) !== p.maxOnBoard;
  });
  const problems = changed.filter((p) => problemOf(p) !== null);

  const onSave = async () => {
    if (problems.length > 0) return;
    const rows: CrewPositionSaveRow[] = changed.map((p) => ({
      position_id: p.positionId,
      sort_order: p.sortOrder,
      is_listed: true,
      min_on_board: parseCount(valueOf(p).min) ?? 0,
      max_on_board: parseCount(valueOf(p).max),
    }));
    try {
      await save.mutateAsync(rows);
      setStaged({});
      notify.success('Manning saved', { description: `${rows.length} ${rows.length === 1 ? 'position' : 'positions'} updated.` });
    } catch (error) {
      notify.error(error, { title: 'The manning was not saved', fallback: positionRefusalMessage(error) });
    }
  };

  const editable = access.canAdminManning;

  return (
    <div className="min-w-0 space-y-4" data-planner-tab="configuration">
      <Card data-planner-config="manning">
        <CardHeader className="space-y-1">
          <CardTitle className="type-subtitle">Position manning</CardTitle>
          <CardDescription>
            How many people each position needs on board, and an optional maximum. The planner and the manning grid band each day against it; qualified counts the crew compliance of the
            position.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!editable ? (
            <Alert variant="info" data-planner-config-readonly="">
              <Lock aria-hidden="true" className="size-4" />
              <AlertDescription>{MANNING_READ_ONLY}</AlertDescription>
            </Alert>
          ) : null}
          {positions.status !== 'ready' ? (
            <div className="space-y-2" aria-busy="true" aria-label="Loading the positions">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : listed.length === 0 ? (
            <p className="type-body text-muted-foreground">
              No positions are listed on this vessel yet.{' '}
              <Link className="font-medium text-primary underline-offset-4 hover:underline" to={`${scopedPath('crew/list')}?positions=1`}>
                Open the positions list
              </Link>
            </p>
          ) : (
            <>
              <ManningGroups title={null} positions={withCrew} valueOf={valueOf} problemOf={problemOf} aboardOf={aboardOf} aboardToday={aboardToday} editable={editable} onChange={(id, v) => setStaged((s) => ({ ...s, [id]: v }))} />
              {nobody.length > 0 ? (
                <div className="space-y-2" data-planner-config="nobody-aboard">
                  <h3 className="flex items-center gap-2 type-eyebrow text-muted-foreground">
                    <UsersRound aria-hidden="true" className="size-3.5" />
                    Nobody aboard ({nobody.length})
                  </h3>
                  <ManningGroups title="nobody" positions={nobody} valueOf={valueOf} problemOf={problemOf} aboardOf={aboardOf} aboardToday={aboardToday} editable={editable} onChange={(id, v) => setStaged((s) => ({ ...s, [id]: v }))} />
                </div>
              ) : null}
              {editable ? (
                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
                  {changed.length > 0 ? <span className="mr-auto type-caption text-muted-foreground">{`${changed.length} unsaved ${changed.length === 1 ? 'change' : 'changes'}`}</span> : null}
                  <Button type="button" variant="outline" size="sm" className={COARSE} disabled={changed.length === 0 || save.isPending} onClick={() => setStaged({})}>
                    Discard
                  </Button>
                  <Button type="button" size="sm" className={COARSE} disabled={changed.length === 0 || problems.length > 0 || save.isPending} onClick={() => void onSave()}>
                    {save.isPending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
                    Save manning
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <HodStepCard vessel={vessel} canApproveLeave={access.canApproveLeave} />

      <Card data-planner-config="legend">
        <CardHeader className="space-y-1">
          <CardTitle className="type-subtitle">Leave types</CardTitle>
          <CardDescription>The one list the planner, Add leave, requests and the day codes share.</CardDescription>
        </CardHeader>
        <CardContent>
          <LeaveLegend types={types} detailed />
        </CardContent>
      </Card>
    </div>
  );
};

const ManningGroups: React.FC<{
  title: string | null;
  positions: readonly VesselPosition[];
  valueOf: (p: VesselPosition) => { min: string; max: string };
  problemOf: (p: VesselPosition) => string | null;
  aboardOf: (p: VesselPosition) => number;
  aboardToday: ReadonlyMap<string, { aboard: number; qualified: number }>;
  editable: boolean;
  onChange: (positionId: string, value: { min: string; max: string }) => void;
}> = ({ title, positions, valueOf, problemOf, aboardOf, aboardToday, editable, onChange }) => (
  <div className="space-y-4">
    {groupByDepartment(positions).map((g) => (
      <section key={`${title ?? 'crew'}:${g.departmentKey}`} aria-label={g.departmentLabel} className="space-y-1.5">
        {title === null ? <h3 className="type-eyebrow text-muted-foreground">{g.departmentLabel}</h3> : <h4 className="type-caption font-medium text-muted-foreground">{g.departmentLabel}</h4>}
        <ul className="divide-y divide-border rounded-md border border-border">
          {g.positions.map((p) => {
            const v = valueOf(p);
            const problem = problemOf(p);
            const today = aboardToday.get(p.positionId);
            const min = parseCount(v.min);
            const max = parseCount(v.max);
            const band: ManningBand | null =
              today && min !== null && !Number.isNaN(min) && (max === null || !Number.isNaN(max)) && (min > 0 || max !== null) ? manningBand(today.aboard, today.qualified, min, max) : null;
            return (
              <li key={p.positionId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2" data-manning-position={p.positionId}>
                <div className="min-w-[10rem] flex-1">
                  <p className="truncate type-body font-medium text-foreground">{p.name}</p>
                  <p className="type-caption text-muted-foreground">
                    {today ? `${today.qualified} qualified of ${today.aboard} aboard today` : `${aboardOf(p)} on the crew`}
                  </p>
                </div>
                {band ? <StatusPill domain="manning_band" status={band} /> : null}
                <div className="grid w-full grid-cols-2 gap-3 sm:flex sm:w-auto sm:items-center sm:gap-4">
                  <label className="flex flex-col gap-1 type-caption text-muted-foreground sm:flex-row sm:items-center sm:gap-2">
                    Required on board
                    <Input
                      inputMode="numeric"
                      className={cn('h-9 w-full text-right tabular-nums sm:w-16', COARSE)}
                      value={v.min}
                      disabled={!editable}
                      aria-invalid={problem !== null}
                      aria-label={`Required on board: ${p.name}`}
                      onChange={(e) => onChange(p.positionId, { ...v, min: e.target.value })}
                    />
                  </label>
                  <label className="flex flex-col gap-1 type-caption text-muted-foreground sm:flex-row sm:items-center sm:gap-2">
                    Maximum
                    <Input
                      inputMode="numeric"
                      placeholder="None"
                      className={cn('h-9 w-full text-right tabular-nums sm:w-16', COARSE)}
                      value={v.max}
                      disabled={!editable}
                      aria-invalid={problem !== null}
                      aria-label={`Maximum on board: ${p.name}`}
                      onChange={(e) => onChange(p.positionId, { ...v, max: e.target.value })}
                    />
                  </label>
                </div>
                {problem ? (
                  <p className="basis-full type-caption text-critical" role="alert">
                    {problem}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    ))}
  </div>
);

const HodStepCard: React.FC<{ vessel: PlannerVessel; canApproveLeave: boolean }> = ({ vessel, canApproveLeave }) => {
  const settings = useLeaveSettings(vessel);
  const mutations = useLeaveRequestMutations(vessel);
  const current: LeaveHodStep = settings.status === 'ready' ? settings.hodStep : 'nudge';
  const onChange = async (step: LeaveHodStep) => {
    if (step === current) return;
    try {
      await mutations.saveSettings.mutateAsync(step);
      notify.success('Leave approval step saved');
    } catch (error) {
      notify.error(error, { title: 'The leave approval step was not saved', fallback: error instanceof PlannerRefusalError ? error.message : undefined });
    }
  };
  return (
    <Card data-planner-config="hod-step">
      <CardHeader className="space-y-1">
        <CardTitle className="type-subtitle">Leave approval</CardTitle>
        <CardDescription>Whether the head of the crew member&rsquo;s department reviews a leave request before it is decided.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {settings.status === 'error' ? (
          <PageError variant="inline" error={settings.error} onRetry={settings.retry} title="The leave approval step could not load" treatMissingAsOff={false} />
        ) : settings.status === 'not_set_up' ? (
          <p className="type-body text-muted-foreground">The approval step arrives with the planner update.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              {canApproveLeave ? (
                <Segmented
                  label="Head of department review"
                  value={current}
                  onChange={(v) => void onChange(v)}
                  options={[
                    { value: 'off', label: 'Off' },
                    { value: 'nudge', label: 'Optional' },
                    { value: 'required', label: 'Required' },
                  ]}
                />
              ) : (
                <StatusPill tone="neutral">{current === 'off' ? 'Off' : current === 'nudge' ? 'Optional' : 'Required'}</StatusPill>
              )}
              {mutations.saveSettings.isPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin text-muted-foreground" /> : null}
            </div>
            <p className="flex items-start gap-1.5 type-caption text-muted-foreground">
              <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              {HOD_STEP_TEXT[current]}
              {canApproveLeave ? null : ' Leave approvers change this.'}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ConfigurationTab;

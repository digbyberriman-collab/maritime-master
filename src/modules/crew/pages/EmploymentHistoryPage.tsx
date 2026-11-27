import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { History, Loader2, UserPlus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PageHeader from '@/shared/components/layout/PageHeader';
import { AccessDenied, PageEmpty, PageError, PageLoading } from '@/shared/components/states';
import { DataTable, KpiGrid, KpiTile, type DataTableColumn } from '@/shared/components/data';
import { notify } from '@/shared/lib/notify';
import { useCan, useCapability } from '@/lib/permissions/useCan';
import { useScope } from '@/app/router/scopeContext';
import { useScopedPath } from '@/app/router/scopes';
import { CREW_CAPS } from '@/modules/crew/paths';
import { formatDay } from '@/modules/crew/hooks/useCrewProfile';
import { useDepartments } from '@/modules/crew/hooks/useReferenceData';
import { HISTORY_NOT_SET_UP, useRehireStart, useVesselEmploymentHistory, type HistoryVessel } from '@/modules/crew/hooks/useEmploymentHistory';
import { addCrewPath } from '@/modules/crew/lib/addCrewSchema';
import { profilePath } from '@/modules/crew/lib/profileTabs';
import {
  EMPLOYMENT_SUBTAB_PARAM,
  endReasonLabel,
  formatDuration,
  historyCounters,
  historySearchText,
  rehireBlock,
  type EmploymentHistoryRow,
} from '@/modules/crew/lib/employment';

/** The page's department filter (`?dept=<department key>`). */
export const DEPARTMENT_PARAM = 'dept';
const ALL = '__all__';

interface PageVessel extends HistoryVessel {
  name: string;
}

/**
 * Employment history (gap/04 C59, W8; X1-11B) at crew/employment-history:
 * everyone who has left this vessel's crew, newest end first, with the
 * position and department, the period, its length and why it ended
 * (crew_vessel_employment_history). Counters: past crew (people) and
 * records (ended assignments). `?dept=` narrows it to one department (the
 * server filters). Each row opens the person's Employment tab (View) and,
 * for holders of crew profile creation, Re-hire opens Add crew prefilled
 * (crew_rehire_prefill); someone on a crew today is stopped with the
 * reason, since they are transferred or edited there.
 *
 * Gate: hris.employee_records.contracts_employment.view on the route
 * vessel (the route guard checks it too): nothing is read while it loads,
 * AccessDenied when denied; the server asks again. D-01: the RPC missing
 * says the history is not set up yet (PageEmpty), never an empty history;
 * any other error is PageError with Retry.
 */
const EmploymentHistoryPage: React.FC = () => {
  const scope = useScope();
  const vessel = scope.scope === 'vessel' ? scope.vessel ?? null : null;
  const gate = useCapability(CREW_CAPS.employmentView, { vesselId: vessel?.id ?? null });

  if (!vessel) {
    return <PageEmpty title="Choose a vessel" body="Employment history belongs to a vessel. Open it from a vessel's Crew tab." />;
  }
  if (gate.status === 'loading') return <PageLoading variant="list" rows={6} label="Checking your access" />;
  if (!gate.allowed) {
    return (
      <AccessDenied
        title="You can't see this vessel's employment history"
        detail="The employment history needs contracts and employment access in HR for this vessel. Ask your fleet manager if you need it."
      />
    );
  }
  return <HistoryBody key={vessel.id} vessel={{ id: vessel.id, companyId: vessel.company_id, name: vessel.name }} />;
};

const HistoryBody: React.FC<{ vessel: PageVessel }> = ({ vessel }) => {
  const [params, setParams] = useSearchParams();
  const department = params.get(DEPARTMENT_PARAM)?.trim() || null;
  const history = useVesselEmploymentHistory(vessel, department);
  const departments = useDepartments();

  const setDepartment = (key: string | null) => {
    const next = new URLSearchParams(params);
    if (key) next.set(DEPARTMENT_PARAM, key);
    else next.delete(DEPARTMENT_PARAM);
    setParams(next, { replace: true });
  };

  const header = (
    <PageHeader
      eyebrow={vessel.name}
      title="Employment history"
      description="Everyone who has left this vessel’s crew: their position, how long they served and why it ended."
    />
  );

  const departmentOptions = departments.status === 'ready' ? departments.items : [];
  const filter = (
    <div className="flex min-w-0 flex-wrap items-center gap-2" data-history-filter="">
      <label htmlFor="history-department" className="type-body-sm text-muted-foreground">
        Department
      </label>
      <Select value={department ?? ALL} onValueChange={(v) => setDepartment(v === ALL ? null : v)}>
        <SelectTrigger id="history-department" className="h-9 w-56 max-w-full [@media(pointer:coarse)]:h-11">
          <SelectValue placeholder="All departments" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All departments</SelectItem>
          {departmentOptions.map((d) => (
            <SelectItem key={d.key} value={d.key}>
              {d.label}
            </SelectItem>
          ))}
          {department && !departmentOptions.some((d) => d.key === department) ? <SelectItem value={department}>{department}</SelectItem> : null}
        </SelectContent>
      </Select>
    </div>
  );

  if (history.status === 'idle' || history.status === 'loading') {
    return (
      <div className="min-w-0 space-y-4">
        {header}
        <PageLoading variant="list" rows={6} label="Loading the employment history" />
      </div>
    );
  }
  if (history.status === 'not_set_up') {
    return (
      <div className="min-w-0 space-y-4" data-employment-history="not-set-up">
        {header}
        <PageEmpty icon={History} title="Employment history is not set up yet" body={HISTORY_NOT_SET_UP} />
      </div>
    );
  }
  if (history.status === 'denied') {
    return <AccessDenied title="You can't see this vessel's employment history" detail={history.message} />;
  }
  if (history.status === 'error') {
    return (
      <div className="min-w-0 space-y-4">
        {header}
        <PageError error={history.error} title="The employment history could not load" onRetry={history.retry} treatMissingAsOff={false} />
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6" data-employment-history="ready">
      {header}
      <Counters rows={history.rows} department={department} departmentLabel={departmentOptions.find((d) => d.key === department)?.label ?? null} />
      <HistoryTable vessel={vessel} rows={history.rows} filter={filter} department={department} onClearDepartment={() => setDepartment(null)} />
    </div>
  );
};

const Counters: React.FC<{ rows: readonly EmploymentHistoryRow[]; department: string | null; departmentLabel: string | null }> = ({ rows, department, departmentLabel }) => {
  const { pastCrew, records } = historyCounters(rows);
  const scope = department ? ` in ${departmentLabel ?? department}` : '';
  return (
    <KpiGrid className="grid-cols-2 lg:grid-cols-2 min-[1440px]:grid-cols-4" data-history-counters="">
      <KpiTile label="Past crew" icon={Users} value={pastCrew} state="ready" sub={`People who have left${scope}`} />
      <KpiTile label="Records" icon={History} value={records} state="ready" sub={`Ended assignments${scope}`} />
    </KpiGrid>
  );
};

const HistoryTable: React.FC<{
  vessel: PageVessel;
  rows: EmploymentHistoryRow[];
  filter: React.ReactNode;
  department: string | null;
  onClearDepartment: () => void;
}> = ({ vessel, rows, filter, department, onClearDepartment }) => {
  const scopedPath = useScopedPath();
  const navigate = useNavigate();
  const canRehire = useCan(CREW_CAPS.profilesCreate, { vesselId: vessel.id });
  const rehireStart = useRehireStart(vessel);
  const [starting, setStarting] = useState<string | null>(null);

  const viewHref = useMemo(
    () => (row: EmploymentHistoryRow) => `${scopedPath(profilePath(row.profileId, 'employment'))}?${EMPLOYMENT_SUBTAB_PARAM}=details`,
    [scopedPath],
  );

  const rehire = async (row: EmploymentHistoryRow) => {
    setStarting(row.assignmentId);
    try {
      const start = await rehireStart(row.profileId);
      if (start.kind === 'blocked') {
        notify.warning('Not re-hired', { description: start.message });
        return;
      }
      navigate(scopedPath(addCrewPath({ rehire: row.profileId })));
    } finally {
      setStarting(null);
    }
  };

  const columns = useMemo<DataTableColumn<EmploymentHistoryRow>[]>(
    () => [
      {
        id: 'crew',
        header: 'Crew',
        value: (r) => r.name,
        sticky: true,
        minWidth: 168,
        cell: (r) => {
          const block = rehireBlock(r, vessel.id);
          return (
            <span className="flex min-w-0 flex-col">
              <Link className="truncate font-medium text-foreground underline-offset-4 hover:underline" to={viewHref(r)}>
                {r.name}
              </Link>
              {block ? (
                <span id={`history-block-${r.assignmentId}`} className="type-caption text-muted-foreground">
                  {r.currentVesselId === vessel.id ? 'Back on this vessel’s crew' : `Now on ${r.currentVesselName ?? 'another vessel'}`}
                </span>
              ) : null}
            </span>
          );
        },
      },
      { id: 'position', header: 'Position', value: (r) => r.position ?? '', minWidth: 140 },
      { id: 'department', header: 'Department', value: (r) => r.departmentLabel ?? r.departmentKey ?? '', minWidth: 120 },
      {
        id: 'period',
        header: 'Period',
        kind: 'date',
        minWidth: 200,
        value: (r) => r.leaveDate ?? '',
        cell: (r) => (
          <span className="whitespace-nowrap tabular-nums">
            {formatDay(r.joinDate) ?? 'Not recorded'} to {formatDay(r.leaveDate) ?? 'not recorded'}
          </span>
        ),
      },
      {
        id: 'duration',
        header: 'Duration',
        kind: 'number',
        value: (r) => r.durationDays ?? -1,
        cell: (r) => {
          const d = formatDuration(r.joinDate, r.leaveDate);
          return d ? (
            <span className="whitespace-nowrap tabular-nums" title={d.long}>
              <span aria-hidden="true">{d.short}</span>
              <span className="sr-only">{d.long}</span>
            </span>
          ) : null;
        },
      },
      {
        id: 'reason',
        header: 'Reason',
        minWidth: 180,
        value: (r) => endReasonLabel(r.endReason) ?? '',
        cell: (r) => (
          <span className="flex min-w-0 flex-col">
            <span>{endReasonLabel(r.endReason) ?? 'Not recorded'}</span>
            {r.endNotes ? <span className="line-clamp-2 type-caption text-muted-foreground">{r.endNotes}</span> : null}
          </span>
        ),
      },
    ],
    [vessel.id, viewHref],
  );

  return (
    <section aria-labelledby="history-table-heading" className="min-w-0 space-y-3">
      <h2 id="history-table-heading" className="sr-only">
        Ended assignments
      </h2>
      <DataTable
        data={rows}
        columns={columns}
        getRowId={(r) => r.assignmentId}
        label={`Employment history of ${vessel.name}`}
        noun={{ one: 'record', other: 'records' }}
        searchable
        searchPlaceholder="Search name, position or reason"
        searchText={historySearchText}
        toolbar={filter}
        hasExternalFilters={Boolean(department)}
        onClearFilters={onClearDepartment}
        defaultSort={{ columnId: 'period', direction: 'desc' }}
        rowActions={(r) => {
          const block = rehireBlock(r, vessel.id);
          return (
            <span className="flex items-center gap-1">
              <Button asChild variant="ghost" size="sm" className="[@media(pointer:coarse)]:h-11" data-row-action="">
                <Link to={viewHref(r)} aria-label={`View ${r.name}`}>
                  View
                </Link>
              </Button>
              {canRehire ? (
                block ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="[@media(pointer:coarse)]:h-11"
                    aria-disabled="true"
                    aria-describedby={`history-block-${r.assignmentId}`}
                    aria-label={`Re-hire ${r.name}: ${block}`}
                    title={block}
                    data-row-action=""
                    onClick={(e) => e.preventDefault()}
                  >
                    <UserPlus aria-hidden="true" className="mr-1.5 size-3.5" />
                    Re-hire
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="[@media(pointer:coarse)]:h-11"
                    disabled={starting !== null}
                    aria-label={`Re-hire ${r.name}`}
                    data-row-action=""
                    onClick={() => void rehire(r)}
                  >
                    {starting === r.assignmentId ? <Loader2 aria-hidden="true" className="mr-1.5 size-3.5 animate-spin" /> : <UserPlus aria-hidden="true" className="mr-1.5 size-3.5" />}
                    Re-hire
                  </Button>
                )
              ) : null}
            </span>
          );
        }}
        empty={{
          icon: History,
          title: department ? 'No one from this department has left yet' : 'No one has left this vessel’s crew yet',
          body: 'Ended assignments appear here once someone signs off, is transferred or ends their employment.',
        }}
      />
    </section>
  );
};

export default EmploymentHistoryPage;

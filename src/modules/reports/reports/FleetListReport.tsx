/**
 * Fleet › Reports › Fleet list (`/fleet/reports/fleet-list`; gap/02 R14;
 * X5 spec X5-03B). One row per vessel shown: type, flag, class, IMO, LOA,
 * builder, year, fleet group, crew on board and certificate health, from
 * `fleet_vessel_list` (040200) through `useFleetVesselList`.
 *
 * - A count the reader cannot see on a vessel (crew without the crew list
 *   read, certificates without the certificates read) is "–", never 0, and
 *   the KPI totals leave that vessel out and say how many they cover.
 * - Certificate health: "n expired", "n due", "All valid", "None recorded"
 *   or "Not covered"; it opens the vessel's certificates.
 * - A vessel not counted in fleet totals (D-X5-22: shown only when ticked)
 *   carries a "Not counted" chip.
 * - Show filter (`?show=findings`): only vessels with certificates expired
 *   or due. A client-side search over the list (it is one row per vessel).
 * - Export: the rows on screen; no personal data.
 * - D-01: while the RPC is missing, "This report is not set up yet"; any
 *   other error with Retry. Below 768 px one card per vessel.
 */
import React, { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { AlertOctagon, CalendarClock, Ship, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Json } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';
import type { DataTableColumn } from '@/shared/components/data/DataTable';
import { KpiGrid, KpiTile } from '@/shared/components/data/KpiTile';
import { StatusPill } from '@/shared/components/status/StatusPill';
import { EmptyState, PageEmpty, PageError } from '@/shared/components/states';
import { FleetVesselsFilter, VESSELS_SHOWN_PARAM, useFleetVesselsShown } from '@/modules/fleet';
import { vesselPath } from '@/modules/vessels/lib/vesselCode';
import { ReportShell, ReportTable } from '../components/ReportShell';
import { reportsKeys } from '../hooks/keys';
import { useFleetVesselList, type ReportScope } from '../hooks/useReportData';
import { useReportFilters } from '../hooks/useReportFilters';
import type { ReportComponentProps } from '../registry';
import type { FleetVesselListRow } from '../types/db.pending';
import {
  FLEET_LIST_EXPORT_COLUMNS,
  FLEET_LIST_FILTERS,
  certificateHealth,
  fleetListRows,
  fleetListSummary,
  lengthText,
} from '../lib/expiryReports';

const COARSE = '[@media(pointer:coarse)]:min-h-11';
const LINK = cn('-mx-1 inline-flex min-h-8 items-center rounded-sm px-1 hover:underline focus-ring', COARSE);
const NOT_COVERED = 'Not covered: you cannot see this on this vessel';
const n = (v: number) => v.toLocaleString('en-GB');

function VesselName({ row }: { row: FleetVesselListRow }) {
  const name = row.vessel_code ? (
    <Link to={vesselPath(row.vessel_code, '')} className={cn(LINK, 'font-medium text-foreground')}>
      {row.vessel_name}
    </Link>
  ) : (
    <span className="font-medium text-foreground">{row.vessel_name}</span>
  );
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {name}
      {row.is_counted ? null : (
        <Badge variant="neutral" title="Not counted in fleet totals">
          Not counted
        </Badge>
      )}
    </span>
  );
}

function CertificateHealthCell({ row }: { row: FleetVesselListRow }) {
  const health = certificateHealth(row);
  if (!health.covered) {
    return (
      <span className="text-muted-foreground" title={NOT_COVERED}>
        <span aria-hidden="true">–</span>
        <span className="sr-only">Certificates: not covered</span>
      </span>
    );
  }
  const pill = <StatusPill tone={health.tone} label={health.label} />;
  if (!row.vessel_code || row.certificates_total === 0) return pill;
  return (
    <Link to={vesselPath(row.vessel_code, 'certificates')} className={cn(LINK, 'px-0')} aria-label={`Certificates on ${row.vessel_name}: ${health.label}`}>
      {pill}
    </Link>
  );
}

function CrewCount({ row }: { row: FleetVesselListRow }) {
  if (row.active_crew === null) {
    return (
      <span className="text-muted-foreground" title={NOT_COVERED}>
        <span aria-hidden="true">–</span>
        <span className="sr-only">Crew on board: not covered</span>
      </span>
    );
  }
  return <span className="tabular-nums">{n(row.active_crew)}</span>;
}

const COLUMNS: DataTableColumn<FleetVesselListRow>[] = [
  { id: 'vessel', header: 'Vessel', sticky: true, minWidth: 170, value: (r) => r.vessel_name, cell: (r) => <VesselName row={r} /> },
  {
    id: 'certificates',
    header: 'Certificates',
    minWidth: 160,
    sortDescFirst: true,
    // Expired weigh more than due: sorting puts the vessels with expired certificates first.
    value: (r) => (certificateHealth(r).covered ? (r.certificates_expired ?? 0) * 1000 + (r.certificates_expiring ?? 0) : null),
    cell: (r) => <CertificateHealthCell row={r} />,
  },
  { id: 'crew', header: 'Crew on board', kind: 'number', minWidth: 110, sortDescFirst: true, value: (r) => r.active_crew, cell: (r) => <CrewCount row={r} /> },
  { id: 'group', header: 'Fleet group', minWidth: 120, value: (r) => r.fleet_group_name, emptyReason: 'In no fleet group' },
  { id: 'type', header: 'Type', minWidth: 120, value: (r) => r.vessel_type, emptyReason: 'Not recorded' },
  { id: 'flag', header: 'Flag', minWidth: 130, value: (r) => r.flag_state, emptyReason: 'Not recorded' },
  { id: 'class', header: 'Class', minWidth: 130, value: (r) => r.classification_society, emptyReason: 'Not recorded' },
  { id: 'imo', header: 'IMO', kind: 'reference', minWidth: 90, value: (r) => r.imo_number, emptyReason: 'Not recorded' },
  {
    id: 'loa',
    header: 'LOA',
    kind: 'number',
    minWidth: 80,
    value: (r) => r.length_overall,
    cell: (r) => {
      const text = lengthText(r.length_overall);
      return text ? <span className="whitespace-nowrap">{text}</span> : null;
    },
    emptyReason: 'Not recorded',
  },
  { id: 'year', header: 'Year', kind: 'number', minWidth: 64, value: (r) => r.build_year, cell: (r) => (r.build_year === null ? null : String(r.build_year)), emptyReason: 'Not recorded' },
  { id: 'builder', header: 'Builder', minWidth: 130, value: (r) => r.builder, emptyReason: 'Not recorded' },
];

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="type-caption text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm">{children ?? <span className="text-muted-foreground">–</span>}</dd>
    </div>
  );
}

function VesselCard({ row }: { row: FleetVesselListRow }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <VesselName row={row} />
        <CertificateHealthCell row={row} />
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        <Fact label="Type">{row.vessel_type}</Fact>
        <Fact label="Flag">{row.flag_state}</Fact>
        <Fact label="Class">{row.classification_society}</Fact>
        <Fact label="IMO">{row.imo_number}</Fact>
        <Fact label="LOA">{lengthText(row.length_overall)}</Fact>
        <Fact label="Built">{[row.builder, row.build_year].filter((x) => x !== null && x !== '').join(', ') || null}</Fact>
        <Fact label="Fleet group">{row.fleet_group_name}</Fact>
        <Fact label="Crew on board">
          <CrewCount row={row} />
        </Fact>
      </dl>
    </div>
  );
}

function SummaryTiles({ rows, loading }: { rows: readonly FleetVesselListRow[]; loading: boolean }) {
  const s = fleetListSummary(rows);
  const state = loading ? 'loading' : undefined;
  const coverage = (covered: number) => (covered < s.vessels ? `On ${n(covered)} of ${n(s.vessels)} vessels` : undefined);
  return (
    <section aria-label="Fleet list summary">
      <KpiGrid className="min-[1440px]:grid-cols-4">
        <KpiTile label="Vessels" icon={Ship} value={s.vessels} state={loading ? 'loading' : 'ready'} />
        <KpiTile
          label="Crew on board"
          icon={Users}
          value={s.crew ?? undefined}
          state={loading ? 'loading' : s.crew === null ? 'not-enabled' : 'ready'}
          notEnabledReason="Not covered on any vessel listed"
          sub={coverage(s.crewCovered)}
        />
        <KpiTile
          label="Certificates expired"
          icon={AlertOctagon}
          value={s.expired ?? undefined}
          tone={s.expired && s.expired > 0 ? 'danger' : undefined}
          state={loading ? 'loading' : s.expired === null ? 'not-enabled' : state}
          notEnabledReason="Not covered on any vessel listed"
          zeroLabel="None expired"
          sub={coverage(s.certificatesCovered)}
        />
        <KpiTile
          label="Certificates due"
          icon={CalendarClock}
          value={s.expiring ?? undefined}
          tone={s.expiring && s.expiring > 0 ? 'warn' : undefined}
          state={loading ? 'loading' : s.expiring === null ? 'not-enabled' : state}
          notEnabledReason="Not covered on any vessel listed"
          zeroLabel="None due"
          sub={coverage(s.certificatesCovered)}
        />
      </KpiGrid>
    </section>
  );
}

export default function FleetListReport({ definition }: ReportComponentProps) {
  const shown = useFleetVesselsShown();
  const [params] = useSearchParams();
  const filters = useReportFilters(FLEET_LIST_FILTERS);
  const show = filters.applied.show;

  const ready = shown.status === 'ready' ? shown : null;
  const scope = useMemo<ReportScope | null>(
    () => (ready ? { companyId: ready.companyId, vesselIds: ready.shownIds, fleetWide: ready.isDefault } : null),
    [ready],
  );
  const list = useFleetVesselList(scope);
  const data = useMemo(() => (list.state === 'ready' ? list.data : []), [list]);
  const rows = useMemo(() => fleetListRows(data, show), [data, show]);

  const queryClient = useQueryClient();
  const prefix = [...reportsKeys.company(ready?.companyId ?? null), 'vessel-list'];
  const refreshing = useIsFetching({ queryKey: prefix }) > 0;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: prefix });

  const vesselsParam = ready && !ready.isDefault ? params.get(VESSELS_SHOWN_PARAM) : null;
  const loading = list.state === 'loading' || list.state === 'idle' || !ready;

  const exportBlockedReason =
    list.state === 'not_set_up'
      ? 'This report is not set up yet.'
      : list.state === 'error' || shown.status === 'error'
        ? 'The report could not load.'
        : list.state === 'no_vessels'
          ? 'There are no vessels to list.'
          : null;
  const exportParams: Json = { show, vessels: ready && !ready.isDefault ? ready.shownVessels.map((v) => v.code) : 'counted' };

  const toolbar = ready ? (
    <FleetVesselsFilter
      vessels={ready.vessels}
      selectedIds={ready.shownIds}
      countedIds={ready.countedIds}
      fleetGroups={ready.fleetGroups}
      droppedCodes={ready.droppedCodes}
      onApply={ready.setShown}
    />
  ) : null;

  let body: React.ReactNode;
  if (shown.status === 'error') {
    body = <PageError error={shown.error} title="Your vessels could not load" onRetry={shown.retry} headingLevel={2} />;
  } else if (list.state === 'not_set_up') {
    body = (
      <PageEmpty
        icon={Ship}
        title="This report is not set up yet"
        body="Each vessel's particulars, crew on board and certificate health appear here once fleet reports are set up for your account."
        headingLevel={2}
        bordered
      />
    );
  } else if (list.state === 'no_vessels') {
    body = (
      <EmptyState
        title="No vessels to list"
        body="The fleet list covers the vessels you can reach. None is set up for you yet; ask your account admin."
        headingLevel={2}
        bordered
      />
    );
  } else {
    body = (
      <>
        <SummaryTiles rows={data} loading={loading} />
        <ReportTable
          label="Fleet list"
          noun={{ one: 'vessel', other: 'vessels' }}
          rows={rows}
          columns={COLUMNS}
          getRowId={(r) => r.vessel_id}
          renderCard={(r) => <VesselCard row={r} />}
          isLoading={loading}
          error={list.state === 'error' ? list.error : undefined}
          onRetry={list.state === 'error' ? list.retry : undefined}
          empty={{ title: 'No vessels to list' }}
          hasExternalFilters={show !== 'all'}
          onClearFilters={filters.reset}
          searchable={rows.length > 8}
        />
      </>
    );
  }

  return (
    <ReportShell<FleetVesselListRow>
      definition={definition}
      generatedAt={list.state === 'ready' ? list.updatedAt : null}
      refreshing={refreshing}
      onRefresh={ready ? refresh : undefined}
      vesselsParam={vesselsParam}
      toolbar={toolbar}
      toolbarLabel="Vessels"
      filters={filters}
      exportSpec={list.state === 'ready' ? { kind: 'Fleet list', columns: FLEET_LIST_EXPORT_COLUMNS, rows, params: exportParams } : null}
      exportBlockedReason={exportBlockedReason}
    >
      {body}
    </ReportShell>
  );
}

/**
 * The frame every registry report renders in (gap/02 R1, R19; DECISIONS
 * C12, D-88, D-X5-11, D-X5-12; X5 spec X5-03A):
 *
 * - a back link to the hub ("All reports", keeping the vessels shown);
 * - PageHeader: the report's title, its description, the module chip and,
 *   in the actions slot, the one freshness stamp ("Fleet · generated
 *   26 Nov 2026, 14:05 UTC") next to the Refresh it comes from, "Switch
 *   report" (the reports of this scope the reader may open) and Export;
 * - the filter bar: the report's own controls (`toolbar`, e.g. "Vessels
 *   shown", which applies itself) and its declared filters, edited as a
 *   draft and written to the query string on Apply (`useReportFilters`);
 * - the KPI row and the report body (usually `ReportTable`).
 *
 * Export goes through the platform engine (`@/lib/export` runExport, PR-13):
 * logged first, CSV / Excel / PDF built on demand, the report's
 * `personalData` passed through (the engine refuses personal data while the
 * export log is not set up). The menu is disabled, with its reason, until
 * the reader holds `fleet.operations.fleet_reports.export` and the report's
 * data is ready; it exports exactly the rows on screen.
 *
 * `ReportTable` folds a register into cards below 768 px (gap/10 A.10), so
 * no report scrolls the page sideways on a phone.
 *
 * Tokens only; 44 px targets on coarse pointers.
 */
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import type { Json } from '@/integrations/supabase/types';
import { runExport, type ExportColumn, type ExportRange } from '@/lib/export';
import { useCapability } from '@/lib/permissions/useCan';
import { cn } from '@/lib/utils';
import { DataTable, type DataTableColumn, type DataTableEmpty } from '@/shared/components/data/DataTable';
import { ExportMenu } from '@/shared/components/data/ExportMenu';
import { TABLET_MIN_WIDTH, useMinWidth } from '@/shared/components/data/useMinWidth';
import PageHeader from '@/shared/components/layout/PageHeader';
import { EmptyState, PageError } from '@/shared/components/states';
import { usePageLocationOverride } from '@/shared/components/layout/pageLocationOverride';
import { FLEET_REPORTS_ROOT, REPORTS_CAPS } from '../paths';
import { fleetReportPath, reportsForScope, type ReportDefinition } from '../registry';
import { useReportAccess } from '../hooks/useReportAccess';
import type { ReportFiltersController } from '../hooks/useReportFilters';
import { formatGeneratedStamp } from '../lib/reportStamp';

const COARSE = '[@media(pointer:coarse)]:min-h-11';

export const EXPORT_COPY = {
  checking: 'Checking your export access…',
  denied: 'Exporting fleet reports needs export access. Ask your account admin.',
  loading: 'Available once the report has loaded.',
  empty: 'Nothing to export with these filters.',
} as const;

/** What the report exports: the rows on screen and how each column reads in the file. */
export interface ReportExportSpec<Row> {
  /** The file-name kind and the title inside the file, e.g. "Vessel comparison". */
  kind: string;
  columns: readonly ExportColumn<Row>[];
  rows: readonly Row[];
  title?: string;
  range?: ExportRange | null;
  /** The filters, logged with the export (ids and codes only). */
  params?: Json;
  vesselId?: string | null;
  vesselCode?: string | null;
}

export interface ReportShellProps<Row> {
  definition: ReportDefinition;
  /** "Fleet" in the fleet scope (the stamp's scope). */
  scopeLabel?: string;
  /** When the data on screen was read (ms); no stamp until it is known. */
  generatedAt?: number | null;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** The `?vessels=` codes to carry into the back link and "Switch report" (non-default only). */
  vesselsParam?: string | null;
  /** Controls before the filters (e.g. the "Vessels shown" filter). */
  toolbar?: React.ReactNode;
  /** A caption over the toolbar, like the filters' labels ("Vessels"). */
  toolbarLabel?: string;
  filters?: ReportFiltersController;
  kpis?: React.ReactNode;
  /** The export, or null while there is nothing to export yet. */
  exportSpec?: ReportExportSpec<Row> | null;
  /** Why the data cannot be exported yet (loading, not set up, an error); null when ready. */
  exportBlockedReason?: string | null;
  children: React.ReactNode;
}

function SwitchReport({ current, vesselsParam }: { current: ReportDefinition; vesselsParam?: string | null }) {
  const navigate = useNavigate();
  const id = React.useId();
  const access = useReportAccess(reportsForScope('fleet'));
  const options = access.allowed.some((r) => r.key === current.key) ? access.allowed : [current, ...access.allowed];
  if (access.status === 'loading' || options.length < 2) return null;
  const go = (key: string) => {
    const next = options.find((r) => r.key === key);
    if (!next || next.key === current.key) return;
    const query = next.load && vesselsParam ? new URLSearchParams({ vessels: vesselsParam }) : null;
    navigate(fleetReportPath(next, query));
  };
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={id} className="sr-only">
        Switch report
      </Label>
      <Select value={current.key} onValueChange={go}>
        <SelectTrigger id={id} className={cn('w-auto min-w-[12rem] max-w-[16rem]', COARSE)} aria-label="Switch report">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((r) => (
            <SelectItem key={r.key} value={r.key} className={COARSE}>
              {r.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function FilterBar({
  toolbar,
  toolbarLabel,
  filters,
}: {
  toolbar?: React.ReactNode;
  toolbarLabel?: string;
  filters?: ReportFiltersController;
}) {
  const baseId = React.useId();
  if (!toolbar && !filters?.specs.length) return null;
  return (
    <form
      role="search"
      aria-label="Report filters"
      className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3"
      onSubmit={(event) => {
        event.preventDefault();
        filters?.apply();
      }}
    >
      {toolbar ? (
        <div className="flex flex-col gap-1">
          {toolbarLabel ? <span className="type-caption text-muted-foreground">{toolbarLabel}</span> : null}
          <div className="flex flex-wrap items-end gap-2">{toolbar}</div>
        </div>
      ) : null}
      {filters?.specs.map((spec) => {
        const id = `${baseId}-${spec.key}`;
        return (
          <div key={spec.key} className="flex min-w-[12rem] flex-1 flex-col gap-1 sm:flex-none">
            <Label htmlFor={id} className="type-caption text-muted-foreground">
              {spec.label}
            </Label>
            <Select value={filters.draft[spec.key]} onValueChange={(value) => filters.setDraft(spec.key, value)}>
              <SelectTrigger id={id} className={cn('w-full sm:w-48', COARSE)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {spec.options.map((o) => (
                  <SelectItem key={o.value} value={o.value} className={COARSE}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      })}
      {filters?.specs.length ? (
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" variant={filters.dirty ? 'default' : 'outline'} className={COARSE} disabled={!filters.dirty}>
            Apply
          </Button>
          {!filters.isDefault ? (
            <Button type="button" variant="ghost" size="sm" className={COARSE} onClick={filters.reset}>
              Reset
            </Button>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

export function ReportShell<Row>({
  definition,
  scopeLabel = 'Fleet',
  generatedAt,
  refreshing,
  onRefresh,
  vesselsParam,
  toolbar,
  toolbarLabel,
  filters,
  kpis,
  exportSpec,
  exportBlockedReason,
  children,
}: ReportShellProps<Row>) {
  usePageLocationOverride({ title: definition.title, crumbs: 'page' });
  const exportAccess = useCapability(REPORTS_CAPS.export);
  const backHref = `${FLEET_REPORTS_ROOT}${vesselsParam ? `?${new URLSearchParams({ vessels: vesselsParam }).toString()}` : ''}`;

  const exportReason =
    exportAccess.status === 'loading'
      ? EXPORT_COPY.checking
      : !exportAccess.allowed
        ? EXPORT_COPY.denied
        : exportBlockedReason ?? (!exportSpec ? EXPORT_COPY.loading : exportSpec.rows.length === 0 ? EXPORT_COPY.empty : null);

  const onExport = (format: (typeof definition.exporters)[number]) => {
    const spec = exportSpec;
    if (!spec) return Promise.resolve({ status: 'refused' as const, code: 'no_columns' as const, message: EXPORT_COPY.loading });
    return runExport({
      format,
      kind: spec.kind,
      title: spec.title ?? definition.title,
      sourceKey: `reports.${definition.key}`,
      personalData: definition.personalData,
      columns: spec.columns,
      rows: spec.rows,
      range: spec.range,
      params: spec.params,
      vesselId: spec.vesselId,
      vesselCode: spec.vesselCode,
    });
  };

  return (
    <div className="space-y-4">
      <Link
        to={backHref}
        className={cn('-ml-1 inline-flex min-h-9 items-center gap-1 rounded-sm px-1 text-sm text-muted-foreground hover:text-foreground focus-ring', COARSE)}
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        All reports
      </Link>
      <PageHeader
        title={definition.title}
        description={definition.description}
        actions={
          <>
            {generatedAt ? (
              <span className="type-caption tabular-nums text-muted-foreground" data-testid="report-generated">
                {formatGeneratedStamp(scopeLabel, generatedAt)}
              </span>
            ) : null}
            {onRefresh ? (
              <Button type="button" variant="outline" size="sm" className={COARSE} onClick={onRefresh} disabled={refreshing}>
                <RefreshCw aria-hidden="true" className={cn('h-4 w-4', refreshing && 'motion-safe:animate-spin')} />
                Refresh
              </Button>
            ) : null}
            <SwitchReport current={definition} vesselsParam={vesselsParam} />
            {definition.exporters.length ? (
              <ExportMenu formats={definition.exporters} onExport={onExport} disabledReason={exportReason} className={COARSE} />
            ) : null}
          </>
        }
      >
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="neutral">{definition.moduleChip}</Badge>
          {definition.personalData ? <Badge variant="info">Personal data</Badge> : null}
        </div>
      </PageHeader>
      <FilterBar toolbar={toolbar} toolbarLabel={toolbarLabel} filters={filters} />
      {kpis}
      {children}
    </div>
  );
}

// ─── Table that folds into cards ────────────────────────────────────────

export interface ReportTableProps<T> {
  label: string;
  noun: { one: string; other: string };
  rows: readonly T[];
  columns: ReadonlyArray<DataTableColumn<T>>;
  getRowId: (row: T) => string;
  /** The card a row becomes below 768 px. */
  renderCard: (row: T) => React.ReactNode;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  empty?: DataTableEmpty;
  /** Report filters hide some rows (the filtered empty state, with Clear filters). */
  hasExternalFilters?: boolean;
  onClearFilters?: () => void;
  rowClassName?: (row: T) => string | undefined;
  searchable?: boolean;
}

export function ReportTable<T>({
  label,
  noun,
  rows,
  columns,
  getRowId,
  renderCard,
  isLoading,
  error,
  onRetry,
  empty,
  hasExternalFilters,
  onClearFilters,
  rowClassName,
  searchable,
}: ReportTableProps<T>) {
  const wide = useMinWidth(TABLET_MIN_WIDTH);
  if (wide) {
    return (
      <DataTable
        label={label}
        noun={noun}
        data={rows}
        columns={columns}
        getRowId={(row) => getRowId(row)}
        isLoading={isLoading}
        error={error}
        onRetry={onRetry}
        empty={empty}
        hasExternalFilters={hasExternalFilters}
        onClearFilters={onClearFilters}
        rowClassName={rowClassName}
        searchable={searchable ?? false}
        showDensityToggle={false}
      />
    );
  }

  if (error) return <PageError variant="inline" error={error} onRetry={onRetry} title={`${label} could not load`} />;
  if (isLoading) {
    return (
      <ul aria-busy="true" aria-label={`Loading ${noun.other}`} className="space-y-2">
        {[0, 1, 2].map((i) => (
          <li key={i} className="rounded-lg border border-border bg-card p-4">
            <Skeleton className="mb-3 h-4 w-40" />
            <Skeleton className="h-3 w-full" />
          </li>
        ))}
      </ul>
    );
  }
  if (rows.length === 0) {
    return hasExternalFilters ? (
      <EmptyState
        kind="filtered"
        title="Nothing matches these filters"
        action={
          onClearFilters ? (
            <Button type="button" variant="outline" size="sm" className={COARSE} onClick={onClearFilters}>
              Clear filters
            </Button>
          ) : undefined
        }
        bordered
        compact
      />
    ) : (
      <EmptyState title={empty?.title ?? `No ${noun.other}`} body={empty?.body} icon={empty?.icon} action={empty?.action} bordered compact />
    );
  }
  return (
    <ul aria-label={label} className="space-y-2">
      {rows.map((row) => (
        <li key={getRowId(row)} className="rounded-lg border border-border bg-card p-4 text-card-foreground">
          {renderCard(row)}
        </li>
      ))}
    </ul>
  );
}

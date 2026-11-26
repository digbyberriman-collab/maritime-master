/**
 * The body shared by the fleet expiry reports, Fleet certificates and Crew
 * documents (gap/02 R3, R4; DECISIONS C5, D-01, D-04, D-31, D-88, D-X5-12,
 * D-X5-21; X5 spec X5-03B), on ReportShell:
 *
 * - Data: one page of `fleet_expiry_items` (the expiry engine, through the
 *   fleet module's `useFleetExpiryItems`) for the vessels shown, with every
 *   filter applied by the server (sources,
 *   buckets, search, paging through p_limit / p_offset), so a page and its
 *   "of n" are always the server's; the KPI tiles from
 *   `fleet_expiry_summary` (muted items apart). Nothing is read until the
 *   vessels shown are known; the report page has already checked the
 *   report's own capability.
 * - Filters in the query string (../lib/expiryReports.ts): Status and the
 *   show-valid toggle, Type and Vessel (crew), the search, and the page.
 *   They are edited as a draft and applied with Apply (or Enter in the
 *   search); a new filter, search or set of vessels goes back to page 1.
 * - Order: the server's, most urgent first. Columns are not sortable here,
 *   because sorting one page would misstate the list.
 * - Tiles: one per bucket (and, for certificates, per endorsement state),
 *   each linking to the list filtered to it.
 * - Warning windows: the window each item type warns ahead
 *   (`expiry_window_rules`, else the defaults), and "Alert windows" for
 *   readers with `fleet.operations.fleet_reports.admin`.
 * - D-01: while the RPCs are missing, "This report is not set up yet";
 *   any other error says so with Retry; never sample rows. Below 768 px the
 *   table folds into one card per item.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { AlertOctagon, CalendarClock, CalendarX2, CheckCircle2, ChevronLeft, ChevronRight, FileClock, Settings2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import type { Json } from '@/integrations/supabase/types';
import { EXPIRY_BUCKET_LABELS, type ExpiryBucket } from '@/lib/records/expiry';
import { useCapability } from '@/lib/permissions/useCan';
import { cn } from '@/lib/utils';
import { useMembershipReach } from '@/app/router/useMembershipReach';
import { DataTable, type DataTableColumn } from '@/shared/components/data/DataTable';
import { KpiGrid, KpiTile } from '@/shared/components/data/KpiTile';
import { TABLET_MIN_WIDTH, useMinWidth } from '@/shared/components/data/useMinWidth';
import { ExpiryPill, StatusPill } from '@/shared/components/status';
import { EmptyState, PageEmpty, PageError } from '@/shared/components/states';
import { todayDateOnly } from '@/shared/lib/form';
import {
  ENDORSEMENT_STATE_LABELS,
  FLEET_CAPS,
  FleetVesselsFilter,
  VESSELS_SHOWN_PARAM,
  fleetKeys,
  useExpiryWindowRules,
  useFleetExpiryItems,
  useFleetExpirySummary,
  useFleetVesselsShown,
  type ExpiryItemType,
  type ExpiryTally,
  type FleetExpiryItem,
  type ShownVessel,
} from '@/modules/fleet';
import { ReportShell, ReportTable } from './ReportShell';
import { ExpiryWindowsDrawer } from './ExpiryWindowsDrawer';
import { useReportFilters, type ReportFiltersController } from '../hooks/useReportFilters';
import type { ReportDefinition } from '../registry';
import { defaultReportFilters, writeReportFilters, type ReportFilterSpec } from '../lib/reportFilters';
import {
  CERTIFICATE_EXPORT_COLUMNS,
  CERTIFICATE_SOURCES,
  CREW_DOCUMENT_EXPORT_COLUMNS,
  CREW_ITEM_TYPES,
  EXPIRY_REPORT_PAGE_SIZE,
  PAGE_PARAM,
  SEARCH_MAX_LENGTH,
  SEARCH_PARAM,
  STATUS_FILTER,
  TYPE_FILTER,
  VALID_FILTER,
  VESSEL_FILTER_KEY,
  bucketTileParams,
  bucketsFor,
  crewSourcesFor,
  crewVesselScope,
  expiryItemId,
  formatDay,
  itemTypesLabel,
  pageInfo,
  pageSummaryText,
  parsePage,
  readSearch,
  tallyForSources,
  vesselFilterSpec,
  windowText,
  writeSearchAndPage,
  type PageInfo,
} from '../lib/expiryReports';

const COARSE = '[@media(pointer:coarse)]:min-h-11';

export type ExpiryReportVariant = 'certificates' | 'crew';

interface VariantConfig {
  kind: string;
  noun: { one: string; other: string };
  itemTypes: readonly ExpiryItemType[];
  endorsements: boolean;
  searchLabel: string;
  searchPlaceholder: string;
  emptyTitle: string;
  emptyBody: string;
  notSetUpBody: string;
}

const VARIANTS: Readonly<Record<ExpiryReportVariant, VariantConfig>> = {
  certificates: {
    kind: 'Fleet certificates',
    noun: { one: 'certificate', other: 'certificates' },
    itemTypes: ['vessel_certificate'],
    endorsements: true,
    searchLabel: 'Certificate',
    searchPlaceholder: 'Name, number or authority',
    emptyTitle: 'No certificates due',
    emptyBody: 'No certificate on the vessels shown has expired or is due within its warning window.',
    notSetUpBody: 'Vessel certificates, their expiry and endorsement dates appear here once fleet reports are set up for your account.',
  },
  crew: {
    kind: 'Crew documents',
    noun: { one: 'document', other: 'documents' },
    itemTypes: CREW_ITEM_TYPES,
    endorsements: false,
    searchLabel: 'Search',
    searchPlaceholder: 'Person or document',
    emptyTitle: 'No crew documents due',
    emptyBody: 'No crew document has expired or is due within its warning window.',
    notSetUpBody: 'Passports, visas, certificates and medicals of the crew appear here once fleet reports are set up for your account.',
  },
};

const NO_VESSELS: readonly ShownVessel[] = [];
const NO_ITEMS: readonly FleetExpiryItem[] = [];

// ─── Cells shared by the two reports ────────────────────────────────────

/** The bucket pill (the server's bucket and days), with "Alerts off" when the item's alerts are muted. */
export function ExpiryStatus({ item, today }: { item: FleetExpiryItem; today: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <ExpiryPill bucket={item.bucket} daysRemaining={item.daysRemaining} expiresOn={item.expiresOn} windowDays={item.windowDays} today={today} />
      {item.alertsMuted ? <StatusPill tone="neutral" label="Alerts off" /> : null}
    </span>
  );
}

/** The expiry day ("30 Nov 2026"), or null (the table's explained dash). */
export function ExpiryDay({ value }: { value: string | null }) {
  const text = formatDay(value);
  return text ? <span className="whitespace-nowrap tabular-nums">{text}</span> : null;
}

/** The endorsement state and its due day, or null when no endorsement is due. */
export function EndorsementCell({ item }: { item: FleetExpiryItem }) {
  if (!item.endorsementState) return null;
  const due = formatDay(item.endorsementDueOn);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <StatusPill tone={item.endorsementState === 'overdue' ? 'danger' : 'warn'} label={ENDORSEMENT_STATE_LABELS[item.endorsementState]} />
      {due ? <span className="type-caption tabular-nums text-muted-foreground">{due}</span> : null}
    </span>
  );
}

// ─── Data ───────────────────────────────────────────────────────────────

/**
 * The report's filters as one controller for ReportShell's filter bar: the
 * declared selects (useReportFilters) plus the search box, applied together
 * in one URL write that also goes back to page 1.
 */
function useExpiryReportFilters(specs: readonly ReportFilterSpec[]) {
  const selects = useReportFilters(specs);
  const [params, setParams] = useSearchParams();
  const appliedSearch = readSearch(params.get(SEARCH_PARAM));
  const page = parsePage(params.get(PAGE_PARAM));
  const [searchDraft, setSearchDraft] = useState(appliedSearch);
  useEffect(() => setSearchDraft(appliedSearch), [appliedSearch]);

  const { draft, setDraft } = selects;
  const apply = useCallback(() => {
    setParams((current) => writeSearchAndPage(writeReportFilters(specs, draft, current), searchDraft, 1), { replace: true });
  }, [setParams, specs, draft, searchDraft]);
  const reset = useCallback(() => {
    for (const spec of specs) setDraft(spec.key, spec.defaultValue);
    setSearchDraft('');
    setParams((current) => writeSearchAndPage(writeReportFilters(specs, defaultReportFilters(specs), current), '', 1), { replace: true });
  }, [setParams, specs, setDraft]);
  const setPage = useCallback(
    (next: number) => setParams((current) => writeSearchAndPage(current, null, next), { replace: true }),
    [setParams],
  );

  const controller: ReportFiltersController = {
    ...selects,
    apply,
    reset,
    dirty: selects.dirty || readSearch(searchDraft) !== appliedSearch,
    isDefault: selects.isDefault && !appliedSearch,
  };
  return { controller, applied: selects.applied, search: appliedSearch, searchDraft, setSearchDraft, page, setPage };
}

// ─── Pieces ─────────────────────────────────────────────────────────────

interface TileDef {
  key: string;
  label: string;
  icon: typeof AlertOctagon;
  tone: 'danger' | 'orange' | 'warn' | undefined;
  value: (tally: ExpiryTally) => number;
  bucket?: ExpiryBucket;
}

const BUCKET_TILES: readonly TileDef[] = [
  { key: 'expired', label: EXPIRY_BUCKET_LABELS.expired, icon: AlertOctagon, tone: 'danger', value: (t) => t.buckets.expired, bucket: 'expired' },
  // "Endorsement late": short enough to stay on one line in a six-tile row (the pills say "Endorsement overdue").
  { key: 'endorsement_overdue', label: 'Endorsement late', icon: ShieldAlert, tone: 'danger', value: (t) => t.endorsements.overdue },
  { key: 'expiring_soon', label: 'Expiring ≤ 30 d', icon: CalendarX2, tone: 'orange', value: (t) => t.buckets.expiring_soon, bucket: 'expiring_soon' },
  { key: 'endorsement_due', label: ENDORSEMENT_STATE_LABELS.due, icon: FileClock, tone: 'warn', value: (t) => t.endorsements.due },
  { key: 'expiring', label: 'Due ≤ window', icon: CalendarClock, tone: 'warn', value: (t) => t.buckets.expiring, bucket: 'expiring' },
  { key: 'valid', label: EXPIRY_BUCKET_LABELS.valid, icon: CheckCircle2, tone: undefined, value: (t) => t.buckets.valid, bucket: 'valid' },
];

type SummaryState = ReturnType<typeof useFleetExpirySummary>;

function BucketTiles({
  summary,
  sources,
  endorsements,
  tileHref,
  listsUnassigned,
}: {
  summary: SummaryState;
  sources: readonly string[];
  endorsements: boolean;
  tileHref: (bucket: ExpiryBucket) => string;
  /** The list also holds people with no current vessel, whom the counts never include. */
  listsUnassigned: boolean;
}) {
  const tiles = endorsements ? BUCKET_TILES : BUCKET_TILES.filter((t) => t.bucket);
  const tally = summary.state === 'ready' ? tallyForSources(summary.data, sources) : null;
  return (
    <section aria-label="Expiry summary" className="space-y-2">
      <KpiGrid className={cn(!endorsements && 'min-[1440px]:grid-cols-4')}>
        {tiles.map((tile) => {
          const common = { label: tile.label, icon: tile.icon };
          if (summary.state === 'error') return <KpiTile key={tile.key} {...common} state="error" onRetry={summary.retry} />;
          if (summary.state === 'not_set_up') return <KpiTile key={tile.key} {...common} state="not-enabled" notEnabledReason="Not set up yet" />;
          if (summary.state === 'no_vessels') return <KpiTile key={tile.key} {...common} state="not-enabled" notEnabledReason="No vessels shown" />;
          if (!tally) return <KpiTile key={tile.key} {...common} state="loading" />;
          const value = tile.value(tally);
          return (
            <KpiTile
              key={tile.key}
              {...common}
              value={value}
              tone={value > 0 ? tile.tone : undefined}
              href={tile.bucket ? tileHref(tile.bucket) : undefined}
              zeroLabel="None"
            />
          );
        })}
      </KpiGrid>
      {tally && listsUnassigned ? (
        <p className="type-caption text-muted-foreground">
          The counts cover the vessels shown. People with no current vessel are listed below as “No current vessel” but not counted here.
        </p>
      ) : null}
      {tally && tally.muted > 0 ? (
        <p className="type-caption text-muted-foreground">
          {`${tally.muted.toLocaleString('en-GB')} ${tally.muted === 1 ? 'item has' : 'items have'} alerts switched off and ${tally.muted === 1 ? 'is' : 'are'} not counted above.`}
        </p>
      ) : null}
    </section>
  );
}

function WarningWindows({
  companyId,
  itemTypes,
  canEdit,
  onEdit,
}: {
  companyId: string | null;
  itemTypes: readonly ExpiryItemType[];
  canEdit: boolean;
  onEdit: () => void;
}) {
  const windows = useExpiryWindowRules(companyId);
  let content: React.ReactNode;
  if (windows.state === 'error') {
    content = (
      <span className="inline-flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        The warning windows could not load.
        <Button type="button" variant="outline" size="sm" className={COARSE} onClick={windows.retry}>
          Try again
        </Button>
      </span>
    );
  } else if (windows.state === 'loading' || windows.state === 'idle') {
    content = <Skeleton className="h-4 w-64" />;
  } else {
    const rules = windows.state === 'ready' ? windows.rules : [];
    content = (
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Warning windows">
        {itemTypes.map((type) => {
          const custom = rules.some((r) => r.itemType === type && !r.certificateTypeId);
          return (
            <li key={type} className="tabular-nums">
              <span className="text-muted-foreground">{itemTypesLabel(type)}</span>{' '}
              <span className="font-medium text-foreground">{windowText(windows.windowFor({ itemType: type }))}</span>
              {custom ? null : <span className="text-muted-foreground"> (default)</span>}
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <section
      aria-labelledby="warning-windows-heading"
      className="flex flex-col gap-3 rounded-lg border border-border bg-card px-3 py-2 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 id="warning-windows-heading" className="type-caption text-muted-foreground">
          Warns this far ahead
        </h2>
        {content}
      </div>
      {canEdit ? (
        <Button type="button" variant="outline" size="sm" className={cn('shrink-0 self-start', COARSE)} onClick={onEdit}>
          <Settings2 aria-hidden="true" className="h-4 w-4" />
          Alert windows
        </Button>
      ) : null}
    </section>
  );
}

function Pager({ info, onPage, label }: { info: PageInfo; onPage: (page: number) => void; label: string }) {
  if (!info.hasPrevious && !info.hasNext) return null;
  return (
    <nav aria-label={`${label} pages`} className="flex items-center justify-end gap-2">
      <Button type="button" variant="outline" size="sm" className={COARSE} disabled={!info.hasPrevious} onClick={() => onPage(info.page - 1)}>
        <ChevronLeft aria-hidden="true" className="h-4 w-4" />
        Previous
      </Button>
      <span className="type-caption tabular-nums text-muted-foreground">{`Page ${info.page} of ${info.pages}`}</span>
      <Button type="button" variant="outline" size="sm" className={COARSE} disabled={!info.hasNext} onClick={() => onPage(info.page + 1)}>
        Next
        <ChevronRight aria-hidden="true" className="h-4 w-4" />
      </Button>
    </nav>
  );
}

// ─── The report ─────────────────────────────────────────────────────────

export interface ExpiryItemsReportProps {
  definition: ReportDefinition;
  variant: ExpiryReportVariant;
  /** The table's columns (wide screens); sorting is switched off (the server orders the list). */
  columns: (today: string) => ReadonlyArray<DataTableColumn<FleetExpiryItem>>;
  /** One item as a card below 768 px. */
  renderCard: (item: FleetExpiryItem, today: string) => React.ReactNode;
}

export function ExpiryItemsReport({ definition, variant, columns, renderCard }: ExpiryItemsReportProps) {
  const config = VARIANTS[variant];
  const shown = useFleetVesselsShown();
  const ready = shown.status === 'ready' ? shown : null;
  const { fleetReach } = useMembershipReach();
  const crewReach = variant === 'crew' && fleetReach;
  const shownVessels = ready?.shownVessels ?? NO_VESSELS;
  const companyId = ready?.companyId ?? null;
  const location = useLocation();
  const [params] = useSearchParams();
  const today = todayDateOnly();

  const specs = useMemo<readonly ReportFilterSpec[]>(
    () => (variant === 'crew' ? [STATUS_FILTER, VALID_FILTER, TYPE_FILTER, vesselFilterSpec(shownVessels)] : [STATUS_FILTER, VALID_FILTER]),
    [variant, shownVessels],
  );
  const { controller, applied, search, searchDraft, setSearchDraft, page, setPage } = useExpiryReportFilters(specs);

  const sources = useMemo<readonly string[]>(() => (variant === 'crew' ? crewSourcesFor(applied) : [...CERTIFICATE_SOURCES]), [variant, applied]);
  const buckets = bucketsFor(applied);
  const scope = useMemo(() => {
    if (variant === 'crew') return crewVesselScope(applied[VESSEL_FILTER_KEY] ?? '', shownVessels, crewReach);
    return { vesselIds: shownVessels.map((v) => v.id), includeUnassigned: false };
  }, [variant, applied, shownVessels, crewReach]);
  const fleetScope = useMemo(() => (companyId ? { companyId, vesselIds: scope.vesselIds } : null), [companyId, scope.vesselIds]);

  // One page of the list, every filter applied by the server; explicit vessel ids (reach-checked, D-X5-22).
  const items = useFleetExpiryItems(fleetScope, {
    sources,
    buckets,
    search: search || null,
    includeUnassigned: scope.includeUnassigned,
    limit: EXPIRY_REPORT_PAGE_SIZE,
    offset: (page - 1) * EXPIRY_REPORT_PAGE_SIZE,
    today,
  });
  const summary = useFleetExpirySummary(fleetScope, { today });

  // A different set of vessels shown starts again from page 1.
  const shownKey = ready ? ready.shownIds.join(',') : null;
  const previousShown = useRef(shownKey);
  useEffect(() => {
    if (previousShown.current !== null && shownKey !== null && previousShown.current !== shownKey && page > 1) setPage(1);
    if (shownKey !== null) previousShown.current = shownKey;
  }, [shownKey, page, setPage]);

  const windowsAdmin = useCapability(FLEET_CAPS.expiryWindowsAdmin);
  const [windowsOpen, setWindowsOpen] = useState(false);

  const queryClient = useQueryClient();
  const expiryPrefix = fleetKeys.expiry.all(companyId);
  const refreshing = useIsFetching({ queryKey: expiryPrefix }) > 0;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: expiryPrefix });

  const wide = useMinWidth(TABLET_MIN_WIDTH);
  const tableColumns = useMemo(() => columns(today).map((c) => ({ ...c, sortable: false })), [columns, today]);
  const rows = items.state === 'ready' ? items.data.items : NO_ITEMS;
  const info = pageInfo(page, rows.length, items.state === 'ready' ? items.data.total : 0);
  const loading = !ready || items.state === 'loading' || items.state === 'idle';
  const listLabel = definition.title;
  const filtered = !controller.isDefault;

  const tileHref = (bucket: ExpiryBucket) => `${location.pathname}?${bucketTileParams(params, bucket).toString()}`;
  const vesselsParam = ready && !ready.isDefault ? params.get(VESSELS_SHOWN_PARAM) : null;

  const exportBlockedReason =
    items.state === 'not_set_up'
      ? 'This report is not set up yet.'
      : items.state === 'error' || shown.status === 'error'
        ? 'The report could not load.'
        : items.state === 'no_vessels'
          ? 'There are no vessels to report on.'
          : null;
  const exportParams: Json = {
    status: applied[STATUS_FILTER.key] ?? STATUS_FILTER.defaultValue,
    valid: applied[VALID_FILTER.key] ?? VALID_FILTER.defaultValue,
    ...(variant === 'crew' ? { type: applied[TYPE_FILTER.key] ?? 'all', vessel: applied[VESSEL_FILTER_KEY] ?? 'all' } : {}),
    search: Boolean(search),
    page,
    vessels: ready && !ready.isDefault ? ready.shownVessels.map((v) => v.code) : 'counted',
  };

  const searchId = React.useId();
  const toolbar = (
    <>
      {ready ? (
        <div className="flex flex-col gap-1">
          <span className="type-caption text-muted-foreground">Vessels</span>
          <FleetVesselsFilter
            vessels={ready.vessels}
            selectedIds={ready.shownIds}
            countedIds={ready.countedIds}
            fleetGroups={ready.fleetGroups}
            droppedCodes={ready.droppedCodes}
            onApply={ready.setShown}
          />
        </div>
      ) : null}
      <div className="flex w-full flex-col gap-1 sm:w-56">
        <Label htmlFor={searchId} className="type-caption text-muted-foreground">
          {config.searchLabel}
        </Label>
        <Input
          id={searchId}
          type="search"
          value={searchDraft}
          maxLength={SEARCH_MAX_LENGTH}
          placeholder={config.searchPlaceholder}
          onChange={(event) => setSearchDraft(event.target.value)}
          className={cn('h-9', COARSE)}
        />
      </div>
    </>
  );

  let body: React.ReactNode;
  if (shown.status === 'error') {
    body = <PageError error={shown.error} title="Your vessels could not load" onRetry={shown.retry} headingLevel={2} />;
  } else if (items.state === 'not_set_up') {
    body = <PageEmpty icon={FileClock} title="This report is not set up yet" body={config.notSetUpBody} headingLevel={2} bordered />;
  } else if (items.state === 'no_vessels') {
    body = (
      <EmptyState
        title="No vessels to report on"
        body="The report covers the vessels you can reach. None is set up for you yet; ask your account admin."
        headingLevel={2}
        bordered
      />
    );
  } else {
    const empty = { title: config.emptyTitle, body: config.emptyBody };
    let list: React.ReactNode;
    if (items.state === 'ready' && info.pastEnd) {
      list = (
        <EmptyState
          kind="filtered"
          title="This page is past the end of the list"
          body="The list is shorter than it was. Go back to the first page."
          action={
            <Button type="button" variant="outline" size="sm" className={COARSE} onClick={() => setPage(1)}>
              First page
            </Button>
          }
          headingLevel={2}
          bordered
          compact
        />
      );
    } else if (wide) {
      list = (
        <DataTable
          label={listLabel}
          noun={config.noun}
          data={rows}
          columns={tableColumns}
          getRowId={(r) => expiryItemId(r)}
          isLoading={loading}
          error={items.state === 'error' ? items.error : undefined}
          onRetry={items.state === 'error' ? items.retry : undefined}
          empty={empty}
          hasExternalFilters={filtered}
          onClearFilters={controller.reset}
          searchable={false}
          showDensityToggle={false}
          summary={() => pageSummaryText(info, config.noun)}
        />
      );
    } else {
      list = (
        <div className="space-y-2">
          <ReportTable
            label={listLabel}
            noun={config.noun}
            rows={rows}
            columns={tableColumns}
            getRowId={(r) => expiryItemId(r)}
            renderCard={(r) => renderCard(r, today)}
            isLoading={loading}
            error={items.state === 'error' ? items.error : undefined}
            onRetry={items.state === 'error' ? items.retry : undefined}
            empty={empty}
            hasExternalFilters={filtered}
            onClearFilters={controller.reset}
          />
          {items.state === 'ready' && rows.length > 0 ? (
            <p aria-live="polite" className="type-caption tabular-nums text-muted-foreground">
              {pageSummaryText(info, config.noun)}
            </p>
          ) : null}
        </div>
      );
    }
    body = (
      <>
        <BucketTiles summary={summary} sources={sources} endorsements={config.endorsements} tileHref={tileHref} listsUnassigned={scope.includeUnassigned} />
        <WarningWindows
          companyId={companyId}
          itemTypes={config.itemTypes}
          canEdit={windowsAdmin.allowed}
          onEdit={() => setWindowsOpen(true)}
        />
        {list}
        {items.state === 'ready' ? <Pager info={info} onPage={setPage} label={listLabel} /> : null}
      </>
    );
  }

  return (
    <ReportShell<FleetExpiryItem>
      definition={definition}
      generatedAt={items.state === 'ready' ? items.updatedAt : null}
      refreshing={refreshing}
      onRefresh={ready ? refresh : undefined}
      vesselsParam={vesselsParam}
      toolbar={toolbar}
      filters={controller}
      exportSpec={
        items.state === 'ready'
          ? { kind: config.kind, columns: variant === 'crew' ? CREW_DOCUMENT_EXPORT_COLUMNS : CERTIFICATE_EXPORT_COLUMNS, rows, params: exportParams }
          : null
      }
      exportBlockedReason={exportBlockedReason}
    >
      {body}
      {windowsAdmin.allowed ? (
        <ExpiryWindowsDrawer open={windowsOpen} onOpenChange={setWindowsOpen} companyId={companyId} focusTypes={config.itemTypes} />
      ) : null}
    </ReportShell>
  );
}

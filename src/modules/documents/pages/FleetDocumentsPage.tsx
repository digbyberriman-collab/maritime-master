/**
 * Fleet › Compliance › Documents (`/fleet/documents`; gap/02 FD1, FD2,
 * FD4, FD5, FD10, X1; DECISIONS D-01, D-04, D-88, D-X5-03; X5 spec
 * X5-04A). The library of documents the company publishes to its vessels.
 *
 * - Gate: `fleet.operations.fleet_documents.view` (the route guard uses the
 *   same key). Nothing is read until it is granted: while it loads the page
 *   is a skeleton, denied is AccessDenied (fail closed).
 * - URL: `?tab=documents|acknowledgements`, `?section=<id>`,
 *   `?vessel=<code>`, `?settings=1` (the settings drawer).
 * - Documents tab: the sections with their document counts and "n not
 *   uploaded" (rail beside the list from 1024 px, a picker below), search,
 *   a vessel filter (documents that reach the vessel: published to all
 *   vessels, or to that one) and status chips (current = published and
 *   drafts, the default); a DataTable with title, type, version, date,
 *   vessels ("All n" / "k of n"), acknowledged (X5-05B; explained dash
 *   until then) and status; cards below 768 px; the document types with
 *   nothing published under the list (FD5).
 * - Header: one freshness stamp and Refresh (D-88), "Controlled register"
 *   (the live register at /fleet/documents/register), and "Library
 *   settings" for editors (`fleet.operations.fleet_documents.edit`).
 * - Acknowledgements tab: says it is not set up yet (X5-05B builds it).
 *
 * D-01: while the library's tables are missing the page says "Fleet
 * documents are not set up yet" with a link to the register; any other
 * error is PageError with Retry; never sample rows. Tokens only; 44 px
 * targets on coarse pointers; usable at 390 px.
 */
import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, FileText, Library, RefreshCw, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useCapability } from '@/lib/permissions/useCan';
import { cn } from '@/lib/utils';
import { CountChips, DataTable, SearchField, type DataTableColumn } from '@/shared/components/data';
import { TABLET_MIN_WIDTH, useMinWidth } from '@/shared/components/data/useMinWidth';
import PageHeader from '@/shared/components/layout/PageHeader';
import { AccessDenied, EmptyState, PageEmpty, PageError, PageLoading } from '@/shared/components/states';
import { StatusPill } from '@/shared/components/status';
import { useBrandingContext } from '@/shared/contexts/BrandingContext';
import { useFleetVesselsShown, type ShownVessel } from '@/modules/fleet';
import { DocumentSettingsDrawer } from '../components/DocumentSettingsDrawer';
import { fleetDocumentKeys } from '../hooks/keys';
import { useFleetDocuments } from '../hooks/useFleetDocuments';
import { useFleetDocumentTaxonomy } from '../hooks/useFleetDocumentTaxonomy';
import {
  LIBRARY_STATUS_FILTERS,
  LIBRARY_STATUS_LABELS,
  buildFleetDocumentLibrary,
  filterLibraryRows,
  formatDateOnly,
  formatUpdatedUtc,
  notUploadedLabel,
  parseLibraryStatus,
  statusCounts,
  vesselForCode,
  type FleetDocumentLibrary,
  type LibraryRow,
  type LibrarySectionSummary,
  type LibraryStatusFilter,
  type LibraryVessel,
} from '../lib/fleetDocumentLibrary';
import { DOCUMENTS_CAPS, FLEET_DOCUMENTS_PARAMS } from '../paths';

const COARSE = '[@media(pointer:coarse)]:min-h-11';
const REGISTER_PATH = '/fleet/documents/register';
const RAIL_MIN_WIDTH = 1024;
const ACK_NOT_SET_UP = 'Acknowledgements are not set up yet';

type Tab = 'documents' | 'acknowledgements';
const parseTab = (value: string | null): Tab => (value === 'acknowledgements' ? 'acknowledgements' : 'documents');

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

const FleetDocumentsPage: React.FC = () => {
  const access = useCapability(DOCUMENTS_CAPS.view);
  if (access.status === 'loading') return <PageLoading variant="list" label="Loading fleet documents" />;
  if (!access.allowed) {
    return <AccessDenied detail="The fleet document library needs access to fleet documents. If you think you should see it, ask your account admin." />;
  }
  return <FleetDocumentsBody />;
};

export default FleetDocumentsPage;

// ─── Body ───────────────────────────────────────────────────────────────

function FleetDocumentsBody() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { clientDisplayName, companyName } = useBrandingContext();
  const eyebrow = clientDisplayName?.trim() || companyName?.trim() || 'Fleet';
  const edit = useCapability(DOCUMENTS_CAPS.edit);
  const [params, setParams] = useSearchParams();
  const tab = parseTab(params.get(FLEET_DOCUMENTS_PARAMS.tab));
  const settingsOpen = params.get(FLEET_DOCUMENTS_PARAMS.settings) === '1';

  const taxonomy = useFleetDocumentTaxonomy(companyId);
  const documents = useFleetDocuments(companyId);
  const shown = useFleetVesselsShown();
  const queryClient = useQueryClient();

  const vessels = useMemo<LibraryVessel[]>(
    () => (shown.status === 'ready' ? shown.vessels.map((v: ShownVessel) => ({ id: v.id, name: v.name, code: v.code, counted: v.counted })) : []),
    [shown],
  );
  const library = useMemo<FleetDocumentLibrary | null>(() => {
    if (taxonomy.state !== 'ready' || documents.state !== 'ready' || shown.status !== 'ready') return null;
    return buildFleetDocumentLibrary({ ...taxonomy.taxonomy, ...documents.data, vessels });
  }, [taxonomy, documents, shown.status, vessels]);

  const setParam = (key: string, value: string | null) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );

  const refreshing = (taxonomy.state === 'ready' && taxonomy.refreshing) || (documents.state === 'ready' && documents.refreshing);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: fleetDocumentKeys.company(companyId) });
  const stamps = [taxonomy, documents].flatMap((s) => (s.state === 'ready' ? [s.updatedAt] : []));
  const updatedAt = stamps.length === 2 ? Math.min(...stamps) : null;
  const notSetUp = taxonomy.state === 'not_set_up' || documents.state === 'not_set_up';

  const header = (
    <PageHeader
      eyebrow={eyebrow}
      title="Fleet documents"
      description="The documents the company publishes to its vessels, by section."
      actions={
        <>
          {updatedAt ? (
            <span className="type-caption tabular-nums text-muted-foreground" data-testid="documents-updated">
              {formatUpdatedUtc(updatedAt)}
            </span>
          ) : null}
          {!notSetUp ? (
            <Button type="button" variant="outline" size="sm" className={COARSE} onClick={refresh} disabled={refreshing || !companyId}>
              <RefreshCw aria-hidden="true" className={cn('h-4 w-4', refreshing && 'motion-safe:animate-spin')} />
              Refresh
            </Button>
          ) : null}
          <Button asChild variant="outline" size="sm" className={COARSE}>
            <Link to={REGISTER_PATH}>
              <BookOpen aria-hidden="true" className="h-4 w-4" />
              Controlled register
            </Link>
          </Button>
          {edit.allowed && !notSetUp ? (
            <Button type="button" variant="outline" size="sm" className={COARSE} onClick={() => setParam(FLEET_DOCUMENTS_PARAMS.settings, '1')}>
              <Settings2 aria-hidden="true" className="h-4 w-4" />
              Library settings
            </Button>
          ) : null}
        </>
      }
    />
  );

  const drawer = (
    <DocumentSettingsDrawer
      open={settingsOpen}
      onOpenChange={(open) => setParam(FLEET_DOCUMENTS_PARAMS.settings, open ? '1' : null)}
      companyId={companyId}
      taxonomy={taxonomy}
      sections={library?.sections ?? null}
    />
  );

  if (notSetUp) {
    return (
      <div className="space-y-4">
        {header}
        <PageEmpty
          icon={Library}
          title="Fleet documents are not set up yet"
          body="The library opens here once this part of STORM is set up. Until then the company's documents are in the controlled register."
          action={
            <Button asChild size="sm" className={COARSE}>
              <Link to={REGISTER_PATH}>Open the controlled register</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const error =
    taxonomy.state === 'error' ? { e: taxonomy.error, retry: taxonomy.retry, title: 'The library sections could not load' }
    : documents.state === 'error' ? { e: documents.error, retry: documents.retry, title: 'The fleet documents could not load' }
    : shown.status === 'error' ? { e: shown.error, retry: shown.retry, title: 'Your vessels could not load' }
    : null;
  if (error) {
    return (
      <div className="space-y-4">
        {header}
        <PageError error={error.e} title={error.title} onRetry={error.retry} />
        {drawer}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {header}
      <nav aria-label="Fleet documents views" className="flex gap-1 border-b border-border">
        {(
          [
            ['documents', 'Documents'],
            ['acknowledgements', 'Acknowledgements'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-current={tab === key ? 'page' : undefined}
            onClick={() => setParam(FLEET_DOCUMENTS_PARAMS.tab, key === 'documents' ? null : key)}
            className={cn(
              'focus-ring -mb-px inline-flex h-10 items-center border-b-2 px-3 text-sm font-medium transition-colors duration-quick',
              COARSE,
              tab === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === 'acknowledgements' ? (
        <EmptyState
          kind="not-enabled"
          title={ACK_NOT_SET_UP}
          body="Once they are, this tab shows who has read and acknowledged each document on every vessel, with due dates."
          bordered
        />
      ) : library ? (
        <LibraryView library={library} vessels={vessels} canEdit={edit.allowed} params={params} setParam={setParam} />
      ) : (
        <PageLoading variant="list" label="Loading fleet documents" />
      )}
      {drawer}
    </div>
  );
}

// ─── The documents tab ──────────────────────────────────────────────────

interface LibraryViewProps {
  library: FleetDocumentLibrary;
  vessels: readonly LibraryVessel[];
  canEdit: boolean;
  params: URLSearchParams;
  setParam: (key: string, value: string | null) => void;
}

const ALL = '__all__';

function LibraryView({ library, vessels, canEdit, params, setParam }: LibraryViewProps) {
  const wide = useMinWidth(TABLET_MIN_WIDTH);
  const rail = useMinWidth(RAIL_MIN_WIDTH);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<LibraryStatusFilter>(() => parseLibraryStatus(null));

  const sectionParam = params.get(FLEET_DOCUMENTS_PARAMS.section);
  const section = library.sections.find((s) => s.id === sectionParam) ?? null;
  const vessel = vesselForCode(vessels, params.get(FLEET_DOCUMENTS_PARAMS.vessel));
  const filters = { sectionId: section?.id ?? null, vessel, search };
  const rows = filterLibraryRows(library.rows, { ...filters, status });
  const counts = statusCounts(library.rows, filters);
  const hasFilters = Boolean(section || vessel || search.trim() || status !== 'current');
  const clearFilters = () => {
    setSearch('');
    setStatus('current');
    setParam(FLEET_DOCUMENTS_PARAMS.section, null);
    setParam(FLEET_DOCUMENTS_PARAMS.vessel, null);
  };

  if (!library.sections.length) {
    return (
      <EmptyState
        icon={Library}
        title="No sections yet"
        body={
          canEdit
            ? 'Add sections and document types in Library settings; documents are published into them.'
            : 'The company has not set up the sections of its document library yet.'
        }
        action={
          canEdit ? (
            <Button type="button" size="sm" className={COARSE} onClick={() => setParam(FLEET_DOCUMENTS_PARAMS.settings, '1')}>
              Open library settings
            </Button>
          ) : undefined
        }
        bordered
      />
    );
  }

  const columns: DataTableColumn<LibraryRow>[] = [
    {
      id: 'title',
      header: 'Title',
      sticky: true,
      minWidth: 220,
      value: (r) => r.title,
      cell: (r) => (
        <div className="min-w-0">
          <p className="break-words font-medium text-foreground">{r.title}</p>
          {r.status === 'published' && r.draft ? <p className="type-caption text-muted-foreground">{`${r.draft.label} in draft`}</p> : null}
          {r.status === 'withdrawn' && r.withdrawnReason ? <p className="type-caption text-muted-foreground">{r.withdrawnReason}</p> : null}
        </div>
      ),
    },
    { id: 'type', header: 'Type', minWidth: 140, value: (r) => r.typeName },
    {
      id: 'version',
      header: 'Version',
      kind: 'reference',
      value: (r) => r.current?.label ?? r.draft?.label ?? null,
      cell: (r) =>
        r.current ? r.current.label : r.draft ? <span className="text-muted-foreground">{`${r.draft.label} (draft)`}</span> : null,
      emptyReason: 'No version yet',
    },
    {
      id: 'date',
      header: 'Date',
      kind: 'date',
      sortDescFirst: true,
      value: (r) => (r.current ?? r.draft)?.effectiveDate ?? null,
      cell: (r) => formatDateOnly((r.current ?? r.draft)?.effectiveDate),
      emptyReason: 'No version yet',
    },
    {
      id: 'vessels',
      header: 'Vessels',
      className: 'whitespace-nowrap',
      value: (r) => r.vesselCount,
      cell: (r) => <VesselsCell row={r} vessels={vessels} />,
    },
    {
      id: 'acknowledged',
      header: 'Acknowledged',
      sortable: false,
      searchable: false,
      cell: () => null,
      emptyReason: ACK_NOT_SET_UP,
    },
    {
      id: 'status',
      header: 'Status',
      value: (r) => r.status,
      cell: (r) => <StatusPill domain="fleet_document" status={r.status} />,
    },
  ];

  const sectionsFor = section ? [section] : library.sections;
  const notUploaded = sectionsFor.flatMap((s) => s.notUploaded.map((t) => ({ ...t, sectionName: s.name })));

  return (
    <div className={cn('grid gap-4', rail && 'grid-cols-[15rem_minmax(0,1fr)]')}>
      {rail ? (
        <SectionRail library={library} activeId={section?.id ?? null} onSelect={(id) => setParam(FLEET_DOCUMENTS_PARAMS.section, id)} />
      ) : null}
      <div className="min-w-0 space-y-3">
        <div role="group" aria-label="Filter documents" className="flex flex-wrap items-center gap-2">
          {!rail ? (
            <Select value={section?.id ?? ALL} onValueChange={(v) => setParam(FLEET_DOCUMENTS_PARAMS.section, v === ALL ? null : v)}>
              <SelectTrigger aria-label="Section" className={cn('h-9 w-full sm:w-56', COARSE)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{`All sections (${library.sections.reduce((n, s) => n + s.documentCount, 0)})`}</SelectItem>
                {library.sections.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{`${s.name} (${s.documentCount})`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <SearchField value={search} onChange={setSearch} placeholder="Search titles, types, versions" label="Search documents" className="sm:w-64" />
          <Select value={vessel?.code?.toLowerCase() ?? ALL} onValueChange={(v) => setParam(FLEET_DOCUMENTS_PARAMS.vessel, v === ALL ? null : v)}>
            <SelectTrigger aria-label="Vessel" className={cn('h-9 w-full sm:w-52', COARSE)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All vessels</SelectItem>
              {vessels
                .filter((v) => v.code)
                .map((v) => (
                  <SelectItem key={v.id} value={(v.code as string).toLowerCase()}>
                    {v.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <CountChips
          label="Filter by status"
          activeId={status}
          onChange={(id) => setStatus(parseLibraryStatus(id))}
          chips={LIBRARY_STATUS_FILTERS.filter((f) => f !== 'draft' || canEdit || counts.draft > 0).map((f) => ({ id: f, label: LIBRARY_STATUS_LABELS[f], count: counts[f] }))}
        />

        {wide ? (
          <DataTable
            label="Fleet documents"
            noun={{ one: 'document', other: 'documents' }}
            data={rows}
            columns={columns}
            getRowId={(r) => r.id}
            searchable={false}
            showDensityToggle={false}
            defaultSort={{ columnId: 'title', direction: 'asc' }}
            hasExternalFilters={hasFilters}
            onClearFilters={clearFilters}
            empty={{
              icon: FileText,
              title: 'Nothing published yet',
              body: 'Documents the company publishes to its vessels appear here, grouped by section.',
            }}
            maxHeight="none"
          />
        ) : (
          <DocumentCards rows={rows} vessels={vessels} hasFilters={hasFilters} onClearFilters={clearFilters} total={library.rows.length} />
        )}

        {notUploaded.length ? (
          <section aria-labelledby="not-uploaded-heading" className="rounded-lg border border-dashed border-border p-3">
            <h2 id="not-uploaded-heading" className="text-sm font-semibold text-foreground">
              {`Not uploaded: ${plural(notUploaded.length, 'document type')} with nothing published`}
            </h2>
            <ul className="mt-2 flex flex-wrap gap-2">
              {notUploaded.map((t) => (
                <li key={t.id} className="rounded-md border border-border bg-card px-2 py-1 text-sm text-muted-foreground">
                  <span className="text-foreground">{t.name}</span>
                  {section ? null : <span>{` · ${t.sectionName}`}</span>}
                  {t.hideWhenEmpty ? <span>{' · hidden on vessels'}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function SectionRail({ library, activeId, onSelect }: { library: FleetDocumentLibrary; activeId: string | null; onSelect: (id: string | null) => void }) {
  const total = library.sections.reduce((n, s) => n + s.documentCount, 0);
  const item = (key: string, id: string | null, name: string, count: number, notUploaded: number) => (
    <li key={key}>
      <button
        type="button"
        aria-current={activeId === id ? 'true' : undefined}
        onClick={() => onSelect(id)}
        className={cn(
          'focus-ring flex w-full items-start justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors duration-quick',
          COARSE,
          activeId === id ? 'bg-signal-muted text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )}
      >
        <span className="min-w-0">
          <span className="block break-words font-medium">{name}</span>
          {notUploaded > 0 ? <span className="type-caption block text-muted-foreground">{notUploadedLabel(notUploaded)}</span> : null}
        </span>
        <span className="shrink-0 tabular-nums font-semibold text-foreground">{count.toLocaleString('en-GB')}</span>
      </button>
    </li>
  );
  return (
    <nav aria-label="Sections">
      <ul className="space-y-0.5">
        {item('all', null, 'All sections', total, library.notUploaded.length)}
        {library.sections.map((s: LibrarySectionSummary) => item(s.id, s.id, s.name, s.documentCount, s.notUploaded.length))}
      </ul>
    </nav>
  );
}

function VesselsCell({ row, vessels }: { row: LibraryRow; vessels: readonly LibraryVessel[] }) {
  const names =
    row.targetMode === 'selected'
      ? row.targetVesselIds.map((id) => vessels.find((v) => v.id === id)?.name ?? 'A vessel you do not reach').join(', ')
      : 'Every counted vessel, also ones added later';
  return (
    <span className="tabular-nums" title={names}>
      {row.vesselsLabel}
      <span className="sr-only">{`: ${names}`}</span>
    </span>
  );
}

function DocumentCards({
  rows,
  vessels,
  hasFilters,
  onClearFilters,
  total,
}: {
  rows: readonly LibraryRow[];
  vessels: readonly LibraryVessel[];
  hasFilters: boolean;
  onClearFilters: () => void;
  total: number;
}) {
  if (!rows.length) {
    return hasFilters && total > 0 ? (
      <PageEmpty filtered onClearFilters={onClearFilters} bordered compact />
    ) : (
      <EmptyState icon={FileText} title="Nothing published yet" body="Documents the company publishes to its vessels appear here, grouped by section." bordered compact />
    );
  }
  return (
    <ul aria-label="Fleet documents" className="space-y-2">
      {rows.map((r) => {
        const version = r.current ?? r.draft;
        return (
          <li key={r.id}>
            <Card className="space-y-1.5 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 break-words font-medium text-foreground">{r.title}</p>
                <StatusPill domain="fleet_document" status={r.status} />
              </div>
              <p className="type-caption text-muted-foreground">{[r.typeName, r.sectionName].filter(Boolean).join(' · ')}</p>
              <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-foreground">
                <span className="font-mono">{version ? (r.current ? version.label : `${version.label} (draft)`) : 'No version yet'}</span>
                {version ? <span>{formatDateOnly(version.effectiveDate)}</span> : null}
                <VesselsCell row={r} vessels={vessels} />
              </p>
              {r.status === 'published' && r.draft ? <p className="type-caption text-muted-foreground">{`${r.draft.label} in draft`}</p> : null}
              {r.status === 'withdrawn' && r.withdrawnReason ? <p className="type-caption text-muted-foreground">{r.withdrawnReason}</p> : null}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

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
 *   vessels ("All n" / "k of n"), acknowledged ("n of m" with a per-person
 *   bar and the overdue count, X5-05B; an explained dash for drafts,
 *   documents without acknowledgement, or while acknowledgements are not
 *   set up) and status; cards below 768 px; the document types with
 *   nothing published under the list (FD5).
 * - Header: one freshness stamp and Refresh (D-88), "Controlled register"
 *   (the live register at /fleet/documents/register), and "Library
 *   settings" for editors (`fleet.operations.fleet_documents.edit`).
 * - Acknowledgements tab (X5-05B; gap/02 FD6, FD7): AcknowledgementsTab,
 *   `?tab=acknowledgements&doc=<id>`: per document and vessel who has
 *   acknowledged, who still has to and why someone cannot; Remind for
 *   editors. The counts are one `fleet_document_summary` read, shared with
 *   the Acknowledged column.
 * - Publishing (X5-04B; gap/02 FD3, FD4, W1), for editors only:
 *   "Publish document" in the header (and on each "Not uploaded" type
 *   slot) opens PublishDocumentDialog; a row's menu finishes a draft,
 *   uploads a new version, withdraws (WithdrawDocumentDialog) or deletes a
 *   draft (DeleteDraftDialog). Every reader opens a row's version history
 *   (VersionHistoryDrawer) by clicking it or from its menu.
 *
 * D-01: while the library's tables are missing the page says "Fleet
 * documents are not set up yet" with a link to the register; any other
 * error is PageError with Retry; never sample rows. Tokens only; 44 px
 * targets on coarse pointers; usable at 390 px.
 */
import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, FilePlus2, FileText, History, Library, MoreHorizontal, RefreshCw, Settings2, Trash2, Undo2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { PublishDocumentDialog } from '../components/PublishDocumentDialog';
import { VersionHistoryDrawer } from '../components/VersionHistoryDrawer';
import { DeleteDraftDialog, WithdrawDocumentDialog } from '../components/WithdrawDocumentDialog';
import { fleetDocumentActions } from '../lib/fleetDocumentMachine';
import { AckBar, AcknowledgementsTab } from '../components/AcknowledgementsTab';
import { summariseByDocument, type AckCounts, type DocumentAckSummary } from '../lib/ackAdmin';
import { fleetDocumentKeys } from '../hooks/keys';
import { useFleetDocumentSummary } from '../hooks/useFleetDocumentAcks';
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
import { DOCUMENTS_CAPS, FLEET_DOCUMENT_DOC_PARAM, FLEET_DOCUMENTS_PARAMS } from '../paths';

const COARSE = '[@media(pointer:coarse)]:min-h-11';
const REGISTER_PATH = '/fleet/documents/register';
const RAIL_MIN_WIDTH = 1024;
const ACK_NOT_SET_UP = 'Acknowledgements are not set up yet';

type Tab = 'documents' | 'acknowledgements';
const parseTab = (value: string | null): Tab => (value === 'acknowledgements' ? 'acknowledgements' : 'documents');

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

/** The one dialog or drawer open over the library (X5-04B). */
type Overlay =
  | { kind: 'publish'; document: LibraryRow | null; typeId: string | null }
  | { kind: 'history'; document: LibraryRow }
  | { kind: 'withdraw'; document: LibraryRow }
  | { kind: 'delete'; document: LibraryRow }
  | null;

/** The Acknowledged column's source: the page's one summary read. */
type AckColumn = { state: 'loading' | 'not_set_up' | 'error' } | { state: 'ready'; byDocument: ReadonlyMap<string, DocumentAckSummary> };

/** A row's acknowledgement counts, or why the cell is a dash. */
function ackCell(row: LibraryRow, ack: AckColumn): { counts: AckCounts } | { reason: string } {
  if (row.status === 'draft') return { reason: 'Not published yet' };
  if (row.status === 'withdrawn') return { reason: 'Withdrawn: no longer acknowledged' };
  if (!row.ackRequired) return { reason: 'No acknowledgement needed' };
  if (ack.state !== 'ready') {
    return { reason: ack.state === 'not_set_up' ? ACK_NOT_SET_UP : ack.state === 'error' ? 'The acknowledgements could not load' : 'Loading acknowledgements' };
  }
  const summary = ack.byDocument.get(row.id);
  if (!summary || summary.counts.total === 0) return { reason: 'Nobody on the crew lists of its vessels' };
  return { counts: summary.counts };
}

/** What a row (or a type slot) can open. */
interface LibraryActions {
  openHistory: (row: LibraryRow) => void;
  /** Editors only: publish a new document (optionally of a type), finish a draft, or upload a new version. */
  publish: ((row: LibraryRow | null, typeId?: string | null) => void) | null;
  withdraw: ((row: LibraryRow) => void) | null;
  deleteDraft: ((row: LibraryRow) => void) | null;
}

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
  const summary = useFleetDocumentSummary(companyId, null);
  const shown = useFleetVesselsShown();
  const queryClient = useQueryClient();
  const [overlay, setOverlay] = useState<Overlay>(null);
  const closeOverlay = () => setOverlay(null);

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

  const ackColumn = useMemo<AckColumn>(() => {
    if (summary.state === 'ready') {
      const current = new Map((library?.rows ?? []).map((r) => [r.id, r.current?.id ?? null] as const));
      return { state: 'ready', byDocument: summariseByDocument(summary.data, current) };
    }
    if (summary.state === 'not_set_up' || summary.state === 'error') return { state: summary.state };
    return { state: 'loading' };
  }, [summary, library]);

  const refreshing =
    (taxonomy.state === 'ready' && taxonomy.refreshing) || (documents.state === 'ready' && documents.refreshing) || (summary.state === 'ready' && summary.refreshing);
  // The company prefix holds the library and every acknowledgement read.
  const refresh = () => void queryClient.invalidateQueries({ queryKey: fleetDocumentKeys.company(companyId) });
  // One stamp (D-88): the oldest read the tab shows (the library's, and on the acknowledgements tab the counts').
  const reads = tab === 'acknowledgements' ? [taxonomy, documents, summary] : [taxonomy, documents];
  const stamps = reads.flatMap((s) => (s.state === 'ready' ? [s.updatedAt] : []));
  const updatedAt = stamps.length === reads.length ? Math.min(...stamps) : null;
  const notSetUp = taxonomy.state === 'not_set_up' || documents.state === 'not_set_up';
  const types = taxonomy.state === 'ready' ? taxonomy.taxonomy.types : [];
  const canPublish = edit.allowed && !notSetUp && library !== null && types.length > 0;
  const actions: LibraryActions = {
    openHistory: (row) => setOverlay({ kind: 'history', document: row }),
    publish: canPublish ? (row, typeId = null) => setOverlay({ kind: 'publish', document: row, typeId }) : null,
    withdraw: edit.allowed ? (row) => setOverlay({ kind: 'withdraw', document: row }) : null,
    deleteDraft: edit.allowed ? (row) => setOverlay({ kind: 'delete', document: row }) : null,
  };

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
          {canPublish ? (
            <Button type="button" size="sm" className={COARSE} onClick={() => setOverlay({ kind: 'publish', document: null, typeId: null })}>
              <FilePlus2 aria-hidden="true" className="h-4 w-4" />
              Publish document
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
            onClick={() =>
              setParams(
                (current) => {
                  const next = new URLSearchParams(current);
                  if (key === 'documents') {
                    next.delete(FLEET_DOCUMENTS_PARAMS.tab);
                    next.delete(FLEET_DOCUMENT_DOC_PARAM);
                  } else next.set(FLEET_DOCUMENTS_PARAMS.tab, key);
                  return next;
                },
                { replace: true },
              )
            }
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
      {tab === 'acknowledgements' && library ? (
        <AcknowledgementsTab
          companyId={companyId}
          library={library}
          vessels={vessels}
          summary={summary}
          canRemind={edit.allowed}
          callerProfileId={profile?.id ?? null}
          documentId={params.get(FLEET_DOCUMENT_DOC_PARAM)}
          onSelectDocument={(id) => setParam(FLEET_DOCUMENT_DOC_PARAM, id)}
        />
      ) : library ? (
        <LibraryView
          library={library}
          vessels={vessels}
          canEdit={edit.allowed}
          actions={actions}
          params={params}
          setParam={setParam}
          ack={ackColumn}
          onOpenAcknowledgements={(row) =>
            setParams(
              (current) => {
                const next = new URLSearchParams(current);
                next.set(FLEET_DOCUMENTS_PARAMS.tab, 'acknowledgements');
                next.set(FLEET_DOCUMENT_DOC_PARAM, row.id);
                return next;
              },
              { replace: false },
            )
          }
        />
      ) : (
        <PageLoading variant="list" label="Loading fleet documents" />
      )}
      {drawer}
      {library ? (
        <>
          <PublishDocumentDialog
            open={overlay?.kind === 'publish'}
            onOpenChange={(open) => (!open ? closeOverlay() : undefined)}
            companyId={companyId}
            types={types}
            sections={taxonomy.state === 'ready' ? taxonomy.taxonomy.sections : []}
            vessels={shown.status === 'ready' ? shown.vessels : []}
            fleetGroups={shown.status === 'ready' ? shown.fleetGroups : []}
            document={overlay?.kind === 'publish' ? overlay.document : null}
            initialTypeId={overlay?.kind === 'publish' ? overlay.typeId : null}
          />
          <VersionHistoryDrawer
            open={overlay?.kind === 'history'}
            onOpenChange={(open) => (!open ? closeOverlay() : undefined)}
            companyId={companyId}
            document={overlay?.kind === 'history' ? overlay.document : null}
            vessels={vessels}
            canEdit={edit.allowed}
            onPublish={actions.publish ? (row) => actions.publish?.(row) : undefined}
            onWithdraw={actions.withdraw ?? undefined}
          />
          <WithdrawDocumentDialog
            open={overlay?.kind === 'withdraw'}
            onOpenChange={(open) => (!open ? closeOverlay() : undefined)}
            companyId={companyId}
            document={overlay?.kind === 'withdraw' ? overlay.document : null}
          />
          <DeleteDraftDialog
            open={overlay?.kind === 'delete'}
            onOpenChange={(open) => (!open ? closeOverlay() : undefined)}
            companyId={companyId}
            document={overlay?.kind === 'delete' ? overlay.document : null}
          />
        </>
      ) : null}
    </div>
  );
}

// ─── The documents tab ──────────────────────────────────────────────────

interface LibraryViewProps {
  library: FleetDocumentLibrary;
  vessels: readonly LibraryVessel[];
  canEdit: boolean;
  actions: LibraryActions;
  params: URLSearchParams;
  setParam: (key: string, value: string | null) => void;
  ack: AckColumn;
  onOpenAcknowledgements: (row: LibraryRow) => void;
}

const ALL = '__all__';

function LibraryView({ library, vessels, canEdit, actions, params, setParam, ack, onOpenAcknowledgements }: LibraryViewProps) {
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
      minWidth: 140,
      cell: (r) => {
        const cell = ackCell(r, ack);
        return 'counts' in cell ? <AckSummaryCell row={r} counts={cell.counts} onOpen={onOpenAcknowledgements} /> : null;
      },
      emptyReason: (r) => {
        const cell = ackCell(r, ack);
        return 'reason' in cell ? cell.reason : undefined;
      },
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
              action: actions.publish ? <PublishFirstButton onClick={() => actions.publish?.(null)} /> : undefined,
            }}
            onRowClick={actions.openHistory}
            rowLabel={(r) => `Version history of ${r.title}`}
            rowActions={(r) => <RowMenu row={r} actions={actions} />}
            maxHeight="none"
          />
        ) : (
          <DocumentCards
            rows={rows}
            vessels={vessels}
            hasFilters={hasFilters}
            onClearFilters={clearFilters}
            total={library.rows.length}
            actions={actions}
            ack={ack}
            onOpenAcknowledgements={onOpenAcknowledgements}
          />
        )}

        {notUploaded.length ? (
          <section aria-labelledby="not-uploaded-heading" className="rounded-lg border border-dashed border-border p-3">
            <h2 id="not-uploaded-heading" className="text-sm font-semibold text-foreground">
              {`Not uploaded: ${plural(notUploaded.length, 'document type')} with nothing published`}
            </h2>
            <ul className="mt-2 flex flex-wrap gap-2">
              {notUploaded.map((t) => (
                <li key={t.id} className="flex items-center gap-1 rounded-md border border-border bg-card py-1 pl-2 pr-1 text-sm text-muted-foreground">
                  <span>
                    <span className="text-foreground">{t.name}</span>
                    {section ? null : <span>{` · ${t.sectionName}`}</span>}
                    {t.hideWhenEmpty ? <span>{' · hidden on vessels'}</span> : null}
                  </span>
                  {actions.publish ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={cn('h-7 px-2', COARSE)}
                      aria-label={`Publish a document of type ${t.name}`}
                      onClick={() => actions.publish?.(null, t.id)}
                    >
                      <Upload aria-hidden="true" className="h-3.5 w-3.5" />
                      Publish
                    </Button>
                  ) : null}
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
  actions,
  ack,
  onOpenAcknowledgements,
}: {
  rows: readonly LibraryRow[];
  vessels: readonly LibraryVessel[];
  hasFilters: boolean;
  onClearFilters: () => void;
  total: number;
  actions: LibraryActions;
  ack: AckColumn;
  onOpenAcknowledgements: (row: LibraryRow) => void;
}) {
  if (!rows.length) {
    return hasFilters && total > 0 ? (
      <PageEmpty filtered onClearFilters={onClearFilters} bordered compact />
    ) : (
      <EmptyState
        icon={FileText}
        title="Nothing published yet"
        body="Documents the company publishes to its vessels appear here, grouped by section."
        action={actions.publish ? <PublishFirstButton onClick={() => actions.publish?.(null)} /> : undefined}
        bordered
        compact
      />
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
                <button
                  type="button"
                  onClick={() => actions.openHistory(r)}
                  aria-label={`Version history of ${r.title}`}
                  className="focus-ring min-w-0 rounded-sm text-left font-medium text-foreground underline-offset-2 hover:underline"
                >
                  <span className="break-words">{r.title}</span>
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <StatusPill domain="fleet_document" status={r.status} />
                  <RowMenu row={r} actions={actions} />
                </div>
              </div>
              <p className="type-caption text-muted-foreground">{[r.typeName, r.sectionName].filter(Boolean).join(' · ')}</p>
              <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-foreground">
                <span className="font-mono">{version ? (r.current ? version.label : `${version.label} (draft)`) : 'No version yet'}</span>
                {version ? <span>{formatDateOnly(version.effectiveDate)}</span> : null}
                <VesselsCell row={r} vessels={vessels} />
              </p>
              {r.status === 'published' && r.draft ? <p className="type-caption text-muted-foreground">{`${r.draft.label} in draft`}</p> : null}
              {r.status === 'withdrawn' && r.withdrawnReason ? <p className="type-caption text-muted-foreground">{r.withdrawnReason}</p> : null}
              {(() => {
                const cell = ackCell(r, ack);
                return 'counts' in cell ? <AckSummaryCell row={r} counts={cell.counts} onOpen={onOpenAcknowledgements} /> : null;
              })()}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

/** "34 of 52" with a per-person bar and the overdue count; opens the document on the Acknowledgements tab. */
function AckSummaryCell({ row, counts, onOpen }: { row: LibraryRow; counts: AckCounts; onOpen: (row: LibraryRow) => void }) {
  return (
    <button
      type="button"
      data-row-action=""
      onClick={() => onOpen(row)}
      aria-label={`Acknowledgements of ${row.title}: ${counts.acknowledged.toLocaleString('en-GB')} of ${counts.total.toLocaleString('en-GB')} acknowledged${counts.overdue ? `, ${counts.overdue.toLocaleString('en-GB')} overdue` : ''}`}
      className={cn('focus-ring block w-full min-w-[7rem] space-y-1 rounded-sm text-left', COARSE)}
    >
      <span className="flex items-baseline gap-2 text-sm tabular-nums">
        <span className="text-foreground">{`${counts.acknowledged.toLocaleString('en-GB')} of ${counts.total.toLocaleString('en-GB')}`}</span>
        {counts.overdue ? <span className="type-caption text-critical">{`${counts.overdue.toLocaleString('en-GB')} overdue`}</span> : null}
      </span>
      <AckBar counts={counts} />
    </button>
  );
}

function PublishFirstButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" size="sm" className={COARSE} onClick={onClick}>
      <FilePlus2 aria-hidden="true" className="h-4 w-4" />
      Publish document
    </Button>
  );
}

/**
 * A row's menu: the version history for everyone; for editors the next
 * step its state allows (lib/fleetDocumentMachine.ts): finish a draft,
 * upload a new version, withdraw a published document, delete a draft.
 */
function RowMenu({ row, actions }: { row: LibraryRow; actions: LibraryActions }) {
  const allowed = fleetDocumentActions(row.status);
  const canVersion = !!actions.publish && allowed.includes('add_version');
  const canWithdraw = !!actions.withdraw && allowed.includes('withdraw');
  const canDelete = !!actions.deleteDraft && allowed.includes('delete_draft');
  const publishLabel = row.status === 'draft' ? 'Finish publishing' : row.draft ? `Finish ${row.draft.label}` : 'Upload a new version';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" data-row-action="" className={cn('h-8 w-8', COARSE, '[@media(pointer:coarse)]:min-w-11')} aria-label={`Actions for ${row.title}`}>
          <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={() => actions.openHistory(row)}>
          <History aria-hidden="true" className="mr-2 h-4 w-4" />
          Version history
        </DropdownMenuItem>
        {canVersion ? (
          <DropdownMenuItem onSelect={() => actions.publish?.(row)}>
            <Upload aria-hidden="true" className="mr-2 h-4 w-4" />
            {publishLabel}
          </DropdownMenuItem>
        ) : null}
        {canWithdraw || canDelete ? <DropdownMenuSeparator /> : null}
        {canWithdraw ? (
          <DropdownMenuItem onSelect={() => actions.withdraw?.(row)}>
            <Undo2 aria-hidden="true" className="mr-2 h-4 w-4" />
            Withdraw
          </DropdownMenuItem>
        ) : null}
        {canDelete ? (
          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => actions.deleteDraft?.(row)}>
            <Trash2 aria-hidden="true" className="mr-2 h-4 w-4" />
            Delete draft
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

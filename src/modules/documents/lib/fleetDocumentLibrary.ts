/**
 * The fleet document library as the page shows it (gap/02 FD1, FD2, FD4,
 * FD5, FD10): one row per document with its type, section, current
 * version and date, targets ("All n" / "k of n") and status; the section
 * list with counts; the document types with nothing published ("n not
 * uploaded"); and the page's filters (section, vessel, search, status)
 * applied in memory over the one read (hooks/keys.ts says why).
 *
 * Pure: no React, no Supabase.
 */
import { fromDateOnly } from '@/shared/lib/form';
import type { FleetDocumentSection, FleetDocumentType } from '../hooks/useFleetDocumentTaxonomy';
import type { FleetDocument, FleetDocumentTarget, FleetDocumentVersion } from '../hooks/useFleetDocuments';
import type { FleetDocumentStatus, FleetDocumentTargetMode, FleetDocumentVersionKind } from './fleetDocumentMachine';

/** A vessel the targets are counted against (the fleet module's ShownVessel is one). */
export interface LibraryVessel {
  id: string;
  name: string;
  code: string | null;
  counted: boolean;
}

export interface LibraryVersion {
  id: string;
  versionNo: number;
  label: string;
  kind: FleetDocumentVersionKind;
  /** Date-only `yyyy-MM-dd`. */
  effectiveDate: string;
  fileName: string;
}

export interface LibraryRow {
  id: string;
  title: string;
  description: string | null;
  status: FleetDocumentStatus;
  typeId: string;
  /** "Unknown type" when the type is not in the taxonomy read (never expected; shown honestly). */
  typeName: string;
  sectionId: string | null;
  sectionName: string | null;
  /** The published version (null for a draft). */
  current: LibraryVersion | null;
  /** A version prepared but not yet published. */
  draft: LibraryVersion | null;
  targetMode: FleetDocumentTargetMode;
  targetVesselIds: string[];
  /** "All 6", "All 6 incl. future", "3 of 6", "None yet". */
  vesselsLabel: string;
  /** How many vessels it reaches (the counted vessels for all-vessels mode). */
  vesselCount: number;
  ackRequired: boolean;
  withdrawnReason: string | null;
  updatedAt: string;
}

export interface LibraryTypeSummary {
  id: string;
  sectionId: string;
  name: string;
  hideWhenEmpty: boolean;
  /** Documents of the type the reader sees, any state. */
  documentCount: number;
  /** Of them published (what vessels see). */
  publishedCount: number;
}

export interface LibrarySectionSummary {
  id: string;
  name: string;
  sortOrder: number;
  /** Current documents (published and drafts; withdrawn ones are history). */
  documentCount: number;
  /** Every document of the section's types, withdrawn included (the delete rule). */
  totalCount: number;
  types: LibraryTypeSummary[];
  /** Types with nothing published (FD5). */
  notUploaded: LibraryTypeSummary[];
}

export interface FleetDocumentLibrary {
  rows: LibraryRow[];
  sections: LibrarySectionSummary[];
  /** Every type with nothing published, in section and type order. */
  notUploaded: LibraryTypeSummary[];
  /** Counted vessels ("All n"). */
  countedVesselCount: number;
}

const toVersion = (v: FleetDocumentVersion): LibraryVersion => ({
  id: v.id,
  versionNo: v.version_no,
  label: v.version_label,
  kind: v.version_kind,
  effectiveDate: v.effective_date,
  fileName: v.file_name,
});

/** The targets column: all vessels (counted, also future ones) or k of the counted fleet. */
export function vesselsLabel(mode: FleetDocumentTargetMode, targetCount: number, countedCount: number): string {
  if (mode === 'all_including_future') return `All ${countedCount.toLocaleString('en-GB')}`;
  if (targetCount === 0) return 'None yet';
  if (targetCount > countedCount) return `${targetCount.toLocaleString('en-GB')} vessels`;
  return `${targetCount.toLocaleString('en-GB')} of ${countedCount.toLocaleString('en-GB')}`;
}

export interface BuildLibraryInput {
  sections: readonly FleetDocumentSection[];
  types: readonly FleetDocumentType[];
  documents: readonly FleetDocument[];
  versions: readonly FleetDocumentVersion[];
  targets: readonly FleetDocumentTarget[];
  vessels: readonly LibraryVessel[];
}

export function buildFleetDocumentLibrary(input: BuildLibraryInput): FleetDocumentLibrary {
  const counted = input.vessels.filter((v) => v.counted);
  const countedVesselCount = counted.length;
  const sectionById = new Map(input.sections.map((s) => [s.id, s]));
  const typeById = new Map(input.types.map((t) => [t.id, t]));
  const versionById = new Map(input.versions.map((v) => [v.id, v]));
  const draftByDocument = new Map(input.versions.filter((v) => v.state === 'draft').map((v) => [v.document_id, v]));
  const targetsByDocument = new Map<string, string[]>();
  for (const t of input.targets) {
    const list = targetsByDocument.get(t.document_id) ?? [];
    list.push(t.vessel_id);
    targetsByDocument.set(t.document_id, list);
  }

  const rows: LibraryRow[] = input.documents.map((d) => {
    const type = typeById.get(d.type_id);
    const section = type ? sectionById.get(type.section_id) : undefined;
    const current = d.current_version_id ? versionById.get(d.current_version_id) : undefined;
    const draft = draftByDocument.get(d.id);
    const targetVesselIds = [...(targetsByDocument.get(d.id) ?? [])].sort();
    const vesselCount = d.target_mode === 'all_including_future' ? countedVesselCount : targetVesselIds.length;
    return {
      id: d.id,
      title: d.title,
      description: d.description,
      status: d.status,
      typeId: d.type_id,
      typeName: type?.name ?? 'Unknown type',
      sectionId: section?.id ?? null,
      sectionName: section?.name ?? null,
      current: current && current.state === 'published' ? toVersion(current) : null,
      draft: draft ? toVersion(draft) : null,
      targetMode: d.target_mode,
      targetVesselIds,
      vesselsLabel: vesselsLabel(d.target_mode, targetVesselIds.length, countedVesselCount),
      vesselCount,
      ackRequired: d.ack_required,
      withdrawnReason: d.withdrawn_reason,
      updatedAt: d.updated_at,
    };
  });

  const typeSummaries = input.types.map<LibraryTypeSummary>((t) => {
    const ofType = rows.filter((r) => r.typeId === t.id);
    return {
      id: t.id,
      sectionId: t.section_id,
      name: t.name,
      hideWhenEmpty: t.hide_when_empty,
      documentCount: ofType.length,
      publishedCount: ofType.filter((r) => r.status === 'published').length,
    };
  });

  const sections = input.sections.map<LibrarySectionSummary>((s) => {
    const types = typeSummaries.filter((t) => t.sectionId === s.id);
    const inSection = rows.filter((r) => r.sectionId === s.id);
    return {
      id: s.id,
      name: s.name,
      sortOrder: s.sort_order,
      documentCount: inSection.filter((r) => r.status !== 'withdrawn').length,
      totalCount: inSection.length,
      types,
      notUploaded: types.filter((t) => t.publishedCount === 0),
    };
  });

  return { rows, sections, notUploaded: sections.flatMap((s) => s.notUploaded), countedVesselCount };
}

// ─── Filters ────────────────────────────────────────────────────────────

/** The status chips: current = published and drafts (the default); withdrawn = history. */
export const LIBRARY_STATUS_FILTERS = ['current', 'published', 'draft', 'withdrawn', 'all'] as const;
export type LibraryStatusFilter = (typeof LIBRARY_STATUS_FILTERS)[number];

export const LIBRARY_STATUS_LABELS: Readonly<Record<LibraryStatusFilter, string>> = {
  current: 'Current',
  published: 'Published',
  draft: 'Drafts',
  withdrawn: 'Withdrawn',
  all: 'All',
};

export const parseLibraryStatus = (value: string | null | undefined): LibraryStatusFilter =>
  (LIBRARY_STATUS_FILTERS as readonly string[]).includes(value ?? '') ? (value as LibraryStatusFilter) : 'current';

export function matchesStatus(row: Pick<LibraryRow, 'status'>, filter: LibraryStatusFilter): boolean {
  switch (filter) {
    case 'current':
      return row.status !== 'withdrawn';
    case 'all':
      return true;
    default:
      return row.status === filter;
  }
}

/** Whether a document reaches the vessel: all vessels (if the vessel is counted) or one of its targets. */
export function reachesVessel(row: Pick<LibraryRow, 'targetMode' | 'targetVesselIds'>, vessel: Pick<LibraryVessel, 'id' | 'counted'>): boolean {
  return row.targetMode === 'all_including_future' ? vessel.counted : row.targetVesselIds.includes(vessel.id);
}

const norm = (text: string) => text.toLocaleLowerCase('en-GB').normalize('NFKD');

export interface LibraryFilters {
  sectionId: string | null;
  vessel: LibraryVessel | null;
  search: string;
  status: LibraryStatusFilter;
}

/** The rows the filters keep, by title (search covers title, type, section and version label). */
export function filterLibraryRows(rows: readonly LibraryRow[], filters: LibraryFilters): LibraryRow[] {
  const q = norm(filters.search.trim());
  return rows
    .filter((r) => (filters.sectionId ? r.sectionId === filters.sectionId : true))
    .filter((r) => (filters.vessel ? reachesVessel(r, filters.vessel) : true))
    .filter((r) => matchesStatus(r, filters.status))
    .filter((r) => !q || norm([r.title, r.typeName, r.sectionName ?? '', r.current?.label ?? '', r.draft?.label ?? ''].join(' ')).includes(q))
    .sort((a, b) => a.title.localeCompare(b.title, 'en-GB', { sensitivity: 'base' }) || a.id.localeCompare(b.id));
}

/** Rows per status chip under the other filters (for the chip counts). */
export function statusCounts(rows: readonly LibraryRow[], filters: Omit<LibraryFilters, 'status'>): Record<LibraryStatusFilter, number> {
  const base = filterLibraryRows(rows, { ...filters, status: 'all' });
  return Object.fromEntries(LIBRARY_STATUS_FILTERS.map((f) => [f, base.filter((r) => matchesStatus(r, f)).length])) as Record<LibraryStatusFilter, number>;
}

/** "3 not uploaded" (FD5). */
export const notUploadedLabel = (n: number): string => `${n.toLocaleString('en-GB')} not uploaded`;

/** The vessel a `?vessel=` code names (case-insensitive), or null. */
export function vesselForCode(vessels: readonly LibraryVessel[], code: string | null | undefined): LibraryVessel | null {
  const wanted = (code ?? '').trim().toLowerCase();
  if (!wanted) return null;
  return vessels.find((v) => (v.code ?? '').toLowerCase() === wanted) ?? null;
}

// ─── Formatting ─────────────────────────────────────────────────────────

const FRESHNESS = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'UTC',
});

/** The page's one freshness stamp (D-88): "Updated 26 Nov 2026, 14:05 UTC". */
export const formatUpdatedUtc = (at: number | Date): string => `Updated ${FRESHNESS.format(at)} UTC`;

const DATE = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

/** A date-only `yyyy-MM-dd` in the reader's calendar ("20 Nov 2026"), never shifted by a time zone; null when blank or invalid. */
export function formatDateOnly(value: string | null | undefined): string | null {
  const date = fromDateOnly(value ?? null);
  return date ? DATE.format(date) : null;
}

/**
 * The fleet expiry reports' rules (gap/02 R3, R4, R14; DECISIONS C5, D-31,
 * D-X5-01, D-X5-02, D-X5-22; X5 spec X5-03B). Pure.
 *
 * Fleet certificates and Crew documents read one page at a time of
 * `fleet_expiry_items` (the expiry engine, 040000), most urgent first, with
 * every filter applied by the server, so a page and its total are always
 * the server's. Their filters live in the query string:
 *
 *   status   which due buckets: all of them (default), Expired, ≤ 30 d or
 *            Due ≤ window
 *   valid    the show-valid toggle: `shown` adds the valid items (and those
 *            that never expire) to whatever `status` picks
 *   type     Crew documents only: the document source (`p_sources`)
 *   vessel   Crew documents only: every vessel shown (default; for a reader
 *            with fleet reach also the people with no current vessel, listed
 *            as "No current vessel"), or one of them
 *   q        search on the item, its number or detail and the person
 *   page     the page (1-based; 100 items a page)
 *
 * The KPI tiles count with `fleet_expiry_summary` (per source and bucket,
 * muted items apart); people with no current vessel are not in those
 * counts, which only cover the vessels shown (040000).
 */
import { EXPIRY_BUCKET_LABELS, type ExpiryBucket } from '@/lib/records/expiry';
import type { ExportColumn } from '@/lib/export';
import { fromDateOnly } from '@/shared/lib/form';
import {
  ENDORSEMENT_STATE_LABELS,
  EXPIRY_ITEM_TYPE_LABELS,
  tallyExpirySummary,
  type ExpiryItemType,
  type ExpiryTally,
  type FleetExpiryItem,
  type FleetExpirySummaryEntry,
  type ShownVessel,
} from '@/modules/fleet';
import { vesselPath } from '@/modules/vessels/lib/vesselCode';
import type { FleetVesselListRow } from '../types/db.pending';
import type { ReportFilterSpec, ReportFilterValues } from './reportFilters';

// ─── Paging and search ──────────────────────────────────────────────────

/** Items per page (the server's default page; at most 500). */
export const EXPIRY_REPORT_PAGE_SIZE = 100;
export const SEARCH_PARAM = 'q';
export const PAGE_PARAM = 'page';
/** The longest search the server accepts (`invalid_search` above). */
export const SEARCH_MAX_LENGTH = 200;

/** The page in the URL: a whole number from 1, anything else is page 1. */
export function parsePage(value: string | null | undefined): number {
  if (typeof value !== 'string' || !/^[1-9]\d{0,5}$/.test(value.trim())) return 1;
  return Number(value.trim());
}

/** The search in the URL, trimmed and cut to what the server accepts ('' for none). */
export function readSearch(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim().slice(0, SEARCH_MAX_LENGTH) : '';
}

/** The URL with this search and page (page 1 and an empty search are left out); other parameters kept. */
export function writeSearchAndPage(params: URLSearchParams, search: string | null, page: number | null): URLSearchParams {
  const next = new URLSearchParams(params);
  if (search !== null) {
    const q = readSearch(search);
    if (q) next.set(SEARCH_PARAM, q);
    else next.delete(SEARCH_PARAM);
  }
  if (page !== null) {
    if (page > 1) next.set(PAGE_PARAM, String(Math.trunc(page)));
    else next.delete(PAGE_PARAM);
  }
  return next;
}

export interface PageInfo {
  page: number;
  pages: number;
  /** 1-based index of the first item on the page (0 when the page is empty). */
  from: number;
  to: number;
  total: number;
  hasPrevious: boolean;
  hasNext: boolean;
  /** A page past the end (the list shrank, or a hand-edited link): nothing on it, but page 1 may have items. */
  pastEnd: boolean;
}

/**
 * Where a page sits in the list. `shown` is the number of items the server
 * sent for it, `total` its count of every match (0 when the page is empty,
 * so an empty page after page 1 is "past the end", never "nothing matches").
 */
export function pageInfo(page: number, shown: number, total: number, pageSize: number = EXPIRY_REPORT_PAGE_SIZE): PageInfo {
  const size = Math.max(1, Math.trunc(pageSize));
  const offset = (page - 1) * size;
  const pages = Math.max(1, Math.ceil(total / size));
  const from = shown > 0 ? offset + 1 : 0;
  const to = shown > 0 ? offset + shown : 0;
  return {
    page,
    pages,
    from,
    to,
    total,
    hasPrevious: page > 1,
    hasNext: shown > 0 && offset + shown < total,
    pastEnd: shown === 0 && page > 1,
  };
}

const n = (value: number) => value.toLocaleString('en-GB');

/** "Showing 101–200 of 312 certificates" / "Showing 1 of 1 certificate". */
export function pageSummaryText(info: PageInfo, noun: { one: string; other: string }): string {
  const word = info.total === 1 ? noun.one : noun.other;
  if (info.from === 0) return `No ${noun.other} on this page`;
  const range = info.from === info.to ? n(info.from) : `${n(info.from)}–${n(info.to)}`;
  return `Showing ${range} of ${n(info.total)} ${word}`;
}

// ─── Status and the show-valid toggle ───────────────────────────────────

/** The buckets that raise an alert, most urgent first. */
export const DUE_BUCKETS = ['expired', 'expiring_soon', 'expiring'] as const satisfies readonly ExpiryBucket[];

export const STATUS_FILTER: ReportFilterSpec = {
  key: 'status',
  label: 'Status',
  options: [
    { value: 'due', label: 'Expired and due' },
    { value: 'expired', label: EXPIRY_BUCKET_LABELS.expired },
    { value: 'expiring_soon', label: EXPIRY_BUCKET_LABELS.expiring_soon },
    { value: 'expiring', label: EXPIRY_BUCKET_LABELS.expiring },
  ],
  defaultValue: 'due',
};

export const VALID_FILTER: ReportFilterSpec = {
  key: 'valid',
  label: 'Valid items',
  options: [
    { value: 'hidden', label: 'Hidden' },
    { value: 'shown', label: 'Shown' },
  ],
  defaultValue: 'hidden',
};

/**
 * The buckets to ask for (`p_buckets`): the status's due buckets, plus
 * valid and no-expiry items when the toggle shows them; null when that is
 * every bucket. An unknown status reads as every due bucket.
 */
export function bucketsFor(values: ReportFilterValues): ExpiryBucket[] | null {
  const status = values[STATUS_FILTER.key];
  const due: ExpiryBucket[] = (DUE_BUCKETS as readonly string[]).includes(status) ? [status as ExpiryBucket] : [...DUE_BUCKETS];
  if (values[VALID_FILTER.key] !== 'shown') return due;
  const all: ExpiryBucket[] = [...due, 'valid', 'no_expiry'];
  return all.length === 5 ? null : all;
}

/** The URL of the list with one bucket's tile applied (a Valid tile also shows valid items); the page reset. */
export function bucketTileParams(params: URLSearchParams, bucket: ExpiryBucket): URLSearchParams {
  const next = writeSearchAndPage(params, null, 1);
  if ((DUE_BUCKETS as readonly string[]).includes(bucket)) {
    next.set(STATUS_FILTER.key, bucket);
    next.delete(VALID_FILTER.key);
  } else {
    next.delete(STATUS_FILTER.key);
    next.set(VALID_FILTER.key, 'shown');
  }
  return next;
}

// ─── Sources ────────────────────────────────────────────────────────────

/** The vessel certificates source (gap/06's own source replaces it once X3 registers one). */
export const CERTIFICATE_SOURCES = ['vessel_certificates'] as const;

/**
 * The crew sources, in the Type filter's order. `crew_documents` is X1's
 * (X1-04 registers it as a data row and deactivates the two legacy rows it
 * replaces); an inactive or unregistered source simply matches nothing.
 */
export const CREW_DOCUMENT_SOURCES = [
  { key: 'crew_documents', label: 'Crew documents' },
  { key: 'profile_identity_legacy', label: 'Passports and visas' },
  { key: 'crew_certificates_legacy', label: 'Crew certificates' },
  { key: 'work_authorisations', label: 'Work authorisations' },
  { key: 'training_records', label: 'Training certificates' },
  { key: 'medical_fitness', label: 'Medical fitness' },
] as const;

export type CrewDocumentSourceKey = (typeof CREW_DOCUMENT_SOURCES)[number]['key'];

export const CREW_SOURCE_KEYS: readonly CrewDocumentSourceKey[] = CREW_DOCUMENT_SOURCES.map((s) => s.key);

export const TYPE_FILTER: ReportFilterSpec = {
  key: 'type',
  label: 'Document type',
  options: [{ value: 'all', label: 'All document types' }, ...CREW_DOCUMENT_SOURCES.map((s) => ({ value: s.key, label: s.label }))],
  defaultValue: 'all',
};

/** The sources a Type value reads (every crew source for `all` or an unknown value). */
export function crewSourcesFor(values: ReportFilterValues): CrewDocumentSourceKey[] {
  const type = values[TYPE_FILTER.key];
  const one = CREW_SOURCE_KEYS.find((k) => k === type);
  return one ? [one] : [...CREW_SOURCE_KEYS];
}

/** The item types the crew sources carry (for the warning windows shown). */
export const CREW_ITEM_TYPES: readonly ExpiryItemType[] = ['passport', 'visa', 'crew_document', 'crew_qualification', 'medical', 'work_authorisation'];

// ─── Vessel filter (Crew documents) ─────────────────────────────────────

export const VESSEL_FILTER_KEY = 'vessel';
export const ALL_VESSELS = 'all';
export const NO_CURRENT_VESSEL_LABEL = 'No current vessel';

/** The Vessel filter: every vessel shown (default), or one of them by code. */
export function vesselFilterSpec(shown: readonly Pick<ShownVessel, 'code' | 'name'>[]): ReportFilterSpec {
  return {
    key: VESSEL_FILTER_KEY,
    label: 'Vessel',
    options: [
      { value: ALL_VESSELS, label: 'All vessels shown' },
      ...shown.filter((v) => v.code).map((v) => ({ value: v.code as string, label: v.name })),
    ],
    defaultValue: ALL_VESSELS,
  };
}

export interface CrewVesselScope {
  /** The vessel ids to send. */
  vesselIds: string[];
  /** Ask for people with no current vessel too (`p_include_unassigned`). */
  includeUnassigned: boolean;
}

/**
 * What a Vessel value asks for. All vessels shown: those ids, plus the
 * people with no current vessel ("No current vessel") for a reader with
 * fleet reach only: the server lists them only to fleet-level readers
 * (D-X5-21), so nobody else asks. One vessel: that id only. An unknown
 * value reads as all vessels shown.
 */
export function crewVesselScope(value: string, shown: readonly Pick<ShownVessel, 'id' | 'code'>[], fleetReach: boolean): CrewVesselScope {
  const one = value !== ALL_VESSELS ? shown.find((v) => v.code === value) : undefined;
  if (one) return { vesselIds: [one.id], includeUnassigned: false };
  return { vesselIds: shown.map((v) => v.id), includeUnassigned: fleetReach };
}

// ─── Counts ─────────────────────────────────────────────────────────────

/** The summary counts of these sources only. */
export function tallyForSources(entries: readonly FleetExpirySummaryEntry[], sources: readonly string[]): ExpiryTally {
  const keep = new Set(sources);
  return tallyExpirySummary(entries, (e) => keep.has(e.sourceKey));
}

// ─── Labels, dates and links ────────────────────────────────────────────

/** One item's type (singular, sentence case). */
export const ITEM_TYPE_LABEL: Readonly<Record<ExpiryItemType, string>> = {
  vessel_certificate: 'Vessel certificate',
  insurance_policy: 'Insurance policy',
  passport: 'Passport',
  visa: 'Visa',
  crew_document: 'Crew document',
  crew_qualification: 'Qualification',
  medical: 'Medical certificate',
  vaccination: 'Vaccination',
  work_authorisation: 'Work authorisation',
  contract: 'Contract',
  training_course: 'Training course',
};

export function itemTypeLabel(itemType: string): string {
  return (ITEM_TYPE_LABEL as Record<string, string>)[itemType] ?? 'Document';
}

/** The item types' plural labels (the windows line and the drawer). */
export const itemTypesLabel = (itemType: ExpiryItemType): string => EXPIRY_ITEM_TYPE_LABELS[itemType];

const DAY_FORMAT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** "30 Nov 2026" for a `yyyy-MM-dd` day (read as that local day); null for none or an invalid date. */
export function formatDay(value: string | null | undefined): string | null {
  const date = fromDateOnly(value);
  return date ? DAY_FORMAT.format(date) : null;
}

/** "90 days" / "1 day". */
export function windowText(days: number): string {
  return `${n(days)} ${days === 1 ? 'day' : 'days'}`;
}

/** A link path the server gave (relative to its scope root) that cannot leave that root. */
export function isSafeRelativePath(rel: string | null | undefined): rel is string {
  if (typeof rel !== 'string' || rel.trim() === '') return false;
  if (rel.startsWith('/') || rel.includes('\\') || rel.includes('//') || /(^|\/)\.\.(\/|$)/.test(rel)) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(rel) || /%2e/i.test(rel) || /\s/.test(rel)) return false;
  return ![...rel].some((ch) => ch.charCodeAt(0) < 32);
}

/**
 * Where an item opens: a vessel page under `/v/<code>/` or a Fleet page
 * under `/fleet/`. Workspace links (HRIS or Health records of people with
 * no current vessel) are left plain: whether the reader may open that
 * workspace is not known here.
 */
export function expiryItemHref(item: Pick<FleetExpiryItem, 'linkScope' | 'linkRel' | 'vesselCode'>): string | null {
  if (!isSafeRelativePath(item.linkRel)) return null;
  if (item.linkScope === 'vessel') return item.vesselCode ? vesselPath(item.vesselCode, item.linkRel) : null;
  if (item.linkScope === 'fleet') return `/fleet/${item.linkRel}`;
  return null;
}

/** One row's stable id: a profile carries both its passport and its visa under one record id. */
export const expiryItemId = (item: Pick<FleetExpiryItem, 'sourceKey' | 'itemType' | 'recordId'>): string =>
  `${item.sourceKey}:${item.itemType}:${item.recordId}`;

// ─── Exports ────────────────────────────────────────────────────────────

const bucketLabel = (item: FleetExpiryItem) => EXPIRY_BUCKET_LABELS[item.bucket];
const alertsText = (item: FleetExpiryItem) => (item.alertsMuted ? 'Off' : 'On');

/** Fleet certificates as exported: the rows on screen, with no person on them. */
export const CERTIFICATE_EXPORT_COLUMNS: readonly ExportColumn<FleetExpiryItem>[] = [
  { key: 'vessel', header: 'Vessel', value: (r) => r.vesselName },
  { key: 'vessel_code', header: 'Code', value: (r) => r.vesselCode },
  { key: 'certificate', header: 'Certificate', value: (r) => r.label },
  { key: 'detail', header: 'Number and authority', value: (r) => r.detail },
  { key: 'expires_on', header: 'Expires', kind: 'date', value: (r) => r.expiresOn },
  { key: 'days_remaining', header: 'Days left', kind: 'number', value: (r) => r.daysRemaining },
  { key: 'status', header: 'Status', value: bucketLabel },
  { key: 'window_days', header: 'Warning window (days)', kind: 'number', value: (r) => r.windowDays },
  { key: 'endorsement_due_on', header: 'Endorsement due', kind: 'date', value: (r) => r.endorsementDueOn },
  { key: 'endorsement', header: 'Endorsement', value: (r) => (r.endorsementState ? ENDORSEMENT_STATE_LABELS[r.endorsementState] : null) },
  { key: 'alerts', header: 'Alerts', value: alertsText },
];

/** Crew documents as exported (personal data: the engine refuses it while the export log is missing). */
export const CREW_DOCUMENT_EXPORT_COLUMNS: readonly ExportColumn<FleetExpiryItem>[] = [
  { key: 'person', header: 'Person', value: (r) => r.personName },
  { key: 'vessel', header: 'Vessel', value: (r) => r.vesselName ?? NO_CURRENT_VESSEL_LABEL },
  { key: 'vessel_code', header: 'Code', value: (r) => r.vesselCode },
  { key: 'document', header: 'Document', value: (r) => r.label },
  { key: 'type', header: 'Type', value: (r) => itemTypeLabel(r.itemType) },
  { key: 'detail', header: 'Detail', value: (r) => r.detail },
  { key: 'expires_on', header: 'Expires', kind: 'date', value: (r) => r.expiresOn },
  { key: 'days_remaining', header: 'Days left', kind: 'number', value: (r) => r.daysRemaining },
  { key: 'status', header: 'Status', value: bucketLabel },
  { key: 'window_days', header: 'Warning window (days)', kind: 'number', value: (r) => r.windowDays },
  { key: 'alerts', header: 'Alerts', value: alertsText },
];

// ─── Fleet list (R14) ───────────────────────────────────────────────────

export type CertificateHealthTone = 'danger' | 'warn' | 'ok' | 'neutral';

export interface CertificateHealth {
  tone: CertificateHealthTone;
  label: string;
  /** Whether the reader can count this vessel's certificates. */
  covered: boolean;
  /** Expired or due certificates. */
  findings: boolean;
}

/**
 * A vessel's certificate health from `fleet_vessel_list`: expired (and due)
 * first, then due within the window, then all valid; none recorded when the
 * vessel has no current certificate; not covered when the reader cannot
 * count them (NULL counts, never 0).
 */
export function certificateHealth(row: Pick<FleetVesselListRow, 'certificates_total' | 'certificates_expired' | 'certificates_expiring'>): CertificateHealth {
  const { certificates_total: total, certificates_expired: expired, certificates_expiring: expiring } = row;
  if (total === null || expired === null || expiring === null) return { tone: 'neutral', label: 'Not covered', covered: false, findings: false };
  if (expired > 0) {
    return { tone: 'danger', label: expiring > 0 ? `${n(expired)} expired · ${n(expiring)} due` : `${n(expired)} expired`, covered: true, findings: true };
  }
  if (expiring > 0) return { tone: 'warn', label: `${n(expiring)} due`, covered: true, findings: true };
  if (total === 0) return { tone: 'neutral', label: 'None recorded', covered: true, findings: false };
  return { tone: 'ok', label: 'All valid', covered: true, findings: false };
}

export const FLEET_LIST_FILTERS: readonly ReportFilterSpec[] = [
  {
    key: 'show',
    label: 'Show',
    options: [
      { value: 'all', label: 'All vessels' },
      { value: 'findings', label: 'With certificates expired or due' },
    ],
    defaultValue: 'all',
  },
];

/** The fleet list rows for the Show filter, in the server's order (by name). */
export function fleetListRows(rows: readonly FleetVesselListRow[], show: string): FleetVesselListRow[] {
  return show === 'findings' ? rows.filter((r) => certificateHealth(r).findings) : [...rows];
}

export interface FleetListSummary {
  vessels: number;
  /** Null when the reader can count crew on none of the vessels. */
  crew: number | null;
  crewCovered: number;
  expired: number | null;
  expiring: number | null;
  certificatesCovered: number;
}

const sumCovered = (values: readonly (number | null)[]): number | null => {
  const counted = values.filter((v): v is number => v !== null);
  return counted.length ? counted.reduce((a, b) => a + b, 0) : null;
};

/** The fleet list's KPI totals over every vessel listed (a NULL count is left out, never 0). */
export function fleetListSummary(rows: readonly FleetVesselListRow[]): FleetListSummary {
  return {
    vessels: rows.length,
    crew: sumCovered(rows.map((r) => r.active_crew)),
    crewCovered: rows.filter((r) => r.active_crew !== null).length,
    expired: sumCovered(rows.map((r) => r.certificates_expired)),
    expiring: sumCovered(rows.map((r) => r.certificates_expiring)),
    certificatesCovered: rows.filter((r) => certificateHealth(r).covered).length,
  };
}

/** "52.4 m"; null for no length. */
export function lengthText(metres: number | null): string | null {
  if (metres === null || !Number.isFinite(metres)) return null;
  return `${metres.toLocaleString('en-GB', { maximumFractionDigits: 1 })} m`;
}

export const FLEET_LIST_EXPORT_COLUMNS: readonly ExportColumn<FleetVesselListRow>[] = [
  { key: 'vessel', header: 'Vessel', value: (r) => r.vessel_name },
  { key: 'vessel_code', header: 'Code', value: (r) => r.vessel_code },
  { key: 'type', header: 'Type', value: (r) => r.vessel_type },
  { key: 'flag', header: 'Flag', value: (r) => r.flag_state },
  { key: 'class', header: 'Class', value: (r) => r.classification_society },
  { key: 'imo', header: 'IMO', value: (r) => r.imo_number },
  { key: 'loa', header: 'LOA (m)', kind: 'number', value: (r) => r.length_overall },
  { key: 'builder', header: 'Builder', value: (r) => r.builder },
  { key: 'build_year', header: 'Year', kind: 'number', value: (r) => r.build_year },
  { key: 'fleet_group', header: 'Fleet group', value: (r) => r.fleet_group_name },
  { key: 'counted', header: 'Counted in fleet totals', kind: 'boolean', value: (r) => r.is_counted },
  { key: 'active_crew', header: 'Crew on board', kind: 'number', value: (r) => r.active_crew },
  { key: 'certificates_total', header: 'Certificates', kind: 'number', value: (r) => r.certificates_total },
  { key: 'certificates_expired', header: 'Certificates expired', kind: 'number', value: (r) => r.certificates_expired },
  { key: 'certificates_expiring', header: 'Certificates due', kind: 'number', value: (r) => r.certificates_expiring },
  { key: 'certificate_health', header: 'Certificate health', value: (r) => certificateHealth(r).label },
];

/**
 * The fleet catalogue as the Forms & Checklists pages read it (gap/02 FC1,
 * FC2, FC4, FC5, FC6, W2; X5 spec X5-06B; D-X5-13).
 *
 * - `toCatalogueTemplates`: the live `form_templates` columns joined to the
 *   catalogue columns 040500 adds (read apart, so a missing column never
 *   blanks the list, D-X5-20). Without them every template is Unsorted,
 *   with no cadence, label or origin of its own (D-01).
 * - `targetsVessel` mirrors `form_template_targets_vessel`: FLEET covers
 *   every vessel of the company (and those added later), VESSEL_SPECIFIC
 *   only the listed ones. `normaliseVesselScope` is the file's backfill.
 * - Per template, on the vessels in view (the whole fleet = every counted
 *   vessel, or one vessel): where it is offered, shown and hidden; the
 *   area counts of the overview (shown, customised, hidden, drafts,
 *   overdue); the order on one vessel (`sort_order`, then name) and the
 *   moves of the reorder list; the run summary across vessels.
 * - The vessel pages' list (`vesselTemplates`): published templates that
 *   target the vessel, in its order, hidden ones left out.
 *
 * Pure: no React, no Supabase.
 */
import type {
  FormTemplateArea,
  FormTemplateCadence,
  FormTemplateKind,
  FormTemplateOrigin,
  FormTemplateRunStatRow,
  FormTemplateStatus,
  FormTemplateVisibility,
} from '../types/db.pending';
import { AREA_LABELS, FORM_TEMPLATE_AREAS, UNSORTED_LABEL, UNSORTED_SLUG, areaFromSlug, areaSlug, isFormTemplateArea, isFormTemplateKind } from './areaModel';
import { addDays, isCadence } from './cadence';
import { normaliseFormTemplateStatus } from './templateMachine';

export type VesselScope = 'FLEET' | 'VESSEL_SPECIFIC';

/** A template as the fleet pages read it. */
export interface CatalogueTemplate {
  id: string;
  companyId: string;
  code: string;
  name: string;
  description: string | null;
  /** The live `form_type` (CHECKLIST, PERMIT_TO_WORK, …). */
  formType: string;
  status: FormTemplateStatus;
  version: number;
  /** The controlled number typed at publish; null shows `v<version>`. */
  versionLabel: string | null;
  /** null = Unsorted. */
  area: FormTemplateArea | null;
  kind: FormTemplateKind | null;
  cadence: FormTemplateCadence | null;
  requiresSignature: boolean;
  origin: FormTemplateOrigin;
  /** The template a Customise copy was made from. */
  sourceTemplateId: string | null;
  /** The version this one replaces. */
  supersedesTemplateId: string | null;
  vesselScope: VesselScope;
  vesselIds: string[];
  publishedAt: string | null;
  updatedAt: string | null;
  createdAt: string | null;
}

/** The live columns the list reads (never `form_schema`: the builder and the preview read it). */
export const LIVE_LIST_COLUMNS =
  'id, company_id, template_code, template_name, description, form_type, status, version, vessel_scope, vessel_ids, published_at, updated_at, created_at, supersedes_template_id';

/** The catalogue columns of 040500, read in a select of their own. */
export const CATALOGUE_COLUMNS = 'id, area, form_kind, cadence, requires_completion_signature, origin, source_template_id, version_label';

export interface LiveTemplateInput {
  id: string;
  company_id: string;
  template_code: string | null;
  template_name: string | null;
  description?: string | null;
  form_type?: string | null;
  status: string | null;
  version?: number | null;
  vessel_scope?: string | null;
  vessel_ids?: readonly (string | null)[] | null;
  published_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  supersedes_template_id?: string | null;
}

export interface CatalogueColumnsInput {
  id: string;
  area?: string | null;
  form_kind?: string | null;
  cadence?: string | null;
  requires_completion_signature?: boolean | null;
  origin?: string | null;
  source_template_id?: string | null;
  version_label?: string | null;
}

const FLEET_ALIASES = ['FLEET', 'ALL', 'COMPANY', 'FLEET_WIDE'];
const SPECIFIC_ALIASES = ['VESSEL_SPECIFIC', 'VESSEL', 'VESSELS', 'SPECIFIC', 'SELECTED'];

const cleanIds = (ids: readonly (string | null)[] | null | undefined): string[] =>
  [...new Set((ids ?? []).filter((id): id is string => typeof id === 'string' && id.trim() !== ''))];

/** The stored `vessel_scope` as 040500's backfill normalises it. */
export function normaliseVesselScope(scope: string | null | undefined, vesselIds: readonly (string | null)[] | null | undefined): VesselScope {
  const upper = (scope ?? '').trim().toUpperCase();
  if (FLEET_ALIASES.includes(upper)) return 'FLEET';
  if (SPECIFIC_ALIASES.includes(upper)) return 'VESSEL_SPECIFIC';
  return cleanIds(vesselIds).length > 0 ? 'VESSEL_SPECIFIC' : 'FLEET';
}

const blank = (value: string | null | undefined): string | null => {
  const t = (value ?? '').trim();
  return t ? t : null;
};

/**
 * The list rows joined to their catalogue columns (`catalogue` null: not
 * applied yet, so every template is Unsorted with no cadence or origin of
 * its own). A row with a status outside the four is left out.
 */
export function toCatalogueTemplates(live: readonly LiveTemplateInput[], catalogue: readonly CatalogueColumnsInput[] | null): CatalogueTemplate[] {
  const extra = new Map((catalogue ?? []).map((c) => [c.id, c]));
  const out: CatalogueTemplate[] = [];
  for (const row of live) {
    const status = normaliseFormTemplateStatus(row.status);
    if (!status || typeof row.id !== 'string') continue;
    const c = extra.get(row.id);
    const vesselIds = cleanIds(row.vessel_ids);
    out.push({
      id: row.id,
      companyId: row.company_id,
      code: row.template_code ?? '',
      name: blank(row.template_name) ?? 'Untitled template',
      description: blank(row.description),
      formType: (row.form_type ?? '').toUpperCase(),
      status,
      version: typeof row.version === 'number' && row.version > 0 ? row.version : 1,
      versionLabel: blank(c?.version_label),
      area: isFormTemplateArea(c?.area) ? c.area : null,
      kind: isFormTemplateKind(c?.form_kind) ? c.form_kind : null,
      cadence: isCadence(c?.cadence) ? c.cadence : null,
      requiresSignature: c?.requires_completion_signature === true,
      origin: c?.origin === 'platform' ? 'platform' : 'company',
      sourceTemplateId: blank(c?.source_template_id),
      supersedesTemplateId: blank(row.supersedes_template_id),
      vesselScope: normaliseVesselScope(row.vessel_scope, vesselIds),
      vesselIds,
      publishedAt: row.published_at ?? null,
      updatedAt: row.updated_at ?? null,
      createdAt: row.created_at ?? null,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'en-GB', { sensitivity: 'base' }) || a.code.localeCompare(b.code) || b.version - a.version);
}

/** Whether a template is offered on a vessel (`form_template_targets_vessel`). */
export function targetsVessel(template: Pick<CatalogueTemplate, 'vesselScope' | 'vesselIds'>, vesselId: string | null | undefined): boolean {
  if (!vesselId) return false;
  return template.vesselScope === 'FLEET' || template.vesselIds.includes(vesselId);
}

/** A Customise copy: a company template made from another one. */
export const isCustomisedCopy = (t: Pick<CatalogueTemplate, 'origin' | 'sourceTemplateId'>): boolean => t.origin === 'company' && !!t.sourceTemplateId;

export type OriginKind = 'standard' | 'customised' | 'company';

/** The origin chip: a standard (platform) template, a customised copy, or the company's own. */
export function originKind(t: Pick<CatalogueTemplate, 'origin' | 'sourceTemplateId'>): OriginKind {
  if (t.origin === 'platform') return 'standard';
  return isCustomisedCopy(t) ? 'customised' : 'company';
}

export const ORIGIN_LABELS: Readonly<Record<OriginKind, string>> = {
  standard: 'Standard',
  customised: 'Customised',
  company: 'Company',
};

// ─── Per-vessel settings ───────────────────────────────────────────────

export interface VesselSetting {
  templateId: string;
  vesselId: string;
  visibility: FormTemplateVisibility;
  sortOrder: number | null;
  reason: string | null;
  hiddenAt: string | null;
}

export interface VesselSettingInput {
  template_id: string;
  vessel_id: string;
  visibility?: string | null;
  sort_order?: number | null;
  reason?: string | null;
  hidden_at?: string | null;
}

export const VESSEL_SETTING_COLUMNS = 'template_id, vessel_id, visibility, sort_order, reason, hidden_at';

export function toVesselSettings(rows: readonly VesselSettingInput[]): VesselSetting[] {
  return rows
    .filter((r) => typeof r.template_id === 'string' && typeof r.vessel_id === 'string')
    .map((r) => ({
      templateId: r.template_id,
      vesselId: r.vessel_id,
      visibility: r.visibility === 'hidden' ? 'hidden' : 'shown',
      sortOrder: typeof r.sort_order === 'number' && Number.isFinite(r.sort_order) ? r.sort_order : null,
      reason: blank(r.reason),
      hiddenAt: r.hidden_at ?? null,
    }));
}

/** Settings by `template|vessel`. */
export type SettingsIndex = ReadonlyMap<string, VesselSetting>;

const settingKey = (templateId: string, vesselId: string) => `${templateId}|${vesselId}`;

export function indexSettings(settings: readonly VesselSetting[]): SettingsIndex {
  return new Map(settings.map((s) => [settingKey(s.templateId, s.vesselId), s]));
}

export const settingFor = (index: SettingsIndex, templateId: string, vesselId: string): VesselSetting | null =>
  index.get(settingKey(templateId, vesselId)) ?? null;

export const isHiddenOn = (index: SettingsIndex, templateId: string, vesselId: string): boolean =>
  settingFor(index, templateId, vesselId)?.visibility === 'hidden';

export interface TemplatePlacement {
  /** The vessels in view the template is offered on. */
  targeted: string[];
  /** Of those, shown to crews. */
  shown: string[];
  /** Of those, hidden. */
  hidden: string[];
}

/** Where a template sits on the vessels in view. */
export function placement(template: Pick<CatalogueTemplate, 'id' | 'vesselScope' | 'vesselIds'>, vesselIds: readonly string[], index: SettingsIndex): TemplatePlacement {
  const targeted = vesselIds.filter((v) => targetsVessel(template, v));
  const hidden = targeted.filter((v) => isHiddenOn(index, template.id, v));
  const hiddenSet = new Set(hidden);
  return { targeted, shown: targeted.filter((v) => !hiddenSet.has(v)), hidden };
}

// ─── Areas ─────────────────────────────────────────────────────────────

/** An area page's key: one of the areas, or Unsorted (no area). */
export type AreaKey = FormTemplateArea | null;

/** The area of a `/fleet/forms/:area` slug (`unsorted` = no area); `undefined` for anything else (the page's not found). */
export function areaKeyFromSlug(slug: string | null | undefined): AreaKey | undefined {
  if (slug === UNSORTED_SLUG) return null;
  const area = areaFromSlug(slug);
  return area ?? undefined;
}

export const areaKeySlug = (area: AreaKey): string => (area === null ? UNSORTED_SLUG : areaSlug(area));

export const areaKeyLabel = (area: AreaKey): string => (area === null ? UNSORTED_LABEL : AREA_LABELS[area]);

export const inArea = (t: Pick<CatalogueTemplate, 'area'>, area: AreaKey): boolean => t.area === area;

export interface AreaCounts {
  area: AreaKey;
  /** Published templates offered on at least one vessel in view. */
  offered: number;
  /** Of those, shown on at least one vessel. */
  shown: number;
  /** Shown Customise copies. */
  customised: number;
  /** Published templates hidden on at least one vessel in view. */
  hidden: number;
  /** Drafts of the area (new templates and next versions). */
  drafts: number;
  /** Published templates overdue on at least one vessel in view (null: run tracking not known). */
  overdue: number | null;
}

/**
 * The overview's counts per area, in the overview's order, Unsorted last
 * (only when it holds a template). `stats` null: run tracking not set up
 * or not readable, so no overdue count.
 */
export function areaCounts(
  templates: readonly CatalogueTemplate[],
  vesselIds: readonly string[],
  index: SettingsIndex,
  stats: readonly FormTemplateRunStatRow[] | null,
): AreaCounts[] {
  const overdueIds = stats ? new Set(stats.filter((s) => s.overdue && vesselIds.includes(s.vessel_id)).map((s) => s.template_id)) : null;
  const count = (area: AreaKey): AreaCounts => {
    const rows = templates.filter((t) => t.area === area);
    let offered = 0;
    let shown = 0;
    let customised = 0;
    let hidden = 0;
    let overdue = 0;
    for (const t of rows) {
      if (t.status !== 'PUBLISHED') continue;
      const p = placement(t, vesselIds, index);
      if (p.targeted.length) offered += 1;
      if (p.shown.length) {
        shown += 1;
        if (isCustomisedCopy(t)) customised += 1;
      }
      if (p.hidden.length) hidden += 1;
      if (overdueIds?.has(t.id)) overdue += 1;
    }
    return { area, offered, shown, customised, hidden, drafts: rows.filter((t) => t.status === 'DRAFT').length, overdue: overdueIds ? overdue : null };
  };
  const out: AreaCounts[] = FORM_TEMPLATE_AREAS.map((area) => count(area));
  if (templates.some((t) => t.area === null)) out.push(count(null));
  return out;
}

// ─── Order on one vessel ───────────────────────────────────────────────

/**
 * The published templates of an area on one vessel, in the vessel's
 * order: the stored `sort_order` first (lowest first), then the rest by
 * name. Hidden ones are included (`form_template_reorder` orders them too).
 */
export function orderOnVessel(templates: readonly CatalogueTemplate[], area: AreaKey, vesselId: string, index: SettingsIndex): CatalogueTemplate[] {
  const rows = templates.filter((t) => t.status === 'PUBLISHED' && t.area === area && targetsVessel(t, vesselId));
  const order = (t: CatalogueTemplate) => settingFor(index, t.id, vesselId)?.sortOrder ?? null;
  return [...rows].sort((a, b) => {
    const oa = order(a);
    const ob = order(b);
    if (oa !== null && ob !== null && oa !== ob) return oa - ob;
    if (oa !== null && ob === null) return -1;
    if (oa === null && ob !== null) return 1;
    return a.name.localeCompare(b.name, 'en-GB', { sensitivity: 'base' }) || a.id.localeCompare(b.id);
  });
}

/** `ids` with the item at `from` moved to `to` (clamped); the same list when nothing moves. */
export function moveItem<T>(ids: readonly T[], from: number, to: number): T[] {
  const list = [...ids];
  if (from < 0 || from >= list.length) return list;
  const target = Math.max(0, Math.min(list.length - 1, to));
  if (target === from) return list;
  const [item] = list.splice(from, 1);
  list.splice(target, 0, item);
  return list;
}

/** The new position for a reorder key on an item at `index` of `length` (null: the key does not move it). */
export function reorderKeyTarget(key: string, index: number, length: number): number | null {
  switch (key) {
    case 'ArrowUp':
      return index > 0 ? index - 1 : null;
    case 'ArrowDown':
      return index < length - 1 ? index + 1 : null;
    case 'Home':
      return index > 0 ? 0 : null;
    case 'End':
      return index < length - 1 ? length - 1 : null;
    default:
      return null;
  }
}

export const sameOrder = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((id, i) => id === b[i]);

// ─── Runs ──────────────────────────────────────────────────────────────

export interface RunSummary {
  /** Runs on the vessels in view (every version of the template). */
  runs: number;
  /** The latest run's time across those vessels. */
  lastRunAt: string | null;
  lastRunOn: string | null;
  /** The earliest next due day across those vessels (not hidden). */
  nextDue: string | null;
  /** The vessels it is overdue on. */
  overdueOn: string[];
}

export function runSummary(stats: readonly FormTemplateRunStatRow[], templateId: string, vesselIds: readonly string[]): RunSummary {
  const wanted = new Set(vesselIds);
  const rows = stats.filter((s) => s.template_id === templateId && wanted.has(s.vessel_id));
  let lastRunAt: string | null = null;
  let lastRunOn: string | null = null;
  let nextDue: string | null = null;
  let runs = 0;
  const overdueOn: string[] = [];
  for (const s of rows) {
    runs += Number(s.runs) || 0;
    if (s.last_run_at && (!lastRunAt || Date.parse(s.last_run_at) > Date.parse(lastRunAt))) {
      lastRunAt = s.last_run_at;
      lastRunOn = s.last_run_on ?? null;
    }
    if (!s.hidden && s.next_due && (!nextDue || s.next_due < nextDue)) nextDue = s.next_due;
    if (s.overdue && !s.hidden) overdueOn.push(s.vessel_id);
  }
  return { runs, lastRunAt, lastRunOn, nextDue, overdueOn };
}

export interface VesselRunTally {
  /** Templates with a run recorded today. */
  ranToday: number;
  /** Templates due from today up to `days` days ahead, not overdue. */
  dueSoon: number;
  overdue: number;
}

/** The vessel page's tiles: of the templates listed, what ran today, what is due soon, what is overdue. */
export function vesselRunTally(stats: readonly FormTemplateRunStatRow[], templateIds: readonly string[], vesselId: string, today: string, days = 7): VesselRunTally {
  const wanted = new Set(templateIds);
  const horizon = addDays(today, days - 1);
  let ranToday = 0;
  let dueSoon = 0;
  let overdue = 0;
  for (const s of stats) {
    if (s.vessel_id !== vesselId || !wanted.has(s.template_id) || s.hidden) continue;
    if (s.last_run_on === today) ranToday += 1;
    if (s.overdue) overdue += 1;
    else if (s.next_due && s.next_due >= today && s.next_due <= horizon) dueSoon += 1;
  }
  return { ranToday, dueSoon, overdue };
}

// ─── The vessel pages ──────────────────────────────────────────────────

export interface VesselTemplateList {
  /** Published templates offered on the vessel and shown, in its order. */
  templates: CatalogueTemplate[];
  /** Published templates of the area hidden on the vessel. */
  hiddenCount: number;
}

/**
 * The templates crews on one vessel see in an area: published, targeting
 * the vessel, not hidden there, in the vessel's order. `area` undefined:
 * every area (used while the area column is not applied, D-01).
 */
export function vesselTemplates(templates: readonly CatalogueTemplate[], vesselId: string, area: AreaKey | undefined, index: SettingsIndex): VesselTemplateList {
  const rows =
    area === undefined
      ? templates
          .filter((t) => t.status === 'PUBLISHED' && targetsVessel(t, vesselId))
          .sort((a, b) => a.name.localeCompare(b.name, 'en-GB', { sensitivity: 'base' }) || a.id.localeCompare(b.id))
      : orderOnVessel(templates, area, vesselId, index);
  const shown = rows.filter((t) => !isHiddenOn(index, t.id, vesselId));
  return { templates: shown, hiddenCount: rows.length - shown.length };
}

// ─── Showing: the whole fleet or one vessel ────────────────────────────

export interface ShowingVessel {
  id: string;
  name: string;
  code: string | null;
  counted: boolean;
}

export type Showing = { kind: 'fleet'; vesselIds: string[] } | { kind: 'vessel'; vessel: ShowingVessel; vesselIds: [string] };

/**
 * What `?vessel=<CODE>` shows: that vessel when the user reaches it, else
 * the whole fleet (every counted vessel). `unknownCode` is set when the
 * parameter named no vessel the user reaches.
 */
export function resolveShowing(vessels: readonly ShowingVessel[], code: string | null | undefined): { showing: Showing; unknownCode: string | null } {
  const counted = vessels.filter((v) => v.counted).map((v) => v.id);
  const wanted = (code ?? '').trim().toUpperCase();
  if (!wanted) return { showing: { kind: 'fleet', vesselIds: counted }, unknownCode: null };
  const vessel = vessels.find((v) => (v.code ?? '').toUpperCase() === wanted);
  if (!vessel) return { showing: { kind: 'fleet', vesselIds: counted }, unknownCode: wanted };
  return { showing: { kind: 'vessel', vessel, vesselIds: [vessel.id] }, unknownCode: null };
}

/** "on the whole fleet" / "on DRAAK". */
export const showingPhrase = (showing: Showing): string => (showing.kind === 'fleet' ? 'on the whole fleet' : `on ${showing.vessel.name}`);

// ─── Small formatters ──────────────────────────────────────────────────

const FRESHNESS = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'UTC',
});

/** The page's one freshness stamp (D-88): "Updated 26 Nov 2026, 14:05 UTC". */
export const formatUpdatedUtc = (at: number | Date): string => `Updated ${FRESHNESS.format(at)} UTC`;

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** A `YYYY-MM-DD` as "20 Nov 2026" (calendar numbers, never shifted by a time zone); null for anything else. */
export function formatDay(day: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day ?? '');
  if (!m) return null;
  return DAY.format(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** How long ago a run was, in days from `today` ("Today", "Yesterday", "4 days ago", else the date). */
export function lastRunText(lastRunOn: string | null | undefined, today: string): string | null {
  const formatted = formatDay(lastRunOn);
  if (!formatted || !lastRunOn) return null;
  const days = Math.round((Date.UTC(...dayParts(today)) - Date.UTC(...dayParts(lastRunOn))) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days > 1 && days < 14) return `${days} days ago`;
  return formatted;
}

function dayParts(day: string): [number, number, number] {
  const [y, m, d] = day.split('-').map(Number);
  return [y, m - 1, d];
}

export const plural = (n: number, one: string, many = `${one}s`): string => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

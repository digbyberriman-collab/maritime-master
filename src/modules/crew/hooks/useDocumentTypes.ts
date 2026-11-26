/**
 * The crew document catalogue (X1-04; gap/04 C23): the categories (each on
 * a profile tab) and the document types the caller may use: STORM's system
 * types and their company's own (RLS: active users read the system rows,
 * members their company's). Read with explicit columns and kept for a day:
 * the catalogue changes with a migration or an administrator's new type,
 * not by the minute.
 *
 * D-01. While 20261124060400 is not applied the tables are missing: the
 * hook answers 'not_set_up' (the documents tabs then show the legacy rows
 * read-only with CATALOGUE_MISSING_NOTICE and no Add). Any other error is an
 * error with Retry. Nothing is mocked.
 *
 * Also home of crewDocumentKeys, the React Query keys of every crew document
 * read (company id first, so two companies never share an entry).
 */
import { useQuery } from '@tanstack/react-query';
import { pendingClient, isMissingTable, type NoPending } from '@/integrations/supabase/pending';
import type { CrewDocumentFieldSchema, CrewDocumentItemType, CrewDocumentTab, CrewPendingFunctions, CrewPendingTables } from '../types/db.pending';
import { readFieldSchema, tabForCategory } from '../lib/documentTabs';
import { crewKeys } from './crewKeys';

const crewDb = pendingClient<CrewPendingTables, NoPending, CrewPendingFunctions>();

const NONE = 'none';

export const crewDocumentKeys = {
  all: (companyId: string | null | undefined) => [...crewKeys.company(companyId), 'documents'] as const,
  catalogue: (companyId: string | null | undefined) => [...crewDocumentKeys.all(companyId), 'catalogue'] as const,
  person: (companyId: string | null | undefined, profileId: string | null | undefined) =>
    [...crewDocumentKeys.all(companyId), 'person', profileId ?? NONE] as const,
  rights: (companyId: string | null | undefined, profileId: string | null | undefined) =>
    [...crewDocumentKeys.person(companyId, profileId), 'rights'] as const,
  suggestions: (companyId: string | null | undefined, documentTypeId: string | null | undefined) =>
    [...crewDocumentKeys.all(companyId), 'suggestions', documentTypeId ?? NONE] as const,
};

export const CATEGORY_COLUMNS = 'key, label, tab, sort_order, is_active';
export const TYPE_COLUMNS =
  'id, company_id, category_key, key, name, code, abbreviation, stcw_reference, field_schema, default_validity_months, endorsement_interval_months, expiry_item_type, is_identity, is_medical_fitness, is_active, sort_order';

export interface DocumentCategory {
  key: string;
  label: string;
  tab: CrewDocumentTab;
  sortOrder: number;
  isActive: boolean;
}

export interface DocumentType {
  id: string;
  /** Null for STORM's system types. */
  companyId: string | null;
  categoryKey: string;
  tab: CrewDocumentTab;
  key: string;
  name: string;
  code: string | null;
  abbreviation: string | null;
  stcwReference: string | null;
  fieldSchema: CrewDocumentFieldSchema;
  defaultValidityMonths: number | null;
  endorsementIntervalMonths: number | null;
  itemType: CrewDocumentItemType;
  isIdentity: boolean;
  isMedicalFitness: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface DocumentCatalogue {
  categories: DocumentCategory[];
  /** Every type the caller may see, active or not (a document of a retired type still names it). */
  types: DocumentType[];
  byId: ReadonlyMap<string, DocumentType>;
}

export type DocumentTypesState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'not_set_up' }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'ready'; catalogue: DocumentCatalogue };

/** Not live yet (D-01): either table is missing. */
export class DocumentCatalogueMissing extends Error {
  constructor() {
    super('crew document catalogue not applied');
    this.name = 'DocumentCatalogueMissing';
  }
}

export async function fetchDocumentCatalogue(): Promise<DocumentCatalogue> {
  const [cats, types] = await Promise.all([
    crewDb.from('crew_document_categories').select(CATEGORY_COLUMNS).order('sort_order', { ascending: true }),
    crewDb.from('crew_document_types').select(TYPE_COLUMNS).order('sort_order', { ascending: true }).order('name', { ascending: true }),
  ]);
  for (const r of [cats, types]) {
    if (r.error) {
      if (isMissingTable(r.error)) throw new DocumentCatalogueMissing();
      throw r.error;
    }
  }
  const categories: DocumentCategory[] = (cats.data ?? []).map((c) => ({
    key: c.key,
    label: c.label,
    tab: c.tab,
    sortOrder: c.sort_order,
    isActive: c.is_active,
  }));
  const catSort = new Map(categories.map((c) => [c.key, c.sortOrder]));
  const list: DocumentType[] = (types.data ?? [])
    .map((t) => ({
      id: t.id,
      companyId: t.company_id,
      categoryKey: t.category_key,
      tab: tabForCategory(t.category_key, categories),
      key: t.key,
      name: t.name,
      code: t.code,
      abbreviation: t.abbreviation,
      stcwReference: t.stcw_reference,
      fieldSchema: readFieldSchema(t.field_schema),
      defaultValidityMonths: t.default_validity_months,
      endorsementIntervalMonths: t.endorsement_interval_months,
      itemType: t.expiry_item_type,
      isIdentity: t.is_identity,
      isMedicalFitness: t.is_medical_fitness,
      isActive: t.is_active,
      sortOrder: t.sort_order,
    }))
    .sort((a, b) => (catSort.get(a.categoryKey) ?? 9999) - (catSort.get(b.categoryKey) ?? 9999) || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  return { categories, types: list, byId: new Map(list.map((t) => [t.id, t])) };
}

/** The catalogue. `enabled: false` (a gate still loading or denied) sends nothing. */
export function useDocumentTypes(companyId: string | null | undefined, options: { enabled?: boolean } = {}): DocumentTypesState {
  const enabled = (options.enabled ?? true) && Boolean(companyId);
  const query = useQuery({
    queryKey: crewDocumentKeys.catalogue(companyId),
    queryFn: fetchDocumentCatalogue,
    enabled,
    staleTime: 24 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    retry: (failureCount, error) => !(error instanceof DocumentCatalogueMissing) && failureCount < 1,
  });
  if (!enabled) return { status: 'idle' };
  if (query.error instanceof DocumentCatalogueMissing) return { status: 'not_set_up' };
  if (query.error) return { status: 'error', error: query.error, retry: () => void query.refetch() };
  if (!query.data) return { status: 'loading' };
  return { status: 'ready', catalogue: query.data };
}

/** The active types of a tab, grouped by category in catalogue order (the add dialog's picker). */
export function typesByCategory(catalogue: DocumentCatalogue, tab?: CrewDocumentTab): Array<{ category: DocumentCategory; types: DocumentType[] }> {
  return catalogue.categories
    .filter((c) => c.isActive && (!tab || c.tab === tab))
    .map((category) => ({ category, types: catalogue.types.filter((t) => t.isActive && t.categoryKey === category.key) }))
    .filter((g) => g.types.length > 0);
}

/** Search over name, code and abbreviation (case and accents folded; every word must match). */
export function searchDocumentTypes(types: readonly DocumentType[], query: string): DocumentType[] {
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return types.filter((t) => t.isActive);
  return types.filter((t) => {
    if (!t.isActive) return false;
    const hay = fold([t.name, t.code ?? '', t.abbreviation ?? '', t.stcwReference ?? ''].join(' '));
    return words.every((w) => hay.includes(w));
  });
}

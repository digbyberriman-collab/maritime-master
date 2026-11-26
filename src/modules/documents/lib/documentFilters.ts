import type { DocumentCategory, DocumentFilters } from '@/modules/documents/hooks/useDocuments';

/** Number of filters in use (search excluded), for the "Filters (n)" button. */
export const activeFilterCount = (filters: DocumentFilters): number =>
  filters.categories.length + filters.statuses.length + filters.ismSections.length + (filters.vesselId ? 1 : 0);

/** Filters with nothing selected. */
export const EMPTY_DOCUMENT_FILTERS: DocumentFilters = {
  search: '',
  categories: [],
  statuses: [],
  ismSections: [],
  vesselId: null,
};

/**
 * The register's category in the URL (`/fleet/documents/register?category=manuals`):
 * the legacy `/documents/{manuals,policies,procedures}` redirect there
 * (gap/00 K1), and the filters write it back.
 */
export const REGISTER_CATEGORY_PARAM = 'category';

/** "ISM / SMS" → "ism-sms", "Manuals" → "manuals". */
export function categorySlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const singular = (slug: string) => (slug.endsWith('ies') ? `${slug.slice(0, -3)}y` : slug.endsWith('s') ? slug.slice(0, -1) : slug);

type CategoryRef = Pick<DocumentCategory, 'id' | 'name'> & Partial<Pick<DocumentCategory, 'display_order'>>;

/**
 * The category ids a `?category=` value names: comma-separated names or
 * slugs, matched without case, accents or punctuation, singular or plural
 * ("manual" finds Manuals, "ism-sms" finds ISM / SMS). Unknown names are
 * left out; nothing known is an empty list.
 */
export function categoryIdsForParam(categories: readonly CategoryRef[], param: string | null | undefined): string[] {
  const wanted = (param ?? '')
    .split(',')
    .map((part) => singular(categorySlug(part)))
    .filter(Boolean);
  if (!wanted.length) return [];
  return categories.filter((c) => wanted.includes(singular(categorySlug(c.name)))).map((c) => c.id);
}

/** The `?category=` value for chosen category ids (their slugs, in the categories' order), or null for none. */
export function categoryParamFor(categories: readonly CategoryRef[], ids: readonly string[]): string | null {
  if (!ids.length) return null;
  const chosen = new Set(ids);
  const slugs = [...categories]
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
    .filter((c) => chosen.has(c.id))
    .map((c) => categorySlug(c.name))
    .filter(Boolean);
  return slugs.length ? slugs.join(',') : null;
}

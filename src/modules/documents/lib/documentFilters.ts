import type { DocumentFilters } from '@/modules/documents/hooks/useDocuments';

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

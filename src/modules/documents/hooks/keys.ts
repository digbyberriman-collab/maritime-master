/**
 * React Query keys of the fleet document library (gap/02 FD1, FD2, FD10).
 * Every key carries the company id it was read for. Invalidate by prefix:
 * `fleetDocumentKeys.company(companyId)` after any library change.
 *
 * The library is read whole, once per company: the section counts, the
 * "n not uploaded" type slots and the vessel filter all need every
 * document the reader may see, and a company's library is tens to a few
 * hundred rows. The page's filters (section, vessel, search, status) are
 * applied in memory over that read (lib/fleetDocumentLibrary.ts), so they
 * are not part of a fetch key; `libraryView` names a filtered view for
 * callers that cache one.
 */
const NONE = 'none';

const company = (companyId: string | null | undefined) => ['fleet-documents', 'company', companyId ?? NONE] as const;

/** A view of the library: the filters the page applies over one read. */
export interface FleetDocumentLibraryFilters {
  sectionId: string | null;
  vesselId: string | null;
  search: string;
  status: string | null;
}

export const fleetDocumentKeys = {
  all: ['fleet-documents'] as const,
  company,
  /** Sections and document types. */
  taxonomy: (companyId: string | null | undefined) => [...company(companyId), 'taxonomy'] as const,
  /** Documents, their current and draft versions, and their targets. */
  library: (companyId: string | null | undefined) => [...company(companyId), 'library'] as const,
  /**
   * One document as the version history and the publish dialog read it:
   * the document, every version the reader may see (superseded ones
   * included), its targets and the names of the people who acted (X5-04B).
   */
  document: (companyId: string | null | undefined, documentId: string | null | undefined) =>
    [...company(companyId), 'document', documentId ?? NONE] as const,
  /** A filtered view of the library (normalised: trimmed, lower-case search). */
  libraryView: (companyId: string | null | undefined, filters: FleetDocumentLibraryFilters) =>
    [
      ...company(companyId),
      'library',
      'view',
      {
        sectionId: filters.sectionId ?? null,
        vesselId: filters.vesselId ?? null,
        search: filters.search.trim().toLowerCase(),
        status: filters.status ?? null,
      },
    ] as const,
};

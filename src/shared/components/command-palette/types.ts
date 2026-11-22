/**
 * Command palette contract (gap/10 IA12, BUILD-PLAN S5). Phase 1 cross-lane
 * interface: the shell (TopBar search trigger, AppShell) codes against these
 * types; the palette folder implements them. Change a shape here only with
 * both owners' agreement.
 */

/** What any component may do with the palette. */
export interface CommandPaletteApi {
  /** The palette dialog is open. */
  isOpen: boolean;
  /** Open the palette, optionally with a query already typed. */
  open: (initialQuery?: string) => void;
  close: () => void;
  toggle: () => void;
  /**
   * False when no `CommandPaletteProvider` is mounted above the caller: the
   * functions are then no-ops, and a trigger should render disabled.
   */
  available: boolean;
}

/**
 * A record found by its reference (`TYPE-VSL-YYYY-NNN`, C21; voyages
 * `VSL-YYYYMMDD-NNN`). Filled in Phase 3 by the domain streams.
 */
export interface RecordReferenceMatch {
  /** The reference as stored, e.g. `PTW-DRA-2026-061`. */
  reference: string;
  /** One line shown under the reference ("Hot work, aft deck"). */
  label: string;
  /** Scope-qualified path that opens the record (`/v/dra/safety/permits/…`). */
  path: string;
  /** Record kind key (gap/08 record-kind registry), e.g. `permit`. */
  kind: string;
}

/**
 * One source of record references (a domain stream registers one in Phase 3).
 * `search` must respect RLS (it queries as the signed-in user) and return
 * nothing it cannot open. It is called only when `matches(query)` is true.
 */
export interface RecordReferenceProvider {
  /** Stable id, e.g. `safety.permits`. */
  id: string;
  /** Cheap check: could this query be one of this provider's references? */
  matches: (query: string) => boolean;
  search: (query: string, signal: AbortSignal) => Promise<RecordReferenceMatch[]>;
}

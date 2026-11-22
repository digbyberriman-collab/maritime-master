/**
 * What the palette lists (gap/10 IA12, BUILD-PLAN S5). Each source hook in
 * ./sources.ts turns what the user may reach into `PaletteItem`s; the dialog
 * renders them and runs `perform` on selection. Items are the only way the
 * palette navigates or acts, so every gate lives in a source.
 */
import type { LucideIcon } from 'lucide-react';
import { scoreKeywords } from './fuzzy';

export type PaletteGroupId = 'pages' | 'vessels' | 'actions';

/** What selecting an item does. The dialog closes itself first in every case. */
export type PaletteEffect =
  /** Go to a scope-qualified path. */
  | { kind: 'navigate'; to: string }
  /** Open another vessel through `useVesselSwitch` (keeps the sub-path, IA23). */
  | { kind: 'switch-vessel'; vessel: { id: string; code: string } }
  /** Do something in place (theme, density, sign out). */
  | { kind: 'run'; run: () => void | Promise<void> }
  /**
   * Open another shell surface (notifications, shortcuts, feedback panel):
   * the palette closes, skips its focus return, and calls `open` on the next
   * animation frame so the two never fight over focus.
   */
  | { kind: 'open-surface'; open: () => void };

export interface PaletteItem {
  /** Stable across opens and vessels: `page:<path>`, `vessel:<id>`, `action:<name>`. */
  id: string;
  group: PaletteGroupId;
  label: string;
  /** One line under the label (a page's trail, a vessel's type and flag). */
  subtitle?: string;
  /** Matched by the fuzzy filter; the first is the label. */
  keywords: readonly string[];
  icon: LucideIcon;
  /** A short code shown as a chip (vessel code). */
  chip?: string;
  /** `current`: the vessel in scope; `active`: the theme or density in use. */
  marker?: 'current' | 'active';
  /** Remembered in Recent when picked. */
  recordable: boolean;
  /** Destructive actions read in the destructive tone (Sign out). */
  tone?: 'destructive';
  /** Pages: the nav scope the page belongs to (suggestions favour the current one). */
  scope?: string;
  perform: PaletteEffect;
}

export interface PaletteSource {
  /** `loading`: the group shows one skeleton row and offers nothing (fail closed). */
  status: 'loading' | 'ready';
  items: readonly PaletteItem[];
}

export const LOADING_SOURCE: PaletteSource = { status: 'loading', items: [] };

/** Every item of the sources that are ready, by id (Recent looks items up here). */
export function indexItems(sources: readonly PaletteSource[]): Map<string, PaletteItem> {
  const map = new Map<string, PaletteItem>();
  for (const source of sources) {
    if (source.status !== 'ready') continue;
    for (const item of source.items) if (!map.has(item.id)) map.set(item.id, item);
  }
  return map;
}

/** Recent rows get their own cmdk value, so a page in Recent and in Pages are two options. */
export const RECENT_VALUE_PREFIX = 'recent:';

/** Pages suggested before anything is typed; the rest are a query away. */
export const EMPTY_QUERY_PAGE_LIMIT = 5;

/**
 * The pages to show with an empty query (pure): the current scope's first,
 * in nav order, capped, so Vessels and Actions stay in view.
 */
export function suggestedPages(items: readonly PaletteItem[], scope: string | undefined, limit = EMPTY_QUERY_PAGE_LIMIT): PaletteItem[] {
  const rank = (item: PaletteItem) => (scope && item.scope === scope ? 0 : 1);
  return [...items].sort((a, b) => rank(a) - rank(b)).slice(0, limit);
}

/**
 * The items that match `query`, best first (pure). Ties keep the source
 * order (nav order, vessel name, action order). `best` is the top score,
 * 0 when nothing matches; the dialog orders its groups by it.
 */
export function rankItems(query: string, items: readonly PaletteItem[]): { items: PaletteItem[]; best: number } {
  const scored: { item: PaletteItem; index: number; score: number }[] = [];
  items.forEach((item, index) => {
    const score = scoreKeywords(query, item.keywords);
    if (score > 0) scored.push({ item, index, score });
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return { items: scored.map((s) => s.item), best: scored[0]?.score ?? 0 };
}

export interface PaletteGroupView {
  id: PaletteGroupId;
  heading: string;
  /** `loading`: render one skeleton row (fail closed). */
  status: PaletteSource['status'];
  items: readonly PaletteItem[];
  /** Pages hidden behind the empty-query suggestions. */
  more: number;
}

const GROUP_HEADINGS: Record<PaletteGroupId, string> = { pages: 'Pages', vessels: 'Vessels', actions: 'Actions' };

/**
 * The groups to render, in order (pure). With no query: Pages (a few
 * suggestions, the current scope's first), Vessels, Actions. With a query:
 * only groups with a match, the group holding the best match first, then
 * groups still loading (one skeleton row each, never an unfiltered list).
 *
 * The palette ranks here rather than through cmdk's own filter, so the top
 * result is the first option and Enter opens it, whatever group it is in.
 */
export function paletteGroups(
  query: string,
  sources: Record<PaletteGroupId, PaletteSource>,
  scope?: string,
): PaletteGroupView[] {
  const order: PaletteGroupId[] = ['pages', 'vessels', 'actions'];
  const trimmed = query.trim();
  if (!trimmed) {
    return order.map((id): PaletteGroupView => {
      const source = sources[id];
      if (source.status === 'loading') return { id, heading: GROUP_HEADINGS[id], status: 'loading', items: [], more: 0 };
      const items = id === 'pages' ? suggestedPages(source.items, scope) : [...source.items];
      return { id, heading: GROUP_HEADINGS[id], status: 'ready', items, more: source.items.length - items.length };
    }).filter((group) => group.status === 'loading' || group.items.length > 0);
  }
  return order
    .map((id, position) => {
      const source = sources[id];
      if (source.status === 'loading') return { view: { id, heading: GROUP_HEADINGS[id], status: 'loading' as const, items: [], more: 0 }, best: -1, position };
      const ranked = rankItems(trimmed, source.items);
      return { view: { id, heading: GROUP_HEADINGS[id], status: 'ready' as const, items: ranked.items, more: 0 }, best: ranked.best, position };
    })
    .filter((group) => group.view.status === 'loading' || group.view.items.length > 0)
    .sort((a, b) => b.best - a.best || a.position - b.position)
    .map((group) => group.view);
}

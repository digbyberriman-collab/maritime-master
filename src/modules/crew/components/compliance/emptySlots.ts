/**
 * "Show empty slots" on a profile documents tab (gap/04 C24; X1-06B): each
 * requirement of the person's position the tab misses, as a slot in the
 * group of its first option's category (a new group, in catalogue order,
 * when the person holds nothing of it), else in "Required, not held" at
 * the end.
 */
import type { DocumentCatalogue } from '@/modules/crew/hooks/useDocumentTypes';
import type { MissingOnTab } from '@/modules/crew/lib/complianceModel';

/** Where an empty slot goes when its option's category is unknown. */
export const REQUIRED_GROUP_KEY = '__required__';
export const REQUIRED_GROUP_LABEL = 'Required, not held';

/** A documents tab's group (DocumentsTab's), with the slots it gains. */
export interface SlotGroup<D> {
  key: string;
  label: string;
  documents: D[];
  slots?: MissingOnTab[];
}

const humanise = (key: string) => key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/**
 * The groups with the slots put in. `unclassifiedKey` is the tab's group of
 * documents with no category, kept just before "Required, not held".
 * Without the catalogue the groups keep their order and new ones go last.
 */
export function withEmptySlots<D>(
  groups: readonly SlotGroup<D>[],
  slots: readonly MissingOnTab[],
  catalogue: DocumentCatalogue | null,
  unclassifiedKey: string,
): SlotGroup<D>[] {
  if (slots.length === 0) return [...groups];
  const out: SlotGroup<D>[] = groups.map((g) => ({ ...g, slots: [] }));
  const order = new Map(catalogue ? catalogue.categories.map((c, i) => [c.key, { index: i, label: c.label }] as const) : []);
  for (const slot of slots) {
    const firstType = slot.optionTypeIds.map((id) => catalogue?.byId.get(id)).find(Boolean) ?? null;
    const key = firstType?.categoryKey ?? REQUIRED_GROUP_KEY;
    let g = out.find((x) => x.key === key);
    if (!g) {
      g = { key, label: key === REQUIRED_GROUP_KEY ? REQUIRED_GROUP_LABEL : order.get(key)?.label ?? humanise(key), documents: [], slots: [] };
      out.push(g);
    }
    (g.slots ??= []).push(slot);
  }
  const rank = (key: string) =>
    key === REQUIRED_GROUP_KEY ? Number.MAX_SAFE_INTEGER : key === unclassifiedKey ? Number.MAX_SAFE_INTEGER - 1 : order.get(key)?.index ?? Number.MAX_SAFE_INTEGER - 2;
  const original = new Map(groups.map((g, i) => [g.key, i]));
  return out.sort((a, b) =>
    catalogue
      ? rank(a.key) - rank(b.key) || a.label.localeCompare(b.label)
      : (original.get(a.key) ?? Number.MAX_SAFE_INTEGER) - (original.get(b.key) ?? Number.MAX_SAFE_INTEGER),
  );
}

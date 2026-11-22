/**
 * Shared nav node builders (gap/00 F0.3: "sitemap.ts becomes an assembler:
 * slots + module nav fragments + shared builders L()/G()").
 *
 * The site map and every module manifest build their nodes with these, so a
 * leaf has the same id, path and gating fields wherever it is declared.
 * This file stays light (lucide icons and types only): manifests import it
 * eagerly through the module registry.
 *
 * Status (D-06, gap/00 W3): a leaf built with an explicit `status`, or with
 * `existing` (it points at a route that exists), keeps it. Any other leaf is
 * left without one, and the assembler settles it with `resolveNavStatus`:
 * `live` when a registered route serves its path, `planned` otherwise. So a
 * leaf goes live by registering its route, with no edit to the nav.
 */
import { CircleDot, type LucideIcon } from 'lucide-react';
import type { NavChild, NavScope, NavStatus } from './navigation-types';

const DEFAULT_ICON: LucideIcon = CircleDot;

/** Normalize a label into a URL slug. */
export const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/['’`"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Gating and registry fields any node may carry. */
export type GateOpts = Pick<
  NavChild,
  'moduleKey' | 'minPermission' | 'crossLink' | 'selfServe' | 'capability' | 'badgeKey' | 'moduleSetting' | 'scope'
>;

const gateFields = (opts: GateOpts): Partial<NavChild> => ({
  ...(opts.moduleKey ? { moduleKey: opts.moduleKey } : {}),
  ...(opts.minPermission ? { minPermission: opts.minPermission } : {}),
  ...(opts.crossLink ? { crossLink: true } : {}),
  ...(opts.selfServe ? { selfServe: true } : {}),
  ...(opts.capability ? { capability: opts.capability } : {}),
  ...(opts.badgeKey ? { badgeKey: opts.badgeKey } : {}),
  ...(opts.moduleSetting ? { moduleSetting: opts.moduleSetting } : {}),
  ...(opts.scope ? { scope: opts.scope } : {}),
});

export const nodeId = (base: string, s: string): string =>
  `${base}-${s}`.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+/, '');

/** A leaf that reaches a real page served outside the module registry. */
export const LIVE = { status: 'live' } as const;

/**
 * Build a leaf under a base path. Pass `existing` to point at a route that
 * exists elsewhere (it is then `live`); otherwise the path is base + slug and
 * the status is settled later by `resolveNavStatus` unless given.
 */
export function L(
  label: string,
  base: string,
  opts: { existing?: string; icon?: LucideIcon; slug?: string; status?: NavStatus } & GateOpts = {},
): NavChild {
  const s = opts.slug ?? slug(label);
  const path = opts.existing ?? `${base}/${s}`;
  const status: NavStatus | undefined = opts.status ?? (opts.existing ? 'live' : undefined);
  return {
    id: nodeId(base, s),
    label,
    path,
    icon: opts.icon ?? DEFAULT_ICON,
    kind: 'leaf',
    ...(status ? { status } : {}),
    ...gateFields(opts),
  };
}

/** Build a group (collapsible child with its own children) under a base path. */
export function G(
  label: string,
  base: string,
  children: NavChild[],
  opts: { icon?: LucideIcon; slug?: string } & GateOpts = {},
): NavChild {
  const s = opts.slug ?? slug(label);
  return {
    id: nodeId(base, s),
    label,
    path: `${base}/${s}`,
    icon: opts.icon ?? DEFAULT_ICON,
    kind: 'group',
    children,
    ...gateFields({ ...opts, crossLink: undefined }),
  };
}

/**
 * Build a section: a non-interactive eyebrow heading ("OVERVIEW",
 * "ADMINISTRATION") with its children listed beneath it (gap/10 IA6). A
 * heading has no page of its own, so its path is its parent's (`base`): a
 * breadcrumb on it leads to the parent's landing, never to a made-up URL.
 * Everywhere else it behaves like a group (leaf walks, visibility).
 */
export function S(
  label: string,
  base: string,
  children: NavChild[],
  opts: { icon?: LucideIcon; slug?: string } & GateOpts = {},
): NavChild {
  const s = opts.slug ?? slug(label);
  return {
    id: nodeId(base, s),
    label,
    path: base,
    icon: opts.icon ?? DEFAULT_ICON,
    kind: 'section',
    children,
    ...gateFields({ ...opts, crossLink: undefined }),
  };
}

/** Sets `scope` on a subtree, keeping any scope a node already declares. */
export function withScope(items: NavChild[], scope: NavScope): NavChild[] {
  return items.map((item) => ({
    ...item,
    scope: item.scope ?? scope,
    ...(item.children ? { children: withScope(item.children, scope) } : {}),
  }));
}

/** A slot entry: a node with its position (lower first). */
export interface SlotEntry {
  order: number;
  node: NavChild;
}

/**
 * The children of one slot: the platform's own nodes and the fragments
 * modules contributed, sorted by `order`. A plain node in `base` takes the
 * order of its position (10, 20, 30, …); an entry gives its own. On equal
 * order the platform node comes first, then fragments in the order given.
 */
export function mergeSlot(base: readonly (NavChild | SlotEntry)[], fragments: readonly SlotEntry[] = []): NavChild[] {
  const entries = [
    ...base.map((item, i) => ({ ...('node' in item ? item : { order: (i + 1) * 10, node: item }), rank: 0, seq: i })),
    ...fragments.map((f, i) => ({ ...f, rank: 1, seq: i })),
  ];
  entries.sort((a, b) => a.order - b.order || a.rank - b.rank || a.seq - b.seq);
  return entries.map((e) => e.node);
}

/**
 * Settles the status of every leaf that was built without one: `live` when
 * `isRouted(path)` (a registered route serves it), `planned` otherwise.
 * Leaves that already carry a status, groups and sections are unchanged.
 */
export function resolveNavStatus(items: NavChild[], isRouted: (path: string) => boolean): NavChild[] {
  return items.map((item) => {
    if (item.children?.length) return { ...item, children: resolveNavStatus(item.children, isRouted) };
    if (item.status || (item.kind && item.kind !== 'leaf')) return item;
    return { ...item, status: isRouted(item.path.split('?')[0]) ? 'live' : 'planned' };
  });
}

/**
 * Nodes as slot fragments in their given order (10, 20, 30, …), for a
 * manifest's `nav`: `nav: inSlot('workspace.hris', hrisTree)`.
 */
export function inSlot<S extends string>(slot: S, nodes: NavChild[], first = 10, step = 10): { slot: S; order: number; node: NavChild }[] {
  return nodes.map((node, i) => ({ slot, order: first + i * step, node }));
}

/**
 * Data-driven nav sections (gap/10 IA24; spec §2.1 L1b): the extension point
 * through which a module fills part of a vessel's nav from data — one leaf
 * per certificate section, per vessel document section, per logbook in the
 * vessel registry, per enabled department.
 *
 * A provider names the node it fills (`nodeId`: a resolved vessel node id
 * such as `vessel-safety-vessel-documents`, or a tab's module id such as
 * `logbooks` for the whole tab) and a hook that returns that vessel's
 * children. `useVesselNav` merges the results into the vessel tree before
 * the visibility filter, so provided leaves pass the same rule as static
 * ones:
 *
 * - `ready`: the provider's children replace the static ones;
 * - `loading`: the node stays, with no children and a skeleton row (never
 *   stale or static children that may be wrong for this vessel);
 * - `error`: the static children stay (the seed is better than nothing).
 *
 * The registry is a static list, so the hooks run in the same order on every
 * render. No provider ships in Phase 1: certificate sections (doc 06),
 * vessel documents (doc 05), the logbook registry and departments register
 * theirs in Phase 3. Children carry absolute paths under `/v/<code>`, a
 * `status` and stable ids.
 */
import { useRef } from 'react';
import type { NavChild, VesselModuleNav } from '@/config/navigation-types';
import type { NavTreeNode } from './navTree';

export interface NavProviderVessel {
  id: string;
  code: string;
  name: string;
}

export type NavProviderStatus = 'loading' | 'error' | 'ready';

export interface NavProviderResult {
  status: NavProviderStatus;
  children: readonly NavChild[];
}

export interface NavChildrenProvider {
  /** Stable id of the provider (`certificate-sections`). */
  id: string;
  /** The node it fills: a resolved vessel node id, or a tab's module id. */
  nodeId: string;
  /** That vessel's children. Called on every render, in registry order. */
  useChildren: (vessel: NavProviderVessel | null) => NavProviderResult;
}

/** The registered providers (none in Phase 1). Never mutated at runtime. */
export const NAV_CHILDREN_PROVIDERS: readonly NavChildrenProvider[] = Object.freeze([]);

/** A vessel module after the providers ran: its children may be pending. */
export interface ProvidedVesselModule extends Omit<VesselModuleNav, 'children'> {
  children: NavTreeNode[];
  /** The whole tab's children are loading (a provider on the module id). */
  childrenPending?: boolean;
}

function mergeNodes(nodes: readonly NavChild[], results: ReadonlyMap<string, NavProviderResult>): NavTreeNode[] {
  return nodes.map((node) => {
    const result = results.get(node.id);
    if (result?.status === 'ready') return { ...node, children: [...result.children] };
    if (result?.status === 'loading') return { ...node, children: [], childrenPending: true };
    if (!node.children?.length) return node;
    return { ...node, children: mergeNodes(node.children, results) };
  });
}

/** The vessel modules with the providers' results merged in (pure; rules above). */
export function applyNavProviders(
  modules: readonly VesselModuleNav[],
  results: ReadonlyMap<string, NavProviderResult>,
): ProvidedVesselModule[] {
  return modules.map((module) => {
    const own = results.get(module.id);
    if (own?.status === 'ready') return { ...module, children: [...own.children] };
    if (own?.status === 'loading') return { ...module, children: [], childrenPending: true };
    return { ...module, children: results.size ? mergeNodes(module.children, results) : module.children };
  });
}

/**
 * Runs every provider's hook for the vessel, in registry order, and keys the
 * results by node id. `providers` must be the same list on every render
 * (the registry, or a fixed list in a test).
 */
const NO_RESULTS: ReadonlyMap<string, NavProviderResult> = new Map();

const sameResults = (a: ReadonlyMap<string, NavProviderResult>, b: ReadonlyMap<string, NavProviderResult>): boolean =>
  a.size === b.size &&
  [...a].every(([key, value]) => {
    const other = b.get(key);
    return other !== undefined && other.status === value.status && other.children === value.children;
  });

export function useNavProviderResults(
  vessel: NavProviderVessel | null,
  providers: readonly NavChildrenProvider[] = NAV_CHILDREN_PROVIDERS,
): ReadonlyMap<string, NavProviderResult> {
  const results = new Map<string, NavProviderResult>();
  for (const provider of providers) {
    // A fixed list, so this is the same sequence of hook calls every render.
    results.set(provider.nodeId, provider.useChildren(vessel));
  }
  // The same map object while nothing changed, so the nav below stays memoised.
  const previous = useRef<ReadonlyMap<string, NavProviderResult>>(NO_RESULTS);
  if (!sameResults(previous.current, results)) previous.current = results.size ? results : NO_RESULTS;
  return previous.current;
}

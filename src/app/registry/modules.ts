/**
 * The module registry: every `src/modules/<module>/module.ts`, collected at
 * build time (gap/00 A2, "Registration flow"; BUILD-PLAN B8).
 *
 * Adding a module means adding its folder and its `module.ts`; nothing here
 * or in the router or site map changes. The glob is eager because manifests
 * are data (no pages, no shells): pages load when their route is opened.
 */
import { buildRegistry, type ModuleRegistry } from './registry';
import type { ModuleManifest } from './types';

const manifests = import.meta.glob<ModuleManifest>('../../modules/*/module.ts', { eager: true, import: 'default' });

export const MODULE_REGISTRY: ModuleRegistry = buildRegistry(manifests);

if (import.meta.env.DEV && MODULE_REGISTRY.problems.length) {
  console.error(`Module manifests have problems:\n  ${MODULE_REGISTRY.problems.join('\n  ')}`);
}

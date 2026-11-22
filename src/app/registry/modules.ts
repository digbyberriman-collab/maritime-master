/**
 * The module registry: every `src/modules/<module>/module.ts`, collected at
 * build time (gap/00 A2, "Registration flow"; BUILD-PLAN B8).
 *
 * Adding a module means adding its folder and its `module.ts`; nothing here
 * or in the router or site map changes. The glob is eager because manifests
 * are data (no pages, no shells): pages load when their route is opened.
 */
import { recordKinds } from '@/lib/records/registry';
import { buildRegistry, type ModuleRegistry } from './registry';
import type { ModuleManifest } from './types';

const manifests = import.meta.glob<ModuleManifest>('../../modules/*/module.ts', { eager: true, import: 'default' });

export const MODULE_REGISTRY: ModuleRegistry = buildRegistry(manifests);

/*
 * Seed the app-wide record-kind registry (palette lookups by reference
 * prefix, getRecordKind) with the kinds that passed validation. Registering
 * an identical definition again is a no-op, so hot reload is safe; a
 * changed definition under a live key is reported, not thrown.
 */
const seedProblems: string[] = [];
for (const { moduleId, ...kind } of MODULE_REGISTRY.recordKinds) {
  try {
    recordKinds.register(kind);
  } catch (e) {
    seedProblems.push(`${moduleId}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

if (import.meta.env.DEV && (MODULE_REGISTRY.problems.length || seedProblems.length)) {
  console.error(`Module manifests have problems:\n  ${[...MODULE_REGISTRY.problems, ...seedProblems].join('\n  ')}`);
}

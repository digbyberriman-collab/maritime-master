/**
 * The URL scope the current page renders in (gap/00 IA table C). Set by the
 * scope layout routes in ./scopes.tsx; read with `useScope()`,
 * `useVesselScope()` and `useScopedPath()`.
 */
import { createContext, useContext } from 'react';
import type { NavScope } from '@/config/navigation-types';
import type { Vessel } from '@/modules/vessels/contexts/VesselContext';

export interface ScopeValue {
  /** `legacy` = a route that has not moved into a scope yet. */
  scope: NavScope | 'legacy';
  /** Vessel scope only: the vessel the URL names. */
  vessel?: Vessel;
  /** Vessel scope only: its code, upper case. */
  vesselCode?: string;
  /** Workspace scope only: `hris`, `health`, `yard`, `legal`, … */
  workspace?: string;
}

export const LEGACY_SCOPE: ScopeValue = { scope: 'legacy' };

export const ScopeContext = createContext<ScopeValue>(LEGACY_SCOPE);

export function useScope(): ScopeValue {
  return useContext(ScopeContext);
}

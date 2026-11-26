/**
 * Fleet ↔ vessel counterparts (gap/10 top bar element 2, W2; spec §6.1).
 *
 * The same subject seen across the fleet and on one vessel: Crew › Training
 * on a vessel is Fleet › Training, the vessel home is the fleet dashboard.
 * The scope control's Fleet segment uses `fleetCounterpart` (vessel → fleet)
 * and `vesselSwitchTarget` uses `vesselCounterpart` (fleet → vessel). Both
 * match the longest prefix; the vessel home matches only itself. A
 * counterpart is a suggestion: callers use it only when the target page is
 * visible to the user, and fall back to the fleet dashboard or the vessel
 * home otherwise.
 */

export interface Counterpart {
  /** Path inside the vessel scope, after `/v/<code>/`; `''` is the vessel home. */
  vesselRest: string;
  /** Absolute Fleet path. */
  fleetPath: string;
}

export const COUNTERPARTS: readonly Counterpart[] = Object.freeze([
  { vesselRest: '', fleetPath: '/fleet/dashboard' },
  { vesselRest: 'crew/training', fleetPath: '/fleet/training' },
  { vesselRest: 'crew/planner', fleetPath: '/fleet/planner' },
  { vesselRest: 'crew/medical', fleetPath: '/fleet/medical' },
  { vesselRest: 'crew/visitors', fleetPath: '/fleet/visits' },
  { vesselRest: 'safety', fleetPath: '/fleet/safety' },
  // The documents the company publishes, and their forms and checklists by
  // area (gap/02 FD, FC; gap/05).
  { vesselRest: 'safety/fleet-documents', fleetPath: '/fleet/documents' },
  { vesselRest: 'safety/checklists', fleetPath: '/fleet/forms/safety' },
  { vesselRest: 'technical/forms', fleetPath: '/fleet/forms/technical' },
  { vesselRest: 'calendar', fleetPath: '/fleet/calendar' },
  { vesselRest: 'reports', fleetPath: '/fleet/reports' },
  { vesselRest: 'vessel/tracking', fleetPath: '/fleet/tracker' },
]);

const clean = (path: string): string => path.split(/[?#]/)[0].replace(/^\/+|\/+$/g, '');

const under = (path: string, prefix: string): boolean => path === prefix || path.startsWith(`${prefix}/`);

/** The Fleet page for a vessel page (`crew/training/123` → `/fleet/training`), or null. */
export function fleetCounterpart(vesselRest: string): string | null {
  const rest = clean(vesselRest);
  let best: Counterpart | null = null;
  for (const entry of COUNTERPARTS) {
    const match = entry.vesselRest === '' ? rest === '' : under(rest, entry.vesselRest);
    if (match && (!best || entry.vesselRest.length > best.vesselRest.length)) best = entry;
  }
  return best?.fleetPath ?? null;
}

/** The vessel page for a Fleet page (`/fleet/training?x=1` → `crew/training`), or null. */
export function vesselCounterpart(fleetPath: string): string | null {
  const path = `/${clean(fleetPath)}`;
  let best: Counterpart | null = null;
  for (const entry of COUNTERPARTS) {
    if (under(path, entry.fleetPath) && (!best || entry.fleetPath.length > best.fleetPath.length)) best = entry;
  }
  return best ? best.vesselRest : null;
}

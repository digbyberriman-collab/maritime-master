/**
 * The crew profile's tabs (X1-03; gap/04 C16; X1 spec §4): one registry the
 * page renders from, so each later slice adds its tab here and nowhere else.
 *
 *   personal, contact                        X1-03 (this slice)
 *   training, medical, activity              X1-03B
 *   documents, stcw, qualifications          X1-04B
 *   hours-of-rest                            X1-07B (until then the route
 *                                            crew/people/:crewId/hours-of-rest
 *                                            keeps the month page)
 *   employment                               X1-11B
 *
 * A tab names the capability it needs on the vessel, whether the person's
 * own profile always opens it, and the vessel module setting that can close
 * it. Which tabs the viewer may open comes from the server
 * (crew_profile_summary.tabs); while that RPC is not applied (D-01) the
 * page asks useCan with the same keys.
 *
 * Each tab body loads lazily (gap/00 I6): `load` is a dynamic import, and
 * PROFILE_TAB_COMPONENTS wraps each once in React.lazy.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { CapabilityKey } from '@/lib/permissions/types';
import { CREW_CAPS, CREW_ROOT } from '../paths';
import type { CrewProfileTabKey } from '../types/db.pending';
import type { CrewProfileSummary } from '../hooks/useCrewProfile';

/** What every tab body receives. */
export interface ProfileTabProps {
  profile: CrewProfileSummary;
  vessel: { id: string; companyId: string; name: string };
}

export interface ProfileTabDef {
  key: CrewProfileTabKey;
  label: string;
  /** Needed on the vessel to open the tab (own profile: see ownAlways). */
  capability: CapabilityKey;
  /** The person's own profile always opens it. */
  ownAlways: boolean;
  /** A vessel_module_settings key that closes the tab when off. */
  moduleSetting?: string;
  load: () => Promise<{ default: ComponentType<ProfileTabProps> }>;
}

/** Every tab key a profile can have (X1 spec §4), built or not yet, in display order. */
export const PROFILE_TAB_KEYS: readonly CrewProfileTabKey[] = [
  'personal',
  'contact',
  'documents',
  'stcw',
  'qualifications',
  'training',
  'hours-of-rest',
  'employment',
  'medical',
  'activity',
];

export const DEFAULT_PROFILE_TAB: CrewProfileTabKey = 'personal';

/** The tabs built so far, in display order. */
export const PROFILE_TABS: readonly ProfileTabDef[] = [
  {
    key: 'personal',
    label: 'Personal',
    capability: CREW_CAPS.profilesView,
    ownAlways: true,
    load: () => import('@/modules/crew/components/profile/PersonalTab'),
  },
  {
    key: 'contact',
    label: 'Contact',
    capability: CREW_CAPS.profilesView,
    ownAlways: true,
    load: () => import('@/modules/crew/components/profile/ContactTab'),
  },
];

/** One lazy component per built tab, made once. */
export const PROFILE_TAB_COMPONENTS: Readonly<Record<string, LazyExoticComponent<ComponentType<ProfileTabProps>>>> = Object.fromEntries(
  PROFILE_TABS.map((tab) => [tab.key, lazy(tab.load)]),
);

/** The built tab with this key, or null (an unknown key, or a tab a later slice builds). */
export function profileTabFor(key: string | null | undefined): ProfileTabDef | null {
  return PROFILE_TABS.find((tab) => tab.key === key) ?? null;
}

/** The scope-relative path of a profile tab (link it with useScopedPath()). */
export function profilePath(profileId: string, tab: CrewProfileTabKey = DEFAULT_PROFILE_TAB): string {
  return `${CREW_ROOT}/people/${encodeURIComponent(profileId)}/${tab}`;
}

export interface TabAccess {
  /** The tabs the server says the viewer may open (crew_profile_summary.tabs), or null without the RPC (D-01). */
  serverTabs: readonly string[] | null;
  /** The viewer's own profile. */
  own: boolean;
  /** useCan for a tab's capability on the vessel (the D-01 fallback). */
  can: (key: CapabilityKey) => boolean;
  /** A vessel module setting is on (absent settings are on). */
  moduleOn?: (setting: string) => boolean;
}

/** The built tabs this viewer may open, in display order. */
export function visibleProfileTabs(access: TabAccess): ProfileTabDef[] {
  return PROFILE_TABS.filter((tab) => {
    if (tab.moduleSetting && access.moduleOn && !access.moduleOn(tab.moduleSetting)) return false;
    if (access.serverTabs) return access.serverTabs.includes(tab.key);
    return (tab.ownAlways && access.own) || access.can(tab.capability);
  });
}

/**
 * Where a profile URL's tab segment should land: the tab itself when it is
 * built and open to the viewer, else the first tab the viewer may open (an
 * unknown or not-yet-built tab goes to Personal), else null (no tab at all).
 */
export function resolveProfileTab(requested: string | null | undefined, visible: readonly ProfileTabDef[]): ProfileTabDef | null {
  return visible.find((tab) => tab.key === requested) ?? visible.find((tab) => tab.key === DEFAULT_PROFILE_TAB) ?? visible[0] ?? null;
}

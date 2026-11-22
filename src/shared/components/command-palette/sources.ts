/**
 * The palette's sources (gap/10 IA12, BUILD-PLAN S5): what this user may open
 * or do, turned into `PaletteItem`s. Every gate lives here and fails closed
 * (D-04): a source that is still loading offers nothing and shows a skeleton
 * row; an action whose surface is not available is left out.
 *
 * - Pages: `useVisibleNavLeaves()` (the same visibility pipeline as the
 *   sidebar), never an unfiltered list.
 * - Vessels: the vessels in the user's reach, once `useScopeAccess()` is
 *   ready; "All vessels" only with fleet reach (D-26). Selecting goes through
 *   `useVesselSwitch()`, which keeps the user's place (IA23).
 * - Actions: theme (`useThemeChoice`, mirrored to the profile, gap/10 W1),
 *   density (device only, D-19), shell surfaces that the shell says are
 *   available, report a problem, report an incident (capability + a vessel
 *   in reach; `/incidents?new=true`, D-27), sign out.
 */
import { useMemo } from 'react';
import {
  Bell,
  Earth,
  Keyboard,
  LogOut,
  MessageSquareWarning,
  Monitor,
  Moon,
  Rows2,
  Rows3,
  Rows4,
  Ship,
  Siren,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { useVisibleNavLeaves } from '@/app/nav/useVisibleNav';
import { useNavAccess } from '@/app/nav/navAccess';
import { useScopeAccess } from '@/app/router/useScopeAccess';
import { useScope } from '@/app/router/scopeContext';
import { useShellActions } from '@/app/shell/shellActions';
import { useThemeChoice } from '@/app/shell/themeChoice';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import { VESSEL_SCOPE_PATTERN, vesselPath } from '@/modules/vessels/lib/vesselCode';
import { useFeedbackStore } from '@/modules/feedback/store/feedbackStore';
import { useCan } from '@/lib/permissions/useCan';
import { useDensity } from '@/components/ui/use-density';
import type { Density, ThemePreference } from '@/components/ui/theme-config';
import { LOADING_SOURCE, type PaletteItem, type PaletteSource } from './model';

/** Where "Report an incident" goes (D-27: the incidents URLs stay until their stream rebuilds them). */
export const REPORT_INCIDENT_PATH = '/incidents?new=true';
export const REPORT_INCIDENT_CAPABILITY = 'vessel.safety.incidents.create';
export const FLEET_OVERVIEW_PATH = '/fleet/dashboard';

/**
 * A nav path with the literal `/v/:vesselCode` prefix (the static tree's
 * form), pointed at `code` when one is known; otherwise left as it is, which
 * the vessel scope opens on the current vessel.
 */
export function resolveVesselPattern(path: string, code: string | null | undefined): string {
  if (!code) return path;
  const lower = path.toLowerCase();
  const pattern = VESSEL_SCOPE_PATTERN.toLowerCase();
  if (!lower.startsWith(pattern)) return path;
  const rest = path.slice(VESSEL_SCOPE_PATTERN.length);
  if (rest && !/^[/?#]/.test(rest)) return path;
  return vesselPath(code, rest);
}

export function usePalettePages(): PaletteSource {
  const nav = useVisibleNavLeaves();
  const scope = useScope();
  const { lastVesselCode } = useScopeAccess();
  const vesselCode = (scope.scope === 'vessel' ? scope.vesselCode : undefined) ?? lastVesselCode;
  return useMemo<PaletteSource>(() => {
    if (!nav.ready) return LOADING_SOURCE;
    const items = nav.leaves.map<PaletteItem>((leaf) => {
      const trail = leaf.trail.filter(Boolean);
      return {
        id: `page:${leaf.path}`,
        group: 'pages',
        label: leaf.label,
        subtitle: trail.length ? trail.join(' › ') : undefined,
        keywords: [leaf.label, ...trail],
        icon: leaf.icon,
        scope: leaf.scope,
        recordable: true,
        perform: { kind: 'navigate', to: resolveVesselPattern(leaf.path, vesselCode) },
      };
    });
    return { status: 'ready', items };
  }, [nav, vesselCode]);
}

export function usePaletteVessels(): PaletteSource {
  const access = useScopeAccess();
  const { fleetReach } = useNavAccess();
  const { profile } = useAuth();
  const { vessels, getVesselCodeById } = useVessel();
  const scope = useScope();
  const currentCode = scope.scope === 'vessel' ? scope.vesselCode ?? null : null;
  return useMemo<PaletteSource>(() => {
    if (!access.ready || !access.signedIn) return LOADING_SOURCE;
    const items: PaletteItem[] = [];
    if (fleetReach) {
      items.push({
        id: 'fleet:overview',
        group: 'vessels',
        label: 'All vessels — Fleet overview',
        keywords: ['All vessels', 'Fleet overview', 'Fleet dashboard'],
        icon: Earth,
        recordable: true,
        perform: { kind: 'navigate', to: FLEET_OVERVIEW_PATH },
      });
    }
    // No readable profile: no vessels, whatever the context still holds (useScopeAccess does the same).
    const reachable = profile ? [...vessels].sort((a, b) => a.name.localeCompare(b.name)) : [];
    for (const vessel of reachable) {
      const code = getVesselCodeById(vessel.id);
      if (!code) continue;
      const details = [vessel.vessel_type, vessel.flag_state].filter((part): part is string => Boolean(part));
      items.push({
        id: `vessel:${vessel.id}`,
        group: 'vessels',
        label: vessel.name,
        subtitle: details.length ? details.join(' · ') : undefined,
        keywords: [vessel.name, code, vessel.imo_number ?? '', ...details].filter(Boolean),
        icon: Ship,
        chip: code,
        marker: currentCode === code ? 'current' : undefined,
        recordable: true,
        perform: { kind: 'switch-vessel', vessel: { id: vessel.id, code } },
      });
    }
    return { status: 'ready', items };
  }, [access.ready, access.signedIn, fleetReach, profile, vessels, getVesselCodeById, currentCode]);
}

const THEME_ACTIONS: readonly { value: ThemePreference; label: string; icon: LucideIcon; keywords: string[] }[] = [
  { value: 'dark', label: 'Theme: Abyss (dark)', icon: Moon, keywords: ['dark mode', 'night', 'appearance'] },
  { value: 'light', label: 'Theme: Daylight (light)', icon: Sun, keywords: ['light mode', 'day', 'appearance'] },
  { value: 'system', label: 'Theme: match this device', icon: Monitor, keywords: ['system', 'auto', 'appearance'] },
];

const DENSITY_ACTIONS: readonly { value: Density; label: string; icon: LucideIcon; keywords: string[] }[] = [
  { value: 'comfortable', label: 'Density: Comfortable', icon: Rows2, keywords: ['larger rows', 'touch', 'spacing'] },
  { value: 'default', label: 'Density: Default', icon: Rows3, keywords: ['standard', 'spacing'] },
  { value: 'compact', label: 'Density: Compact', icon: Rows4, keywords: ['dense', 'smaller rows', 'spacing'] },
];

export interface PaletteActionDeps {
  /** Navigate after sign-out (the dialog passes React Router's navigate). */
  navigate: (to: string) => void;
}

export function usePaletteActions({ navigate }: PaletteActionDeps): PaletteSource {
  const { theme, choose } = useThemeChoice();
  const [density, setDensity] = useDensity();
  const { openNotifications, openKeyboardShortcuts } = useShellActions();
  const { vesselReach } = useNavAccess();
  const canReportIncident = useCan(REPORT_INCIDENT_CAPABILITY);
  const { user, signOut } = useAuth();
  const setFeedbackOpen = useFeedbackStore((s) => s.setPanelOpen);
  const signedIn = Boolean(user);

  return useMemo<PaletteSource>(() => {
    const items: PaletteItem[] = [];
    if (canReportIncident && vesselReach) {
      items.push({
        id: 'action:report-incident',
        group: 'actions',
        label: 'Report an incident',
        keywords: ['Report an incident', 'new incident', 'accident', 'near miss', 'safety'],
        icon: Siren,
        recordable: true,
        perform: { kind: 'navigate', to: REPORT_INCIDENT_PATH },
      });
    }
    if (openNotifications) {
      items.push({
        id: 'action:open-notifications',
        group: 'actions',
        label: 'Open notifications',
        keywords: ['Open notifications', 'alerts', 'bell', 'inbox'],
        icon: Bell,
        recordable: true,
        perform: { kind: 'open-surface', open: openNotifications },
      });
    }
    for (const option of THEME_ACTIONS) {
      items.push({
        id: `action:theme-${option.value}`,
        group: 'actions',
        label: option.label,
        keywords: [option.label, 'theme', ...option.keywords],
        icon: option.icon,
        marker: theme === option.value ? 'active' : undefined,
        recordable: true,
        perform: { kind: 'run', run: () => choose(option.value) },
      });
    }
    for (const option of DENSITY_ACTIONS) {
      items.push({
        id: `action:density-${option.value}`,
        group: 'actions',
        label: option.label,
        keywords: [option.label, 'density', ...option.keywords],
        icon: option.icon,
        marker: density === option.value ? 'active' : undefined,
        recordable: true,
        perform: { kind: 'run', run: () => setDensity(option.value) },
      });
    }
    if (openKeyboardShortcuts) {
      items.push({
        id: 'action:keyboard-shortcuts',
        group: 'actions',
        label: 'Keyboard shortcuts',
        keywords: ['Keyboard shortcuts', 'keys', 'hotkeys', 'help'],
        icon: Keyboard,
        recordable: true,
        perform: { kind: 'open-surface', open: openKeyboardShortcuts },
      });
    }
    items.push({
      id: 'action:report-problem',
      group: 'actions',
      label: 'Report a problem',
      keywords: ['Report a problem', 'feedback', 'bug', 'issue', 'support'],
      icon: MessageSquareWarning,
      recordable: true,
      perform: { kind: 'open-surface', open: () => setFeedbackOpen(true) },
    });
    if (signedIn) {
      items.push({
        id: 'action:sign-out',
        group: 'actions',
        label: 'Sign out',
        keywords: ['Sign out', 'log out', 'logout'],
        icon: LogOut,
        recordable: false,
        tone: 'destructive',
        perform: {
          kind: 'run',
          run: async () => {
            await signOut();
            navigate('/auth');
          },
        },
      });
    }
    return { status: 'ready', items };
  }, [
    canReportIncident,
    vesselReach,
    openNotifications,
    openKeyboardShortcuts,
    theme,
    choose,
    density,
    setDensity,
    setFeedbackOpen,
    signedIn,
    signOut,
    navigate,
  ]);
}

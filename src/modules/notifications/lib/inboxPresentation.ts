/**
 * How an inbox row reads, in one place for the bell and /inbox (gap/10 DS12:
 * the same severity gets the same tone on every surface).
 *
 * - Severity → `StatusPill` tone (D-57: critical is the critical/destructive
 *   token; D-34: nothing uses `accent` as a cue): info → signal, success →
 *   ok, warning → warn, critical → danger. An unknown value is neutral, with
 *   its own words.
 * - Where a row belongs ("Draak", "Fleet", "HRIS", "Personal") and the
 *   module label for the module filter.
 */
import { AlertOctagon, AlertTriangle, CheckCircle2, Info, type LucideIcon } from 'lucide-react';
import type { Tone } from '@/components/ui/tones';
import { VESSEL_MODULES } from '@/config/sitemap';
import { WORKSPACE_SCOPE_LABELS } from '@/app/shell/apps';
import type { InboxLinkScope, InboxSeverity, InboxWorkspace } from '../types/db.pending';

export interface InboxSeverityMeta {
  tone: Tone;
  label: string;
  icon: LucideIcon;
}

export const INBOX_SEVERITIES: readonly InboxSeverity[] = ['critical', 'warning', 'info', 'success'];

export const INBOX_SEVERITY_META: Readonly<Record<InboxSeverity, InboxSeverityMeta>> = Object.freeze({
  critical: Object.freeze({ tone: 'danger' as const, label: 'Critical', icon: AlertOctagon }),
  warning: Object.freeze({ tone: 'warn' as const, label: 'Warning', icon: AlertTriangle }),
  info: Object.freeze({ tone: 'signal' as const, label: 'Info', icon: Info }),
  success: Object.freeze({ tone: 'ok' as const, label: 'Success', icon: CheckCircle2 }),
});

const humanise = (value: string): string => {
  const words = value.replace(/[_.-]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1).toLowerCase() : 'Unknown';
};

export function inboxSeverityMeta(severity: string | null | undefined): InboxSeverityMeta {
  if (severity && Object.prototype.hasOwnProperty.call(INBOX_SEVERITY_META, severity)) {
    return INBOX_SEVERITY_META[severity as InboxSeverity];
  }
  return { tone: 'neutral', label: humanise(severity ?? ''), icon: Info };
}

export const INBOX_SCOPE_LABELS: Readonly<Record<InboxLinkScope, string>> = Object.freeze({
  vessel: 'Vessel',
  fleet: 'Fleet',
  workspace: 'Workspace',
  personal: 'Personal',
});

export const INBOX_SCOPES = Object.keys(INBOX_SCOPE_LABELS) as InboxLinkScope[];

export interface InboxPlaceSource {
  link_scope: string;
  link_vessel_code: string | null;
  link_workspace: string | null;
  vessel_id: string | null;
}

/**
 * Where a row belongs, for its meta line: the vessel's name (else its code),
 * "Fleet", the workspace's name, or "Personal".
 */
export function inboxPlace(item: InboxPlaceSource, vesselName: (vesselId: string) => string | null | undefined): string {
  switch (item.link_scope) {
    case 'vessel': {
      const name = item.vessel_id ? vesselName(item.vessel_id) : null;
      return name || item.link_vessel_code || 'Vessel';
    }
    case 'fleet':
      return 'Fleet';
    case 'workspace':
      return (item.link_workspace && WORKSPACE_SCOPE_LABELS[item.link_workspace as InboxWorkspace]) || 'Workspace';
    case 'personal':
      return 'Personal';
    default:
      return humanise(item.link_scope);
  }
}

/** Module keys the module filter offers: the vessel modules, then the workspaces, then records-wide areas. */
const MODULE_LABELS: ReadonlyMap<string, string> = new Map<string, string>([
  ...VESSEL_MODULES.filter((m) => m.id !== 'home').map((m) => [m.id, m.label] as [string, string]),
  ...Object.entries(WORKSPACE_SCOPE_LABELS),
  ['admin', 'Administration'],
  ['exports', 'Exports'],
]);

export const INBOX_MODULE_KEYS: readonly string[] = Array.from(MODULE_LABELS.keys());

export function inboxModuleLabel(moduleKey: string | null | undefined): string | null {
  if (!moduleKey) return null;
  return MODULE_LABELS.get(moduleKey) ?? humanise(moduleKey);
}

/**
 * Copy for the Apps menu tiles (gap/10 top bar element 4, IA8, D-09): one
 * line per STORM workspace, keyed by the workspace's root path (the path of
 * its node in the Fleet tree's Workspaces section). The entries themselves
 * come from that section, filtered like the sidebar, so the menu and the
 * sidebar never disagree; a workspace without a line here still shows, with
 * no purpose line.
 */

export interface WorkspaceAppMeta {
  /** One short line under the name. */
  purpose: string;
}

export const WORKSPACE_APP_META: Readonly<Record<string, WorkspaceAppMeta>> = Object.freeze({
  '/hris': { purpose: 'People, contracts, leave and pay' },
  '/health': { purpose: 'Medical care, wellbeing and spa' },
  '/yard': { purpose: 'Refit and new-build projects' },
  '/departments/legal': { purpose: 'Contracts, claims and legal matters' },
  '/shoreside': { purpose: 'Shore services for owners and crew' },
});

/** The line for a workspace path (query ignored), or null. */
export function workspacePurpose(path: string): string | null {
  const root = path.split(/[?#]/)[0];
  return WORKSPACE_APP_META[root]?.purpose ?? null;
}

/** Workspace scope ids (`WorkspaceScope workspace=…`) → the scope control's chip label. */
export const WORKSPACE_SCOPE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  hris: 'HRIS',
  health: 'Health & Wellness',
  yard: 'Yard',
  legal: 'Legal',
  shoreside: 'Shoreside',
});

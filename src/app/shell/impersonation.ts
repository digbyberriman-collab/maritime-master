/**
 * "Viewing as" (gap/10 IA25, top bar element 9; gap/01 W8).
 *
 * Phase 1 ships the UI path only: there is no impersonation runtime yet, so
 * this always returns null and the shell never shows the warning bar. When
 * gap/01 W8 lands, this hook returns the session being viewed and how to end
 * it; ImpersonationBar and the warning-toned top bar need no change.
 */

export interface ImpersonationSession {
  /** Who is being viewed, as the bar shows it: a role or a person's display label. */
  targetLabel: string;
  /** End the session and return to the signed-in user. */
  end: () => void;
}

export function useImpersonation(): ImpersonationSession | null {
  return null;
}

/**
 * Marks "a shell is already mounted above this point" (DECISIONS D-13,
 * gap/00 B2).
 *
 * Scope layout routes render `DashboardLayout` once around an `<Outlet/>`.
 * About 90 legacy pages render `DashboardLayout` themselves as well. When a
 * `DashboardLayout` finds this context it renders its children only, so those
 * pages move under a layout route unchanged and the shell (sidebar, header,
 * providers) is not remounted on every navigation.
 *
 * A nested layout can still ask the outer shell for one thing its props used
 * to control: `collapseSidebar` (the logbook workspace's wide mode).
 */
import { createContext, useContext } from 'react';

export interface ShellContextValue {
  /** Ask the shell to keep its sidebar off-canvas. Returns the release function. */
  requestSidebarCollapse: () => () => void;
}

export const ShellContext = createContext<ShellContextValue | null>(null);

/** The enclosing shell, or null when this subtree has none yet. */
export function useShell(): ShellContextValue | null {
  return useContext(ShellContext);
}

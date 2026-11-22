/**
 * The open state of the shell's own popovers and dialogs, held by AppShell so
 * that a shortcut (`g v`, `?`), the command palette (through ShellActions) and
 * the top-bar triggers all drive the same surface. Internal to the shell: other
 * parts of the app use `useShellActions()` (./shellActions.ts), which exposes
 * only the "open" half and only for surfaces this user can use.
 *
 * Outside a shell the hook returns null and each top-bar control falls back to
 * its own local state, so a control rendered alone (a test, a story) still works.
 */
import { createContext, useContext, useState } from 'react';

export interface ShellSurfaceState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export interface ShellUi {
  notifications: ShellSurfaceState;
  vesselSwitcher: ShellSurfaceState;
  help: ShellSurfaceState;
  keyboardShortcuts: ShellSurfaceState;
  /**
   * A static (not drawer) sidebar is on screen: at least 1024 px wide and the
   * page has not asked for the wide, off-canvas mode. ⌘/Ctrl+B acts only then.
   */
  staticSidebar: boolean;
}

export const ShellUiContext = createContext<ShellUi | null>(null);

export function useShellUi(): ShellUi | null {
  return useContext(ShellUiContext);
}

export type ShellSurface = 'notifications' | 'vesselSwitcher' | 'help' | 'keyboardShortcuts';

/** `[open, setOpen]` for one shell surface: the shell's state, or local state outside a shell. */
export function useShellSurface(surface: ShellSurface): [boolean, (open: boolean) => void] {
  const ui = useShellUi();
  const [local, setLocal] = useState(false);
  return ui ? [ui[surface].open, ui[surface].setOpen] : [local, setLocal];
}

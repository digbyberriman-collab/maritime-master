/**
 * Shell surfaces other parts of the app may open (contract, BUILD-PLAN S1,
 * S5): the command palette's "Open notifications" action, the `g v`
 * shortcut, the account menu's "Keyboard shortcuts". AppShell provides the
 * functions; each one is absent (undefined) when no shell is mounted or the
 * surface is not available to this user, and callers then hide the action
 * rather than offer a dead one (D-04).
 */
import { createContext, useContext } from 'react';

export interface ShellActions {
  /** Open the notification bell's panel. */
  openNotifications?: () => void;
  /** Open the vessel switcher (users with at least two vessels in reach). */
  openVesselSwitcher?: () => void;
  /** Open the Help popover. */
  openHelp?: () => void;
  /** Open the keyboard shortcuts dialog. */
  openKeyboardShortcuts?: () => void;
}

export const NO_SHELL_ACTIONS: ShellActions = {};

export const ShellActionsContext = createContext<ShellActions>(NO_SHELL_ACTIONS);

export function useShellActions(): ShellActions {
  return useContext(ShellActionsContext);
}

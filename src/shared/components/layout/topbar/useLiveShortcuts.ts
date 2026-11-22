/**
 * The keyboard shortcuts that act for this user right now (spec §6.6): the
 * dialog lists exactly these, so it never promises a dead key (D-04).
 * `g f` needs fleet reach (D-26), `g v` an available vessel switcher, ⌘/Ctrl+B
 * a static sidebar, ⌘K a mounted command palette; `?` always works.
 */
import { useMemo } from 'react';
import { KEYBOARD_SHORTCUTS, type KeyboardShortcut } from '@/app/shell/keyboard';
import { useShellUi } from '@/app/shell/shellUi';
import { useShellActions } from '@/app/shell/shellActions';
import { useNavAccess } from '@/app/nav/navAccess';
import { useCommandPalette } from '@/shared/components/command-palette';

export function useLiveShortcuts(): readonly KeyboardShortcut[] {
  const { fleetReach } = useNavAccess();
  const { openVesselSwitcher } = useShellActions();
  const palette = useCommandPalette();
  const ui = useShellUi();
  const staticSidebar = ui?.staticSidebar ?? false;
  return useMemo(
    () =>
      KEYBOARD_SHORTCUTS.filter((shortcut) => {
        switch (shortcut.id) {
          case 'palette':
            return palette.available;
          case 'vessel-switcher':
            return Boolean(openVesselSwitcher);
          case 'fleet':
            return fleetReach;
          case 'sidebar':
            return staticSidebar;
          default:
            return true;
        }
      }),
    [fleetReach, openVesselSwitcher, palette.available, staticSidebar],
  );
}

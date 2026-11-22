/**
 * The shell's single-key shortcuts (gap/10 improvement 12; spec §2.1):
 * `g v` opens the vessel switcher, `g f` goes to the Fleet view, `?` opens the
 * keyboard shortcuts dialog. A handler that is absent does nothing, so a key
 * never acts for a user who cannot use the surface (`g f` without fleet
 * reach, `g v` with one vessel). Keys are ignored while the user types in a
 * field, inside an open dialog, menu or list (their own keys win), with a
 * modifier held, and when another handler already took the event.
 * ⌘K / Ctrl+K belongs to the palette provider and ⌘/Ctrl+B to AppShell.
 */
import { useEffect, useRef } from 'react';
import { KEY_SEQUENCE_TIMEOUT_MS, isEditableTarget } from '@/app/shell/keyboard';

export interface ShellShortcutHandlers {
  openVesselSwitcher?: () => void;
  openKeyboardShortcuts?: () => void;
  goFleet?: () => void;
}

const OVERLAY_SELECTOR = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

function insideOverlay(target: EventTarget | null): boolean {
  return typeof Element !== 'undefined' && target instanceof Element && target.closest(OVERLAY_SELECTOR) !== null;
}

export function useShellShortcuts(handlers: ShellShortcutHandlers): void {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  }, [handlers]);

  useEffect(() => {
    let sequenceStartedAt = 0;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target) || insideOverlay(event.target)) {
        sequenceStartedAt = 0;
        return;
      }
      const h = latest.current;
      if (event.key === '?') {
        sequenceStartedAt = 0;
        if (h.openKeyboardShortcuts) {
          event.preventDefault();
          h.openKeyboardShortcuts();
        }
        return;
      }
      const key = event.shiftKey ? '' : event.key.toLowerCase();
      const now = Date.now();
      if (sequenceStartedAt && now - sequenceStartedAt <= KEY_SEQUENCE_TIMEOUT_MS && key !== 'g') {
        sequenceStartedAt = 0;
        const action = key === 'v' ? h.openVesselSwitcher : key === 'f' ? h.goFleet : undefined;
        if (action) {
          event.preventDefault();
          action();
        }
        return;
      }
      sequenceStartedAt = key === 'g' ? now : 0;
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

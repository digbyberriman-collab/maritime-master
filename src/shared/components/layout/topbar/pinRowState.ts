/**
 * How one favourite is drawn (gap/10 top bar element 6, IA13; D-04, D-93,
 * D-107), shared by the top-bar menu (FavouritesControl's `PinItem`) and
 * Manage favourites (/me/shortcuts, ShortcutsSection), so both list a pin
 * the same way:
 *
 * - `link`: an in-app path the viewer can open now.
 * - `waiting`: access is still loading; no link yet.
 * - `error`: the check failed (the pinned vessel's module settings did not
 *   load). Whether the page opens is not known, so there is no link and no
 *   Remove, only "Could not check access" and a retry.
 * - `remove`: the viewer can no longer open it ("No longer available"), or
 *   it is not a path in this app ("Not a page in STORM", never a link).
 *
 * Mount it only while the pin's row is shown: it reads access and, for a
 * vessel pin, that vessel's module settings.
 */
import { isInAppPath, type PinnedShortcut } from '@/shared/hooks/usePinnedShortcuts';
import { usePinAvailability } from './pinAvailability';

export type PinRemoveReason = 'No longer available' | 'Not a page in STORM';

export type PinRowState =
  | { kind: 'link' }
  | { kind: 'waiting' }
  | { kind: 'error'; retry: () => void }
  | { kind: 'remove'; reason: PinRemoveReason };

const LINK: PinRowState = { kind: 'link' };
const WAITING: PinRowState = { kind: 'waiting' };
const GONE: PinRowState = { kind: 'remove', reason: 'No longer available' };
const NOT_IN_APP: PinRowState = { kind: 'remove', reason: 'Not a page in STORM' };

export function usePinRowState(pin: Pick<PinnedShortcut, 'shortcut_target'>): PinRowState {
  const inApp = isInAppPath(pin.shortcut_target);
  // Hooks run unconditionally; a target that is not an in-app path is never resolved as a page.
  const { availability, retry } = usePinAvailability(inApp ? pin.shortcut_target : '/');
  if (!inApp) return NOT_IN_APP;
  switch (availability) {
    case 'available':
      return LINK;
    case 'waiting':
      return WAITING;
    case 'error':
      return { kind: 'error', retry };
    case 'unavailable':
      return GONE;
  }
}

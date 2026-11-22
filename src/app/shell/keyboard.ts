/**
 * Global keyboard shortcuts of the shell (gap/10 improvement 12; contract,
 * BUILD-PLAN S1, S5). One list, read by the keyboard shortcuts dialog and by
 * the handlers, so what the dialog promises is what the keys do.
 *
 * Every handler ignores key presses while the user is typing
 * (`isEditableTarget`), except ⌘K / Ctrl+K, which opens the palette from a
 * field too (it is the "search" key everywhere).
 */

export interface KeyboardShortcut {
  id: 'palette' | 'vessel-switcher' | 'fleet' | 'shortcuts' | 'sidebar';
  /** Keys as shown, per platform family. */
  keys: { mac: string[]; other: string[] };
  label: string;
}

export const KEYBOARD_SHORTCUTS: readonly KeyboardShortcut[] = [
  { id: 'palette', keys: { mac: ['⌘', 'K'], other: ['Ctrl', 'K'] }, label: 'Search STORM (command palette)' },
  { id: 'vessel-switcher', keys: { mac: ['G', 'V'], other: ['G', 'V'] }, label: 'Switch vessel' },
  { id: 'fleet', keys: { mac: ['G', 'F'], other: ['G', 'F'] }, label: 'Go to the Fleet view' },
  { id: 'shortcuts', keys: { mac: ['?'], other: ['?'] }, label: 'Show keyboard shortcuts' },
  { id: 'sidebar', keys: { mac: ['⌘', 'B'], other: ['Ctrl', 'B'] }, label: 'Collapse or expand the sidebar' },
];

/** How long the second key of a `g` sequence may follow the first. */
export const KEY_SEQUENCE_TIMEOUT_MS = 1000;

/** True while focus is in a text field, select or content editor. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== 'string') return false;
  const el = target as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  return el.isContentEditable === true;
}

/** True on Apple platforms, where the modifier is ⌘ rather than Ctrl. */
export function isApplePlatform(nav: Pick<Navigator, 'platform' | 'userAgent'> | undefined = globalThis.navigator): boolean {
  if (!nav) return false;
  return /Mac|iPhone|iPad|iPod/i.test(nav.platform || nav.userAgent || '');
}

/** ⌘K on Apple platforms, Ctrl+K elsewhere (either modifier is accepted). */
export function isPaletteShortcut(event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>): boolean {
  return (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k';
}

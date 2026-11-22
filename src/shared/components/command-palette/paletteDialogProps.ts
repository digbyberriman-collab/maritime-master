/**
 * Props of the lazily loaded palette dialog (./PaletteDialog.tsx). Kept in
 * their own module so the eager parts (CommandPalette, preload) can type the
 * lazy import without pulling the dialog into the main bundle.
 */
import type { MutableRefObject } from 'react';

export interface PaletteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Typed into the search field when the palette opens (`open(initialQuery)`). */
  initialQuery: string;
  /**
   * The element that had focus when the palette opened. Focus goes back to it
   * on close (when it is still on the page), except after an action that
   * opens another surface, which takes focus itself.
   */
  openerRef: MutableRefObject<HTMLElement | null>;
}

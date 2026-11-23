/**
 * `true` while the viewport is at least `px` wide (`(min-width: …px)`), kept
 * live. Pages use it where a register must swap a table for cards on phones
 * (gap/10 A.10; Phase 1 S7: documents and crew list at 390 px) rather than
 * render both and hide one with CSS. False where `matchMedia` is missing, so
 * the narrow (card) layout is the safe default. A thin wrapper over the
 * shell's `useMediaQuery`, so there is one matchMedia hook.
 */
import { useMediaQuery } from '@/app/shell/useMediaQuery';

/** gap/10 §6.8 breakpoints: tablet and up. */
export const TABLET_MIN_WIDTH = 768;

export function useMinWidth(px: number): boolean {
  return useMediaQuery(`(min-width: ${px}px)`);
}

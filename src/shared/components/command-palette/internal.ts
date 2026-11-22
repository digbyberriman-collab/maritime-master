/**
 * State the provider shares with its own dialog only (not public API).
 */
import { createContext, useContext, type MutableRefObject } from 'react';

export interface PaletteInternals {
  /** The element focused when the palette last opened. */
  openerRef: MutableRefObject<HTMLElement | null>;
}

const NO_OPENER: MutableRefObject<HTMLElement | null> = { current: null };

export const PaletteInternalsContext = createContext<PaletteInternals>({ openerRef: NO_OPENER });

export function usePaletteInternals(): PaletteInternals {
  return useContext(PaletteInternalsContext);
}

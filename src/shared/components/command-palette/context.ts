/**
 * The palette's React context and `useCommandPalette()` (contract, BUILD-PLAN
 * S5). Without a provider the hook returns a closed, inert palette
 * (`available: false`), so a trigger rendered in a test or outside the shell
 * does nothing harmful.
 */
import { createContext, useContext } from 'react';
import type { CommandPaletteApi } from './types';

const noop = () => undefined;

export const INERT_COMMAND_PALETTE: CommandPaletteApi = {
  isOpen: false,
  open: noop,
  close: noop,
  toggle: noop,
  available: false,
};

export const CommandPaletteContext = createContext<CommandPaletteApi>(INERT_COMMAND_PALETTE);

/** Open, close or toggle the command palette from anywhere inside the shell. */
export function useCommandPalette(): CommandPaletteApi {
  return useContext(CommandPaletteContext);
}

/**
 * The query to show when the palette opens (set by `open(initialQuery)`),
 * read by the palette dialog itself.
 */
export const CommandPaletteQueryContext = createContext<string>('');

export function useCommandPaletteInitialQuery(): string {
  return useContext(CommandPaletteQueryContext);
}

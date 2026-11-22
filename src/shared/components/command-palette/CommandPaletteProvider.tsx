/**
 * Holds the palette's open state, listens for ⌘K / Ctrl+K and renders the
 * dialog once per shell (contract, BUILD-PLAN S5; gap/10 IA12). AppShell
 * mounts it around the shell; the TopBar search trigger calls
 * `useCommandPalette().open()`.
 *
 * - ⌘K / Ctrl+K toggles the palette from anywhere, text fields included (it
 *   is the search key). It claims the key (`preventDefault`) only when it
 *   acts: a key another handler already took is left alone.
 * - The first shortcut warms the lazy dialog chunk (`preloadCommandPalette`).
 * - Focus goes back to whatever had it when the palette opened.
 * - A provider inside another provider passes its children through, so a
 *   nested shell never mounts a second listener or dialog.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isPaletteShortcut } from '@/app/shell/keyboard';
import type { CommandPaletteApi } from './types';
import { CommandPaletteContext, CommandPaletteQueryContext, useCommandPalette } from './context';
import { PaletteInternalsContext, type PaletteInternals } from './internal';
import { preloadCommandPalette } from './preload';
import CommandPalette from './CommandPalette';

function focusedElement(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const active = document.activeElement;
  return active instanceof HTMLElement && active !== document.body ? active : null;
}

const PaletteRoot: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [initialQuery, setInitialQuery] = useState('');
  // Mirrors `isOpen` synchronously: every change goes through the callbacks below.
  const openRef = useRef(false);
  const openerRef = useRef<HTMLElement | null>(null);

  const open = useCallback((query?: string) => {
    if (!openRef.current) openerRef.current = focusedElement();
    openRef.current = true;
    preloadCommandPalette();
    setInitialQuery(query ?? '');
    setIsOpen(true);
  }, []);
  const close = useCallback(() => {
    openRef.current = false;
    setIsOpen(false);
  }, []);
  const toggle = useCallback(() => {
    if (openRef.current) close();
    else open();
  }, [open, close]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || !isPaletteShortcut(event)) return;
      // The palette owns the key from here (the browser would otherwise focus
      // its own search box); a held key does not flicker it open and shut.
      event.preventDefault();
      if (event.repeat) return;
      toggle();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle]);

  const api = useMemo<CommandPaletteApi>(
    () => ({ isOpen, open, close, toggle, available: true }),
    [isOpen, open, close, toggle],
  );
  const internals = useMemo<PaletteInternals>(() => ({ openerRef }), []);

  return (
    <CommandPaletteContext.Provider value={api}>
      <CommandPaletteQueryContext.Provider value={initialQuery}>
        <PaletteInternalsContext.Provider value={internals}>
          {children}
          <CommandPalette />
        </PaletteInternalsContext.Provider>
      </CommandPaletteQueryContext.Provider>
    </CommandPaletteContext.Provider>
  );
};

const CommandPaletteProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const outer = useCommandPalette();
  if (outer.available) return <>{children}</>;
  return <PaletteRoot>{children}</PaletteRoot>;
};

export default CommandPaletteProvider;

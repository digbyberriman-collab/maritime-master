/**
 * Command palette contract (BUILD-PLAN S5): the API the shell's search
 * trigger calls and the reserved record-reference slot. Owned by the palette.
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import {
  CommandPaletteProvider,
  INERT_COMMAND_PALETTE,
  looksLikeRecordReference,
  preloadCommandPalette,
  searchRecordReferences,
  useCommandPalette,
  useCommandPaletteInitialQuery,
} from '@/shared/components/command-palette';

describe('command palette API', () => {
  it('is inert without a provider', () => {
    const { result } = renderHook(() => useCommandPalette());
    expect(result.current).toBe(INERT_COMMAND_PALETTE);
    expect(result.current.available).toBe(false);
    expect(() => result.current.open('crew')).not.toThrow();
    expect(result.current.isOpen).toBe(false);
  });

  it('opens with an initial query, closes and toggles inside the provider', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => <CommandPaletteProvider>{children}</CommandPaletteProvider>;
    const { result } = renderHook(() => ({ api: useCommandPalette(), query: useCommandPaletteInitialQuery() }), { wrapper });
    expect(result.current.api.available).toBe(true);
    act(() => result.current.api.open('permits'));
    expect(result.current.api.isOpen).toBe(true);
    expect(result.current.query).toBe('permits');
    act(() => result.current.api.close());
    expect(result.current.api.isOpen).toBe(false);
    act(() => result.current.api.toggle());
    expect(result.current.api.isOpen).toBe(true);
  });

  it('renders its children and no dialog until the palette is first opened', () => {
    render(
      <CommandPaletteProvider>
        <p>page</p>
      </CommandPaletteProvider>,
    );
    expect(screen.getByText('page')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('can be preloaded any number of times, with or without a provider', () => {
    expect(() => {
      preloadCommandPalette();
      preloadCommandPalette();
    }).not.toThrow();
  });

  it('reserves the record-reference slot and finds nothing in Phase 1', async () => {
    expect(looksLikeRecordReference('PTW-DRA-2026-061')).toBe(true);
    expect(looksLikeRecordReference('inc-2026-011')).toBe(true);
    expect(looksLikeRecordReference('DRA-20261103-037')).toBe(true);
    expect(looksLikeRecordReference('crew list')).toBe(false);
    await expect(searchRecordReferences('PTW-DRA-2026-061', new AbortController().signal)).resolves.toEqual([]);
  });
});

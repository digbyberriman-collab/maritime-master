/**
 * The Command primitive leaves Ctrl+K to the command palette (D-61: Cmd+K /
 * Ctrl+K opens the palette from anywhere, text fields included). cmdk's vim
 * bindings are on by default and map Ctrl+K to "previous item", calling
 * preventDefault, so a menu built on Command (the vessel switcher, the people
 * pickers) swallowed the key and the palette never opened. Command now
 * defaults `vimBindings` to false; a caller can still opt in.
 */
import React from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { CommandPaletteProvider, useCommandPalette } from '@/shared/components/command-palette';

// The palette's lazy dialog chunk: a stub, so only the provider's key handling is under test.
vi.mock('@/shared/components/command-palette/PaletteDialog', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="Search STORM" /> : null),
}));

beforeAll(() => {
  // cmdk measures its list; jsdom has neither of these.
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => undefined;
});

const ITEMS = ['DRAAK', 'DAGON', 'HYDRA'];

const Menu: React.FC<{ vimBindings?: boolean }> = ({ vimBindings }) => (
  <Command label="Vessels" {...(vimBindings === undefined ? {} : { vimBindings })}>
    <CommandInput aria-label="Search vessels" />
    <CommandList>
      <CommandGroup heading="Vessels">
        {ITEMS.map((label) => (
          <CommandItem key={label} value={label}>
            {label}
          </CommandItem>
        ))}
      </CommandGroup>
    </CommandList>
  </Command>
);

const input = () => screen.getByRole('combobox', { name: 'Vessels' });
const selectedText = () => document.querySelector<HTMLElement>('[cmdk-item][aria-selected="true"]')?.textContent ?? null;

/** Focus the input and move the selection to the second vessel, so "previous item" would show. */
async function focusSecondItem() {
  input().focus();
  await waitFor(() => expect(selectedText()).toBe('DRAAK'));
  fireEvent.keyDown(input(), { key: 'ArrowDown' });
  await waitFor(() => expect(selectedText()).toBe('DAGON'));
}

function pressCtrlK(target: Element) {
  const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

const PaletteState: React.FC = () => {
  const palette = useCommandPalette();
  return <output data-testid="palette-state">{palette.isOpen ? 'open' : 'closed'}</output>;
};

describe('Command and Ctrl+K', () => {
  it('by default, Ctrl+K in a focused CommandInput keeps the selection and is not claimed', async () => {
    render(<Menu />);
    await focusSecondItem();
    const event = pressCtrlK(input());
    expect(event.defaultPrevented).toBe(false);
    // Give cmdk a chance to move the selection, then check it did not.
    await act(async () => {});
    expect(selectedText()).toBe('DAGON');
  });

  it('a caller can still opt in to the vim bindings (Ctrl+K moves to the previous item)', async () => {
    render(<Menu vimBindings />);
    await focusSecondItem();
    const event = pressCtrlK(input());
    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(selectedText()).toBe('DRAAK'));
  });

  it('inside the palette provider, Ctrl+K from a Command menu opens the palette', async () => {
    render(
      <CommandPaletteProvider>
        <Menu />
        <PaletteState />
      </CommandPaletteProvider>,
    );
    await focusSecondItem();
    expect(screen.getByTestId('palette-state')).toHaveTextContent('closed');
    const event = pressCtrlK(input());
    // The provider claimed it (it acts on the key), and cmdk did not move the selection.
    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(screen.getByTestId('palette-state')).toHaveTextContent('open'));
    expect(await screen.findByRole('dialog', { name: 'Search STORM' })).toBeInTheDocument();
    expect(selectedText()).toBe('DAGON');
  });
});

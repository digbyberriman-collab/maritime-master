/**
 * The command input names the option Enter will run (WAI-ARIA combobox;
 * gap/10 IA4 vessel switcher, IA12 palette). cmdk writes
 * `aria-activedescendant` itself, after the caller's props, and it is
 * missing until the first arrow key and stale after a query changes the first
 * match; CommandInput keeps it on the `[aria-selected="true"]` option.
 */
import React from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

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

const ITEMS = ['Crew List', 'Crew Roster', 'Crew Compliance', 'Drills', 'Dashboard'];

const Menu: React.FC<{ extra?: boolean }> = ({ extra = false }) => (
  <Command label="Test menu">
    <CommandInput aria-label="Search" />
    <CommandList>
      <CommandGroup heading="Pages">
        {ITEMS.map((label) => (
          <CommandItem key={label} value={label}>
            {label}
          </CommandItem>
        ))}
      </CommandGroup>
      {extra && (
        <CommandGroup heading="Later">
          <CommandItem value="Late arrival">Late arrival</CommandItem>
        </CommandGroup>
      )}
    </CommandList>
  </Command>
);

// cmdk labels the input with the Command's `label` (aria-labelledby).
const input = () => screen.getByRole('combobox', { name: 'Test menu' });
const selected = () => document.querySelector<HTMLElement>('[cmdk-item][aria-selected="true"]');

/** The input points at the selected option (and the option is a real, labelled element). */
async function expectInSync(label: string) {
  await waitFor(() => {
    const option = selected();
    expect(option).not.toBeNull();
    expect(option).toHaveTextContent(label);
    expect(option?.id).toBeTruthy();
    expect(input()).toHaveAttribute('aria-activedescendant', option?.id);
  });
}

const type = (value: string) => fireEvent.change(input(), { target: { value } });

describe('CommandInput aria-activedescendant', () => {
  it('names the first option once mounted, before any arrow key', async () => {
    render(<Menu />);
    await expectInSync('Crew List');
  });

  it('follows a query that changes the first match', async () => {
    render(<Menu />);
    await expectInSync('Crew List');
    type('dri');
    await expectInSync('Drills');
    type('dash');
    await expectInSync('Dashboard');
  });

  it('is not left stale after ArrowDown then Backspace', async () => {
    render(<Menu />);
    type('crew');
    await expectInSync('Crew List');
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    await expectInSync('Crew Roster');
    // Backspace: cmdk selects the first match again, but would keep the old id.
    type('cre');
    await expectInSync('Crew List');
  });

  it('after clearing the query names the top option again', async () => {
    render(<Menu />);
    type('dri');
    await expectInSync('Drills');
    type('');
    await expectInSync('Crew List');
  });

  it('is removed when nothing matches', async () => {
    render(<Menu />);
    await expectInSync('Crew List');
    type('zzzz');
    await waitFor(() => expect(selected()).toBeNull());
    await waitFor(() => expect(input()).not.toHaveAttribute('aria-activedescendant'));
  });

  it('covers options in a list part that mounts later', async () => {
    const { rerender } = render(<Menu />);
    await expectInSync('Crew List');
    rerender(<Menu extra />);
    type('late');
    await expectInSync('Late arrival');
  });
});

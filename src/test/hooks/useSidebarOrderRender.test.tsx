/**
 * useSidebarOrder writes outside React state updaters (D-112): a move tells
 * every consumer from the click handler, never while React renders, so the
 * shell's consumers (the scope control, the sidebar) are never set during
 * another component's render, and two moves in one handler compose.
 *
 * Its own file: React logs "Cannot update a component while rendering a
 * different component" once per page load, so a test that triggered it
 * earlier in the same file would hide it here.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useSidebarOrder } from '@/shared/hooks/useSidebarOrder';

const GROUP = 'fleet';
const IDS = ['a', 'b', 'c', 'd'];

/** The Sidebar layout page: moves rows. */
const Editor: React.FC = () => {
  const { map, moveInGroup } = useSidebarOrder();
  return (
    <div>
      <output data-testid="editor-order">{(map[GROUP] ?? []).join(',')}</output>
      <button type="button" onClick={() => moveInGroup(GROUP, 'a', 'down', IDS)}>
        Move a down
      </button>
      <button type="button" onClick={() => moveInGroup(GROUP, 'a', 'up', IDS)}>
        Move a up
      </button>
      <button
        type="button"
        onClick={() => {
          moveInGroup(GROUP, 'a', 'down', IDS);
          moveInGroup(GROUP, 'a', 'down', IDS);
        }}
      >
        Move a down twice
      </button>
    </div>
  );
};

/** The shell: reads the order (as the scope control and the sidebar do). */
const Shell: React.FC = () => {
  const { map } = useSidebarOrder();
  return <output data-testid="shell-order">{(map[GROUP] ?? []).join(',')}</output>;
};

let errors: string[] = [];

beforeEach(() => {
  localStorage.clear();
  errors = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('useSidebarOrder with two mounted consumers', () => {
  it('moves without setting another component during render, and every consumer follows', () => {
    render(
      <React.StrictMode>
        <Shell />
        <Editor />
      </React.StrictMode>,
    );
    const click = (name: string) =>
      act(() => {
        fireEvent.click(screen.getByRole('button', { name }));
      });

    // Four alternating moves…
    click('Move a down');
    expect(screen.getByTestId('shell-order').textContent).toBe('b,a,c,d');
    click('Move a up');
    expect(screen.getByTestId('shell-order').textContent).toBe('a,b,c,d');
    click('Move a down');
    click('Move a up');
    expect(screen.getByTestId('editor-order').textContent).toBe('a,b,c,d');
    // …then two moves in one click, which compose on the stored order.
    click('Move a down twice');

    expect(errors.filter((e) => e.includes('Cannot update a component'))).toEqual([]);
    expect(screen.getByTestId('editor-order').textContent).toBe('b,c,a,d');
    expect(screen.getByTestId('shell-order').textContent).toBe('b,c,a,d');
    expect(JSON.parse(localStorage.getItem('storm:sidebar-order:v2') ?? '{}')).toEqual({ [GROUP]: ['b', 'c', 'a', 'd'] });
  });
});

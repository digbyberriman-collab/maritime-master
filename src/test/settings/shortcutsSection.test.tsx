/**
 * Manage favourites (/me/shortcuts; gap/10 IA13; D-68, D-79, D-107): the
 * user's real pins, each opened or removed, drawn with the favourites menu's
 * row rules (`usePinRowState`). No legacy default targets, no "Available
 * Shortcuts" grid, no reorder promise. Fail closed (D-04): a loader while the
 * pins load, an alert with Retry after a load error (never the empty copy),
 * and a named, always visible Remove that waits for the delete (D-35).
 *
 * The pins and each pin's availability are stubbed here; the live wiring
 * (the table failing, Retry, a real delete) is in shortcutsSection.live.test.tsx.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { PinnedShortcut, PinnedShortcutsStatus } from '@/shared/hooks/usePinnedShortcuts';
import type { PinAvailabilityResult } from '@/shared/components/layout/topbar/pinAvailability';

interface PinsStub {
  pins: PinnedShortcut[];
  status: PinnedShortcutsStatus;
  retry: () => Promise<void>;
  removePin: (target: string) => Promise<void>;
}

const stub = vi.hoisted(() => ({
  pins: { current: null as PinsStub | null },
  availability: { byTarget: {} as Record<string, PinAvailabilityResult> },
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('@/shared/hooks/usePinnedShortcuts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/hooks/usePinnedShortcuts')>();
  return { ...actual, usePinnedShortcuts: () => stub.pins.current };
});
vi.mock('@/shared/components/layout/topbar/pinAvailability', () => ({
  usePinAvailability: (target: string): PinAvailabilityResult =>
    stub.availability.byTarget[target] ?? { availability: 'available', retry: () => undefined },
}));

import ShortcutsSection from '@/modules/settings/components/sections/ShortcutsSection';

const pin = (target: string, label: string, sort = 0): PinnedShortcut => ({
  id: `pin-${label}`,
  shortcut_target: target,
  shortcut_label: label,
  shortcut_icon: 'ship',
  sort_order: sort,
});

function setPins(patch: Partial<PinsStub> = {}): PinsStub {
  const value: PinsStub = {
    pins: [],
    status: 'ready',
    retry: vi.fn(async () => undefined),
    removePin: vi.fn(async () => undefined),
    ...patch,
  };
  stub.pins.current = value;
  return value;
}

const renderSection = () =>
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ShortcutsSection />
    </MemoryRouter>,
  );

/** The retired page's copy and controls never come back. */
function expectNoLegacyPage() {
  for (const text of [/Quick Action/i, /Drag/i, /Available Shortcuts/i, /Pinned Shortcuts/i, /suggested/i]) {
    expect(screen.queryByText(text)).toBeNull();
  }
  expect(screen.queryByRole('button', { name: /^Add|Fleet Map|Add Vessel/ })).toBeNull();
}

beforeEach(() => {
  stub.availability.byTarget = {};
  setPins();
});

describe('Manage favourites', () => {
  it('has one visible h2, "Favourites", with its one line', () => {
    renderSection();
    const headings = screen.getAllByRole('heading');
    expect(headings).toHaveLength(1);
    expect(headings[0].tagName).toBe('H2');
    expect(headings[0]).toHaveTextContent('Favourites');
    expect(headings[0]).toHaveClass('type-display');
    expect(screen.getByText('Pages you starred with the star in the top bar. Open one, or remove it.')).toBeInTheDocument();
    expectNoLegacyPage();
  });

  it('while the pins load: a status loader, no list, no empty copy', () => {
    setPins({ status: 'loading' });
    renderSection();
    expect(screen.getByRole('status')).toHaveTextContent('Loading favourites…');
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByText('Star a page to keep it here.')).toBeNull();
  });

  it('after a load error: an alert with Retry; no empty copy, no rows (D-04)', () => {
    const state = setPins({ status: 'error' });
    renderSection();
    expect(screen.getByRole('alert')).toHaveTextContent('Favourites could not load.');
    expect(screen.queryByText('Star a page to keep it here.')).toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByRole('listitem')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(state.retry).toHaveBeenCalledTimes(1);
    expectNoLegacyPage();
  });

  it('with no pins: "Star a page to keep it here."', () => {
    renderSection();
    expect(screen.getByText('Star a page to keep it here.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('draws each pin by its row state: link, waiting, could not check, gone, not in STORM', () => {
    const retryDraak = vi.fn();
    stub.availability.byTarget = {
      '/v/dra/technical': { availability: 'waiting', retry: () => undefined },
      '/v/hyd/crew/list': { availability: 'error', retry: retryDraak },
      '/fleet/admin/users': { availability: 'unavailable', retry: () => undefined },
    };
    setPins({
      pins: [
        pin('/v/dra/crew/list', 'Crew List', 0),
        pin('/v/dra/technical', 'Technical', 1),
        pin('/v/hyd/crew/list', 'HYDRA crew', 2),
        pin('/fleet/admin/users', 'Users', 3),
        pin('javascript:alert(1)', 'Script', 4),
      ],
    });
    renderSection();
    const list = screen.getByRole('list', { name: 'Favourites' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(5);
    const [link, waiting, error, gone, notInApp] = rows;

    // A link to the page, with its path beside it.
    expect(within(link).getByRole('link', { name: 'Crew List' })).toHaveAttribute('href', '/v/dra/crew/list');
    expect(link).toHaveTextContent('/v/dra/crew/list');
    expect(within(link).getByRole('button', { name: 'Remove Crew List from favourites' })).toBeInTheDocument();

    // Waiting: muted, no link, no Remove yet.
    expect(waiting).toHaveAttribute('data-pin-state', 'waiting');
    expect(within(waiting).queryByRole('link')).toBeNull();
    expect(within(waiting).queryByRole('button')).toBeNull();

    // The check failed: no link and no Remove, only Check again.
    expect(error).toHaveAttribute('data-pin-state', 'error');
    expect(error).toHaveTextContent('Could not check access');
    expect(within(error).queryByRole('link')).toBeNull();
    expect(within(error).queryByRole('button', { name: /^Remove/ })).toBeNull();
    fireEvent.click(within(error).getByRole('button', { name: 'Check again for HYDRA crew' }));
    expect(retryDraak).toHaveBeenCalledTimes(1);

    // Gone, and not a page in this app: the reason, with Remove; never a link.
    expect(gone).toHaveTextContent('No longer available');
    expect(within(gone).queryByRole('link')).toBeNull();
    expect(within(gone).getByRole('button', { name: 'Remove Users from favourites' })).toBeInTheDocument();
    expect(notInApp).toHaveTextContent('Not a page in STORM');
    expect(within(notInApp).queryByRole('link')).toBeNull();
    expect(within(notInApp).getByRole('button', { name: 'Remove Script from favourites' })).toBeInTheDocument();

    // No anchor points anywhere but the one in-app page.
    expect(Array.from(list.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toEqual(['/v/dra/crew/list']);
    expectNoLegacyPage();
  });

  it('Remove is named, always visible, and deletes once; it waits for the delete (no optimistic removal)', async () => {
    let finish: () => void = () => undefined;
    const removePin = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    setPins({ pins: [pin('/v/dra/crew/list', 'Crew List')], removePin });
    renderSection();
    const remove = screen.getByRole('button', { name: 'Remove Crew List from favourites' });
    expect(remove.className).not.toMatch(/opacity-0/);
    expect(remove.className).not.toMatch(/\bh-7\b|\bw-7\b/);
    // The control height: 44 px on a coarse pointer (D-35).
    expect(remove).toHaveClass('h-[var(--control-h)]', 'w-[var(--control-h)]', 'text-destructive');
    expect(remove.className).toMatch(/focus-visible:ring-2/);

    fireEvent.click(remove);
    expect(removePin).toHaveBeenCalledTimes(1);
    expect(removePin).toHaveBeenCalledWith('/v/dra/crew/list');
    // In flight: disabled, a second click does nothing, and the row stays until the list is re-read.
    expect(remove).toBeDisabled();
    fireEvent.click(remove);
    expect(removePin).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Crew List' })).toBeInTheDocument();
    await act(async () => finish());
    expect(remove).not.toBeDisabled();
  });
});

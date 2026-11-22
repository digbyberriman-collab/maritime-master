/**
 * Keyboard shortcuts (gap/10 improvement 12; spec §6.6): `g v`, `g f`, `?`
 * and ⌘/Ctrl+B act only when their surface is there, never while typing or
 * inside an open dialog or menu, and the shortcuts dialog lists exactly the
 * keys that act for this user (D-04: no dead key promised).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', async () => (await import('./fakeSupabase')).fakeSupabaseModule);

import { useShellShortcuts, type ShellShortcutHandlers } from '@/shared/components/layout/topbar/useShellShortcuts';
import KeyboardShortcutsDialog from '@/shared/components/layout/topbar/KeyboardShortcutsDialog';
import { ShellUiContext, type ShellUi } from '@/app/shell/shellUi';
import { ShellActionsContext, type ShellActions } from '@/app/shell/shellActions';
import { NavAccessContext } from '@/app/nav/navAccess';
import { KEY_SEQUENCE_TIMEOUT_MS } from '@/app/shell/keyboard';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import { CommandPaletteProvider } from '@/shared/components/command-palette';
import { FLEET_ACCESS, VESSEL_ONLY_ACCESS } from './shellFakes';

const Harness: React.FC<{ handlers: ShellShortcutHandlers; children?: React.ReactNode }> = ({ handlers, children }) => {
  useShellShortcuts(handlers);
  return <>{children}</>;
};

const key = (target: EventTarget, init: KeyboardEventInit) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  act(() => void target.dispatchEvent(event));
  return event;
};

describe('useShellShortcuts', () => {
  let handlers: Required<ShellShortcutHandlers>;
  beforeEach(() => {
    handlers = { openVesselSwitcher: vi.fn(), openKeyboardShortcuts: vi.fn(), goFleet: vi.fn() };
  });
  afterEach(() => vi.useRealTimers());

  it('g v opens the vessel switcher, g f goes to the Fleet view, ? opens the dialog', () => {
    render(<Harness handlers={handlers} />);
    key(document.body, { key: 'g' });
    expect(key(document.body, { key: 'v' }).defaultPrevented).toBe(true);
    expect(handlers.openVesselSwitcher).toHaveBeenCalledTimes(1);
    key(document.body, { key: 'g' });
    key(document.body, { key: 'f' });
    expect(handlers.goFleet).toHaveBeenCalledTimes(1);
    key(document.body, { key: '?', shiftKey: true });
    expect(handlers.openKeyboardShortcuts).toHaveBeenCalledTimes(1);
  });

  it('needs the g first, and within the sequence timeout', () => {
    vi.useFakeTimers();
    render(<Harness handlers={handlers} />);
    key(document.body, { key: 'v' });
    key(document.body, { key: 'f' });
    key(document.body, { key: 'g' });
    vi.advanceTimersByTime(KEY_SEQUENCE_TIMEOUT_MS + 50);
    key(document.body, { key: 'v' });
    expect(handlers.openVesselSwitcher).not.toHaveBeenCalled();
    expect(handlers.goFleet).not.toHaveBeenCalled();
  });

  it('a key between g and v cancels the sequence; g g v still works', () => {
    render(<Harness handlers={handlers} />);
    key(document.body, { key: 'g' });
    key(document.body, { key: 'x' });
    key(document.body, { key: 'v' });
    expect(handlers.openVesselSwitcher).not.toHaveBeenCalled();
    key(document.body, { key: 'g' });
    key(document.body, { key: 'g' });
    key(document.body, { key: 'v' });
    expect(handlers.openVesselSwitcher).toHaveBeenCalledTimes(1);
  });

  it('is ignored while typing in a field', () => {
    render(
      <Harness handlers={handlers}>
        <input aria-label="Notes" />
        <textarea aria-label="Remarks" />
      </Harness>,
    );
    for (const field of [screen.getByLabelText('Notes'), screen.getByLabelText('Remarks')]) {
      key(field, { key: 'g' });
      key(field, { key: 'f' });
      key(field, { key: '?' });
    }
    expect(handlers.goFleet).not.toHaveBeenCalled();
    expect(handlers.openKeyboardShortcuts).not.toHaveBeenCalled();
  });

  it('is ignored inside an open dialog or menu, and with a modifier held', () => {
    render(
      <Harness handlers={handlers}>
        <div role="dialog" aria-label="Palette">
          <button type="button">Inside</button>
        </div>
      </Harness>,
    );
    const inside = screen.getByRole('button', { name: 'Inside' });
    key(inside, { key: 'g' });
    key(inside, { key: 'v' });
    key(document.body, { key: 'g', ctrlKey: true });
    key(document.body, { key: 'v' });
    key(document.body, { key: '?', metaKey: true });
    expect(handlers.openVesselSwitcher).not.toHaveBeenCalled();
    expect(handlers.openKeyboardShortcuts).not.toHaveBeenCalled();
  });

  it('a missing handler leaves the key alone (no surface, no action)', () => {
    render(<Harness handlers={{}} />);
    key(document.body, { key: 'g' });
    expect(key(document.body, { key: 'f' }).defaultPrevented).toBe(false);
    expect(key(document.body, { key: '?' }).defaultPrevented).toBe(false);
  });
});

describe('the keyboard shortcuts dialog', () => {
  const surface = (open: boolean) => ({ open, setOpen: () => undefined });
  const ui = (staticSidebar: boolean): ShellUi => ({
    notifications: surface(false),
    vesselSwitcher: surface(false),
    help: surface(false),
    keyboardShortcuts: surface(true),
    staticSidebar,
  });

  function renderDialog({ fleet, switcher, staticSidebar, palette = true }: { fleet: boolean; switcher: boolean; staticSidebar: boolean; palette?: boolean }) {
    const actions: ShellActions = { openKeyboardShortcuts: () => undefined, openVesselSwitcher: switcher ? () => undefined : undefined };
    const dialog = (
      <NavAccessContext.Provider value={fleet ? FLEET_ACCESS : VESSEL_ONLY_ACCESS}>
        <ShellActionsContext.Provider value={actions}>
          <ShellUiContext.Provider value={ui(staticSidebar)}>
            <KeyboardShortcutsDialog />
          </ShellUiContext.Provider>
        </ShellActionsContext.Provider>
      </NavAccessContext.Provider>
    );
    render(palette ? <CommandPaletteProvider>{dialog}</CommandPaletteProvider> : dialog);
    return screen.getByTestId(SHELL_TEST_IDS.keyboardShortcuts);
  }

  const listed = (dialog: HTMLElement) => within(dialog).getAllByRole('term').map((t) => t.textContent);

  it('lists every shortcut for a fleet user with several vessels on a desktop', () => {
    const dialog = renderDialog({ fleet: true, switcher: true, staticSidebar: true });
    expect(within(dialog).getByRole('heading', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
    expect(listed(dialog)).toEqual([
      'Search STORM (command palette)',
      'Switch vessel',
      'Go to the Fleet view',
      'Show keyboard shortcuts',
      'Collapse or expand the sidebar',
    ]);
  });

  it('drops g f without fleet reach, g v without a switcher and Ctrl+B without a static sidebar', () => {
    const dialog = renderDialog({ fleet: false, switcher: false, staticSidebar: false });
    expect(listed(dialog)).toEqual(['Search STORM (command palette)', 'Show keyboard shortcuts']);
  });

  it('drops ⌘K / Ctrl+K without a command palette', () => {
    const dialog = renderDialog({ fleet: true, switcher: true, staticSidebar: true, palette: false });
    expect(listed(dialog)).not.toContain('Search STORM (command palette)');
  });

  it('shows the keys for this platform and sequences as "then"', () => {
    const dialog = renderDialog({ fleet: true, switcher: true, staticSidebar: true });
    const palette = within(dialog).getByText('Search STORM (command palette)').closest('div') as HTMLElement;
    expect(within(palette).getByText('Ctrl')).toBeInTheDocument();
    expect(within(palette).getByText('K')).toBeInTheDocument();
    const fleet = within(dialog).getByText('Go to the Fleet view').closest('div') as HTMLElement;
    expect(within(fleet).getByText('then')).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    const setOpen = vi.fn();
    render(
      <ShellUiContext.Provider value={{ ...ui(true), keyboardShortcuts: { open: true, setOpen } }}>
        <KeyboardShortcutsDialog />
      </ShellUiContext.Provider>,
    );
    fireEvent.keyDown(screen.getByTestId(SHELL_TEST_IDS.keyboardShortcuts), { key: 'Escape' });
    expect(setOpen).toHaveBeenCalledWith(false);
  });
});

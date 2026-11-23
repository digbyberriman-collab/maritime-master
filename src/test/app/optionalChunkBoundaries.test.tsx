/**
 * The optional chunks' failure states (src/app/optionalChunks.ts; D-81,
 * D-100): the palette dialog and the vessel switcher's list. After a deploy
 * the old hashed file is gone, so a new import of it fails again; the
 * boundaries name both causes (an update, the connection) and offer an
 * explicit Reload that goes through the bounded guard (`requestChunkRecovery`,
 * src/app/staleChunkRecovery.ts). Try again / Retry imports again and never
 * reloads, and a hover, focus or background preload that fails is silent.
 */
import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

const PALETTE_FAILURE = 'Failed to fetch dynamically imported module: /assets/PaletteDialog-x.js';
const PANEL_FAILURE = 'Failed to fetch dynamically imported module: /assets/VesselSwitcherPanel-x.js';

const h = vi.hoisted(() => ({
  paletteImports: 0,
  panelImports: 0,
}));

vi.mock('@/app/staleChunkRecovery', () => ({ requestChunkRecovery: vi.fn() }));

// The palette's chunk, as after a deploy: every import of the old file fails.
vi.mock('@/shared/components/command-palette/preload', async () => {
  const { createOptionalChunkLoader } = await import('@/app/optionalChunks');
  const importer = () => {
    h.paletteImports += 1;
    return Promise.reject(new TypeError(PALETTE_FAILURE));
  };
  const paletteLoader = createOptionalChunkLoader<{ default: React.ComponentType<unknown> }>(importer);
  return {
    paletteLoader,
    createPaletteLoader: createOptionalChunkLoader,
    preloadCommandPalette: () => paletteLoader.preload(),
  };
});

// The switcher's list, likewise (the shell fakes as in vesselSwitcher.test.tsx).
vi.mock('@/shared/components/layout/topbar/VesselSwitcherPanel', () => {
  h.panelImports += 1;
  throw new TypeError(PANEL_FAILURE);
});
vi.mock('@/integrations/supabase/client', async () => (await import('../shell/fakeSupabase')).fakeSupabaseModule);
vi.mock('@/modules/auth/contexts/AuthContext', async () => {
  const { shellState } = await import('../shell/shellFakes');
  return { useAuth: () => shellState.auth };
});
vi.mock('@/modules/vessels/contexts/VesselContext', async () => {
  const { shellState } = await import('../shell/shellFakes');
  return { useVessel: () => shellState.vessel };
});
vi.mock('@/modules/auth/store/permissionsStore', async () => {
  const { shellState } = await import('../shell/shellFakes');
  return { usePermissionsStore: (selector: (s: object) => unknown) => selector(shellState.perm) };
});

import { requestChunkRecovery } from '@/app/staleChunkRecovery';
import { CommandPaletteProvider, preloadCommandPalette } from '@/shared/components/command-palette';
import SearchTrigger from '@/shared/components/layout/topbar/SearchTrigger';
import ScopeControl from '@/shared/components/layout/topbar/ScopeControl';
import { PALETTE_TEST_IDS, SHELL_TEST_IDS } from '@/app/shell/testIds';
import { DRAAK, renderShell, resetShellState } from '../shell/shellFakes';
import { resetFakeDb } from '../shell/fakeSupabase';

const recover = vi.mocked(requestChunkRecovery);

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
  if (!('ResizeObserver' in window)) {
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

beforeEach(() => {
  recover.mockClear();
  h.paletteImports = 0;
  h.panelImports = 0;
  localStorage.clear();
  resetFakeDb();
  resetShellState();
  // React logs every error a boundary catches; these failures are the point.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

/** Let the failed imports settle and React render what follows. */
const settle = () => act(async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 0));
});

const renderPalette = () =>
  render(
    <TooltipProvider>
      <CommandPaletteProvider>
        <SearchTrigger />
      </CommandPaletteProvider>
    </TooltipProvider>,
  );

const pressCtrlK = () => fireEvent.keyDown(window, { key: 'k', ctrlKey: true });

describe('palette: "Search could not load"', () => {
  it('names both causes and offers Close, Try again and Reload, in that order', async () => {
    renderPalette();
    pressCtrlK();
    const dialog = await screen.findByTestId(PALETTE_TEST_IDS.dialog);
    expect(within(dialog).getByRole('heading', { name: 'Search could not load' })).toBeInTheDocument();
    expect(dialog).toHaveTextContent(
      'STORM may have been updated, or the connection dropped. Reload to get the latest version, or try again.',
    );
    const reload = within(dialog).getByRole('button', { name: 'Reload' });
    const footer = reload.parentElement as HTMLElement;
    expect(within(footer).getAllByRole('button').map((b) => b.textContent?.trim())).toEqual(['Close', 'Try again', 'Reload']);
    // Reload is the primary action (text on Signal is primary-foreground); the others are outline.
    expect(reload.className).toContain('text-primary-foreground');
    expect(within(footer).getByRole('button', { name: 'Try again' }).className).toContain('border-input');
    expect(recover).not.toHaveBeenCalled();
  });

  it('Try again imports the chunk again and never reloads', async () => {
    renderPalette();
    pressCtrlK();
    const dialog = await screen.findByTestId(PALETTE_TEST_IDS.dialog);
    await within(dialog).findByRole('button', { name: 'Try again' });
    const before = h.paletteImports;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Try again' }));
    await settle();
    expect(h.paletteImports).toBeGreaterThan(before);
    // Still failing (the old file is gone): the same state again, no reload.
    const again = await screen.findByTestId(PALETTE_TEST_IDS.dialog);
    expect(within(again).getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(recover).not.toHaveBeenCalled();
  });

  it('Reload asks the bounded guard exactly once', async () => {
    renderPalette();
    pressCtrlK();
    const dialog = await screen.findByTestId(PALETTE_TEST_IDS.dialog);
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Reload' }));
    expect(recover).toHaveBeenCalledTimes(1);
  });

  it('a hover, focus or background preload that fails never asks for a reload', async () => {
    renderPalette();
    preloadCommandPalette();
    await settle();
    const trigger = screen.getByTestId(SHELL_TEST_IDS.searchTrigger);
    fireEvent.pointerEnter(trigger);
    await settle();
    fireEvent.focus(trigger);
    await settle();
    expect(h.paletteImports).toBeGreaterThanOrEqual(3);
    expect(recover).not.toHaveBeenCalled();
    expect(screen.queryByTestId(PALETTE_TEST_IDS.dialog)).toBeNull();
  });
});

const vesselScope = { scope: 'vessel' as const, vessel: DRAAK, vesselCode: 'DRA' };

/** Open the switcher and wait for its failure state. */
async function openFailingSwitcher() {
  renderShell(<ScopeControl />, { path: '/v/dra', scope: vesselScope });
  const trigger = await screen.findByTestId(SHELL_TEST_IDS.vesselSwitcherTrigger);
  fireEvent.click(trigger);
  const panel = await screen.findByTestId(SHELL_TEST_IDS.vesselSwitcher);
  await within(panel).findByRole('button', { name: 'Retry' });
  return { trigger, panel };
}

describe('vessel switcher: "The vessel list could not load"', () => {
  it('says the list could not load and that STORM may have been updated, with Retry and Reload', async () => {
    const { panel } = await openFailingSwitcher();
    expect(within(panel).getByRole('alert')).toHaveTextContent('The vessel list could not load. STORM may have been updated.');
    const retry = within(panel).getByRole('button', { name: 'Retry' });
    const reload = within(panel).getByRole('button', { name: 'Reload' });
    // 44 px on touch (D-35); the icons are decoration.
    for (const button of [retry, reload]) {
      expect(button.className).toContain('[@media(pointer:coarse)]:h-11');
      expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    }
    expect(within(panel).queryByRole('combobox')).toBeNull();
    expect(recover).not.toHaveBeenCalled();
  });

  it('Retry imports the list again and never reloads', async () => {
    const { panel } = await openFailingSwitcher();
    const before = h.panelImports;
    fireEvent.click(within(panel).getByRole('button', { name: 'Retry' }));
    await settle();
    await waitFor(() => expect(h.panelImports).toBeGreaterThan(before));
    expect(await within(panel).findByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(recover).not.toHaveBeenCalled();
  });

  it('Reload asks the bounded guard exactly once', async () => {
    const { panel } = await openFailingSwitcher();
    fireEvent.click(within(panel).getByRole('button', { name: 'Reload' }));
    expect(recover).toHaveBeenCalledTimes(1);
  });

  it('hover and focus preloads that fail never ask for a reload', async () => {
    renderShell(<ScopeControl />, { path: '/v/dra', scope: vesselScope });
    const trigger = await screen.findByTestId(SHELL_TEST_IDS.vesselSwitcherTrigger);
    fireEvent.pointerEnter(trigger);
    await settle();
    fireEvent.focus(trigger);
    await settle();
    expect(h.panelImports).toBeGreaterThanOrEqual(1);
    expect(recover).not.toHaveBeenCalled();
  });
});

/**
 * Optional UI chunks (src/app/optionalChunks.ts): which failed imports main.tsx
 * leaves to their own boundary instead of reloading (D-39 for route chunks,
 * D-81 for the palette, D-100 for the vessel switcher and the Red Room
 * dialogs), and the shared loader that forgets a failed import,
 * including one that resolves to something that is not a module.
 */
import { describe, expect, it, vi } from 'vitest';
import { OPTIONAL_CHUNKS, createOptionalChunkLoader, isOptionalChunkError } from '@/app/optionalChunks';
import { createPaletteLoader, type PaletteDialogModule } from '@/shared/components/command-palette/preload';

describe('isOptionalChunkError', () => {
  it('lists the palette dialog, the vessel switcher panel and the Red Room Snooze / Assign task dialogs', () => {
    expect([...OPTIONAL_CHUNKS]).toEqual(['PaletteDialog', 'VesselSwitcherPanel', 'SnoozeDialog', 'AssignTaskDialog']);
  });

  it.each([
    'Failed to fetch dynamically imported module: http://127.0.0.1:4510/assets/PaletteDialog-BviMxRmP.js',
    'Failed to fetch dynamically imported module: https://storm.example/assets/VesselSwitcherPanel-BksRtyXc.js',
    'Unable to preload CSS for /assets/PaletteDialog-C2x_9-aB.css',
    'Failed to fetch dynamically imported module: http://127.0.0.1:4511/src/shared/components/command-palette/PaletteDialog.tsx',
    'Failed to fetch dynamically imported module: http://127.0.0.1:4511/src/shared/components/command-palette/PaletteDialog.tsx?t=1',
    'Uncaught TypeError: Failed to fetch dynamically imported module: http://127.0.0.1:4511/src/shared/components/layout/topbar/VesselSwitcherPanel.tsx?t=1700000000000',
    'error loading dynamically imported module: http://127.0.0.1/assets/VesselSwitcherPanel-abc.js',
    '/assets/PaletteDialog.js',
    // The Red Room panel's dialogs (D-100).
    'Failed to fetch dynamically imported module: https://storm.example/assets/SnoozeDialog-BcrYV0_K.js',
    'Failed to fetch dynamically imported module: https://storm.example/assets/AssignTaskDialog-D4x-9qTz.js',
    'error loading dynamically imported module: http://127.0.0.1/assets/SnoozeDialog-abc.js',
    'Failed to fetch dynamically imported module: http://127.0.0.1:4511/src/modules/red-room/components/AssignTaskDialog.tsx?t=1',
    '/assets/SnoozeDialog-abc.js',
    '/assets/AssignTaskDialog-abc.js',
  ])('matches %s', (msg) => {
    expect(isOptionalChunkError(msg)).toBe(true);
  });

  it.each([
    ['a route chunk', 'Failed to fetch dynamically imported module: http://127.0.0.1/assets/CrewList-abc.js'],
    ['a longer name', 'Failed to fetch dynamically imported module: http://127.0.0.1/assets/PaletteDialogFoo.js'],
    ['a longer hashed name', 'Failed to fetch dynamically imported module: http://127.0.0.1/assets/PaletteDialogFoo-abc.js'],
    ['a name ending like one', 'Failed to fetch dynamically imported module: http://127.0.0.1/assets/MyPaletteDialog-abc.js'],
    ['another extension', 'Failed to fetch dynamically imported module: http://127.0.0.1/assets/PaletteDialog-abc.jsx'],
    ['a longer Snooze name alone', 'SnoozeDialogFoo'],
    ['a longer Snooze name', 'Failed to fetch dynamically imported module: http://127.0.0.1/assets/SnoozeDialogFoo.js'],
    ['a longer hashed Snooze name', 'Failed to fetch dynamically imported module: http://127.0.0.1/assets/SnoozeDialogFoo-abc.js'],
    ['a name ending like Assign', 'Failed to fetch dynamically imported module: http://127.0.0.1/assets/BulkAssignTaskDialog-abc.js'],
    ['the Red Room panel (a route chunk part)', 'Failed to fetch dynamically imported module: http://127.0.0.1/assets/RedRoomPanel-abc.js'],
    ['the name without a file', 'PaletteDialog failed to render'],
    ["Safari's message (no URL)", 'Importing a module script failed.'],
    ['an empty message', ''],
  ])('does not match %s', (_name, msg) => {
    expect(isOptionalChunkError(msg)).toBe(false);
  });
});

type Module = { default: () => null };
const module: Module = { default: () => null };

describe('createOptionalChunkLoader', () => {
  it('imports once for any number of preloads and loads', async () => {
    const importer = vi.fn(async () => module);
    const loader = createOptionalChunkLoader(importer);
    loader.preload();
    loader.preload();
    await expect(loader.load()).resolves.toBe(module);
    loader.preload();
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it('an import that resolves to undefined is a failure, and the next load imports again', async () => {
    const importer = vi
      .fn<() => Promise<Module>>()
      .mockResolvedValueOnce(undefined as unknown as Module)
      .mockResolvedValue(module);
    const loader = createOptionalChunkLoader(importer);
    await expect(loader.load()).rejects.toThrow('chunk failed to load');
    await expect(loader.load()).resolves.toBe(module);
    expect(importer).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['null', null],
    ['an object without default', { other: 1 }],
    ['a string', 'PaletteDialog'],
  ])('an import that resolves to %s is a failure too', async (_name, value) => {
    const importer = vi
      .fn<() => Promise<Module>>()
      .mockResolvedValueOnce(value as unknown as Module)
      .mockResolvedValue(module);
    const loader = createOptionalChunkLoader(importer);
    await expect(loader.load()).rejects.toThrow('chunk failed to load');
    await expect(loader.load()).resolves.toBe(module);
  });

  it('a rejected or throwing import is forgotten, and a preload never rejects or throws', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const importer = vi
        .fn<() => Promise<Module>>()
        .mockImplementationOnce(() => {
          throw new Error('sync failure');
        })
        .mockRejectedValueOnce(new Error('chunk failed'))
        .mockResolvedValueOnce(undefined as unknown as Module)
        .mockResolvedValue(module);
      const loader = createOptionalChunkLoader(importer);
      expect(() => loader.preload()).not.toThrow();
      await new Promise((r) => setTimeout(r, 0));
      expect(() => loader.preload()).not.toThrow();
      await new Promise((r) => setTimeout(r, 0));
      expect(() => loader.preload()).not.toThrow();
      await new Promise((r) => setTimeout(r, 0));
      await expect(loader.load()).resolves.toBe(module);
      expect(importer).toHaveBeenCalledTimes(4);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});

describe('createPaletteLoader (the palette dialog chunk)', () => {
  const dialog: PaletteDialogModule = { default: () => null };

  it('a dialog import that resolves to undefined rejects, then the next load imports again', async () => {
    const importer = vi
      .fn<() => Promise<PaletteDialogModule>>()
      .mockResolvedValueOnce(undefined as unknown as PaletteDialogModule)
      .mockResolvedValue(dialog);
    const loader = createPaletteLoader(importer);
    await expect(loader.load()).rejects.toThrow('chunk failed to load');
    await expect(loader.load()).resolves.toBe(dialog);
    expect(importer).toHaveBeenCalledTimes(2);
  });

  it('a preload of a dialog import that resolves to undefined never rejects unhandled', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const importer = vi
        .fn<() => Promise<PaletteDialogModule>>()
        .mockResolvedValueOnce(undefined as unknown as PaletteDialogModule)
        .mockResolvedValue(dialog);
      const loader = createPaletteLoader(importer);
      expect(() => loader.preload()).not.toThrow();
      await new Promise((r) => setTimeout(r, 0));
      expect(unhandled).not.toHaveBeenCalled();
      await expect(loader.load()).resolves.toBe(dialog);
      expect(importer).toHaveBeenCalledTimes(2);
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});

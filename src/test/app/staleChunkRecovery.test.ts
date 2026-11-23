/**
 * The bounded stale-chunk reload guard (src/app/staleChunkRecovery.ts; D-39,
 * D-100): at most 2 reloads in 60 s, then the recovery panel; without
 * storage the panel at once; one decision per page load; never a reload
 * with no panel to fall back on. sessionStorage is driven directly, and each
 * test imports a fresh module, as a page load would.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Recovery = typeof import('@/app/staleChunkRecovery');

const KEY = 'storm.preloadReloads';
const NOW = Date.parse('2026-11-23T10:00:00Z');
const realLocation = window.location;
let reloads = 0;

async function freshModule(): Promise<Recovery> {
  vi.resetModules();
  return import('@/app/staleChunkRecovery');
}

/** A fresh page load with a panel registered; `panel` counts how often it was shown. */
async function pageLoad() {
  const recovery = await freshModule();
  const panel = vi.fn();
  recovery.setRecoveryPanel(panel);
  return { recovery, panel };
}

const record = () => JSON.parse(sessionStorage.getItem(KEY) ?? 'null');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  sessionStorage.clear();
  reloads = 0;
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...realLocation, reload: () => { reloads += 1; } },
  });
});

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('requestChunkRecovery', () => {
  it('is React-free: main.tsx imports it before React', () => {
    const source = readFileSync(join(process.cwd(), 'src/app/staleChunkRecovery.ts'), 'utf8');
    expect(source).not.toMatch(/^\s*import\b/m);
  });

  it('exports the guard key', async () => {
    const { RELOAD_KEY } = await freshModule();
    expect(RELOAD_KEY).toBe(KEY);
  });

  it('with no earlier reloads: reloads, and the record becomes {count: 1, at: now}', async () => {
    const { recovery, panel } = await pageLoad();
    recovery.requestChunkRecovery();
    vi.runAllTimers();
    expect(reloads).toBe(1);
    expect(panel).not.toHaveBeenCalled();
    expect(record()).toEqual({ count: 1, at: NOW });
  });

  it('after a second reload in the window: reloads once more ({count: 2})', async () => {
    sessionStorage.setItem(KEY, JSON.stringify({ count: 1, at: NOW - 5_000 }));
    const { recovery, panel } = await pageLoad();
    recovery.requestChunkRecovery();
    vi.runAllTimers();
    expect(reloads).toBe(1);
    expect(panel).not.toHaveBeenCalled();
    expect(record()).toEqual({ count: 2, at: NOW });
  });

  it('at the cap ({count: 2, at: now}): the panel, deferred, and no reload', async () => {
    const stored = JSON.stringify({ count: 2, at: NOW });
    sessionStorage.setItem(KEY, stored);
    const { recovery, panel } = await pageLoad();
    recovery.requestChunkRecovery();
    // Deferred: never inside the caller's own (React) work.
    expect(panel).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(panel).toHaveBeenCalledTimes(1);
    expect(reloads).toBe(0);
    expect(sessionStorage.getItem(KEY)).toBe(stored);
  });

  it('a record older than 60 s starts a new count: reloads', async () => {
    sessionStorage.setItem(KEY, JSON.stringify({ count: 2, at: NOW - 60_001 }));
    const { recovery, panel } = await pageLoad();
    recovery.requestChunkRecovery();
    vi.runAllTimers();
    expect(reloads).toBe(1);
    expect(panel).not.toHaveBeenCalled();
    expect(record()).toEqual({ count: 1, at: NOW });
  });

  it('an unreadable record counts as no earlier reloads', async () => {
    sessionStorage.setItem(KEY, '{not json');
    const { recovery } = await pageLoad();
    recovery.requestChunkRecovery();
    expect(reloads).toBe(1);
    expect(record()).toEqual({ count: 1, at: NOW });
  });

  it('storage that cannot be written: the panel, no reload', async () => {
    const { recovery, panel } = await pageLoad();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    recovery.requestChunkRecovery();
    vi.runAllTimers();
    expect(panel).toHaveBeenCalledTimes(1);
    expect(reloads).toBe(0);
  });

  it('two calls in one page load make one decision', async () => {
    const { recovery, panel } = await pageLoad();
    recovery.requestChunkRecovery();
    recovery.requestChunkRecovery();
    vi.runAllTimers();
    expect(reloads).toBe(1);
    expect(record()).toEqual({ count: 1, at: NOW });

    // At the cap too: one panel, not two.
    sessionStorage.setItem(KEY, JSON.stringify({ count: 2, at: NOW }));
    const second = await pageLoad();
    second.recovery.requestChunkRecovery();
    second.recovery.requestChunkRecovery();
    vi.runAllTimers();
    expect(second.panel).toHaveBeenCalledTimes(1);
    expect(panel).not.toHaveBeenCalled();
    expect(reloads).toBe(1);
  });

  it('with no panel registered it never reloads, and a later call still decides once registered', async () => {
    const recovery = await freshModule();
    recovery.requestChunkRecovery();
    vi.runAllTimers();
    expect(reloads).toBe(0);
    expect(sessionStorage.getItem(KEY)).toBeNull();

    const panel = vi.fn();
    recovery.setRecoveryPanel(panel);
    recovery.requestChunkRecovery();
    vi.runAllTimers();
    expect(reloads).toBe(1);
  });
});

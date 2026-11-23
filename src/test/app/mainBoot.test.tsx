/**
 * main.tsx stale-chunk recovery (BUILD-PLAN B2: a chunk-load failure ends in a
 * recoverable state, not a blank page or a reload loop), and the optional UI
 * chunks it leaves to their own boundaries (src/app/optionalChunks.ts, D-81).
 *
 * Each "boot" re-imports main.tsx into a fresh #root, as a page reload would,
 * then fails a route chunk the way Vite's preload helper does (a cancelable
 * vite:preloadError on window). The reload guard lives in sessionStorage, so
 * it is the only state that survives between boots.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';

const hoisted = vi.hoisted(() => ({ unmounts: 0 }));

vi.mock('@/App.tsx', () => ({ default: () => <p>app shell</p> }));
vi.mock('@/index.css', () => ({}));
vi.mock('react-dom/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom/client')>();
  return {
    ...actual,
    createRoot: (...args: Parameters<typeof actual.createRoot>) => {
      const root = actual.createRoot(...args);
      const unmount = root.unmount.bind(root);
      root.unmount = () => {
        hoisted.unmounts += 1;
        unmount();
      };
      return root;
    },
  };
});

const RELOAD_KEY = 'storm.preloadReloads';
let reloads = 0;
let added: Array<[string, EventListenerOrEventListenerObject]> = [];
const realLocation = window.location;

const tick = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0));
});

/** Load main.tsx as a fresh page load would. */
async function boot(placeholder = 'placeholder') {
  for (const [type, fn] of added) window.removeEventListener(type, fn);
  added = [];
  document.body.innerHTML = `<div id="root">${placeholder}</div>`;
  const add = window.addEventListener.bind(window);
  const spy = vi.spyOn(window, 'addEventListener').mockImplementation(((
    type: string,
    fn: EventListenerOrEventListenerObject,
    opts?: boolean | AddEventListenerOptions,
  ) => {
    added.push([type, fn]);
    add(type, fn, opts);
  }) as typeof window.addEventListener);
  vi.resetModules();
  await act(async () => {
    await import('@/main.tsx');
  });
  spy.mockRestore();
}

/** A route chunk fails after boot, as Vite reports it. */
async function failChunk() {
  const event = new Event('vite:preloadError', { cancelable: true });
  window.dispatchEvent(event);
  await tick();
  return event;
}

/** A chunk fails with the error Vite's preload helper puts on the event's payload. */
async function failChunkWith(message: string) {
  const event = Object.assign(new Event('vite:preloadError', { cancelable: true }), { payload: new Error(message) });
  window.dispatchEvent(event);
  await tick();
  return event;
}

const panelShown = () => !!document.getElementById('storm-recovery-reload');

beforeEach(() => {
  sessionStorage.clear();
  reloads = 0;
  hoisted.unmounts = 0;
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...realLocation, reload: () => { reloads += 1; } },
  });
});

afterEach(() => {
  for (const [type, fn] of added) window.removeEventListener(type, fn);
  added = [];
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
  vi.restoreAllMocks();
});

describe('main.tsx reload guard', () => {
  it('mounts the app and keeps the guard across a healthy boot', async () => {
    sessionStorage.setItem(RELOAD_KEY, JSON.stringify({ count: 1, at: Date.now() }));
    await boot();
    expect(document.getElementById('root')).toHaveTextContent('app shell');
    // Not cleared at boot: a route chunk can still fail after the app mounts.
    expect(JSON.parse(sessionStorage.getItem(RELOAD_KEY) ?? 'null')).toMatchObject({ count: 1 });
  });

  it('a chunk that keeps failing reloads MAX_RELOADS times, then shows the recovery panel and stops', async () => {
    const seen: Array<{ reloads: number; panel: boolean; prevented: boolean }> = [];
    for (let i = 0; i < 5; i += 1) {
      await boot();
      const event = await failChunk();
      seen.push({ reloads, panel: panelShown(), prevented: event.defaultPrevented });
    }
    expect(seen.map((s) => s.reloads)).toEqual([1, 2, 2, 2, 2]);
    expect(seen.map((s) => s.panel)).toEqual([false, false, true, true, true]);
    expect(seen.every((s) => s.prevented)).toBe(true);
    // React was stopped before the panel replaced its DOM.
    expect(hoisted.unmounts).toBe(3);
    expect(document.getElementById('root')).not.toHaveTextContent('app shell');
  });

  it('several error events from one failure count as one reload', async () => {
    await boot();
    await failChunk();
    window.dispatchEvent(
      Object.assign(new Event('unhandledrejection'), {
        reason: new Error('Failed to fetch dynamically imported module: /assets/x.js'),
      }),
    );
    await tick();
    expect(reloads).toBe(1);
    expect(JSON.parse(sessionStorage.getItem(RELOAD_KEY) ?? 'null')).toMatchObject({ count: 1 });
  });

  it('a failure long after the last automatic reload starts a new count', async () => {
    const t0 = Date.parse('2026-01-01T10:00:00Z');
    const now = vi.spyOn(Date, 'now').mockReturnValue(t0);
    await boot();
    await failChunk();
    await boot();
    await failChunk();
    expect(reloads).toBe(2);

    // An hour later a new deploy leaves another stale chunk: reload again.
    now.mockReturnValue(t0 + 60 * 60 * 1000);
    await boot();
    await failChunk();
    expect(reloads).toBe(3);
    expect(panelShown()).toBe(false);
  });

  it('the panel Reload button clears the guard and reloads', async () => {
    for (let i = 0; i < 3; i += 1) {
      await boot();
      await failChunk();
    }
    expect(panelShown()).toBe(true);
    document.getElementById('storm-recovery-reload')!.click();
    expect(reloads).toBe(3);
    expect(sessionStorage.getItem(RELOAD_KEY)).toBeNull();
  });

  it('the panel reuses the boot screen STORM lockup and puts focus on Reload', async () => {
    const lockup =
      '<div class="storm-boot"><div class="storm-boot-lockup" data-storm-boot-logo><span class="storm-boot-mark">STORM</span></div></div>';
    for (let i = 0; i < 3; i += 1) {
      await boot(lockup);
      await failChunk();
    }
    const panel = document.querySelector('[data-storm-recovery]');
    expect(panel).not.toBeNull();
    expect(panel?.querySelector('[data-storm-boot-logo]')).not.toBeNull();
    expect(panel?.querySelector('[role="alert"]')).toHaveTextContent("We couldn't finish loading STORM");
    expect(document.getElementById('storm-recovery-reload')).toHaveFocus();
  });

  it('fails closed when sessionStorage cannot be written: panel, no automatic reload', async () => {
    await boot();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    await failChunk();
    expect(reloads).toBe(0);
    expect(panelShown()).toBe(true);
  });
});

describe('optional UI chunks fail softly (D-81), route chunks still reload (D-39)', () => {
  const BUILT_PALETTE = 'Failed to fetch dynamically imported module: http://127.0.0.1/assets/PaletteDialog-abc.js';
  const DEV_SWITCHER =
    'Failed to fetch dynamically imported module: http://127.0.0.1:4511/src/shared/components/layout/topbar/VesselSwitcherPanel.tsx?t=1';
  const PALETTE_CSS = 'Unable to preload CSS for http://127.0.0.1/assets/PaletteDialog-abc.css';
  const ROUTE_CHUNK = 'Failed to fetch dynamically imported module: http://127.0.0.1/assets/CrewList-abc.js';
  const earlier = () => JSON.stringify({ count: 1, at: Date.now() - 5_000 });

  it.each([
    ['the built palette dialog', BUILT_PALETTE],
    ['the dev vessel switcher panel', DEV_SWITCHER],
    ["the palette dialog's CSS", PALETTE_CSS],
  ])('a vite:preloadError for %s is not prevented and reloads nothing', async (_name, message) => {
    const record = earlier();
    sessionStorage.setItem(RELOAD_KEY, record);
    await boot();
    const event = await failChunkWith(message);
    expect(reloads).toBe(0);
    // Vite rethrows to the chunk's loader, so its boundary can offer Try again.
    expect(event.defaultPrevented).toBe(false);
    expect(sessionStorage.getItem(RELOAD_KEY)).toBe(record);
    expect(panelShown()).toBe(false);
    expect(document.getElementById('root')).toHaveTextContent('app shell');
  });

  it('with no earlier reloads, an optional chunk failure writes no guard record', async () => {
    await boot();
    await failChunkWith(BUILT_PALETTE);
    expect(reloads).toBe(0);
    expect(sessionStorage.getItem(RELOAD_KEY)).toBeNull();
  });

  it('a window error carrying an optional chunk (React replays boundary-caught errors in development) reloads nothing', async () => {
    const record = earlier();
    sessionStorage.setItem(RELOAD_KEY, record);
    await boot();
    window.dispatchEvent(new ErrorEvent('error', { message: `Uncaught TypeError: ${DEV_SWITCHER}` }));
    window.dispatchEvent(new ErrorEvent('error', { message: 'Script error.', error: new TypeError(BUILT_PALETTE) }));
    await tick();
    expect(reloads).toBe(0);
    expect(sessionStorage.getItem(RELOAD_KEY)).toBe(record);
  });

  it('an unhandled rejection carrying an optional chunk reloads nothing', async () => {
    await boot();
    window.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: new TypeError(BUILT_PALETTE) }));
    await tick();
    expect(reloads).toBe(0);
    expect(sessionStorage.getItem(RELOAD_KEY)).toBeNull();
  });

  it('a route chunk still reloads once, prevented, and counts in the guard', async () => {
    await boot();
    const event = await failChunkWith(ROUTE_CHUNK);
    expect(reloads).toBe(1);
    expect(event.defaultPrevented).toBe(true);
    expect(JSON.parse(sessionStorage.getItem(RELOAD_KEY) ?? 'null')).toMatchObject({ count: 1 });
    // The same failure surfacing as an error event too still counts once.
    window.dispatchEvent(new ErrorEvent('error', { message: `Uncaught TypeError: ${ROUTE_CHUNK}` }));
    await tick();
    expect(reloads).toBe(1);
  });

  it('a chunk whose name only starts like an optional one is a route chunk', async () => {
    await boot();
    const event = await failChunkWith('Failed to fetch dynamically imported module: http://127.0.0.1/assets/PaletteDialogFoo-abc.js');
    expect(reloads).toBe(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('a route chunk failing as a window error or rejection still reloads', async () => {
    await boot();
    window.dispatchEvent(new ErrorEvent('error', { message: `Uncaught TypeError: ${ROUTE_CHUNK}` }));
    await tick();
    expect(reloads).toBe(1);
    await boot();
    window.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: new TypeError(ROUTE_CHUNK) }));
    await tick();
    expect(reloads).toBe(2);
  });
});

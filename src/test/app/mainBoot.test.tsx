/**
 * main.tsx stale-chunk recovery (BUILD-PLAN B2: a chunk-load failure ends in a
 * recoverable state, not a blank page or a reload loop).
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

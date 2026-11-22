/**
 * Theme runtime (BUILD-PLAN A2, A3; gap/10 DS4, DS6, DS22, W1): the
 * index.html pre-paint script, the next-themes provider, theme-color and the
 * density store.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { useTheme } from 'next-themes';
import { ThemeProvider } from '@/components/ui/theme-provider';
import {
  DENSITY_STORAGE_KEY,
  THEME_COLOR,
  THEME_STORAGE_KEY,
  applyThemeColor,
  getDensity,
  hasStoredThemeChoice,
  resolveDensity,
  resolveThemeClass,
  setDensity,
} from '@/components/ui/theme-config';
import { useDensity } from '@/components/ui/use-density';
import { readRepoFile } from './cssTokens';

const html = readRepoFile('index.html');
const prepaint = /<script data-storm-prepaint>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';

const originalMatchMedia = window.matchMedia;
const stubMatchMedia = (matching: string[]) => {
  window.matchMedia = ((query: string) => ({
    matches: matching.includes(query),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
};

const root = () => document.documentElement;
const runPrepaint = () => new Function(prepaint)();

const resetDom = () => {
  localStorage.clear();
  root().className = '';
  root().removeAttribute('data-density');
  root().style.colorScheme = '';
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = '#FFFFFF';
  document.head.appendChild(meta);
};

const themeColor = () => document.querySelector('meta[name="theme-color"]')?.getAttribute('content');

beforeEach(resetDom);
afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe('index.html first paint', () => {
  it('is dark before any script runs', () => {
    expect(html).toMatch(/<html lang="en" class="dark" style="color-scheme: dark">/);
    expect(html).toContain('<meta name="theme-color" content="#0A0E14" />');
    expect(html).toContain('<meta name="color-scheme" content="dark light" />');
    expect(html).toMatch(/html \{ background: #0A0E14;/);
  });

  it('runs the pre-paint script before the stylesheet and the app', () => {
    expect(prepaint).not.toBe('');
    const scriptAt = html.indexOf('data-storm-prepaint');
    expect(scriptAt).toBeLessThan(html.indexOf('fonts.googleapis.com/css2'));
    expect(scriptAt).toBeLessThan(html.indexOf('/src/main.tsx'));
    expect(scriptAt).toBeLessThan(html.indexOf('</head>'));
  });

  it('loads Inter, Barlow Semi Condensed and JetBrains Mono with preconnect and swap (D-DS3)', () => {
    expect(html).toContain('<link rel="preconnect" href="https://fonts.googleapis.com" />');
    expect(html).toContain('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />');
    const href = /href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"/.exec(html)?.[1] ?? '';
    expect(href).toContain('family=Inter');
    expect(href).toContain('family=Barlow+Semi+Condensed');
    expect(href).toContain('family=JetBrains+Mono');
    expect(href).toContain('display=swap');
  });

  it('styles the loading placeholder and watchdog on Abyss, not the old light colours', () => {
    expect(html).toContain('data-storm-placeholder');
    for (const legacy of ['#0066CC', '#64748b', '#94a3b8']) expect(html).not.toContain(legacy);
    expect(html).toMatch(/\.storm-boot-button \{[^}]*background: #00AFE6; color: #0A0E14;/);
  });

  it.each([
    [null, [], 'dark'],
    ['dark', [], 'dark'],
    ['light', [], 'light'],
    ['system', ['(prefers-color-scheme: dark)'], 'dark'],
    ['system', [], 'light'],
    ['nonsense', [], 'dark'],
  ] as const)('stored theme %s (media %j) paints %s', (stored, media, expected) => {
    stubMatchMedia([...media]);
    root().classList.add(expected === 'dark' ? 'light' : 'dark');
    if (stored) localStorage.setItem(THEME_STORAGE_KEY, stored);
    runPrepaint();
    expect(root().classList.contains(expected)).toBe(true);
    expect(root().classList.contains(expected === 'dark' ? 'light' : 'dark')).toBe(false);
    expect(root().style.colorScheme).toBe(expected);
    expect(themeColor()).toBe(THEME_COLOR[expected]);
    // The script and the TS helper agree.
    expect(resolveThemeClass(stored, media.length > 0)).toBe(expected);
  });

  it('sets data-density from storage, else comfortable on narrow touch screens', () => {
    stubMatchMedia(['(pointer: coarse)']);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
    runPrepaint();
    expect(root().getAttribute('data-density')).toBe('comfortable');

    resetDom();
    localStorage.setItem(DENSITY_STORAGE_KEY, 'compact');
    runPrepaint();
    expect(root().getAttribute('data-density')).toBe('compact');

    resetDom();
    stubMatchMedia([]);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
    runPrepaint();
    expect(root().getAttribute('data-density')).toBe('default');
  });

  it('survives storage that throws (private mode)', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('blocked');
      },
    });
    try {
      expect(() => runPrepaint()).not.toThrow();
      expect(root().classList.contains('dark')).toBe(true);
    } finally {
      if (original) Object.defineProperty(window, 'localStorage', original);
    }
  });
});

describe('theme-color metas (BUILD-PLAN S6, IA26)', () => {
  /** The theme-color metas in document order: [media or null, content]. */
  const themeColorMetas = [...html.matchAll(/<meta\b[^>]*name="theme-color"[^>]*>/g)].map((m) => [
    /\bmedia="([^"]+)"/.exec(m[0])?.[1] ?? null,
    /\bcontent="([^"]+)"/.exec(m[0])?.[1] ?? null,
  ]);

  it('keeps the script-managed meta (no media) first, then one per colour scheme', () => {
    // Browsers use the first theme-color whose media matches: the user's
    // choice (set by the pre-paint script) must win over the OS scheme, or a
    // Daylight user on a dark OS gets a dark status bar.
    expect(themeColorMetas).toEqual([
      [null, THEME_COLOR.dark],
      ['(prefers-color-scheme: dark)', THEME_COLOR.dark],
      ['(prefers-color-scheme: light)', THEME_COLOR.light],
    ]);
  });

  const addSchemeMetas = () => {
    for (const [media, content] of [
      ['(prefers-color-scheme: dark)', THEME_COLOR.dark],
      ['(prefers-color-scheme: light)', THEME_COLOR.light],
    ]) {
      const meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      meta.setAttribute('media', media);
      meta.setAttribute('content', content);
      document.head.appendChild(meta);
    }
  };
  const schemeMetas = () =>
    [...document.querySelectorAll('meta[name="theme-color"][media]')].map((m) => [m.getAttribute('media'), m.getAttribute('content')]);

  it('the pre-paint script sets only the script-managed meta', () => {
    addSchemeMetas();
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    runPrepaint();
    expect(themeColor()).toBe(THEME_COLOR.light);
    expect(schemeMetas()).toEqual([
      ['(prefers-color-scheme: dark)', THEME_COLOR.dark],
      ['(prefers-color-scheme: light)', THEME_COLOR.light],
    ]);
  });

  it('applyThemeColor sets only the script-managed meta, even after the per-scheme ones', () => {
    addSchemeMetas();
    applyThemeColor('light');
    expect(document.querySelector('meta[name="theme-color"]:not([media])')?.getAttribute('content')).toBe(THEME_COLOR.light);
    applyThemeColor('dark');
    expect(themeColor()).toBe(THEME_COLOR.dark);
    expect(schemeMetas()).toEqual([
      ['(prefers-color-scheme: dark)', THEME_COLOR.dark],
      ['(prefers-color-scheme: light)', THEME_COLOR.light],
    ]);
  });

  it('pre-paint and theme-config agree on the colours', () => {
    expect(prepaint).toContain(`theme === 'light' ? '${THEME_COLOR.light}' : '${THEME_COLOR.dark}'`);
    expect(prepaint).toContain('meta[name="theme-color"]:not([media])');
  });

  it('never blocks first paint on the font stylesheet (no blank screen on a slow link)', () => {
    const fontLink = /<link\b[^>]*fonts\.googleapis\.com\/css2[^>]*>/.exec(html)?.[0] ?? '';
    expect(fontLink).toContain('media="print"');
    expect(fontLink).toContain(`onload="this.media='all'"`);
    expect(html).toMatch(/<noscript>\s*<link\s+rel="stylesheet"\s+href="https:\/\/fonts\.googleapis\.com\/css2/);
  });

  it('paints the boot screen with the STORM lockup and a reduced-motion-safe progress line', () => {
    expect(html).toMatch(/<div data-storm-placeholder class="storm-boot">/);
    expect(html).toContain('data-storm-boot-logo');
    expect(html).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.storm-boot-progress::after \{ animation: none;/);
    expect(html).toMatch(/html\.light \.storm-boot-button \{ background: #00648F; color: #FFFFFF; \}/);
  });
});

describe('theme-config helpers', () => {
  it('resolves density', () => {
    expect(resolveDensity('compact', true, 500)).toBe('compact');
    expect(resolveDensity(null, true, 800)).toBe('comfortable');
    expect(resolveDensity(null, true, 1280)).toBe('default');
    expect(resolveDensity('huge', false, 800)).toBe('default');
  });

  it('knows whether this browser stored a theme', () => {
    expect(hasStoredThemeChoice()).toBe(false);
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(hasStoredThemeChoice()).toBe(true);
  });
});

function ThemeProbe() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button onClick={() => setTheme('light')}>light</button>
      <button onClick={() => setTheme('dark')}>dark</button>
      <button onClick={() => setTheme('system')}>system</button>
    </div>
  );
}

describe('ThemeProvider', () => {
  it('defaults to Abyss (dark) and applies the class and theme-color', () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(root().classList.contains('dark')).toBe(true);
    expect(themeColor()).toBe(THEME_COLOR.dark);
    // Nothing is written until the user chooses (so a new device can adopt the profile theme).
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('switches to Daylight, persists under storm-theme and updates theme-color', () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByText('light'));
    expect(root().classList.contains('light')).toBe(true);
    expect(root().classList.contains('dark')).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(themeColor()).toBe(THEME_COLOR.light);
  });

  it('resolves System from the OS preference', () => {
    stubMatchMedia([]);
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByText('system'));
    expect(screen.getByTestId('resolved').textContent).toBe('light');
    expect(root().classList.contains('light')).toBe(true);
  });

  it('honours a stored choice on start', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme').textContent).toBe('light');
    expect(root().classList.contains('light')).toBe(true);
  });
});

function DensityProbe() {
  const [density, setDensityValue] = useDensity();
  return (
    <div>
      <span data-testid="density">{density}</span>
      <button onClick={() => setDensityValue('compact')}>compact</button>
    </div>
  );
}

describe('density store', () => {
  it('reads the attribute and writes attribute + storage', () => {
    root().setAttribute('data-density', 'comfortable');
    expect(getDensity()).toBe('comfortable');
    setDensity('compact');
    expect(root().getAttribute('data-density')).toBe('compact');
    expect(localStorage.getItem(DENSITY_STORAGE_KEY)).toBe('compact');
  });

  it('notifies subscribers through useDensity', () => {
    root().setAttribute('data-density', 'default');
    render(<DensityProbe />);
    expect(screen.getByTestId('density').textContent).toBe('default');
    act(() => {
      fireEvent.click(screen.getByText('compact'));
    });
    expect(screen.getByTestId('density').textContent).toBe('compact');
    expect(root().getAttribute('data-density')).toBe('compact');
  });
});

describe('wiring', () => {
  it('App mounts the ThemeProvider around the toasters', () => {
    const app = readRepoFile('src/App.tsx');
    expect(app).toContain('import { ThemeProvider } from "@/components/ui/theme-provider";');
    expect(app.indexOf('<ThemeProvider>')).toBeLessThan(app.indexOf('<Sonner />'));
  });

  it('sonner reads the theme from next-themes', () => {
    expect(readRepoFile('src/components/ui/sonner.tsx')).toContain('useTheme()');
  });
});

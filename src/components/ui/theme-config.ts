/**
 * Theme and density runtime configuration (gap/10 DS4, DS11, W1).
 *
 * The inline pre-paint script in index.html mirrors `resolveThemeClass` and
 * `resolveDensity` so the first paint already has the right class and
 * `data-density`; src/test/design/themeRuntime.test.tsx keeps the two in step.
 */

export const THEME_STORAGE_KEY = 'storm-theme';
export const DENSITY_STORAGE_KEY = 'storm-density';

/** Concrete themes applied as a class on <html>. `system` resolves to one of them. */
export const THEMES = ['dark', 'light'] as const;
export type ThemeName = (typeof THEMES)[number];
export type ThemePreference = ThemeName | 'system';
export const DEFAULT_THEME: ThemeName = 'dark';

/** Browser chrome colour (`<meta name="theme-color">`) per resolved theme: the page background. */
export const THEME_COLOR: Record<ThemeName, string> = {
  dark: '#0A0E14',
  light: '#F5F7FA',
};

export const DENSITIES = ['comfortable', 'default', 'compact'] as const;
export type Density = (typeof DENSITIES)[number];

export const isThemePreference = (value: unknown): value is ThemePreference =>
  value === 'dark' || value === 'light' || value === 'system';

export const isDensity = (value: unknown): value is Density =>
  typeof value === 'string' && (DENSITIES as readonly string[]).includes(value);

/**
 * The class to put on <html> for a stored preference (unknown or missing → dark).
 * `system` follows `(prefers-color-scheme: dark)`, exactly as next-themes does.
 */
export function resolveThemeClass(stored: string | null | undefined, prefersDark: boolean): ThemeName {
  if (stored === 'light' || stored === 'dark') return stored;
  if (stored === 'system') return prefersDark ? 'dark' : 'light';
  return DEFAULT_THEME;
}

/** Stored density, or comfortable on touch screens narrower than 1024 px, else default. */
export function resolveDensity(stored: string | null | undefined, coarsePointer: boolean, viewportWidth: number): Density {
  if (isDensity(stored)) return stored;
  return coarsePointer && viewportWidth < 1024 ? 'comfortable' : 'default';
}

const safeGet = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeSet = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode): the attribute still applies for this session */
  }
};

/** True when this browser has never stored a theme choice (a "new device", W1). */
export const hasStoredThemeChoice = (): boolean => isThemePreference(safeGet(THEME_STORAGE_KEY));

/**
 * Update the script-managed `<meta name="theme-color">` (the one without
 * `media`; index.html keeps it ahead of the per-scheme fallbacks, because
 * browsers use the first match) for the resolved theme.
 */
export function applyThemeColor(theme: ThemeName, doc: Document = document) {
  const meta = doc.querySelector('meta[name="theme-color"]:not([media])');
  if (meta) meta.setAttribute('content', THEME_COLOR[theme]);
}

// ---------------------------------------------------------------------------
// Density store: `data-density` on <html> plus localStorage, observable so
// any component (Appearance, DataTable) can read and change it.
// ---------------------------------------------------------------------------

type Listener = () => void;
const listeners = new Set<Listener>();

const matches = (query: string) =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;

/** The density currently in force (attribute first, then storage, then the device default). */
export function getDensity(): Density {
  if (typeof document === 'undefined') return 'default';
  const attr = document.documentElement.getAttribute('data-density');
  if (isDensity(attr)) return attr;
  return resolveDensity(safeGet(DENSITY_STORAGE_KEY), matches('(pointer: coarse)'), window.innerWidth);
}

export function setDensity(next: Density) {
  if (!isDensity(next)) return;
  document.documentElement.setAttribute('data-density', next);
  safeSet(DENSITY_STORAGE_KEY, next);
  listeners.forEach((l) => l());
}

export function subscribeDensity(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

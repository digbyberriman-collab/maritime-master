import { useEffect, type ReactNode } from 'react';
import { ThemeProvider as NextThemesProvider, useTheme } from 'next-themes';
import { DEFAULT_THEME, THEME_STORAGE_KEY, THEMES, applyThemeColor, type ThemeName } from './theme-config';

/** Keeps `<meta name="theme-color">` in step with the resolved theme. */
function ThemeColorSync() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    if (resolvedTheme === 'light' || resolvedTheme === 'dark') applyThemeColor(resolvedTheme as ThemeName);
  }, [resolvedTheme]);
  return null;
}

/**
 * STORM theme runtime (gap/10 DS4): Abyss (dark) by default, Daylight optional,
 * System follows the OS. The class goes on <html> (`dark` | `light`) so the
 * existing `dark:` variants keep working. index.html applies the same class
 * before first paint, so there is no flash.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme={DEFAULT_THEME}
      enableSystem
      storageKey={THEME_STORAGE_KEY}
      themes={[...THEMES]}
      disableTransitionOnChange
    >
      <ThemeColorSync />
      {children}
    </NextThemesProvider>
  );
}

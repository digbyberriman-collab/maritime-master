/**
 * Vite config for the visual harness: the app's own config, plus
 *   - a private dependency cache in node_modules/.vite-visual, so it never
 *     collides with another dev server or vitest run sharing node_modules/.vite
 *     (and stays out of `eslint .`, which would lint optimised bundles left
 *     anywhere else in the tree), and
 *   - HMR off, so an edit made elsewhere in the working tree while the
 *     harness runs cannot reload a page halfway through a capture. Each
 *     capture is a fresh page load, so it still picks up the latest files.
 */
import { defineConfig, mergeConfig } from 'vite';
import baseConfig from '../../vite.config';

export default defineConfig(async (env) => {
  const base = typeof baseConfig === 'function' ? await baseConfig(env) : baseConfig;
  return mergeConfig(base, {
    cacheDir: 'node_modules/.vite-visual',
    clearScreen: false,
    server: { hmr: false },
  });
});

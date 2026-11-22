/**
 * Source-level guards for the route files (BUILD-PLAN B2, gap/00 B1).
 *
 * The Done-when for B2 is literally `grep -c "React.createElement(React.lazy"
 * src/routes/index.tsx` = 0; this keeps it that way and also bans the other
 * ways a lazy or a fallback used to be built per route.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const ROUTE_FILES = [
  'src/routes/index.tsx',
  'src/modules/hris/routes.tsx',
  'src/modules/health/routes.tsx',
  'src/modules/legal/routes.tsx',
  'src/modules/refit/routes.tsx',
  'src/modules/new-build/routes.tsx',
];

const count = (source: string, needle: string) => source.split(needle).length - 1;

describe('src/routes/index.tsx', () => {
  const source = read('src/routes/index.tsx');
  const body = source.slice(source.indexOf('export const AppRoutes'));

  it('has no inline React.createElement(React.lazy(...))', () => {
    expect(count(source, 'React.createElement(React.lazy')).toBe(0);
  });

  it('declares no lazy or Suspense of its own; lazyPage provides both', () => {
    expect(count(source, 'React.lazy')).toBe(0);
    expect(count(source, 'Suspense')).toBe(0);
    expect(source).toContain("from '@/app/router/lazyPage'");
  });

  it('carries none of the old per-route fallbacks', () => {
    expect(source).not.toMatch(/Loading\.\.\./);
    expect(source).not.toMatch(/animate-spin/);
    expect(source).not.toMatch(/const LazyLoader/);
  });

  it('mounts the converted modules from the registry, not from their route files (B8)', () => {
    expect(source).not.toMatch(/@\/modules\/(hris|health|legal|refit|new-build)\/routes/);
    expect(source).toContain('{workspaceManifestRoutes}');
    expect(source).toContain("from '@/app/router/manifestRoutes'");
  });

  it('imports pages only at module scope, never inside the route tree', () => {
    expect(body).not.toMatch(/import\(/);
    const imports = Array.from(source.matchAll(/import\('([^']+)'\)/g));
    expect(imports.length).toBeGreaterThan(100);
    for (const line of source.split('\n').filter((l) => l.includes("import('"))) {
      expect(line, line).toMatch(/^const \w+ = (protectedPage|lazyPage)\(\(\) => import\('/);
    }
  });
});

describe('module route files', () => {
  it.each(ROUTE_FILES.slice(1))('%s is route data: no JSX, no React, no router', (file) => {
    const source = read(file);
    expect(source).not.toMatch(/from 'react'|from 'react-router-dom'|<Route\b|<Navigate\b/);
    expect(source).toContain("from '@/app/registry/types'");
  });

  it.each(ROUTE_FILES)('%s builds no lazy or Suspense itself', (file) => {
    const source = read(file);
    expect(source).not.toMatch(/React\.lazy|\blazy\(|Suspense/);
    expect(source).not.toMatch(/animate-spin|Loading\.\.\./);
  });
});

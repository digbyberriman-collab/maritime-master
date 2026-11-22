/**
 * Load Playwright: the project's own copy if one is ever added, else the
 * global install (it is deliberately not a project dependency; adding one
 * means touching both lockfiles, DECISIONS D-16).
 */
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

function npmGlobalRoot() {
  return new Promise((resolve) => {
    execFile('npm', ['root', '-g'], { encoding: 'utf8', timeout: 15_000 }, (error, stdout) => resolve(error ? null : stdout.trim()));
  });
}

export async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    /* not a project dependency: fall through to the global install */
  }
  const candidates = [
    ...(process.env.NODE_PATH ? process.env.NODE_PATH.split(path.delimiter) : []),
    path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules'),
    path.join(path.dirname(process.execPath), 'node_modules'),
  ];
  const npmRoot = await npmGlobalRoot();
  if (npmRoot) candidates.push(npmRoot);
  for (const dir of candidates) {
    try {
      return createRequire(path.join(dir, 'noop.js'))('playwright');
    } catch {
      /* try the next location */
    }
  }
  throw new Error('playwright is not installed. Install it globally: npm i -g playwright && npx playwright install chromium');
}

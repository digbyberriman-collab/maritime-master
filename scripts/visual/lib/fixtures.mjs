/**
 * Fixture loading for the visual harness.
 *
 * Layout (all optional):
 *   fixtures/<table>.json      array of rows answered for /rest/v1/<table>
 *   fixtures/rpc/<fn>.json     value answered for /rest/v1/rpc/<fn>
 *   fixtures/_auth.json        the signed-in auth user (id, email, metadata)
 *   fixtures/_config.json      { "missingTables": ["t"], "missingRpcs": ["fn"] } answered as
 *                              PGRST205 / PGRST202 (table or function not live)
 *   fixtures/_personas.json    named variations, applied per capture (lib/personas.mjs)
 *
 * Relative dates keep fixtures realistic on any day. A string value that is
 * exactly one of these tokens is replaced when the fixtures are loaded:
 *   "$date:+30"   today + 30 days as YYYY-MM-DD   (units: d default, w, m, y)
 *   "$date:-2m"   two months ago
 *   "$ts:-3h"     an ISO timestamp three hours ago (units: m, h, d default)
 *   "$now"        the current ISO timestamp
 * and inside any string, "{year}" becomes the current year (for references
 * such as "INC-DRA-{year}-031", format TYPE-VSL-YYYY-NNN, DECISIONS C21).
 */

import fs from 'node:fs';
import path from 'node:path';

const DATE_TOKEN = /^\$date:([+-]?\d+)([dwmy]?)$/;
const TS_TOKEN = /^\$ts:([+-]?\d+)([mhd]?)$/;

const pad = (n) => String(n).padStart(2, '0');

/** Local-calendar YYYY-MM-DD (date-only strings are local time in STORM). */
export const toDateOnly = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Resolve one token against `now`; non-token values are returned unchanged. */
export function resolveToken(value, now = new Date()) {
  if (typeof value !== 'string') return value;
  if (value.includes('{year}')) return value.replaceAll('{year}', String(now.getFullYear()));
  if (!value.startsWith('$')) return value;
  if (value === '$now') return now.toISOString();
  let m = DATE_TOKEN.exec(value);
  if (m) {
    const n = Number(m[1]);
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    switch (m[2] || 'd') {
      case 'w': d.setDate(d.getDate() + n * 7); break;
      case 'm': d.setMonth(d.getMonth() + n); break;
      case 'y': d.setFullYear(d.getFullYear() + n); break;
      default: d.setDate(d.getDate() + n);
    }
    return toDateOnly(d);
  }
  m = TS_TOKEN.exec(value);
  if (m) {
    const n = Number(m[1]);
    const unitMs = { m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2] || 'd'];
    return new Date(now.getTime() + n * unitMs).toISOString();
  }
  return value;
}

/** Deeply resolve tokens in a JSON value. */
export function resolveTokens(value, now = new Date()) {
  if (Array.isArray(value)) return value.map((v) => resolveTokens(v, now));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveTokens(v, now)]));
  }
  return resolveToken(value, now);
}

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Fixture ${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Load every fixture under `dir`.
 * @returns {{ tables: Record<string, Record<string, unknown>[]>, rpc: Record<string, unknown>, auth: Record<string, unknown> | null, config: { missingTables: string[], missingRpcs: string[] } }}
 */
export function loadFixtures(dir, now = new Date()) {
  const tables = {};
  const rpc = {};
  let auth = null;
  let config = { missingTables: [], missingRpcs: [] };
  if (!fs.existsSync(dir)) return { tables, rpc, auth, config };

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const name = entry.name.slice(0, -'.json'.length);
    const value = resolveTokens(readJson(path.join(dir, entry.name)), now);
    if (name === '_auth') auth = value;
    else if (name === '_config') config = { missingTables: [], missingRpcs: [], ...value };
    else if (name.startsWith('_')) continue;
    else if (!Array.isArray(value)) throw new Error(`Fixture ${entry.name} must be an array of rows`);
    else tables[name] = value;
  }

  const rpcDir = path.join(dir, 'rpc');
  if (fs.existsSync(rpcDir)) {
    for (const entry of fs.readdirSync(rpcDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      rpc[entry.name.slice(0, -'.json'.length)] = resolveTokens(readJson(path.join(rpcDir, entry.name)), now);
    }
  }
  return { tables, rpc, auth, config };
}

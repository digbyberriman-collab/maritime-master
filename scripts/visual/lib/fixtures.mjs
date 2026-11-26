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
 *
 * Overlays (platform-prep PP2): scripts/visual/fixtures.d/<overlay>/ holds a
 * stream's additions in the same layout, so a stream never edits a shared
 * fixture file. They are loaded after the base, in folder-name order:
 *   <table>.json      rows appended; a row with the id of a base row replaces it
 *   rpc/<fn>.json     replaces the base answer
 *   _personas.json    personas added by name (lib/personas.mjs mergePersonas)
 *   _config.json      missingTables / missingRpcs added to the base lists
 * The same row id in two overlays, two overlays answering one RPC, and a
 * persona name defined twice are load errors naming both sources. An
 * overlay never replaces _auth.json.
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

// ---------------------------------------------------------------------------
// Overlays (fixtures.d)
// ---------------------------------------------------------------------------

const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const isNameList = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string' && s.length > 0);
const OVERLAY_NAME = /^[a-z0-9][a-z0-9._-]*$/;

/**
 * The overlay folders under `dir`, in name order. A folder that holds
 * fixture files itself (a `*.json` or an `rpc/` folder) is read as one
 * overlay, so `--overlays` can name a single overlay too. A missing `dir` is
 * no overlays, unless `required` (an explicit `--overlays`).
 * @returns {string[]} absolute overlay folders
 */
export function findOverlays(dir, { required = false } = {}) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    if (required) throw new Error(`Fixture overlays folder ${dir} does not exist`);
    return [];
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const holdsFixtures = entries.some((e) => (e.isFile() && e.name.endsWith('.json')) || (e.isDirectory() && e.name === 'rpc'));
  const folders = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'rpc').map((e) => e.name);
  if (holdsFixtures) {
    if (folders.length) {
      throw new Error(`Fixture overlays folder ${dir} holds both fixture files and overlay folders (${folders.join(', ')}); use one or the other`);
    }
    return [dir];
  }
  return folders.sort().map((name) => path.join(dir, name));
}

/**
 * One overlay folder: tables, RPC answers, `_config.json` lists and the raw
 * `_personas.json` (validated when merged). Anything else starting with `_`
 * (such as `_auth.json`) is refused; files that are not JSON are ignored.
 */
export function loadOverlay(dir, now = new Date()) {
  const name = path.basename(dir);
  const at = `Fixture overlay "${name}"`;
  if (!OVERLAY_NAME.test(name)) throw new Error(`${at}: folder names are lower case letters, digits, dots, dashes and underscores`);
  const tables = {};
  const rpc = {};
  const config = { missingTables: [], missingRpcs: [] };
  let personas = null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name !== 'rpc' && !entry.name.startsWith('.')) throw new Error(`${at}: unexpected folder ${entry.name}/ (only rpc/ is read)`);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const key = entry.name.slice(0, -'.json'.length);
    const value = resolveTokens(readJson(path.join(dir, entry.name)), now);
    if (key === '_config') {
      if (!isPlainObject(value)) throw new Error(`${at}: _config.json must be { "missingTables": [], "missingRpcs": [] }`);
      const unknown = Object.keys(value).filter((k) => k !== 'missingTables' && k !== 'missingRpcs');
      if (unknown.length) throw new Error(`${at}: _config.json has unknown key ${unknown.map((k) => `"${k}"`).join(', ')}`);
      for (const list of ['missingTables', 'missingRpcs']) {
        if (value[list] === undefined) continue;
        if (!isNameList(value[list])) throw new Error(`${at}: _config.json "${list}" must be a list of names`);
        config[list] = [...value[list]];
      }
    } else if (key === '_personas') {
      personas = value;
    } else if (key.startsWith('_')) {
      throw new Error(`${at}: ${entry.name} cannot be overlaid (an overlay adds rows, RPC answers, personas and _config lists)`);
    } else {
      if (!Array.isArray(value) || !value.every(isPlainObject)) throw new Error(`${at}: ${entry.name} must be an array of row objects`);
      const ids = new Set();
      for (const row of value) {
        if (row.id === undefined || row.id === null) continue;
        const id = JSON.stringify(row.id);
        if (ids.has(id)) throw new Error(`${at}: ${entry.name} has two rows with id ${row.id}`);
        ids.add(id);
      }
      tables[key] = value;
    }
  }
  const rpcDir = path.join(dir, 'rpc');
  if (fs.existsSync(rpcDir)) {
    for (const entry of fs.readdirSync(rpcDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      rpc[entry.name.slice(0, -'.json'.length)] = resolveTokens(readJson(path.join(rpcDir, entry.name)), now);
    }
  }
  return { name, dir, tables, rpc, config, personas };
}

/**
 * The base fixtures with the overlays applied, in the order given (a new
 * object; the base is not changed). Returns the merged fixtures, each
 * overlay's raw personas for `mergePersonas`, and the overlay names.
 * @param {ReturnType<typeof loadFixtures>} base
 * @param {ReturnType<typeof loadOverlay>[]} overlays
 */
export function applyOverlays(base, overlays) {
  const tables = Object.fromEntries(Object.entries(base.tables).map(([t, rows]) => [t, [...rows]]));
  const rpc = { ...base.rpc };
  const union = (a = [], b = []) => [...new Set([...a, ...b])];
  const config = {
    ...base.config,
    missingTables: [...(base.config?.missingTables ?? [])],
    missingRpcs: [...(base.config?.missingRpcs ?? [])],
  };
  const rowOwner = new Map();
  const rpcOwner = new Map();
  const personas = [];
  for (const overlay of overlays) {
    for (const [table, rows] of Object.entries(overlay.tables)) {
      const target = tables[table] ?? (tables[table] = []);
      for (const row of rows) {
        if (row.id !== undefined && row.id !== null) {
          const key = `${table}#${JSON.stringify(row.id)}`;
          const prior = rowOwner.get(key);
          if (prior) throw new Error(`Fixture overlays "${prior}" and "${overlay.name}" both set ${table} row id ${row.id}`);
          rowOwner.set(key, overlay.name);
          const at = target.findIndex((r) => r.id === row.id);
          if (at >= 0) {
            target[at] = row;
            continue;
          }
        }
        target.push(row);
      }
    }
    for (const [fn, value] of Object.entries(overlay.rpc)) {
      const prior = rpcOwner.get(fn);
      if (prior) throw new Error(`Fixture overlays "${prior}" and "${overlay.name}" both answer rpc/${fn}.json`);
      rpcOwner.set(fn, overlay.name);
      rpc[fn] = value;
    }
    config.missingTables = union(config.missingTables, overlay.config.missingTables);
    config.missingRpcs = union(config.missingRpcs, overlay.config.missingRpcs);
    if (overlay.personas !== null) personas.push({ source: overlay.name, personas: overlay.personas });
  }
  return { fixtures: { tables, rpc, auth: base.auth, config }, personas, applied: overlays.map((o) => o.name) };
}

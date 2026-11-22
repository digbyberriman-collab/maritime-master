/**
 * Personas: named variations of the base fixtures, for captures that need
 * another user or another state of the data (a vessel-only master, per-vessel
 * module settings, a failed RBAC load).
 *
 * fixtures/_personas.json:
 *   {
 *     "<name>": {
 *       "note": "what it shows",                  optional
 *       "auth": { "id": "…", "email": "…" },      optional: sign in as someone else
 *       "tables": { "<table>": [rows] },          optional: replaces those tables
 *       "rpc": { "<fn>": value },                 optional: replaces those RPC answers
 *       "missingTables": ["<table>"],             optional: answered PGRST205 (not live)
 *       "missingRpcs": ["<fn>"]                   optional: answered PGRST202 (not live)
 *     }
 *   }
 *
 * A persona's table replaces the base table of the same name (rows are not
 * merged one by one), so what a persona shows is all in one place. Missing
 * tables and RPCs add to `_config.json`'s. Date tokens ("$date:+30", "$ts:-3h",
 * "{year}") resolve as in the other fixtures. Pick one per route
 * (`"persona": "<name>"` in routes.json) or for the whole run (`--persona`).
 */

import fs from 'node:fs';
import path from 'node:path';
import { resolveTokens } from './fixtures.mjs';

export const PERSONAS_FILE = '_personas.json';
const PERSONA_KEYS = ['note', 'auth', 'tables', 'rpc', 'missingTables', 'missingRpcs'];
const NAME = /^[a-z0-9][a-z0-9-]*$/;

const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const isStringList = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string' && s.length > 0);

/**
 * Check a parsed `_personas.json`. Throws with the persona and field named.
 * @param {unknown} raw
 * @returns {Record<string, { note?: string, auth?: Record<string, unknown>, tables?: Record<string, Record<string, unknown>[]>, rpc?: Record<string, unknown>, missingTables?: string[], missingRpcs?: string[] }>}
 */
export function validatePersonas(raw) {
  if (!isPlainObject(raw)) throw new Error(`${PERSONAS_FILE} must be an object of personas: { "<name>": { "tables": { … } } }`);
  for (const [name, persona] of Object.entries(raw)) {
    const at = `${PERSONAS_FILE}: persona "${name}"`;
    if (!NAME.test(name)) throw new Error(`${at}: names are lower case letters, digits and dashes`);
    if (!isPlainObject(persona)) throw new Error(`${at} must be an object`);
    const unknown = Object.keys(persona).filter((k) => !PERSONA_KEYS.includes(k));
    if (unknown.length) throw new Error(`${at} has unknown key${unknown.length > 1 ? 's' : ''} ${unknown.map((k) => `"${k}"`).join(', ')}. Use ${PERSONA_KEYS.join(', ')}.`);
    if (persona.note !== undefined && typeof persona.note !== 'string') throw new Error(`${at}: "note" must be a string`);
    if (persona.auth !== undefined && (!isPlainObject(persona.auth) || typeof persona.auth.id !== 'string')) {
      throw new Error(`${at}: "auth" must be an object with an "id"`);
    }
    if (persona.tables !== undefined) {
      if (!isPlainObject(persona.tables)) throw new Error(`${at}: "tables" must be { "<table>": [rows] }`);
      for (const [table, rows] of Object.entries(persona.tables)) {
        if (!Array.isArray(rows) || !rows.every(isPlainObject)) throw new Error(`${at}: table "${table}" must be an array of row objects`);
      }
    }
    if (persona.rpc !== undefined && !isPlainObject(persona.rpc)) throw new Error(`${at}: "rpc" must be { "<fn>": value }`);
    for (const key of ['missingTables', 'missingRpcs']) {
      if (persona[key] !== undefined && !isStringList(persona[key])) throw new Error(`${at}: "${key}" must be a list of names`);
    }
  }
  return /** @type {never} */ (raw);
}

/** Read and validate `<dir>/_personas.json`; {} when there is none. */
export function loadPersonas(dir, now = new Date()) {
  const file = path.join(dir, PERSONAS_FILE);
  if (!fs.existsSync(file)) return {};
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return validatePersonas(resolveTokens(raw, now));
}

/**
 * The fixtures for one capture with `persona` applied (a new object; the
 * base is not changed). `undefined` returns the base as it is.
 * @param {ReturnType<import('./fixtures.mjs').loadFixtures>} base
 * @param {ReturnType<typeof validatePersonas>[string] | undefined} persona
 */
export function applyPersona(base, persona) {
  if (!persona) return base;
  const union = (a = [], b = []) => [...new Set([...a, ...b])];
  return {
    tables: { ...base.tables, ...(persona.tables ?? {}) },
    rpc: { ...base.rpc, ...(persona.rpc ?? {}) },
    auth: persona.auth ? { ...persona.auth } : base.auth,
    config: {
      ...base.config,
      missingTables: union(base.config?.missingTables, persona.missingTables),
      missingRpcs: union(base.config?.missingRpcs, persona.missingRpcs),
    },
  };
}

/**
 * The persona a capture uses: the run's `--persona` wins over the route's
 * own. Throws for a name the personas file does not define.
 * @returns {string | null}
 */
export function personaFor(route, cliPersona, personas) {
  const name = cliPersona ?? route.persona ?? null;
  if (name !== null && !Object.prototype.hasOwnProperty.call(personas, name)) {
    const known = Object.keys(personas);
    throw new Error(`Unknown persona "${name}"${route.slug ? ` (route "${route.slug}")` : ''}. Known: ${known.length ? known.join(', ') : 'none'}.`);
  }
  return name;
}

/**
 * Screenshot base name: the slug, plus `--<persona>` when the run's
 * `--persona` chose a persona the route does not name itself (so it never
 * overwrites the route's ordinary capture).
 */
export function captureName(route, persona) {
  return persona && persona !== route.persona ? `${route.slug}--${persona}` : route.slug;
}

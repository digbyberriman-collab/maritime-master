#!/usr/bin/env node
// Permission Matrix Standard (PMS v1) — catalogue validator + workbook generator.
//
// Reads docs/permissions/catalogues/<app>.json, expands every subcategory into
// capability rows (domain.module.subcategory.action), computes DRAFT role
// defaults from the tier rules below, resolves role-level separation-of-duties
// conflicts, and writes docs/permissions/workbooks/<app>-permission-matrix.xlsx.
//
//   node scripts/permissions/build-matrix-workbooks.mjs            # all apps
//   node scripts/permissions/build-matrix-workbooks.mjs storm       # one app
//   node scripts/permissions/build-matrix-workbooks.mjs --check     # validate only
//
// The build sessions driven by docs/permissions/MASTER-PROMPT.md reuse this
// file's rules and sheet layout for the in-app export/import, so keep the two
// in step.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ExcelJS from 'exceljs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CAT_DIR = path.join(ROOT, 'docs/permissions/catalogues');
const OUT_DIR = path.join(ROOT, 'docs/permissions/workbooks');

export const PMS_VERSION = '1.0';

// ─── Vocabulary ────────────────────────────────────────────────────────────
export const ACTIONS = {
  view_own: 'View own',
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  export: 'Export',
  assign: 'Assign',
  approve: 'Approve',
  final_approve: 'Final approve',
  sign: 'Sign',
  settle: 'Settle',
  admin: 'Administer',
};
const ACTION_ORDER = Object.keys(ACTIONS);

export const BUNDLES = {
  read: ['view'],
  dash: ['view', 'export'],
  doc: ['view', 'create', 'edit', 'delete', 'export'],
  record: ['view', 'create', 'edit', 'delete', 'export'],
  approvable: ['view', 'create', 'edit', 'delete', 'approve', 'final_approve', 'export'],
  config: ['view', 'admin'],
  self: ['view_own'],
};

export const SENSITIVITY = {
  T0: 'Internal',
  T1: 'Operational',
  T2: 'Confidential',
  T3: 'Special category',
};

export const ROLE_TIERS = ['command', 'hod', 'officer', 'rating', 'trainee', 'external', 'admin'];
const DEFAULT_REACH = {
  command: 'unit',
  hod: 'group',
  officer: 'group',
  rating: 'group',
  trainee: 'self',
  external: 'unit',
  admin: 'all',
};
const LEVELS = ['self', 'group', 'unit', 'all'];
export const NONE = '—';

const SUB_FLAGS = [
  'tier', 'owners', 'deptScoped', 'hodVisible', 'hodApproves', 'hodEdits', 'hodAdmin', 'officerApproves',
  'crewCreates', 'crewSigns', 'crewVisible', 'ratingEdits', 'auditVisible', 'auditExport',
  'ownerOnly', 'onlyRoles', 'selfRoles', 'entitlement', 'rls', 'edge', 'alignsWith',
];

// ─── Loading + expansion ───────────────────────────────────────────────────
export function loadCatalogue(appId) {
  const file = path.join(CAT_DIR, `${appId}.json`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function expandActions(spec) {
  const list = Array.isArray(spec) ? spec : [spec];
  const out = [];
  for (const item of list) {
    const expanded = BUNDLES[item] ?? [item];
    for (const a of expanded) if (!out.includes(a)) out.push(a);
  }
  return out.sort((a, b) => ACTION_ORDER.indexOf(a) - ACTION_ORDER.indexOf(b));
}

function inherit(...layers) {
  const merged = {};
  for (const layer of layers) {
    if (!layer) continue;
    for (const flag of SUB_FLAGS) if (layer[flag] !== undefined) merged[flag] = layer[flag];
  }
  return merged;
}

/** Flattens the catalogue into { domains, subcategories, capabilities }. */
export function expand(cat) {
  const subcategories = [];
  const capabilities = [];
  for (const domain of cat.domains) {
    for (const mod of domain.modules) {
      for (const sub of mod.subcategories) {
        const s = {
          ...inherit(cat.defaults, domain.defaults, mod.defaults, sub),
          key: sub.key,
          label: sub.label,
          route: sub.route ?? '',
          domainKey: domain.key,
          domainLabel: domain.label,
          moduleKey: mod.key,
          moduleLabel: mod.label,
          path: `${domain.key}.${mod.key}.${sub.key}`,
          actions: expandActions(sub.actions ?? mod.defaults?.actions ?? domain.defaults?.actions ?? cat.defaults?.actions ?? 'read'),
          actionTiers: sub.actionTiers ?? {},
          labels: sub.labels ?? {},
          legacy: sub.legacy ?? {},
          grants: sub.grants ?? {},
          t3Holders: sub.t3Holders ?? {},
          notes: sub.notes ?? '',
        };
        s.owners = s.owners ?? [];
        s.alignsWith = s.alignsWith ?? '';
        s.tier = s.tier ?? 'T1';
        subcategories.push(s);
        for (const action of s.actions) {
          const tier = s.actionTiers[action] ?? s.tier;
          capabilities.push({
            key: `${s.path}.${action}`,
            sub: s,
            action,
            tier,
            label: s.labels[action] ?? `${ACTIONS[action] ?? action} — ${s.label}`,
            legacy: s.legacy[action] ?? '',
            enforcement: enforcementFor(s, tier),
          });
        }
      }
    }
  }
  return { subcategories, capabilities };
}

function enforcementFor(sub, tier) {
  const points = ['UI'];
  if (tier === 'T2' || tier === 'T3' || sub.rls) points.push('RLS');
  if (sub.edge) points.push('Edge');
  return points.join(' + ');
}

// ─── Validation ────────────────────────────────────────────────────────────
export function validate(cat) {
  const errors = [];
  const { subcategories, capabilities } = expand(cat);
  const deptKeys = new Set(cat.departments.map((d) => d.key));
  const roleKeys = new Set();
  for (const d of cat.departments) {
    for (const r of d.roles) {
      if (roleKeys.has(r.key)) errors.push(`duplicate role key ${r.key}`);
      roleKeys.add(r.key);
      if (!ROLE_TIERS.includes(r.tier)) errors.push(`role ${r.key}: unknown tier ${r.tier}`);
      if (r.reach && !LEVELS.includes(r.reach)) errors.push(`role ${r.key}: unknown reach ${r.reach}`);
      for (const [level, code] of Object.entries(r.levelCodes ?? {})) {
        if (!LEVELS.includes(level)) errors.push(`role ${r.key}: unknown level ${level}`);
        if (!cat.scopes.some((sc) => sc.code === code)) errors.push(`role ${r.key}: levelCodes.${level} → undeclared scope ${code}`);
      }
    }
  }
  for (const level of LEVELS) {
    if (!cat.levels?.[level]) errors.push(`levels.${level} missing`);
  }
  const scopeCodes = new Set(cat.scopes.map((s) => s.code));
  for (const [level, code] of Object.entries(cat.levels ?? {})) {
    if (!scopeCodes.has(code)) errors.push(`levels.${level} → ${code} is not a declared scope`);
  }

  const seen = new Set();
  const legacySeen = new Set();
  const keyPattern = /^[a-z0-9_]+(\.[a-z0-9_]+){3}$/;
  for (const c of capabilities) {
    if (seen.has(c.key)) errors.push(`duplicate capability ${c.key}`);
    seen.add(c.key);
    if (!keyPattern.test(c.key)) errors.push(`bad key format ${c.key}`);
    if (!ACTIONS[c.action]) errors.push(`${c.key}: unknown action ${c.action}`);
    if (!SENSITIVITY[c.tier]) errors.push(`${c.key}: unknown tier ${c.tier}`);
    if (c.legacy) {
      if (legacySeen.has(c.legacy)) errors.push(`legacy key ${c.legacy} mapped twice`);
      legacySeen.add(c.legacy);
    }
  }
  for (const s of subcategories) {
    for (const o of s.owners) if (!deptKeys.has(o)) errors.push(`${s.path}: unknown owner department ${o}`);
    for (const a of Object.keys(s.labels)) if (!s.actions.includes(a)) errors.push(`${s.path}: label for absent action ${a}`);
    for (const a of Object.keys(s.legacy)) if (!s.actions.includes(a)) errors.push(`${s.path}: legacy for absent action ${a}`);
    for (const a of Object.keys(s.actionTiers)) if (!s.actions.includes(a)) errors.push(`${s.path}: tier for absent action ${a}`);
    for (const [a, g] of Object.entries(s.grants)) {
      if (!s.actions.includes(a)) errors.push(`${s.path}: grants for absent action ${a}`);
      const roles = Array.isArray(g) ? g : Object.keys(g);
      for (const r of roles) if (!roleKeys.has(r)) errors.push(`${s.path}: grant to unknown role ${r}`);
    }
    for (const r of Object.keys(s.t3Holders)) if (!roleKeys.has(r)) errors.push(`${s.path}: t3Holder unknown role ${r}`);
    for (const r of s.onlyRoles ?? []) if (!roleKeys.has(r)) errors.push(`${s.path}: onlyRoles unknown role ${r}`);
    for (const r of s.selfRoles ?? []) if (!roleKeys.has(r)) errors.push(`${s.path}: selfRoles unknown role ${r}`);
    if (s.crewCreates && !['self', 'group'].includes(s.crewCreates)) errors.push(`${s.path}: crewCreates must be self|group`);
  }
  for (const rule of cat.separationOfDuties ?? []) {
    for (const k of [rule.a, rule.b]) if (!seen.has(k)) errors.push(`SoD ${rule.id}: unknown capability ${k}`);
    if (!['role', 'record'].includes(rule.level)) errors.push(`SoD ${rule.id}: level must be role|record`);
  }
  for (const set of cat.accessSets ?? []) {
    if (!ROLE_TIERS.includes(set.tier)) errors.push(`access set ${set.key}: unknown tier ${set.tier}`);
  }
  return { errors, subcategories, capabilities };
}

// ─── Draft defaults ────────────────────────────────────────────────────────
function scopeIndex(cat, code) {
  return cat.scopes.findIndex((s) => s.code === code);
}
function widest(cat, codes) {
  let best = NONE;
  for (const c of codes) {
    if (c === NONE) continue;
    if (best === NONE || scopeIndex(cat, c) > scopeIndex(cat, best)) best = c;
  }
  return best;
}

/**
 * Tier rules. `owned` = the role's department owns the subcategory.
 * Returns a scope code or NONE for one capability.
 */
export function ruleValue(cat, role, owned, sub, action, tier) {
  // A role may remap levels, e.g. a contractor's "group" is their own company.
  const L = { ...cat.levels, ...(role.levelCodes ?? {}) };
  const reachLevel = role.reach ?? DEFAULT_REACH[role.tier];
  const reach = L[reachLevel];
  const wide = reachLevel === 'all';
  // Inside an owned area a fleet-wide role's "department" is the whole fleet.
  // Outside it, a shore role has no vessel department, so department-level
  // grants collapse to none rather than silently widening to the fleet.
  const grp = wide ? L.all : L.group;
  const grpOther = wide ? NONE : L.group;
  const unit = wide ? L.all : L.unit;

  if (sub.onlyRoles && !sub.onlyRoles.includes(role.key)) return NONE;
  if (action === 'view_own') {
    if (sub.selfRoles) return sub.selfRoles.includes(role.key) ? L.self : NONE;
    return role.tier === 'external' ? NONE : L.self;
  }

  if (tier === 'T3') {
    const held = sub.t3Holders?.[role.key];
    if (held) return held.includes(action) ? reach : NONE;
    if (!owned) return NONE;
  }
  if (sub.ownerOnly && !owned && role.tier !== 'command') return NONE;

  const crewCreate = sub.crewCreates === 'self' ? L.self : sub.crewCreates === 'group' ? grpOther : NONE;

  switch (role.tier) {
    case 'admin':
      if (owned || action === 'admin') return reach;
      if (action === 'view' && (tier === 'T0' || tier === 'T1')) return reach;
      return NONE;
    case 'command':
      return reach;
    case 'hod':
      // Owned + department-scoped → own department (or the role's explicit
      // reach); owned area-wide → the whole vessel (fleet for shore roles).
      if (owned) {
        if (action === 'final_approve') return NONE;
        return sub.deptScoped ? reach : widest(cat, [reach, unit]);
      }
      if (action === 'view') {
        if (tier === 'T0') return unit;
        if (tier === 'T1') return sub.deptScoped ? grpOther : unit;
        if (tier === 'T2') return sub.hodVisible ? grpOther : NONE;
        return NONE;
      }
      if (action === 'approve' && sub.hodApproves) return grpOther;
      if ((action === 'create' || action === 'edit') && sub.hodEdits) return grpOther;
      if (action === 'admin' && sub.hodAdmin) return grpOther;
      if (action === 'create') return crewCreate;
      if (action === 'sign' && sub.crewSigns) return L.self;
      return NONE;
    case 'officer':
      if (owned) {
        if (action === 'view') return unit;
        if (['create', 'edit', 'export', 'sign'].includes(action)) return grp;
        if (action === 'approve') return sub.officerApproves ? grp : NONE;
        return NONE;
      }
      if (action === 'view') {
        if (tier === 'T0') return unit;
        if (tier === 'T1') return sub.deptScoped ? grpOther : unit;
        return NONE;
      }
      if (action === 'create') return crewCreate;
      if (action === 'sign' && sub.crewSigns) return L.self;
      return NONE;
    case 'rating':
      if (owned) {
        if (action === 'view') return tier === 'T2' ? NONE : grp;
        if (action === 'create') return sub.ratingEdits ? grp : crewCreate;
        if (action === 'edit') return sub.ratingEdits ? grp : NONE;
        if (action === 'sign') return sub.crewSigns || sub.ratingEdits ? L.self : NONE;
        return NONE;
      }
      if (action === 'view') {
        if (tier === 'T0') return unit;
        if (tier === 'T1') return sub.crewVisible ? unit : NONE;
        return NONE;
      }
      if (action === 'create') return crewCreate;
      if (action === 'sign' && sub.crewSigns) return L.self;
      return NONE;
    case 'trainee':
      if (action === 'view') {
        if (tier === 'T0') return L.unit;
        if (tier === 'T1' && sub.crewVisible) return L.unit;
        return NONE;
      }
      if (action === 'create' && sub.crewCreates === 'self') return L.self;
      if (action === 'sign' && sub.crewSigns) return L.self;
      return NONE;
    case 'external':
      if (!sub.auditVisible || tier === 'T3') return NONE;
      if (action === 'view') return reach;
      if (action === 'export' && sub.auditExport) return reach;
      return NONE;
    default:
      return NONE;
  }
}

/**
 * Explicit grants. Array form is exclusive: listed roles get their reach,
 * everyone else none. Object form overrides only the listed roles
 * ({ role: code }); unlisted roles fall through to the tier rules.
 */
function explicitValue(role, sub, action) {
  const g = sub.grants?.[action];
  if (!g) return undefined;
  if (Array.isArray(g)) return g.includes(role.key) ? 'reach' : NONE;
  return g[role.key];
}

/** Values for one role across all of one subcategory's actions. */
function subcategoryValues(cat, role, dept, sub) {
  const owned = sub.owners.includes(dept.key);
  const values = {};
  for (const action of sub.actions) {
    const tier = sub.actionTiers[action] ?? sub.tier;
    const explicit = explicitValue(role, sub, action);
    if (explicit === 'reach') values[action] = { ...cat.levels, ...(role.levelCodes ?? {}) }[role.reach ?? DEFAULT_REACH[role.tier]];
    else if (explicit !== undefined) values[action] = explicit;
    else values[action] = ruleValue(cat, role, owned, sub, action, tier);
  }
  // Dependency: any grant on a subcategory implies at least that reach of view.
  if (sub.actions.includes('view') && values.view === NONE) {
    const others = sub.actions.filter((a) => a !== 'view' && a !== 'view_own').map((a) => values[a]);
    const w = widest(cat, others);
    if (w !== NONE) values.view = w;
  }
  return values;
}

/**
 * Computes the draft role matrix. Returns
 *   matrix: Map<roleKey, Map<capKey, code>>
 *   sod:    [{ rule, affected: [{ role, kept, dropped }] }]
 */
export function computeDefaults(cat, subcategories) {
  const matrix = new Map();
  for (const dept of cat.departments) {
    for (const role of dept.roles) {
      const row = new Map();
      for (const sub of subcategories) {
        const values = subcategoryValues(cat, role, dept, sub);
        for (const [action, v] of Object.entries(values)) row.set(`${sub.path}.${action}`, v);
      }
      matrix.set(role.key, row);
    }
  }
  const sod = [];
  const roleByKey = new Map(cat.departments.flatMap((d) => d.roles.map((r) => [r.key, r])));
  for (const rule of cat.separationOfDuties ?? []) {
    const affected = [];
    if (rule.level === 'role') {
      const approverTiers = rule.approverTiers ?? ['command'];
      const approverSide = rule.approverSide ?? 'a';
      for (const [roleKey, row] of matrix) {
        if (row.get(rule.a) === NONE || row.get(rule.b) === NONE) continue;
        const role = roleByKey.get(roleKey);
        const keepSide = approverTiers.includes(role.tier) ? approverSide : approverSide === 'a' ? 'b' : 'a';
        const dropKey = keepSide === 'a' ? rule.b : rule.a;
        row.set(dropKey, NONE);
        affected.push({ role: role.label, kept: keepSide === 'a' ? rule.a : rule.b, dropped: dropKey });
      }
    }
    sod.push({ rule, affected });
  }
  return { matrix, sod };
}

/** Values for an access set (abstract member, own area vs other areas). */
function accessSetValues(cat, set, subcategories) {
  const role = { key: `set:${set.key}`, tier: set.tier, reach: set.reach, levelCodes: set.levelCodes };
  const own = new Map();
  const other = new Map();
  for (const sub of subcategories) {
    for (const [owned, target] of [[true, own], [false, other]]) {
      const values = {};
      for (const action of sub.actions) {
        const tier = sub.actionTiers[action] ?? sub.tier;
        values[action] = ruleValue(cat, role, owned, sub, action, tier);
      }
      if (sub.actions.includes('view') && values.view === NONE) {
        const w = widest(cat, sub.actions.filter((a) => a !== 'view' && a !== 'view_own').map((a) => values[a]));
        if (w !== NONE) values.view = w;
      }
      for (const [a, v] of Object.entries(values)) target.set(`${sub.path}.${a}`, v);
    }
  }
  return { own, other };
}

// ─── Workbook styling (Abyss / Deep / Slate / Drift / Signal) ──────────────
const C = {
  abyss: 'FF0A0E14',
  deep: 'FF111722',
  slate: 'FF1C2533',
  drift: 'FF8A94A6',
  signal: 'FF00AFE6',
  white: 'FFFFFFFF',
  subRow: 'FFE6EAF0',
  t2: 'FFFFF1D6',
  t3: 'FFFFDCC2',
  t3Text: 'FFB45309',
  scopeFill: { F: 'FF7FD7F2', G: 'FF7FD7F2', A: 'FF7FD7F2', V: 'FFB3E7F7', E: 'FFB3E7F7', P: 'FFD6F2FB', D: 'FFD6F2FB', C: 'FFE6F6FC', S: 'FFEEF1F4' },
};
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thin = { style: 'thin', color: { argb: 'FFD0D5DD' } };
const border = { top: thin, left: thin, bottom: thin, right: thin };

function titleRow(ws, text, span) {
  const row = ws.addRow([text]);
  ws.mergeCells(row.number, 1, row.number, span);
  row.height = 26;
  row.getCell(1).font = { bold: true, size: 14, color: { argb: C.white } };
  row.getCell(1).fill = fill(C.abyss);
  row.getCell(1).alignment = { vertical: 'middle', indent: 1 };
  return row;
}

function headerRow(ws, values) {
  const row = ws.addRow(values);
  row.height = 32;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: C.white } };
    cell.fill = fill(C.slate);
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = border;
  });
  return row;
}

function bandRow(ws, label, span, level, kind) {
  const values = Array(span).fill('');
  values[0] = label;
  const row = ws.addRow(values);
  row.outlineLevel = level;
  const colours = { domain: [C.deep, C.white], module: [C.slate, C.white], sub: [C.subRow, C.abyss] };
  const [bg, fg] = colours[kind];
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = fill(bg);
    cell.font = { bold: true, color: { argb: fg } };
  });
  return row;
}

function styleTierCell(cell, tier) {
  if (tier === 'T2') cell.fill = fill(C.t2);
  if (tier === 'T3') {
    cell.fill = fill(C.t3);
    cell.font = { bold: true, color: { argb: C.t3Text } };
  }
}

function addScopeValidation(ws, cat, range) {
  const list = [NONE, ...cat.scopes.map((s) => s.code)].join(',');
  ws.dataValidations.add(range, {
    type: 'list',
    allowBlank: true,
    formulae: [`"${list}"`],
    showErrorMessage: true,
    errorTitle: 'PMS scope value',
    error: `Use one of: ${list}`,
  });
  const rules = cat.scopes.map((s, i) => ({
    type: 'cellIs',
    operator: 'equal',
    formulae: [`"${s.code}"`],
    priority: i + 1,
    style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: C.scopeFill[s.code] ?? 'FFEEF1F4' } } },
  }));
  ws.addConditionalFormatting({ ref: range, rules });
}

function colLetter(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Writes the grouped capability rows with one value column per `columns`. */
function writeGroupedMatrix(ws, cat, subcategories, columns, valueFor) {
  const span = 3 + columns.length + 1;
  let lastDomain = null;
  let lastModule = null;
  let firstDataRow = null;
  for (const sub of subcategories) {
    if (sub.domainKey !== lastDomain) {
      bandRow(ws, sub.domainLabel.toUpperCase(), span, 0, 'domain');
      lastDomain = sub.domainKey;
      lastModule = null;
    }
    if (sub.moduleKey !== lastModule) {
      bandRow(ws, `${sub.domainLabel} › ${sub.moduleLabel}`, span, 1, 'module');
      lastModule = sub.moduleKey;
    }
    const subRow = bandRow(ws, sub.label + (sub.owners.length ? `   (owner: ${sub.owners.join(', ')})` : ''), span, 2, 'sub');
    subRow.getCell(1).font = { bold: true, color: { argb: C.abyss } };
    for (const action of sub.actions) {
      const key = `${sub.path}.${action}`;
      const tier = sub.actionTiers[action] ?? sub.tier;
      const label = sub.labels[action] ?? ACTIONS[action];
      const row = ws.addRow([key, label, tier, ...columns.map((col) => valueFor(col, key)), '']);
      row.outlineLevel = 3;
      firstDataRow ??= row.number;
      row.getCell(1).font = { color: { argb: C.drift }, size: 9 };
      styleTierCell(row.getCell(3), tier);
      for (let i = 0; i < columns.length; i++) {
        const cell = row.getCell(4 + i);
        cell.alignment = { horizontal: 'center' };
        cell.border = border;
      }
    }
  }
  const lastRow = ws.rowCount;
  if (columns.length && firstDataRow) {
    addScopeValidation(ws, cat, `D${firstDataRow}:${colLetter(3 + columns.length)}${lastRow}`);
  }
}

// ─── Sheets ────────────────────────────────────────────────────────────────
function readmeSheet(wb, cat, stats) {
  const ws = wb.addWorksheet('README', { properties: { tabColor: { argb: C.signal } } });
  ws.columns = [{ width: 28 }, { width: 110 }];
  titleRow(ws, `${cat.app.name} — Permission Matrix (PMS v${PMS_VERSION})`, 2);
  const lines = [
    ['Status', `${cat.app.status} — generated ${new Date().toISOString().slice(0, 10)} from docs/permissions/catalogues/${cat.app.id}.json. Draft role defaults are rule-based and MUST be reviewed.`],
    ['Repository', cat.app.repo],
    ['Coverage', `${stats.domains} domains · ${stats.modules} modules · ${stats.subcategories} subcategories · ${stats.capabilities} capabilities (${stats.t2} T2, ${stats.t3} T3) · ${stats.departments} departments · ${stats.roles} roles`],
    [],
    ['HOW TO USE', ''],
    ['1. Catalogue', 'Every capability, grouped Domain › Module › Subcategory (use the outline +/- buttons on the left to collapse). Do not edit keys here — propose catalogue changes in the Change Log.'],
    ['2. Access Sets', 'Reusable bundles (Full, HOD, Officer, Crew…). Each set shows its value for areas the member\'s own department owns vs other areas.'],
    ['3. Dept – <Name>', 'One sheet per department. Columns are that department\'s ranks/roles; rows are capabilities. Change a cell using the dropdown. These are the role DEFAULTS; individual people get an access set plus overrides in the app.'],
    ['4. Separation of Duties', 'Conflicting capability pairs. "role" rules are enforced on grants; "record" rules are enforced per record (e.g. nobody approves their own submission).'],
    ['5. People', 'Filled by the in-app export only (person × capability, long format). Import applies changes via Review & save.'],
    ['6. Sign-off / Change Log', 'Each department head / DPA signs off their sheet; every change is logged with a reason.'],
    [],
    ['SCOPE VALUES', ''],
    [NONE, 'No access'],
    ...cat.scopes.map((s) => [s.code, `${s.label} — ${s.description}`]),
    [],
    ['SENSITIVITY', ''],
    ...Object.entries(SENSITIVITY).map(([k, v]) => [k, `${v} — ${cat.sensitivityNotes?.[k] ?? ''}`]),
    [],
    ['ACTIONS', ''],
    ...Object.entries(ACTIONS).map(([k, v]) => [k, `${v} — ${cat.actionNotes?.[k] ?? ''}`]),
    [],
    ['RULES', ''],
    ['Dependencies', 'Any action on a subcategory implies at least that reach of View. Edit on T3 requires View on T3.'],
    ['Deny wins', 'An explicit deny override beats every grant.'],
    ['T3', 'Special-category data is never granted by preset alone outside the owning department; every T3 grant needs a recorded reason.'],
    ['Self-serve', 'View own (S) is always available for a person\'s own record (MLC: own hours of rest, own medical record).'],
  ];
  for (const line of lines) {
    const row = ws.addRow(line);
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    if (line.length === 2 && line[1] === '') row.getCell(1).font = { bold: true, color: { argb: C.signal } };
    else row.getCell(1).font = { bold: true };
  }
}

function catalogueSheet(wb, cat, subcategories) {
  const ws = wb.addWorksheet('Catalogue', { views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }], properties: { outlineProperties: { summaryBelow: false } } });
  const headers = ['Key', 'Capability', 'Tier', 'Action', 'Domain', 'Module', 'Subcategory', 'Owner depts', 'Dept-scoped', 'Route', 'Enforcement', 'Requires module', 'Legacy key', 'Aligns with', 'Notes'];
  ws.columns = [52, 44, 7, 13, 16, 22, 30, 24, 11, 34, 14, 14, 30, 30, 40].map((width) => ({ width }));
  titleRow(ws, `${cat.app.name} — Capability Catalogue`, headers.length);
  headerRow(ws, headers);
  let lastDomain = null;
  let lastModule = null;
  for (const sub of subcategories) {
    if (sub.domainKey !== lastDomain) {
      bandRow(ws, sub.domainLabel.toUpperCase(), headers.length, 0, 'domain');
      lastDomain = sub.domainKey;
      lastModule = null;
    }
    if (sub.moduleKey !== lastModule) {
      bandRow(ws, `${sub.domainLabel} › ${sub.moduleLabel}`, headers.length, 1, 'module');
      lastModule = sub.moduleKey;
    }
    bandRow(ws, sub.label, headers.length, 2, 'sub');
    for (const action of sub.actions) {
      const tier = sub.actionTiers[action] ?? sub.tier;
      const row = ws.addRow([
        `${sub.path}.${action}`,
        sub.labels[action] ?? `${ACTIONS[action]} — ${sub.label}`,
        tier,
        action,
        sub.domainLabel,
        sub.moduleLabel,
        sub.label,
        sub.owners.join(', '),
        sub.deptScoped ? 'yes' : '',
        sub.route,
        enforcementFor(sub, tier),
        sub.entitlement ?? '',
        sub.legacy[action] ?? '',
        sub.alignsWith,
        sub.notes,
      ]);
      row.outlineLevel = 3;
      styleTierCell(row.getCell(3), tier);
    }
  }
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: headers.length } };
}

function accessSetsSheet(wb, cat, subcategories) {
  const sets = cat.accessSets ?? [];
  const ws = wb.addWorksheet('Access Sets', { views: [{ state: 'frozen', xSplit: 3, ySplit: 3 }], properties: { outlineProperties: { summaryBelow: false } } });
  const columns = sets.flatMap((s) => [{ set: s, own: true }, { set: s, own: false }]);
  ws.columns = [{ width: 52 }, { width: 36 }, { width: 7 }, ...columns.map(() => ({ width: 11 })), { width: 30 }];
  titleRow(ws, `${cat.app.name} — Access Sets (DRAFT)`, 3 + columns.length + 1);
  const top = ws.addRow(['', '', '', ...columns.map((c) => (c.own ? c.set.label : '')), '']);
  for (let i = 0; i < sets.length; i++) ws.mergeCells(top.number, 4 + i * 2, top.number, 5 + i * 2);
  top.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: C.white } };
    cell.fill = fill(C.deep);
    cell.alignment = { horizontal: 'center' };
  });
  headerRow(ws, ['Key', 'Capability', 'Tier', ...columns.map((c) => (c.own ? 'Own dept area' : 'Other areas')), 'Notes']);
  const values = new Map(sets.map((s) => [s.key, accessSetValues(cat, s, subcategories)]));
  writeGroupedMatrix(ws, cat, subcategories, columns, (col, key) => {
    const v = values.get(col.set.key);
    return (col.own ? v.own : v.other).get(key);
  });
}

function departmentSheet(wb, cat, dept, subcategories, matrix) {
  const name = `Dept – ${dept.label}`.slice(0, 31).replace(/[\\/?*[\]:]/g, '-');
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', xSplit: 3, ySplit: 3 }], properties: { outlineProperties: { summaryBelow: false } } });
  const roles = dept.roles;
  ws.columns = [{ width: 52 }, { width: 36 }, { width: 7 }, ...roles.map(() => ({ width: 14 })), { width: 30 }];
  titleRow(ws, `${cat.app.name} — ${dept.label}${dept.description ? ` · ${dept.description}` : ''} (DRAFT role defaults)`, 3 + roles.length + 1);
  const tierRow = ws.addRow(['', '', '', ...roles.map((r) => `${r.tier}${r.reach ? ` · ${r.reach}` : ''}${r.appRole ? `\n${r.appRole}` : ''}`), '']);
  tierRow.height = 28;
  tierRow.eachCell((cell) => {
    cell.font = { size: 9, color: { argb: C.white } };
    cell.fill = fill(C.deep);
    cell.alignment = { horizontal: 'center', wrapText: true };
  });
  headerRow(ws, ['Key', 'Capability', 'Tier', ...roles.map((r) => r.label), 'Reviewer notes']);
  writeGroupedMatrix(ws, cat, subcategories, roles, (role, key) => matrix.get(role.key).get(key));
}

function sodSheet(wb, cat, sod) {
  const ws = wb.addWorksheet('Separation of Duties', { views: [{ state: 'frozen', ySplit: 2 }] });
  ws.columns = [10, 50, 50, 9, 60, 60].map((width) => ({ width }));
  titleRow(ws, `${cat.app.name} — Separation of Duties`, 6);
  headerRow(ws, ['Rule', 'Capability A', 'Capability B', 'Level', 'Rule', 'Draft resolution (roles that held both)']);
  for (const { rule, affected } of sod) {
    const resolution = rule.level === 'record'
      ? 'Enforced per record in code (same person cannot do A and B on one record).'
      : affected.length
        ? affected.map((a) => `${a.role}: kept ${a.kept.split('.').pop()}, removed ${a.dropped.split('.').pop()}`).join('\n')
        : 'No role held both.';
    const row = ws.addRow([rule.id, rule.a, rule.b, rule.level, rule.description, resolution]);
    row.alignment = { wrapText: true, vertical: 'top' };
  }
}

function peopleSheet(wb, cat) {
  const ws = wb.addWorksheet('People', { views: [{ state: 'frozen', ySplit: 3 }] });
  const headers = ['Person', 'Email', cat.unitLabel ?? 'Vessel', 'Department', 'Rank / role', 'Access set', 'Capability key', 'Value', 'Source (set / override)', 'Reason', 'Valid until'];
  ws.columns = [24, 30, 18, 18, 20, 16, 52, 8, 20, 36, 12].map((width) => ({ width }));
  titleRow(ws, `${cat.app.name} — People (filled by in-app export; long format, one row per effective grant)`, headers.length);
  const note = ws.addRow(['Leave blank in the draft. The app export writes one row per person × capability; the import diffs these rows against live grants and stages them for Review & save.']);
  ws.mergeCells(note.number, 1, note.number, headers.length);
  note.getCell(1).font = { italic: true, color: { argb: C.drift } };
  headerRow(ws, headers);
}

function signOffSheet(wb, cat) {
  const ws = wb.addWorksheet('Sign-off');
  ws.columns = [26, 26, 26, 18, 14, 50].map((width) => ({ width }));
  titleRow(ws, `${cat.app.name} — Sign-off`, 6);
  headerRow(ws, ['Department / area', 'Reviewer', 'Reviewer role', 'Decision', 'Date', 'Notes']);
  const first = ws.rowCount + 1;
  for (const d of cat.departments) ws.addRow([d.label, '', d.signOffBy ?? '', '', '', '']);
  for (const extra of cat.signOffExtras ?? []) ws.addRow([extra.area, '', extra.by, '', '', '']);
  ws.dataValidations.add(`D${first}:D${ws.rowCount}`, {
    type: 'list',
    allowBlank: true,
    formulae: ['"Approved,Changes requested,Not applicable"'],
  });
}

function changeLogSheet(wb, cat) {
  const ws = wb.addWorksheet('Change Log');
  ws.columns = [12, 8, 22, 52, 20, 8, 8, 20, 50].map((width) => ({ width }));
  titleRow(ws, `${cat.app.name} — Change Log`, 9);
  headerRow(ws, ['Date', 'Version', 'Sheet', 'Capability key', 'Role / set / person', 'From', 'To', 'Changed by', 'Reason']);
  ws.addRow([new Date().toISOString().slice(0, 10), `PMS ${PMS_VERSION}`, 'All', '', '', '', '', 'generator', 'Initial DRAFT generated from catalogue']);
}

export async function buildWorkbook(cat, outFile) {
  const { errors, subcategories, capabilities } = validate(cat);
  if (errors.length) throw new Error(`${cat.app.id}: ${errors.length} catalogue errors:\n  ${errors.join('\n  ')}`);
  const { matrix, sod } = computeDefaults(cat, subcategories);
  const stats = {
    domains: new Set(subcategories.map((s) => s.domainKey)).size,
    modules: new Set(subcategories.map((s) => `${s.domainKey}.${s.moduleKey}`)).size,
    subcategories: subcategories.length,
    capabilities: capabilities.length,
    t2: capabilities.filter((c) => c.tier === 'T2').length,
    t3: capabilities.filter((c) => c.tier === 'T3').length,
    departments: cat.departments.length,
    roles: cat.departments.reduce((n, d) => n + d.roles.length, 0),
  };
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PMS workbook generator';
  wb.created = new Date();
  readmeSheet(wb, cat, stats);
  catalogueSheet(wb, cat, subcategories);
  accessSetsSheet(wb, cat, subcategories);
  for (const dept of cat.departments) departmentSheet(wb, cat, dept, subcategories, matrix);
  sodSheet(wb, cat, sod);
  peopleSheet(wb, cat);
  signOffSheet(wb, cat);
  changeLogSheet(wb, cat);
  if (outFile) await wb.xlsx.writeFile(outFile);
  return { stats, sod, wb };
}

// ─── CLI ───────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');
  const requested = args.filter((a) => !a.startsWith('--'));
  const apps = requested.length
    ? requested
    : fs.readdirSync(CAT_DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let failed = false;
  for (const appId of apps) {
    const cat = loadCatalogue(appId);
    const { errors, capabilities, subcategories } = validate(cat);
    if (errors.length) {
      failed = true;
      console.error(`✗ ${appId}: ${errors.length} error(s)\n  ${errors.join('\n  ')}`);
      continue;
    }
    if (checkOnly) {
      console.log(`✓ ${appId}: ${subcategories.length} subcategories, ${capabilities.length} capabilities`);
      continue;
    }
    const out = path.join(OUT_DIR, `${appId}-permission-matrix.xlsx`);
    const { stats, sod } = await buildWorkbook(cat, out);
    const resolved = sod.reduce((n, s) => n + s.affected.length, 0);
    console.log(`✓ ${appId}: ${stats.capabilities} capabilities (${stats.t2} T2 / ${stats.t3} T3), ${stats.roles} roles in ${stats.departments} departments, ${resolved} SoD conflicts resolved → ${path.relative(ROOT, out)}`);
  }
  if (failed) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

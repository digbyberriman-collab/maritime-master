/**
 * The fleet access areas (D-X5-21): each area's rule in SQL
 * `fleet_ops_can_for()` is the useCan adaptor's rule for the capability key
 * the client gates the same data with, so the page gate and the server
 * agree (D-04). Pinned three ways: the TS map against `ruleForCapability`
 * and the catalogue, the nav role lists against `MODULE_ACCESS` in
 * AuthContext.tsx (canAccessModule's legacy fallback), and the migration's
 * area list, module CASE and nav block against the TS map.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ruleForCapability } from '@/lib/permissions/adaptor';
import { getCatalogueEntry } from '@/lib/permissions/catalogue';
import { parseCapabilityKey } from '@/lib/permissions/types';
import {
  EXPIRY_READ_AREAS,
  FLEET_OPS_AREAS,
  FLEET_OPS_AREA_CAPABILITY,
  FLEET_OPS_AREA_LEGACY_FLAGS,
  FLEET_OPS_AREA_RULES,
  FLEET_OPS_LEVELS,
  FLEET_OPS_NAV_MODULE,
  FLEET_OPS_NAV_ROLES,
  fleetOpsCapability,
  isFleetOpsArea,
  isFleetOpsLevel,
  type FleetOpsArea,
} from '@/modules/fleet/lib/fleetOpsAccess';

const root = process.cwd();
const SQL = readFileSync(join(root, 'supabase/migrations/20261124040000_fleet_expiry_engine.sql'), 'utf8');
const AUTH = readFileSync(join(root, 'src/modules/auth/contexts/AuthContext.tsx'), 'utf8');

/** The body of fleet_ops_can_for in the migration. */
const FOR_BODY = SQL.slice(
  SQL.indexOf('CREATE OR REPLACE FUNCTION public.fleet_ops_can_for'),
  SQL.indexOf('CREATE OR REPLACE FUNCTION public.fleet_ops_can(_company_id'),
);

const quoted = (text: string) => Array.from(text.matchAll(/'([a-z_]+)'/g), (m) => m[1]);

/** `'key': ['a', 'b']` entries of a TS object literal named `name` in AuthContext.tsx. */
function authMap(name: string): Record<string, string[] | string> {
  const start = AUTH.indexOf(`const ${name}`);
  expect(start, `${name} is in AuthContext.tsx`).toBeGreaterThanOrEqual(0);
  const body = AUTH.slice(start, AUTH.indexOf('};', start));
  const out: Record<string, string[] | string> = {};
  for (const m of body.matchAll(/'([a-z-]+)':\s*(\[[^\]]*\]|'[a-z_]+')/g)) {
    out[m[1]] = m[2].startsWith('[') ? quoted(m[2]) : m[2].slice(1, -1);
  }
  return out;
}

const RBAC_AREAS = FLEET_OPS_AREAS.filter((a) => FLEET_OPS_AREA_RULES[a].kind === 'rbac');

describe('the areas', () => {
  it('are the areas fleet_ops_can_for answers for', () => {
    const list = FOR_BODY.match(/_area NOT IN \(([^)]*)\)/)?.[1] ?? '';
    expect(quoted(list)).toEqual([...FLEET_OPS_AREAS]);
    expect(quoted(FOR_BODY.match(/_level NOT IN \(([^)]*)\)/)?.[1] ?? '')).toEqual([...FLEET_OPS_LEVELS]);
  });

  it('each has a rule and a capability key', () => {
    for (const area of FLEET_OPS_AREAS) {
      expect(FLEET_OPS_AREA_RULES[area]).toBeDefined();
      expect(fleetOpsCapability(area)).toBe(FLEET_OPS_AREA_CAPABILITY[area]);
    }
  });

  it('the expiry read areas are the registry CHECK and a subset of the areas', () => {
    const at = SQL.indexOf('expiry_sources_read_area_check CHECK');
    expect(quoted(SQL.slice(at).match(/IN \(([^)]*)\)/)?.[1] ?? '').sort()).toEqual([...EXPIRY_READ_AREAS].sort());
    for (const a of EXPIRY_READ_AREAS) expect(isFleetOpsArea(a)).toBe(true);
  });

  it('guards narrow', () => {
    expect(isFleetOpsArea('certificates')).toBe(true);
    expect(isFleetOpsArea('payroll')).toBe(false);
    expect(isFleetOpsLevel('admin')).toBe(true);
    expect(isFleetOpsLevel('delete')).toBe(false);
  });
});

describe('each area’s rule is the adaptor’s rule for its capability key', () => {
  it.each(FLEET_OPS_AREAS.map((a) => [a] as [FleetOpsArea]))('%s', (area) => {
    const key = FLEET_OPS_AREA_CAPABILITY[area];
    const parsed = parseCapabilityKey(key);
    expect(parsed, `${key} parses`).not.toBeNull();
    if (!parsed) return;
    const entry = getCatalogueEntry(parsed.path);
    expect(entry, `${parsed.path} is in the catalogue`).toBeDefined();
    expect(entry?.actions).toContain(parsed.action);
    expect(ruleForCapability(parsed.path, parsed.modulePath, parsed.action)).toEqual(FLEET_OPS_AREA_RULES[area]);
    // The catalogue's legacy flag for that action is the one SQL honours too.
    expect(entry?.legacy[parsed.action]).toBe(FLEET_OPS_AREA_LEGACY_FLAGS[area]);
  });

  it('medical admin is the admin action; every other area gates on view', () => {
    for (const area of FLEET_OPS_AREAS) {
      expect(parseCapabilityKey(FLEET_OPS_AREA_CAPABILITY[area])?.action).toBe(area === 'medical_admin' ? 'admin' : 'view');
    }
  });

  it('the SQL honours each legacy flag at view', () => {
    for (const [area, flag] of Object.entries(FLEET_OPS_AREA_LEGACY_FLAGS)) {
      expect(FOR_BODY, `${area}: ${flag}`).toContain(`user_has_permission(_user_id, '${flag}', 'view'::public.permission_level, _vessel_id)`);
    }
  });
});

describe('the SQL area rules', () => {
  it('use the rule’s RBAC module for every RBAC area', () => {
    const block = FOR_BODY.slice(FOR_BODY.indexOf('v_module := CASE _area'), FOR_BODY.indexOf('END;', FOR_BODY.indexOf('v_module := CASE _area')));
    const sqlModules = Object.fromEntries(Array.from(block.matchAll(/WHEN '([a-z_]+)' THEN '([a-z_]+)'/g), (m) => [m[1], m[2]]));
    const want = Object.fromEntries(RBAC_AREAS.map((a) => {
      const rule = FLEET_OPS_AREA_RULES[a];
      return [a, rule.kind === 'rbac' ? rule.module : ''];
    }));
    expect(sqlModules).toEqual(want);
  });

  it('call the domain helpers for the domain areas', () => {
    expect(FOR_BODY).toMatch(/_area = 'hr'[\s\S]*hr_can_view\(_user_id\)[\s\S]*hr_can_edit\(_user_id\)[\s\S]*hr_can_admin\(_user_id\)/);
    expect(FOR_BODY).toMatch(/_area = 'medical_fitness'[\s\S]*med_fitness_can_view\(_user_id\) OR public\.medical_can_view\(_user_id\)/);
    expect(FOR_BODY).toMatch(/_area = 'medical_clinical'[\s\S]*medical_can_view\(_user_id\)/);
    expect(FOR_BODY).toMatch(/_area = 'medical_admin' THEN\s+RETURN coalesce\(public\.medical_can_admin\(_user_id\), false\)/);
    expect(FLEET_OPS_AREA_RULES.hr).toEqual({ kind: 'domain', domain: 'hr' });
    expect(FLEET_OPS_AREA_RULES.medical_fitness).toEqual({ kind: 'domain', domain: 'fitness' });
    expect(FLEET_OPS_AREA_RULES.medical_clinical).toEqual({ kind: 'domain', domain: 'medical' });
    expect(FLEET_OPS_AREA_RULES.medical_admin).toEqual({ kind: 'domain', domain: 'medical' });
  });

  it('grant full access as the adaptor does (legacy dpa / shore management, RBAC superadmin / dpa)', () => {
    expect(FOR_BODY).toContain("v_role IN ('dpa', 'shore_management')");
    expect(FOR_BODY).toContain("lower(ro.name) IN ('superadmin', 'dpa')");
  });
});

describe('the nav check at view (canAccessModule)', () => {
  const moduleAccess = authMap('MODULE_ACCESS');
  const moduleKeyMap = authMap('moduleKeyMap');

  it('reads the two AuthContext tables', () => {
    expect(Array.isArray(moduleAccess.dashboard)).toBe(true);
    expect(moduleKeyMap.crew).toBe('crew_roster');
  });

  it.each(RBAC_AREAS.map((a) => [a] as [FleetOpsArea]))('%s: the legacy roles of MODULE_ACCESS[nav]', (area) => {
    const rule = FLEET_OPS_AREA_RULES[area];
    if (rule.kind !== 'rbac') return;
    const want = (moduleAccess[rule.nav ?? ''] as string[] | undefined) ?? [];
    expect([...(FLEET_OPS_NAV_ROLES[area] ?? [])]).toEqual(want);
  });

  it.each(RBAC_AREAS.map((a) => [a] as [FleetOpsArea]))('%s: the nav module’s RBAC key', (area) => {
    const rule = FLEET_OPS_AREA_RULES[area];
    if (rule.kind !== 'rbac') return;
    const navKey = (moduleKeyMap[rule.nav ?? ''] as string | undefined) ?? rule.nav;
    expect(FLEET_OPS_NAV_MODULE[area]).toBe(navKey === rule.module ? undefined : navKey);
  });

  it('the SQL nav block (between its markers) equals FLEET_OPS_NAV_ROLES', () => {
    const start = FOR_BODY.indexOf('-- fleet-ops-nav-rules:start');
    const end = FOR_BODY.indexOf('-- fleet-ops-nav-rules:end');
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const block = FOR_BODY.slice(start, end);
    const sqlRoles = Object.fromEntries(Array.from(block.matchAll(/WHEN '([a-z_]+)' THEN ARRAY\[([^\]]*)\]/g), (m) => [m[1], quoted(m[2])]));
    expect(sqlRoles).toEqual(Object.fromEntries(RBAC_AREAS.map((a) => [a, [...(FLEET_OPS_NAV_ROLES[a] ?? [])]])));
    expect(block).toContain("v_nav_module := CASE _area WHEN 'crew_documents' THEN 'crew_roster' ELSE v_module END;");
    expect(FLEET_OPS_NAV_MODULE).toEqual({ crew_documents: 'crew_roster' });
  });

  it('admits RBAC fleet_master at view, as canAccessModule does', () => {
    expect(AUTH).toContain("hasRBACRole('fleet_master')");
    expect(FOR_BODY).toContain("lower(ro.name) = 'fleet_master'");
  });
});

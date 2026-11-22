import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModulePermission } from '@/modules/auth/types';
import {
  mappedModules,
  mappedSubcategories,
  requiredLevel,
  resetUnknownCapabilityWarnings,
  resolveCapability,
  ruleForCapability,
  type AccessSnapshot,
} from '@/lib/permissions/adaptor';
import { getCatalogueEntry, listCatalogueCapabilities, listCatalogueEntries } from '@/lib/permissions/catalogue';
import { parseCapabilityKey } from '@/lib/permissions/types';

const perm = (module_key: string, level: 'view' | 'edit' | 'admin', scope: ModulePermission['scope'] = 'vessel'): ModulePermission => ({
  module_key,
  module_name: module_key,
  can_view: true,
  can_edit: level === 'edit' || level === 'admin',
  can_admin: level === 'admin',
  scope,
  restrictions: {},
});

const snapshot = (overrides: Partial<AccessSnapshot> = {}): AccessSnapshot => ({
  authLoading: false,
  signedIn: true,
  profileId: 'p-self',
  legacyRole: null,
  rbacInitialized: true,
  rbacLoading: false,
  rbacRoles: [],
  permissions: [],
  practitionerDisciplines: [],
  practitionerDisciplinesLoaded: true,
  canAccessModule: () => false,
  ...overrides,
});

const can = (key: string, s: Partial<AccessSnapshot> = {}, ctx = {}) => resolveCapability(key, snapshot(s), ctx);

describe('resolveCapability: unknown keys fail closed', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    resetUnknownCapabilityWarnings();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it.each([
    ['malformed', 'vessel.safety.view'],
    ['not in catalogue', 'vessel.safety.drill.view'],
    ['action not on subcategory', 'vessel.safety.sms_summary.delete'],
    ['unknown domain', 'finance.ledger.entries.view'],
  ])('%s → unknown, even for a superadmin', (_label, key) => {
    const d = can(key, { rbacRoles: ['superadmin'], canAccessModule: () => true });
    expect(d.allowed).toBe(false);
    expect(d.status).toBe('unknown');
  });

  it('logs each unknown key once', () => {
    can('vessel.safety.drill.view');
    can('vessel.safety.drill.view');
    can('vessel.safety.drill.create');
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0][0])).toContain('vessel.safety.drill.view');
  });

  it('does not log known keys', () => {
    can('vessel.safety.drills.view');
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('resolveCapability: loading and signed out', () => {
  it('denies while the session is loading', () => {
    const d = can('vessel.safety.drills.view', { authLoading: true, rbacRoles: ['superadmin'] });
    expect(d).toMatchObject({ allowed: false, status: 'loading' });
  });

  it('denies while RBAC is not initialised', () => {
    const d = can('vessel.safety.drills.view', { rbacInitialized: false, rbacRoles: ['superadmin'] });
    expect(d).toMatchObject({ allowed: false, status: 'loading' });
  });

  it('denies while RBAC is reloading', () => {
    const d = can('hris.employee_records.personal_details.view', { rbacLoading: true, rbacRoles: ['dpa'] });
    expect(d).toMatchObject({ allowed: false, status: 'loading' });
  });

  it('denies clinical keys until the practitioner roster has loaded', () => {
    const d = can('health.medical.patients.view', { practitionerDisciplinesLoaded: false, rbacRoles: ['dpa'] });
    expect(d).toMatchObject({ allowed: false, status: 'loading' });
    expect(can('health.medical.patients.view', { rbacRoles: ['dpa'] }).allowed).toBe(true);
  });

  it('does not wait for the practitioner roster on non-clinical keys', () => {
    const d = can('vessel.safety.drills.view', { practitionerDisciplinesLoaded: false, rbacRoles: ['superadmin'] });
    expect(d.allowed).toBe(true);
  });

  it('denies when signed out', () => {
    const d = can('fleet.administration.notification_center.view_own', { signedIn: false });
    expect(d).toMatchObject({ allowed: false, status: 'signed_out' });
  });

  it('signed-in-only keys do not wait for RBAC', () => {
    const d = can('fleet.administration.notification_center.view_own', { rbacInitialized: false });
    expect(d.allowed).toBe(true);
  });
});

describe('resolveCapability: RBAC module rules', () => {
  it('grants view from an RBAC permission row', () => {
    expect(can('vessel.safety.drills.view', { permissions: [perm('drills', 'view')] }).allowed).toBe(true);
  });

  it('grants view through canAccessModule(nav) (today’s nav and route check)', () => {
    const nav = vi.fn((id: string) => id === 'ism');
    expect(can('vessel.safety.drills.view', { canAccessModule: nav }).allowed).toBe(true);
    expect(nav).toHaveBeenCalledWith('ism');
  });

  it('nav access never grants edit or admin', () => {
    const s = { canAccessModule: () => true };
    expect(can('vessel.safety.drills.edit', s).allowed).toBe(false);
    expect(can('vessel.safety.drills.delete', s).allowed).toBe(false);
  });

  it('maps actions onto view / edit / admin', () => {
    const viewOnly = { permissions: [perm('drills', 'view')] };
    const editor = { permissions: [perm('drills', 'edit')] };
    const admin = { permissions: [perm('drills', 'admin')] };
    expect(can('vessel.safety.drills.export', viewOnly).allowed).toBe(true);
    expect(can('vessel.safety.drills.create', viewOnly).allowed).toBe(false);
    expect(can('vessel.safety.drills.create', editor).allowed).toBe(true);
    expect(can('vessel.safety.drills.edit', editor).allowed).toBe(true);
    expect(can('vessel.safety.drills.delete', editor).allowed).toBe(false);
    expect(can('vessel.safety.drills.delete', admin).allowed).toBe(true);
  });

  it('uses the subcategory’s own RBAC module where one exists', () => {
    expect(can('vessel.safety.permit_to_work.edit', { permissions: [perm('ism', 'edit')] }).allowed).toBe(false);
    expect(can('vessel.safety.permit_to_work.edit', { permissions: [perm('ptw', 'edit')] }).allowed).toBe(true);
    expect(can('vessel.safety.sms_forms.edit', { permissions: [perm('ism', 'edit')] }).allowed).toBe(true);
  });

  it('a permission on another module does not leak', () => {
    expect(can('vessel.technical.tasks.view', { permissions: [perm('ism', 'admin')] }).allowed).toBe(false);
  });

  it.each([
    ['RBAC superadmin', { rbacRoles: ['superadmin'] }],
    ['RBAC dpa', { rbacRoles: ['DPA'] }],
    ['legacy dpa', { legacyRole: 'dpa' }],
    ['legacy shore management', { legacyRole: 'shore_management' }],
  ])('%s has full module access', (_label, s) => {
    expect(can('vessel.technical.tasks.delete', s).allowed).toBe(true);
    expect(can('admin.access.users_access.admin', s).allowed).toBe(true);
  });

  it('fleet master gets view through nav only, not admin', () => {
    const s = { rbacRoles: ['fleet_master'], canAccessModule: () => true };
    expect(can('vessel.technical.tasks.view', s).allowed).toBe(true);
    expect(can('vessel.technical.tasks.delete', s).allowed).toBe(false);
  });
});

describe('resolveCapability: crew flags lower create / sign to self', () => {
  it('crewCreates: anyone who can enter the module may create', () => {
    const s = { canAccessModule: (id: string) => id === 'ism' };
    expect(can('vessel.safety.incidents.create', s).allowed).toBe(true); // crewCreates
    expect(can('vessel.safety.investigations.create', s).allowed).toBe(false); // not crewCreates
  });

  it('crewSigns: anyone who can enter the module may sign', () => {
    const s = { canAccessModule: (id: string) => id === 'ism' };
    expect(can('vessel.safety.drills.sign', s).allowed).toBe(true); // crewSigns
    expect(can('vessel.technical.tasks.sign', { canAccessModule: () => true }).allowed).toBe(false); // not crewSigns
  });

  it('requiredLevel table', () => {
    const plain = { crewCreates: false, crewSigns: false };
    const crew = { crewCreates: true, crewSigns: true };
    expect(requiredLevel('view_own', plain)).toBe('self');
    expect(requiredLevel('view', plain)).toBe('view');
    expect(requiredLevel('export', plain)).toBe('view');
    expect(requiredLevel('create', plain)).toBe('edit');
    expect(requiredLevel('create', crew)).toBe('self');
    expect(requiredLevel('sign', plain)).toBe('edit');
    expect(requiredLevel('sign', crew)).toBe('self');
    expect(requiredLevel('edit', plain)).toBe('edit');
    expect(requiredLevel('assign', plain)).toBe('edit');
    expect(requiredLevel('approve', plain)).toBe('edit');
    expect(requiredLevel('settle', plain)).toBe('edit');
    expect(requiredLevel('delete', plain)).toBe('admin');
    expect(requiredLevel('final_approve', plain)).toBe('admin');
    expect(requiredLevel('admin', plain)).toBe('admin');
  });
});

describe('resolveCapability: domain resolvers', () => {
  it('HR: crew self-service sees own records only', () => {
    const crew = { legacyRole: 'crew' };
    expect(can('hris.employee_records.personal_details.view_own', crew).allowed).toBe(true);
    expect(can('hris.employee_records.personal_details.view', crew).allowed).toBe(false);
  });

  it('HR: captain edits, chief officer views, DPA administers', () => {
    expect(can('hris.performance.annual_reviews.edit', { rbacRoles: ['captain'] }).allowed).toBe(true);
    expect(can('hris.performance.annual_reviews.final_approve', { rbacRoles: ['captain'] }).allowed).toBe(false);
    expect(can('hris.performance.annual_reviews.view', { rbacRoles: ['chief_officer'] }).allowed).toBe(true);
    expect(can('hris.performance.annual_reviews.edit', { rbacRoles: ['chief_officer'] }).allowed).toBe(false);
    expect(can('hris.performance.annual_reviews.final_approve', { rbacRoles: ['dpa'] }).allowed).toBe(true);
  });

  it('HR self-scope permission rows stay self only', () => {
    const s = { permissions: [perm('hr', 'admin', 'self')] };
    expect(can('hris.employee_records.personal_details.view_own', s).allowed).toBe(true);
    expect(can('hris.employee_records.personal_details.view', s).allowed).toBe(false);
  });

  it('payroll: compensation uses the finance gate, not HR', () => {
    expect(can('hris.compensation.salaries_compensation.view', { rbacRoles: ['captain'] }).allowed).toBe(false);
    expect(can('hris.compensation.salaries_compensation.view', { permissions: [perm('finance', 'view')] }).allowed).toBe(true);
    expect(can('hris.compensation.salaries_compensation.view_own', { legacyRole: 'crew' }).allowed).toBe(true);
  });

  it('legal: the legal team edits, everyone else raises their own requests', () => {
    expect(can('vessel.management.legal.view_own', { legacyRole: 'crew' }).allowed).toBe(true);
    expect(can('vessel.management.legal.create', { legacyRole: 'crew' }).allowed).toBe(true); // crewCreates
    expect(can('vessel.management.legal.view', { legacyRole: 'crew' }).allowed).toBe(false);
    expect(can('vessel.management.legal.edit', { rbacRoles: ['legal_counsel'] }).allowed).toBe(true);
    expect(can('vessel.management.legal.admin', { rbacRoles: ['legal_counsel'] }).allowed).toBe(false);
  });

  it('medical: practitioners, not rank, get clinical access', () => {
    expect(can('health.medical.patients.view', { rbacRoles: ['captain'] }).allowed).toBe(false);
    expect(can('health.medical.patients.edit', { practitionerDisciplines: ['medical'] }).allowed).toBe(true);
    expect(can('health.personnel_medical.crew_medical_records.view_own', { legacyRole: 'crew' }).allowed).toBe(true);
  });

  it('fitness to work: captain and HR read it, not the clinical record', () => {
    const captain = { rbacRoles: ['captain'] };
    expect(can('health.personnel_medical.fitness_to_work.view', captain).allowed).toBe(true);
    expect(can('health.personnel_medical.fitness_to_work.edit', captain).allowed).toBe(false);
    expect(can('health.personnel_medical.crew_medical_records.view', captain).allowed).toBe(false);
  });

  it('wellness and physio', () => {
    expect(can('health.spa.treatments.edit', { practitionerDisciplines: ['spa'] }).allowed).toBe(true);
    expect(can('health.spa.treatments.view', { rbacRoles: ['hod'] }).allowed).toBe(true);
    expect(can('health.spa.treatments.edit', { rbacRoles: ['hod'] }).allowed).toBe(false);
    // Physio records are clinical: a HoD with wellness view cannot read them.
    expect(can('health.physio.assessments.view', { rbacRoles: ['hod'] }).allowed).toBe(false);
    expect(can('health.physio.assessments.edit', { practitionerDisciplines: ['physio'] }).allowed).toBe(true);
  });
});

describe('resolveCapability: catalogue legacy flags', () => {
  it('approvals need the fine-grained flag or full admin', () => {
    const key = 'vessel.crew.hours_of_rest.approve';
    expect(can(key, { permissions: [perm('crew_roster', 'edit')] }).allowed).toBe(false);
    expect(can(key, { permissions: [perm('crew.approve_hours_of_rest', 'view')] }).allowed).toBe(true);
    expect(can(key, { permissions: [perm('crew_roster', 'admin')] }).allowed).toBe(true);
  });

  it('view flags widen, never narrow, the module check', () => {
    const key = 'vessel.crew.crew_list.view';
    expect(can(key, { permissions: [perm('crew.see_crew_list', 'view')] }).allowed).toBe(true);
    expect(can(key, { canAccessModule: (id: string) => id === 'crew' }).allowed).toBe(true);
    expect(can(key).allowed).toBe(false);
  });

  it('leave approval follows crew.approve_leave', () => {
    const key = 'hris.leave_rotation.leave_requests.approve';
    expect(can(key, { rbacRoles: ['captain'] }).allowed).toBe(false); // HR edit is not enough
    expect(can(key, { permissions: [perm('crew.approve_leave', 'view')] }).allowed).toBe(true);
    expect(can(key, { rbacRoles: ['dpa'] }).allowed).toBe(true); // HR admin
  });
});

describe('resolveCapability: subject scope', () => {
  it('view_own covers the caller only', () => {
    const crew = { legacyRole: 'crew', profileId: 'p-self' };
    const key = 'hris.employee_records.personal_details.view_own';
    expect(can(key, crew, { subjectProfileId: 'p-self' }).allowed).toBe(true);
    expect(can(key, crew, { subjectProfileId: 'p-other' })).toMatchObject({ allowed: false, status: 'denied' });
    expect(can(key, crew, {}).allowed).toBe(true);
  });

  it('vessel scope is accepted but not yet refined (D-04)', () => {
    const s = { permissions: [perm('drills', 'view')] };
    expect(can('vessel.safety.drills.view', s, { vesselId: 'v-1' }).allowed).toBe(true);
  });
});

describe('signed-in rules', () => {
  it('own inbox and own feedback need only a session; triage needs admin', () => {
    expect(can('fleet.administration.notification_center.view_own').allowed).toBe(true);
    expect(can('admin.system.feedback.create').allowed).toBe(true);
    expect(can('admin.system.feedback.view').allowed).toBe(false);
    expect(can('fleet.administration.support_tickets.create').allowed).toBe(true);
    expect(can('fleet.administration.support_tickets.edit').allowed).toBe(false);
    expect(can('fleet.administration.support_tickets.edit', { permissions: [perm('settings', 'edit')] }).allowed).toBe(true);
  });
});

describe('adaptor coverage', () => {
  it('every catalogue capability resolves to a rule', () => {
    const unmapped = listCatalogueCapabilities().filter((key) => {
      const p = parseCapabilityKey(key);
      return !p || !ruleForCapability(p.path, p.modulePath, p.action);
    });
    expect(unmapped).toEqual([]);
  });

  it('every mapped module and subcategory exists in the catalogue', () => {
    const modules = new Set(listCatalogueEntries().map((e) => e.path.split('.').slice(0, 2).join('.')));
    expect(mappedModules().filter((m) => !modules.has(m))).toEqual([]);
    expect(mappedSubcategories().filter((path) => !getCatalogueEntry(path))).toEqual([]);
  });

  it('a signed-in user with no roles or permissions gets only the self-service keys', () => {
    const granted = listCatalogueCapabilities().filter((key) => resolveCapability(key, snapshot()).allowed);
    expect(granted.sort()).toEqual(
      [
        'fleet.administration.notification_center.view_own',
        'fleet.administration.support_tickets.view_own',
        'fleet.administration.support_tickets.create',
        'admin.system.feedback.view_own',
        'admin.system.feedback.create',
        // legal_can_*: everyone may raise and follow their own legal requests.
        'vessel.management.legal.view_own',
        'vessel.management.legal.create',
      ].sort(),
    );
  });
});

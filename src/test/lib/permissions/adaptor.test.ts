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
        // Every crew member reads and acknowledges the fleet documents sent to them.
        'vessel.safety.fleet_documents.view_own',
        'vessel.safety.fleet_documents.sign',
        // Own crew records (the server adds vessel reach; definers check the subject).
        'vessel.crew.crew_profiles.view_own',
        'vessel.crew.crew_certificates.view_own',
        'vessel.crew.hours_of_rest.view_own',
        'vessel.crew.familiarisation.view_own',
      ].sort(),
    );
  });
});

const crewNavOnly = { canAccessModule: (id: string) => id === 'crew' };

describe('Phase 3 wave 1 keys (platform prep PP1)', () => {
  it.each([
    'vessel.crew.crew_profiles.view_own',
    'vessel.crew.crew_certificates.view_own',
    'vessel.crew.hours_of_rest.view_own',
    'vessel.crew.familiarisation.view_own',
  ])('%s: any signed-in crew member, own record only', (key) => {
    expect(can(key, { legacyRole: 'crew' }).allowed).toBe(true);
    expect(can(key, { rbacInitialized: false }).allowed).toBe(true);
    expect(can(key, { legacyRole: 'crew' }, { subjectProfileId: 'p-other' }).allowed).toBe(false);
    expect(can(key, { signedIn: false }).status).toBe('signed_out');
  });

  it('own-record rules leave the other crew actions on their modules', () => {
    expect(can('vessel.crew.crew_profiles.view', { legacyRole: 'crew' }).allowed).toBe(false);
    expect(can('vessel.crew.crew_profiles.view', crewNavOnly).allowed).toBe(true);
    expect(can('vessel.crew.crew_certificates.edit', { permissions: [perm('crew_certificates', 'edit')] }).allowed).toBe(true);
    expect(can('vessel.crew.hours_of_rest.create', crewNavOnly).allowed).toBe(true); // crewCreates
    expect(can('vessel.crew.hours_of_rest.edit', crewNavOnly).allowed).toBe(false);
    expect(can('vessel.crew.familiarisation.sign', { canAccessModule: (id: string) => id === 'development' }).allowed).toBe(true); // crewSigns
    expect(can('vessel.crew.familiarisation.sign', { legacyRole: 'crew' }).allowed).toBe(false);
  });

  const crewNav = { canAccessModule: (id: string) => id === 'crew' };
  const devNav = { canAccessModule: (id: string) => id === 'development' };
  const docsNav = { canAccessModule: (id: string) => id === 'documents' };

  it('vessel.crew.crew_compliance: crew certificates view sees it, admin configures it', () => {
    expect(can('vessel.crew.crew_compliance.view', { permissions: [perm('crew_certificates', 'view')] }).allowed).toBe(true);
    expect(can('vessel.crew.crew_compliance.view', crewNav).allowed).toBe(true);
    expect(can('vessel.crew.crew_compliance.view', { permissions: [perm('crew_roster', 'admin')] }).allowed).toBe(false);
    expect(can('vessel.crew.crew_compliance.admin', { permissions: [perm('crew_certificates', 'edit')] }).allowed).toBe(false);
    expect(can('vessel.crew.crew_compliance.admin', { permissions: [perm('crew_certificates', 'admin')] }).allowed).toBe(true);
    expect(can('vessel.crew.crew_compliance.admin', crewNav).allowed).toBe(false);
    expect(can('vessel.crew.crew_compliance.admin', { legacyRole: 'shore_management' }).allowed).toBe(true);
  });

  it('vessel.crew.expiry_alerts.edit is a crew certificates edit (T-160)', () => {
    const key = 'vessel.crew.expiry_alerts.edit';
    expect(ruleForCapability('vessel.crew.expiry_alerts', 'vessel.crew', 'edit')).toEqual({ kind: 'rbac', module: 'crew_certificates', nav: 'crew' });
    expect(can(key, { permissions: [perm('crew_certificates', 'view')] }).allowed).toBe(false);
    expect(can(key, crewNav).allowed).toBe(false);
    expect(can(key, { permissions: [perm('crew_certificates', 'edit')] }).allowed).toBe(true);
    expect(can(key, { rbacRoles: ['superadmin'] }).allowed).toBe(true);
  });

  it.each(['vessel.crew.crew_medical.view', 'vessel.crew.crew_medical.export'])('%s follows fitness to work', (key) => {
    expect(can(key, { rbacRoles: ['captain'] }).allowed).toBe(true);
    expect(can(key, { legacyRole: 'chief_officer' }).allowed).toBe(true); // HR view
    expect(can(key, { practitionerDisciplines: ['medical'] }).allowed).toBe(true);
    expect(can(key, { legacyRole: 'crew' }).allowed).toBe(false);
    expect(can(key, crewNav).allowed).toBe(false);
    expect(can(key, { practitionerDisciplinesLoaded: false, rbacRoles: ['captain'] }).status).toBe('loading');
  });

  it('vessel.crew.crew_training follows the training module (crewCreates)', () => {
    expect(getCatalogueEntry('vessel.crew.crew_training')?.crewCreates).toBe(true);
    expect(can('vessel.crew.crew_training.view_own', devNav).allowed).toBe(true);
    expect(can('vessel.crew.crew_training.view_own', devNav, { subjectProfileId: 'p-other' }).allowed).toBe(false);
    expect(can('vessel.crew.crew_training.view', devNav).allowed).toBe(true);
    expect(can('vessel.crew.crew_training.export', { permissions: [perm('training', 'view')] }).allowed).toBe(true);
    expect(can('vessel.crew.crew_training.create', devNav).allowed).toBe(true); // crewCreates
    expect(can('vessel.crew.crew_training.edit', devNav).allowed).toBe(false);
    expect(can('vessel.crew.crew_training.edit', { permissions: [perm('training', 'edit')] }).allowed).toBe(true);
    expect(can('vessel.crew.crew_training.approve', { permissions: [perm('training', 'edit')] }).allowed).toBe(true);
    expect(can('vessel.crew.crew_training.final_approve', { permissions: [perm('training', 'edit')] }).allowed).toBe(false);
    expect(can('vessel.crew.crew_training.final_approve', { permissions: [perm('training', 'admin')] }).allowed).toBe(true);
    expect(can('vessel.crew.crew_training.view', crewNav).allowed).toBe(false);
  });

  it('vessel.safety.fleet_documents: any crew member reads and acknowledges; the documents module manages', () => {
    expect(getCatalogueEntry('vessel.safety.fleet_documents')?.crewSigns).toBe(true);
    expect(can('vessel.safety.fleet_documents.view_own').allowed).toBe(true);
    expect(can('vessel.safety.fleet_documents.sign').allowed).toBe(true);
    expect(can('vessel.safety.fleet_documents.sign', { rbacInitialized: false }).allowed).toBe(true);
    expect(can('vessel.safety.fleet_documents.sign', { signedIn: false }).status).toBe('signed_out');
    expect(can('vessel.safety.fleet_documents.view').allowed).toBe(false);
    expect(can('vessel.safety.fleet_documents.view', docsNav).allowed).toBe(true);
    expect(can('vessel.safety.fleet_documents.view', { canAccessModule: (id: string) => id === 'ism' }).allowed).toBe(false);
    expect(can('vessel.safety.fleet_documents.assign', docsNav).allowed).toBe(false);
    expect(can('vessel.safety.fleet_documents.assign', { permissions: [perm('documents', 'edit')] }).allowed).toBe(true);
    expect(can('vessel.safety.fleet_documents.admin', { permissions: [perm('documents', 'edit')] }).allowed).toBe(false);
    expect(can('vessel.safety.fleet_documents.admin', { permissions: [perm('documents', 'admin')] }).allowed).toBe(true);
  });

  it('fleet.operations.fleet_training follows the training module', () => {
    const viewer = { permissions: [perm('training', 'view')] };
    const editor = { permissions: [perm('training', 'edit')] };
    const admin = { permissions: [perm('training', 'admin')] };
    expect(can('fleet.operations.fleet_training.view', devNav).allowed).toBe(true);
    expect(can('fleet.operations.fleet_training.export', viewer).allowed).toBe(true);
    expect(can('fleet.operations.fleet_training.create', viewer).allowed).toBe(false);
    expect(can('fleet.operations.fleet_training.create', editor).allowed).toBe(true);
    expect(can('fleet.operations.fleet_training.edit', editor).allowed).toBe(true);
    expect(can('fleet.operations.fleet_training.approve', editor).allowed).toBe(true);
    expect(can('fleet.operations.fleet_training.final_approve', editor).allowed).toBe(false);
    expect(can('fleet.operations.fleet_training.final_approve', admin).allowed).toBe(true);
    expect(can('fleet.operations.fleet_training.admin', editor).allowed).toBe(false);
    expect(can('fleet.operations.fleet_training.admin', admin).allowed).toBe(true);
    expect(can('fleet.operations.fleet_training.view', { canAccessModule: (id: string) => id === 'fleet' }).allowed).toBe(false);
  });

  it('fleet.operations.fleet_medical: fitness viewers read and export; medical admins set thresholds', () => {
    for (const key of ['fleet.operations.fleet_medical.view', 'fleet.operations.fleet_medical.export']) {
      expect(can(key, { rbacRoles: ['fleet_master'] }).allowed).toBe(true);
      expect(can(key, { legacyRole: 'master' }).allowed).toBe(true); // HR edit includes view
      expect(can(key, { legacyRole: 'crew' }).allowed).toBe(false);
    }
    expect(ruleForCapability('fleet.operations.fleet_medical', 'fleet.operations', 'admin')).toEqual({ kind: 'domain', domain: 'medical' });
    expect(can('fleet.operations.fleet_medical.admin', { rbacRoles: ['captain'] }).allowed).toBe(false);
    expect(can('fleet.operations.fleet_medical.admin', { practitionerDisciplines: ['medical'] }).allowed).toBe(false); // edit, not admin
    expect(can('fleet.operations.fleet_medical.admin', { permissions: [perm('medical', 'admin')] }).allowed).toBe(true);
    expect(can('fleet.operations.fleet_medical.admin', { legacyRole: 'dpa' }).allowed).toBe(true);
  });

  it('fleet.operations.fleet_documents gains assign and admin on the documents module', () => {
    expect(can('fleet.operations.fleet_documents.assign', docsNav).allowed).toBe(false);
    expect(can('fleet.operations.fleet_documents.assign', { permissions: [perm('documents', 'edit')] }).allowed).toBe(true);
    expect(can('fleet.operations.fleet_documents.admin', { permissions: [perm('documents', 'edit')] }).allowed).toBe(false);
    expect(can('fleet.operations.fleet_documents.admin', { permissions: [perm('documents', 'admin')] }).allowed).toBe(true);
  });

  it('fleet.operations.fleet_reports gains admin on the reports module', () => {
    expect(can('fleet.operations.fleet_reports.admin', { canAccessModule: (id: string) => id === 'reports' }).allowed).toBe(false);
    expect(can('fleet.operations.fleet_reports.admin', { permissions: [perm('reports', 'edit')] }).allowed).toBe(false);
    expect(can('fleet.operations.fleet_reports.admin', { permissions: [perm('reports', 'admin')] }).allowed).toBe(true);
    expect(can('fleet.operations.fleet_reports.admin', { rbacRoles: ['dpa'] }).allowed).toBe(true);
  });
});

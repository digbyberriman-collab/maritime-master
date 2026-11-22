/**
 * Interim capability adaptor (DECISIONS D-04; gap/00 C1–C3).
 *
 * Maps PMS capability keys (`domain.module.subcategory.action`) onto the
 * checks STORM runs today:
 *
 * - RBAC module levels from `permissionsStore` (`hasPermission(module, level)`),
 * - `AuthContext.canAccessModule(navModuleId)` for view-level entry,
 * - the domain resolvers that mirror the SQL helpers (`hr_can_*`,
 *   `payroll_can_*`, `medical_can_*`, `wellness_can_*`, `legal_can_*`,
 *   `med_fitness_can_view`, physio),
 * - the fine-grained `modules` rows the catalogue lists under `legacy`
 *   (`crew.approve_leave`, `finance.run_payroll`, …).
 *
 * Everything here is pure so the mapping is unit-tested without React. The
 * PMS runtime replaces this file later; call sites keep their keys.
 *
 * Fail-closed rules:
 * - a key that is malformed, not in the catalogue, or has no mapping here is
 *   `unknown` → false (logged once per key in development);
 * - signed out → false;
 * - while auth, RBAC or a resolver the rule needs is loading → false;
 * - `view_own` with a subject other than the caller → false.
 *
 * Gates are coarser than the signed-off PMS matrix (D-04): vessel and
 * department scope are not evaluated yet. RLS stays the real control.
 */
import type { ModulePermission, PermissionLevel } from '@/modules/auth/types';
import { resolveHrAccess, type HrAccess } from '@/modules/auth/lib/hrAccess';
import { resolvePayrollAccess } from '@/modules/auth/lib/payrollAccess';
import { resolveLegalAccess } from '@/modules/auth/lib/legalAccess';
import {
  resolveFitnessAccess,
  resolveMedicalAccess,
  type MedicalAccess,
} from '@/modules/auth/lib/medicalAccess';
import {
  canAccessPhysio,
  resolveWellnessAccess,
  type WellnessAccess,
} from '@/modules/auth/lib/wellnessAccess';
import { getCatalogueEntry, type CatalogueEntry } from './catalogue';
import { parseCapabilityKey, type CanContext, type CapabilityAction } from './types';

// ─── Rules ────────────────────────────────────────────────────────────────

/** The level an action needs from today's checks. `self` = any access to own records. */
export type AccessLevel = 'self' | 'view' | 'edit' | 'admin';

/** Domain resolvers that mirror SQL `*_can_*` helpers. */
export type AccessDomain = 'hr' | 'payroll' | 'legal' | 'medical' | 'fitness' | 'wellness' | 'physio';

export type CapabilityRule =
  /** RBAC module level; `nav` also admits view-level checks through `canAccessModule(nav)`. */
  | { kind: 'rbac'; module: string; nav?: string }
  /** A domain resolver's level. */
  | { kind: 'domain'; domain: AccessDomain }
  /** Any signed-in user (own inbox, own feedback). */
  | { kind: 'signed_in' };

interface ActionOverrides {
  /** Rule for actions not listed in `actions`; falls back to the module rule when absent. */
  default?: CapabilityRule;
  actions: Partial<Record<CapabilityAction, CapabilityRule>>;
}

const rbac = (module: string, nav?: string): CapabilityRule => ({ kind: 'rbac', module, nav });
const domain = (d: AccessDomain): CapabilityRule => ({ kind: 'domain', domain: d });
const SIGNED_IN: CapabilityRule = { kind: 'signed_in' };

/**
 * One rule per catalogue module (`domain.module`). RBAC module keys come from
 * the `modules` seed (20260129125250); nav ids are the ones
 * `canAccessModule` maps today.
 */
const MODULE_RULES: Readonly<Record<string, CapabilityRule>> = {
  'fleet.operations': rbac('fleet', 'fleet'),
  'fleet.administration': rbac('settings', 'admin'),

  'vessel.crew': rbac('crew_roster', 'crew'),
  'vessel.safety': rbac('ism', 'ism'),
  'vessel.certificates': rbac('vessel_certificates', 'certificates'),
  'vessel.technical': rbac('maintenance', 'maintenance'),
  'vessel.charter': rbac('vessels', 'vessel'),
  // Finance is hidden in this programme (G1); its pages keep the finance gate.
  'vessel.accounting': domain('payroll'),
  'vessel.general': rbac('vessels', 'vessels'),
  'vessel.logbooks': rbac('vessels', 'vessel'),
  'vessel.dept_bridge': rbac('vessels', 'vessel'),
  'vessel.dept_deck': rbac('vessels', 'vessel'),
  'vessel.dept_engineering': rbac('vessels', 'vessel'),
  'vessel.dept_interior': rbac('vessels', 'vessel'),
  'vessel.dept_galley': rbac('vessels', 'vessel'),
  'vessel.dept_media': rbac('vessels', 'vessel'),
  'vessel.dept_it_av': rbac('vessels', 'vessel'),
  'vessel.dept_dive': rbac('vessels', 'vessel'),
  'vessel.management': rbac('ism', 'ism'),

  'shoreside.ventures': rbac('reports', 'shoreside'),

  'health.medical': domain('medical'),
  'health.personnel_medical': domain('medical'),
  'health.spa': domain('wellness'),
  'health.nutrition': domain('wellness'),
  'health.physio': domain('physio'),
  'health.personal_training': domain('wellness'),

  'yard.refit_overview': rbac('maintenance', 'yard'),
  'yard.refit_workflow': rbac('maintenance', 'yard'),
  'yard.refit_project': rbac('maintenance', 'yard'),
  'yard.refit_documents': rbac('maintenance', 'yard'),
  'yard.refit_finance': rbac('maintenance', 'yard'),
  'yard.refit_compliance': rbac('maintenance', 'yard'),
  'yard.refit_projects': rbac('maintenance', 'yard'),
  'yard.refit_account': rbac('maintenance', 'yard'),
  'yard.nb_overview': rbac('maintenance', 'yard'),
  'yard.nb_workflow': rbac('maintenance', 'yard'),
  'yard.nb_disciplines': rbac('maintenance', 'yard'),
  'yard.nb_equipment': rbac('maintenance', 'yard'),
  'yard.nb_documents': rbac('maintenance', 'yard'),
  'yard.nb_configuration': rbac('maintenance', 'yard'),

  'hris.overview': domain('hr'),
  'hris.employee_records': domain('hr'),
  'hris.compensation': domain('payroll'),
  'hris.performance': domain('hr'),
  'hris.recruitment': domain('hr'),
  'hris.leave_rotation': domain('hr'),
  'hris.training_development': domain('hr'),
  'hris.compliance': domain('hr'),
  'hris.reporting': domain('hr'),

  'admin.access': rbac('settings', 'admin'),
  'admin.system': rbac('settings', 'admin'),
};

/** Subcategories whose check differs from their module's. */
const SUBCATEGORY_RULES: Readonly<Record<string, CapabilityRule | ActionOverrides>> = {
  'fleet.operations.fleet_dashboard': rbac('dashboard', 'dashboard'),
  'fleet.operations.fleet_tracker': rbac('fleet', 'fleet-map'),
  'fleet.operations.fleet_reports': rbac('reports', 'reports'),
  'fleet.operations.fleet_calendar': rbac('fleet', 'itinerary'),
  'fleet.operations.fleet_documents': rbac('documents', 'documents'),
  'fleet.operations.fleet_checklists': rbac('ism', 'ism'),
  'fleet.operations.vessels': rbac('vessels', 'vessels'),
  'fleet.administration.notification_center': SIGNED_IN,
  'fleet.administration.support_tickets': { actions: { view_own: SIGNED_IN, create: SIGNED_IN } },
  'admin.system.feedback': { actions: { view_own: SIGNED_IN, create: SIGNED_IN } },

  'vessel.crew.crew_certificates': rbac('crew_certificates', 'crew'),
  'vessel.crew.familiarisation': rbac('training', 'development'),

  'vessel.safety.drills': rbac('drills', 'ism'),
  'vessel.safety.permit_to_work': rbac('ptw', 'ism'),
  'vessel.safety.risk_assessments': rbac('risk_assessments', 'ism'),
  'vessel.safety.incidents': rbac('incidents', 'ism'),
  'vessel.safety.investigations': rbac('investigations', 'ism'),
  'vessel.safety.capa': rbac('capa', 'ism'),
  'vessel.safety.non_conformities': rbac('non_conformities', 'ism'),
  'vessel.safety.observations': rbac('observations', 'ism'),
  'vessel.safety.audits_surveys': rbac('audits_surveys', 'ism'),
  'vessel.safety.safety_meetings': rbac('meetings', 'ism'),
  'vessel.safety.emergency_response': rbac('erm', 'ism'),
  'vessel.safety.sops_bridge': rbac('sops', 'ism'),
  'vessel.safety.sops_deck': rbac('sops', 'ism'),
  'vessel.safety.sops_engineering': rbac('sops', 'ism'),
  'vessel.safety.sops_galley': rbac('sops', 'ism'),
  'vessel.safety.sops_interior': rbac('sops', 'ism'),
  'vessel.safety.sops_medical': rbac('sops', 'ism'),

  'vessel.general.billing': rbac('settings', 'admin'),

  'vessel.management.procurement': rbac('maintenance', 'maintenance'),
  'vessel.management.finance_accounts': domain('payroll'),
  'vessel.management.legal': domain('legal'),
  'vessel.management.office_insurance': rbac('insurance', 'insurance'),

  // Fitness to work is the one medical surface HR and the bridge can read.
  'health.personnel_medical.fitness_to_work': { actions: { view: domain('fitness') } },
};

/** Actions where a catalogue `legacy` flag is the fine-grained control. */
const APPROVAL_ACTIONS: ReadonlySet<CapabilityAction> = new Set(['approve', 'final_approve', 'settle']);

/** Full access by today's rules: RBAC superadmin / DPA, legacy DPA / shore management. */
const FULL_ACCESS_RBAC_ROLES = ['superadmin', 'dpa'];
const FULL_ACCESS_LEGACY_ROLES = ['dpa', 'shore_management'];

/** The rule that decides `key`, or undefined when the adaptor has none. */
export function ruleForCapability(path: string, modulePath: string, action: CapabilityAction): CapabilityRule | undefined {
  const sub = SUBCATEGORY_RULES[path];
  if (sub) {
    if ('kind' in sub) return sub;
    return sub.actions[action] ?? sub.default ?? MODULE_RULES[modulePath];
  }
  return MODULE_RULES[modulePath];
}

/** The level an action needs, honouring the catalogue's crew flags. */
export function requiredLevel(action: CapabilityAction, entry: Pick<CatalogueEntry, 'crewCreates' | 'crewSigns'>): AccessLevel {
  switch (action) {
    case 'view_own':
      return 'self';
    case 'view':
    case 'export':
      return 'view';
    case 'create':
      return entry.crewCreates ? 'self' : 'edit';
    case 'sign':
      return entry.crewSigns ? 'self' : 'edit';
    case 'edit':
    case 'assign':
    case 'approve':
    case 'settle':
      return 'edit';
    case 'delete':
    case 'final_approve':
    case 'admin':
      return 'admin';
  }
}

// ─── Snapshot and decision ────────────────────────────────────────────────

/** Everything today's checks read, captured once per render. */
export interface AccessSnapshot {
  /** AuthContext is still resolving the session. */
  authLoading: boolean;
  signedIn: boolean;
  /** `profiles.id` of the caller (D6 subject key). */
  profileId: string | null;
  /** `profiles.role` (legacy user_role enum). */
  legacyRole: string | null;
  rbacInitialized: boolean;
  rbacLoading: boolean;
  rbacRoles: readonly string[];
  permissions: readonly ModulePermission[];
  practitionerDisciplines: readonly string[];
  practitionerDisciplinesLoaded: boolean;
  /** `AuthContext.canAccessModule`: today's nav and route module check. */
  canAccessModule: (navModuleId: string) => boolean;
}

export type CapabilityStatus = 'granted' | 'denied' | 'loading' | 'unknown' | 'signed_out';

export interface CapabilityDecision {
  allowed: boolean;
  status: CapabilityStatus;
  /** Short developer-facing explanation (never shown as UI copy). */
  reason: string;
}

const decision = (status: CapabilityStatus, reason: string): CapabilityDecision => ({
  allowed: status === 'granted',
  status,
  reason,
});

const warned = new Set<string>();

function warnUnknown(key: string, reason: string): void {
  if (!import.meta.env.DEV || warned.has(key)) return;
  warned.add(key);
  console.warn(`[useCan] denied unknown capability "${key}": ${reason}`);
}

/** Test hook: forget which unknown keys were already logged. */
export function resetUnknownCapabilityWarnings(): void {
  warned.clear();
}

function rbacHas(permissions: readonly ModulePermission[], moduleKey: string, level: PermissionLevel): boolean {
  const perm = permissions.find((p) => p.module_key === moduleKey);
  if (!perm) return false;
  if (level === 'admin') return perm.can_admin;
  if (level === 'edit') return perm.can_edit || perm.can_admin;
  return perm.can_view || perm.can_edit || perm.can_admin;
}

function hasFullAccess(s: AccessSnapshot): boolean {
  const roles = s.rbacRoles.map((r) => r.toLowerCase());
  if (FULL_ACCESS_RBAC_ROLES.some((r) => roles.includes(r))) return true;
  const legacy = s.legacyRole?.toLowerCase() ?? null;
  return legacy !== null && FULL_ACCESS_LEGACY_ROLES.includes(legacy);
}

/** Lazily resolved domain levels; each resolver runs at most once per evaluation. */
class DomainLevels {
  private hrCache?: HrAccess;
  private medicalCache?: MedicalAccess;
  private wellnessCache?: WellnessAccess;

  constructor(private readonly s: AccessSnapshot) {}

  private perm(moduleKey: string): ModulePermission | null {
    return this.s.permissions.find((p) => p.module_key === moduleKey) ?? null;
  }

  private roles(): string[] {
    return [...this.s.rbacRoles];
  }

  hr(): HrAccess {
    this.hrCache ??= resolveHrAccess({
      rbacInitialized: this.s.rbacInitialized,
      rbacRoles: this.roles(),
      hrPermission: this.perm('hr'),
      legacyRole: this.s.legacyRole,
    });
    return this.hrCache;
  }

  medical(): MedicalAccess {
    this.medicalCache ??= resolveMedicalAccess({
      rbacInitialized: this.s.rbacInitialized,
      rbacRoles: this.roles(),
      medicalPermission: this.perm('medical'),
      legacyRole: this.s.legacyRole,
      practitionerDisciplines: [...this.s.practitionerDisciplines],
    });
    return this.medicalCache;
  }

  wellness(): WellnessAccess {
    this.wellnessCache ??= resolveWellnessAccess({
      rbacInitialized: this.s.rbacInitialized,
      rbacRoles: this.roles(),
      wellnessPermission: this.perm('wellness'),
      legacyRole: this.s.legacyRole,
      practitionerDisciplines: [...this.s.practitionerDisciplines],
      medical: this.medical(),
    });
    return this.wellnessCache;
  }

  satisfies(d: AccessDomain, level: AccessLevel): boolean {
    switch (d) {
      case 'hr':
        return leveled(this.hr(), level);
      case 'payroll':
        return leveled(
          resolvePayrollAccess({ rbacRoles: this.roles(), financePermission: this.perm('finance'), legacyRole: this.s.legacyRole }),
          level,
        );
      case 'legal':
        return leveled(
          resolveLegalAccess({
            signedIn: this.s.signedIn,
            rbacInitialized: this.s.rbacInitialized,
            rbacRoles: this.roles(),
            legalPermission: this.perm('legal'),
            legacyRole: this.s.legacyRole,
          }),
          level,
        );
      case 'medical':
        return leveled(this.medical(), level);
      case 'wellness':
        return leveled(this.wellness(), level);
      case 'fitness': {
        // Mirror of med_fitness_can_view (which already includes medical view).
        const fitness = resolveFitnessAccess({ medical: this.medical(), hrCanView: this.hr().canView, rbacRoles: this.roles() });
        if (level === 'view') return fitness;
        if (level === 'self') return fitness || this.medical().level !== 'none';
        return leveled(this.medical(), level);
      }
      case 'physio':
        if (level === 'admin') return this.wellness().canAdmin;
        return canAccessPhysio(this.medical(), this.wellness(), level === 'edit' ? 'edit' : 'view');
    }
  }
}

interface Leveled {
  level: string;
  canView: boolean;
  canEdit: boolean;
  canAdmin: boolean;
}

function leveled(access: Leveled, level: AccessLevel): boolean {
  switch (level) {
    case 'self':
      return access.level !== 'none';
    case 'view':
      return access.canView;
    case 'edit':
      return access.canEdit;
    case 'admin':
      return access.canAdmin;
  }
}

function ruleNeedsPractitioners(rule: CapabilityRule): boolean {
  return rule.kind === 'domain' && ['medical', 'fitness', 'wellness', 'physio'].includes(rule.domain);
}

function ruleIsLoading(rule: CapabilityRule, s: AccessSnapshot, needsRbac: boolean): boolean {
  if (s.authLoading) return true;
  if (rule.kind === 'signed_in' && !needsRbac) return false;
  if (!s.rbacInitialized || s.rbacLoading) return true;
  return ruleNeedsPractitioners(rule) && !s.practitionerDisciplinesLoaded;
}

function ruleSatisfied(rule: CapabilityRule, level: AccessLevel, s: AccessSnapshot, domains: DomainLevels): boolean {
  switch (rule.kind) {
    case 'signed_in':
      return s.signedIn;
    case 'domain':
      return domains.satisfies(rule.domain, level);
    case 'rbac': {
      if (hasFullAccess(s)) return true;
      const rbacLevel: PermissionLevel = level === 'self' ? 'view' : level;
      if (rbacHas(s.permissions, rule.module, rbacLevel)) return true;
      if ((level === 'self' || level === 'view') && rule.nav) return s.canAccessModule(rule.nav);
      return false;
    }
  }
}

/**
 * Decide one capability against a snapshot of today's access state.
 * Pure: the same inputs always give the same decision.
 */
export function resolveCapability(key: string, snapshot: AccessSnapshot, ctx: CanContext = {}): CapabilityDecision {
  const parsed = parseCapabilityKey(key);
  if (!parsed) {
    warnUnknown(key, 'not a four-segment snake_case key with a PMS action');
    return decision('unknown', 'malformed key');
  }
  const entry = getCatalogueEntry(parsed.path);
  if (!entry || !entry.actions.includes(parsed.action)) {
    warnUnknown(key, 'not in docs/permissions/catalogues/storm.json');
    return decision('unknown', 'not in the catalogue');
  }
  const rule = ruleForCapability(parsed.path, parsed.modulePath, parsed.action);
  if (!rule) {
    warnUnknown(key, 'the interim adaptor has no mapping for it');
    return decision('unknown', 'no adaptor mapping');
  }

  if (snapshot.authLoading) return decision('loading', 'session loading');
  if (!snapshot.signedIn) return decision('signed_out', 'not signed in');

  const legacyFlag = entry.legacy[parsed.action];
  if (ruleIsLoading(rule, snapshot, Boolean(legacyFlag))) return decision('loading', 'access still loading');

  // view_own only ever covers the caller's own record.
  if (
    parsed.action === 'view_own' &&
    ctx.subjectProfileId &&
    ctx.subjectProfileId !== snapshot.profileId
  ) {
    return decision('denied', 'view_own on another person');
  }

  const level = requiredLevel(parsed.action, entry);
  const domains = new DomainLevels(snapshot);

  if (legacyFlag) {
    const flagGranted = rbacHas(snapshot.permissions, legacyFlag, 'view');
    if (flagGranted) return decision('granted', `legacy flag ${legacyFlag}`);
    // Approvals: the flag is the control; full module admins approve too.
    const fallbackLevel: AccessLevel = APPROVAL_ACTIONS.has(parsed.action) ? 'admin' : level;
    return ruleSatisfied(rule, fallbackLevel, snapshot, domains)
      ? decision('granted', `${rule.kind} at ${fallbackLevel}`)
      : decision('denied', `needs ${legacyFlag} or ${rule.kind} at ${fallbackLevel}`);
  }

  return ruleSatisfied(rule, level, snapshot, domains)
    ? decision('granted', `${rule.kind} at ${level}`)
    : decision('denied', `needs ${rule.kind} at ${level}`);
}

/** Every `domain.module` the adaptor maps (for coverage tests). */
export function mappedModules(): string[] {
  return Object.keys(MODULE_RULES);
}

/** Every subcategory override (for coverage tests). */
export function mappedSubcategories(): string[] {
  return Object.keys(SUBCATEGORY_RULES);
}

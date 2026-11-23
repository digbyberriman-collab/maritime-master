/**
 * ModuleRoute's access rule as a pure function (gap/00 C1; D-04, D-107).
 *
 * `ModuleRoute` (./ModuleRoute.tsx) renders its spinner, its denial or its
 * page from these functions, and the favourites menu rates a workspace pin
 * with `moduleGateDecision` over the same guard the registry gives the page
 * (src/shared/components/layout/topbar/pinAvailability.ts). So the route and
 * the pin can never disagree: a self-service HR viewer who can open
 * `/hris/employee-records/personal-details` sees that pin as a link, and a
 * pin to a page the route would deny is listed "No longer available".
 *
 * The rule, in the order the route checks it:
 *
 * 1. Legacy gate (`moduleId` and its level gates): loading while RBAC has not
 *    initialised or is loading, or while HR, payroll, medical or wellness
 *    access loads; denied when `canAccessModule(moduleId)` fails; then each
 *    level that is set must pass its `…AccessSatisfies` check.
 * 2. Capability (when present): its `CapabilityDecision` decides; status
 *    `loading` is loading, anything not allowed is denied (unknown keys
 *    included).
 *
 * React-free: callers pass the access they read from the hooks.
 */
import type { RouteGuard, AccessLevel } from '@/app/registry/types';
import type { CapabilityDecision } from '@/lib/permissions/adaptor';
import type { CapabilityKey } from '@/lib/permissions/types';
import { hrAccessSatisfies, type HrAccess } from '@/modules/auth/lib/hrAccess';
import { payrollAccessSatisfies, type PayrollAccess } from '@/modules/auth/lib/payrollAccess';
import { medicalAccessSatisfies, type MedicalAccess } from '@/modules/auth/lib/medicalAccess';
import { wellnessAccessSatisfies, type WellnessAccess } from '@/modules/auth/lib/wellnessAccess';

/** What a ModuleRoute guard decides: wait, open the page, or deny it. */
export type ModuleGateDecision = 'loading' | 'allowed' | 'denied';

/** The guards ModuleRoute enforces (the registry's `module` and `capability` kinds). */
export type ModuleGateGuard = Extract<RouteGuard, { kind: 'module' | 'capability' }>;

type Loadable<T> = T & { loading: boolean };

/** The legacy gate's props: the navigation module and its optional level gates. */
export interface LegacyGate {
  moduleId: string;
  hrLevel?: AccessLevel;
  payrollLevel?: AccessLevel;
  medicalLevel?: AccessLevel;
  wellnessLevel?: AccessLevel;
}

/** The access the legacy gate reads (AuthContext, the RBAC store and the four access hooks). */
export interface LegacyGateAccess {
  rbacInitialized: boolean;
  rbacLoading: boolean;
  canAccessModule: (moduleId: string) => boolean;
  hr: Loadable<HrAccess>;
  payroll: Loadable<PayrollAccess>;
  medical: Loadable<MedicalAccess>;
  wellness: Loadable<WellnessAccess>;
}

/** The access the whole guard reads: the legacy gate's, plus a capability's decision. */
export interface ModuleGateAccess extends LegacyGateAccess {
  capability: (key: CapabilityKey) => Pick<CapabilityDecision, 'allowed' | 'status'>;
}

/** Which check of the legacy gate denied, so the route can name it. */
export type LegacyGateDenial =
  | { by: 'module' }
  | { by: 'hr' | 'payroll' | 'medical' | 'wellness'; level: AccessLevel };

export type LegacyGateOutcome = { status: 'loading' } | { status: 'allowed' } | ({ status: 'denied' } & LegacyGateDenial);

/** Step 1: the legacy gate, with the check that denied. */
export function legacyGateOutcome(gate: LegacyGate, access: LegacyGateAccess): LegacyGateOutcome {
  const { hr, payroll, medical, wellness } = access;
  if (!access.rbacInitialized || access.rbacLoading || hr.loading || payroll.loading || medical.loading || wellness.loading) {
    return { status: 'loading' };
  }
  if (!access.canAccessModule(gate.moduleId)) return { status: 'denied', by: 'module' };
  if (gate.hrLevel && !hrAccessSatisfies(hr, gate.hrLevel)) return { status: 'denied', by: 'hr', level: gate.hrLevel };
  if (gate.payrollLevel && !payrollAccessSatisfies(payroll, gate.payrollLevel)) {
    return { status: 'denied', by: 'payroll', level: gate.payrollLevel };
  }
  if (gate.medicalLevel && !medicalAccessSatisfies(medical, gate.medicalLevel)) {
    return { status: 'denied', by: 'medical', level: gate.medicalLevel };
  }
  if (gate.wellnessLevel && !wellnessAccessSatisfies(wellness, gate.wellnessLevel)) {
    return { status: 'denied', by: 'wellness', level: gate.wellnessLevel };
  }
  return { status: 'allowed' };
}

/** Step 2: a capability's decision. Loading waits; anything not allowed (unknown keys too) denies. */
export function capabilityGateDecision(decision: Pick<CapabilityDecision, 'allowed' | 'status'>): ModuleGateDecision {
  if (decision.status === 'loading') return 'loading';
  return decision.allowed ? 'allowed' : 'denied';
}

/** The whole guard, as ModuleRoute applies it: the legacy gate first, then the capability. */
export function moduleGateDecision(guard: ModuleGateGuard, access: ModuleGateAccess): ModuleGateDecision {
  if (guard.kind === 'capability') return capabilityGateDecision(access.capability(guard.capability));
  const legacy = legacyGateOutcome(guard, access);
  if (legacy.status !== 'allowed') return legacy.status;
  return guard.capability ? capabilityGateDecision(access.capability(guard.capability)) : 'allowed';
}

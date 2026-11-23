/**
 * ModuleRoute's rule as a pure function (D-04, D-107): the route renders its
 * spinner, denial or page from it, and the favourites menu rates workspace
 * pins with it, so the two cannot disagree. Loading waits, the legacy gate
 * runs before the capability, and every set level must pass.
 */
import { describe, expect, it } from 'vitest';
import { capabilityGateDecision, legacyGateOutcome, moduleGateDecision, type ModuleGateAccess } from '@/shared/components/moduleGate';
import { resolveHrAccess } from '@/modules/auth/lib/hrAccess';
import { resolvePayrollAccess } from '@/modules/auth/lib/payrollAccess';
import { NO_MEDICAL_ACCESS } from '@/modules/auth/lib/medicalAccess';
import { NO_WELLNESS_ACCESS } from '@/modules/auth/lib/wellnessAccess';

const hrEdit = resolveHrAccess({ rbacInitialized: true, rbacRoles: [], hrPermission: null, legacyRole: 'master' });

const access = (patch: Partial<ModuleGateAccess> = {}): ModuleGateAccess => ({
  rbacInitialized: true,
  rbacLoading: false,
  canAccessModule: () => true,
  hr: { ...hrEdit, loading: false },
  payroll: { ...resolvePayrollAccess({ rbacRoles: [], financePermission: null, legacyRole: 'master' }), loading: false },
  medical: { ...NO_MEDICAL_ACCESS, loading: false },
  wellness: { ...NO_WELLNESS_ACCESS, loading: false },
  capability: () => ({ allowed: true, status: 'granted' }),
  ...patch,
});

describe('the legacy gate', () => {
  it('waits while RBAC or any access resolver loads', () => {
    const gate = { moduleId: 'hris' };
    expect(legacyGateOutcome(gate, access({ rbacInitialized: false }))).toEqual({ status: 'loading' });
    expect(legacyGateOutcome(gate, access({ rbacLoading: true }))).toEqual({ status: 'loading' });
    expect(legacyGateOutcome(gate, access({ hr: { ...hrEdit, loading: true } }))).toEqual({ status: 'loading' });
    expect(legacyGateOutcome(gate, access({ medical: { ...NO_MEDICAL_ACCESS, loading: true } }))).toEqual({ status: 'loading' });
    expect(legacyGateOutcome(gate, access({ wellness: { ...NO_WELLNESS_ACCESS, loading: true } }))).toEqual({ status: 'loading' });
  });

  it('denies a module the viewer cannot access, then each level that is set, in order', () => {
    expect(legacyGateOutcome({ moduleId: 'hris' }, access({ canAccessModule: () => false }))).toEqual({ status: 'denied', by: 'module' });
    expect(legacyGateOutcome({ moduleId: 'hris', hrLevel: 'edit' }, access())).toEqual({ status: 'allowed' });
    expect(legacyGateOutcome({ moduleId: 'hris', hrLevel: 'admin' }, access())).toEqual({ status: 'denied', by: 'hr', level: 'admin' });
    expect(legacyGateOutcome({ moduleId: 'hris', payrollLevel: 'view' }, access())).toEqual({ status: 'denied', by: 'payroll', level: 'view' });
    expect(legacyGateOutcome({ moduleId: 'health', medicalLevel: 'view' }, access())).toEqual({ status: 'denied', by: 'medical', level: 'view' });
    expect(legacyGateOutcome({ moduleId: 'health', wellnessLevel: 'view' }, access())).toEqual({ status: 'denied', by: 'wellness', level: 'view' });
    // The first failing check names the denial.
    expect(legacyGateOutcome({ moduleId: 'hris', hrLevel: 'admin', payrollLevel: 'view' }, access())).toMatchObject({ by: 'hr' });
  });
});

describe('the capability', () => {
  it('loading waits; denied and unknown deny; granted opens', () => {
    expect(capabilityGateDecision({ allowed: false, status: 'loading' })).toBe('loading');
    expect(capabilityGateDecision({ allowed: false, status: 'denied' })).toBe('denied');
    expect(capabilityGateDecision({ allowed: false, status: 'unknown' })).toBe('denied');
    expect(capabilityGateDecision({ allowed: false, status: 'signed_out' })).toBe('denied');
    expect(capabilityGateDecision({ allowed: true, status: 'granted' })).toBe('allowed');
  });
});

describe('moduleGateDecision', () => {
  it('a capability guard reads only the capability', () => {
    const guard = { kind: 'capability', capability: 'vessel.safety.drills.view' } as const;
    expect(moduleGateDecision(guard, access({ rbacInitialized: false }))).toBe('allowed');
    expect(moduleGateDecision(guard, access({ capability: () => ({ allowed: false, status: 'denied' }) }))).toBe('denied');
    expect(moduleGateDecision(guard, access({ capability: () => ({ allowed: false, status: 'loading' }) }))).toBe('loading');
  });

  it('a module guard runs the legacy gate, then its capability when it has one', () => {
    expect(moduleGateDecision({ kind: 'module', moduleId: 'hris' }, access())).toBe('allowed');
    expect(moduleGateDecision({ kind: 'module', moduleId: 'hris' }, access({ rbacLoading: true }))).toBe('loading');
    expect(moduleGateDecision({ kind: 'module', moduleId: 'hris', payrollLevel: 'view' }, access())).toBe('denied');
    const withCapability = { kind: 'module', moduleId: 'ism', capability: 'vessel.safety.drills.edit' } as const;
    expect(moduleGateDecision(withCapability, access({ capability: () => ({ allowed: false, status: 'denied' }) }))).toBe('denied');
    expect(moduleGateDecision(withCapability, access({ capability: () => ({ allowed: false, status: 'loading' }) }))).toBe('loading');
    // The legacy gate decides first: a closed module never asks the capability.
    expect(moduleGateDecision(withCapability, access({ canAccessModule: () => false }))).toBe('denied');
  });
});

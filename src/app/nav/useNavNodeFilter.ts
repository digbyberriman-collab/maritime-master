/**
 * The per-node gate every nav surface applies (sidebar, tab row, Apps menu,
 * command palette, vessel switch): the nav visibility rule in
 * ./visibility.ts, then the legacy `moduleKey` gates (HR, payroll, medical,
 * wellness resolvers, else the RBAC module level). Every branch fails closed
 * while access loads. The sidebar's gating lives here only (one copy).
 *
 * `decide(item)` answers `hidden`, `visible` or `locked` (an add-on the
 * vessel is not entitled to, G4); `canShow(item)` is `decide(item) !==
 * 'hidden'`. For a vessel's own tree pass that vessel's `isModuleOn` (its
 * `vessel_module_settings`, C13); `isEntitled` absent means no add-on is
 * entitled (there is no entitlement source in Phase 1). Callers memoise the
 * functions they pass. Children are never looked at: `filterNavTree`
 * (./navTree.ts) walks a tree with `decide`.
 */
import { useCallback } from 'react';
import type { NavChild } from '@/config/navigation-types';
import { usePermissionsStore } from '@/modules/auth/store/permissionsStore';
import { useHrAccess } from '@/modules/auth/hooks/useHrAccess';
import { hrAccessSatisfies } from '@/modules/auth/lib/hrAccess';
import { usePayrollAccess } from '@/modules/auth/hooks/usePayrollAccess';
import { payrollAccessSatisfies } from '@/modules/auth/lib/payrollAccess';
import { useMedicalAccess } from '@/modules/auth/hooks/useMedicalAccess';
import { medicalAccessSatisfies } from '@/modules/auth/lib/medicalAccess';
import { useWellnessAccess } from '@/modules/auth/hooks/useWellnessAccess';
import { wellnessAccessSatisfies } from '@/modules/auth/lib/wellnessAccess';
import { useNavAccess } from './navAccess';
import { canUseRoadmap, useShowRoadmapPreference } from './roadmap';
import { navNodeDecision, type NavNodeDecision } from './visibility';

export interface NavNodeFilter {
  /** Auth and RBAC have loaded; until then `canShow` is false for every gated node. */
  ready: boolean;
  /** Planned leaves are shown (owner/admin with "Show roadmap" on, D-06, D-29). */
  showPlanned: boolean;
  /** Whether the viewer may toggle "Show roadmap". */
  roadmapAllowed: boolean;
  /** Steps 1–6 of the visibility rule for one node (children are not looked at). */
  decide: (item: NavChild) => NavNodeDecision;
  /** The node passes every gate: `decide(item) !== 'hidden'` (a locked add-on shows). */
  canShow: (item: NavChild) => boolean;
}

export interface NavNodeFilterOptions {
  /** The vessel's module settings (its own tree only). Fails closed while they load. */
  isModuleOn?: (moduleSetting: string) => boolean;
  /** Add-on entitlements; absent = none entitled, so add-on nodes are locked. */
  isEntitled?: (entitlement: string) => boolean;
}

export function useNavNodeFilter(options: NavNodeFilterOptions = {}): NavNodeFilter {
  const { isModuleOn, isEntitled } = options;
  const hasPermission = usePermissionsStore((s) => s.hasPermission);
  const rbacInitialized = usePermissionsStore((s) => s.isInitialized);
  const storeRoles = usePermissionsStore((s) => s.userRoles);
  const hrAccess = useHrAccess();
  const payrollAccess = usePayrollAccess();
  const medicalAccess = useMedicalAccess();
  const wellnessAccess = useWellnessAccess();
  const navAccess = useNavAccess();
  const roadmapAllowed = canUseRoadmap({
    ready: navAccess.ready,
    legacyRole: navAccess.legacyRole,
    rbacRoles: navAccess.rbacRoles.length ? navAccess.rbacRoles : (storeRoles ?? []).map((r) => r.role_name),
  });
  const [showRoadmapStored] = useShowRoadmapPreference();
  const showPlanned = roadmapAllowed && showRoadmapStored;
  const { can, fleetReach, vesselReach } = navAccess;

  // Step 5: the legacy moduleKey gates. HR uses the dedicated resolver so
  // legacy-role users are handled the way the database handles them; crew
  // keep the medical and wellness leaves that show their own record.
  // `health` is the Health & Wellness workspace entry (Apps, Fleet ›
  // Workspaces): medical or wellness access opens it, as
  // `canAccessModule('health')` does (`canEnterHealth`), so a medical-only
  // user gets the workspace and the tree's own gates keep them to Medical.
  // It never reaches `hasPermission`: there is no RBAC module `health`.
  const passesModuleKey = useCallback(
    (item: NavChild): boolean => {
      if (!item.moduleKey) return true;
      const required = item.minPermission ?? 'view';
      // Once loaded: self-only access opens only the self-service nodes.
      const passesMedical = () =>
        medicalAccess.selfOnly ? Boolean(item.selfServe) : medicalAccessSatisfies(medicalAccess, required);
      const passesWellness = () =>
        wellnessAccess.selfOnly ? Boolean(item.selfServe) : wellnessAccessSatisfies(wellnessAccess, required);
      if (item.moduleKey === 'hr') {
        if (hrAccess.loading) return false;
        return hrAccessSatisfies(hrAccess, required);
      }
      if (item.moduleKey === 'finance') {
        if (payrollAccess.loading) return false;
        return payrollAccessSatisfies(payrollAccess, required);
      }
      if (item.moduleKey === 'medical') {
        if (medicalAccess.loading) return false;
        return passesMedical();
      }
      if (item.moduleKey === 'wellness') {
        if (wellnessAccess.loading) return false;
        return passesWellness();
      }
      if (item.moduleKey === 'health') {
        if (medicalAccess.loading || wellnessAccess.loading) return false;
        return passesMedical() || passesWellness();
      }
      // Fail closed while RBAC loads (gap/00 C2), as canAccessModule does.
      if (!rbacInitialized) return false;
      return hasPermission(item.moduleKey, required);
    },
    [hrAccess, payrollAccess, medicalAccess, wellnessAccess, hasPermission, rbacInitialized],
  );

  const decide = useCallback(
    (item: NavChild): NavNodeDecision => {
      const decision = navNodeDecision(item, { showPlanned, can, fleetReach, vesselReach, isModuleOn, isEntitled });
      if (decision === 'hidden') return 'hidden';
      // The legacy module gates run before the add-on lock (rule step 5 < 6).
      return passesModuleKey(item) ? decision : 'hidden';
    },
    [showPlanned, can, fleetReach, vesselReach, isModuleOn, isEntitled, passesModuleKey],
  );
  const canShow = useCallback((item: NavChild): boolean => decide(item) !== 'hidden', [decide]);

  return { ready: navAccess.ready, showPlanned, roadmapAllowed, decide, canShow };
}

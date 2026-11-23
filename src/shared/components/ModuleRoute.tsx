import React from 'react';
import { Loader2 } from 'lucide-react';
import ProtectedRoute from '@/shared/components/ProtectedRoute';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { usePermissionsStore } from '@/modules/auth/store/permissionsStore';
import { useHrAccess } from '@/modules/auth/hooks/useHrAccess';
import { usePayrollAccess } from '@/modules/auth/hooks/usePayrollAccess';
import { useMedicalAccess } from '@/modules/auth/hooks/useMedicalAccess';
import { useWellnessAccess } from '@/modules/auth/hooks/useWellnessAccess';
import { useCapability } from '@/lib/permissions/useCan';
import type { CanContext, CapabilityKey } from '@/lib/permissions/types';
import { AccessDenied as SharedAccessDenied } from '@/shared/components/states';
import { usePageLocationOverride } from '@/shared/components/layout/pageLocationOverride';
import { capabilityGateDecision, legacyGateOutcome, type LegacyGateDenial } from './moduleGate';

interface LegacyGateProps {
  /** Navigation module id (e.g. `hris`). Checked with `canAccessModule`. */
  moduleId: string;
  /** Extra HR gate for sensitive pages inside HRIS. */
  hrLevel?: 'view' | 'edit' | 'admin';
  /** Extra finance gate for compensation / payroll pages. */
  payrollLevel?: 'view' | 'edit' | 'admin';
  /** Extra clinical gate for medical pages. */
  medicalLevel?: 'view' | 'edit' | 'admin';
  /** Extra gate for spa / nutrition / physio / training pages. */
  wellnessLevel?: 'view' | 'edit' | 'admin';
  children?: React.ReactNode;
}

interface CapabilityGateProps {
  /**
   * PMS capability key (`domain.module.subcategory.action`), checked with
   * `useCan`. This is the generic guard for every new route: no new prop per
   * domain (gap/00 C1). Unknown keys and loading both deny.
   */
  capability?: CapabilityKey;
  /** Optional scope for the capability check. */
  capabilityContext?: CanContext;
}

/**
 * A route guarded by `moduleId` (with the optional level gates), by
 * `capability`, or by both (both must pass). At least one is required.
 */
type ModuleRouteProps =
  | (LegacyGateProps & CapabilityGateProps)
  | (Partial<Record<keyof Omit<LegacyGateProps, 'children'>, undefined>> &
      Required<Pick<CapabilityGateProps, 'capability'>> &
      Pick<CapabilityGateProps, 'capabilityContext'> & { children?: React.ReactNode });

/**
 * Names the denial to the page header (D-96, D-107): the document title and
 * the breadcrumb read the state's title, with the scope root as the trail
 * (`scope-root` crumbs), and the favourites star hides, because a denial is
 * not a page to pin. It must render inside `DashboardLayout`: the override's
 * provider is mounted by AppShell, so when this route draws the shell itself
 * a hook in `AccessDenied`'s own body would find no provider.
 */
const DeniedLocation: React.FC<{ title: string }> = ({ title }) => {
  usePageLocationOverride({ title });
  return null;
};

/**
 * The shared no-access state (`@/shared/components/states`) inside the
 * dashboard shell. The shell is idempotent (ShellContext), so this is safe
 * inside a scope layout too. Every denial below (module, HR, finance,
 * clinical, wellness, capability, and a guard with nothing to check) names
 * itself through `DeniedLocation`.
 */
export const AccessDenied: React.FC<{ title?: string; detail?: string }> = ({
  title = 'Restricted area',
  detail = 'Your role does not include access to this module. Ask your DPA or fleet manager if you believe you should have it.',
}) => (
  <DashboardLayout>
    <DeniedLocation title={title} />
    <SharedAccessDenied title={title} detail={detail} backTo={{ to: '/dashboard', label: 'Back to dashboard' }} />
  </DashboardLayout>
);

/** The legacy gate's denial, titled by the check that failed (`legacyGateOutcome`). */
const LegacyDenied: React.FC<{ denial: LegacyGateDenial }> = ({ denial }) => {
  switch (denial.by) {
    case 'module':
      return <AccessDenied />;
    case 'hr':
      return (
        <AccessDenied
          title="HR access required"
          detail={`This page needs HR ${denial.level} rights. DPA has full access; captains and pursers have edit rights; heads of department have view rights.`}
        />
      );
    case 'payroll':
      return (
        <AccessDenied
          title="Finance access required"
          detail={`This page needs finance ${denial.level} rights. DPA has full access and pursers can edit; fleet managers can view.`}
        />
      );
    case 'medical':
      return (
        <AccessDenied
          title="Clinical access required"
          detail={`This page holds medical records and needs ${denial.level} access. Ship's medics get it from the practitioner roster; DPA and superadmins have it by role. Captains and HR see fitness to work instead.`}
        />
      );
    case 'wellness':
      return (
        <AccessDenied
          title="Wellness access required"
          detail={`This page needs wellness ${denial.level} access. Therapists, trainers and physios get it from the practitioner roster; captains and pursers can edit; heads of department can view.`}
        />
      );
  }
};

const Spinner: React.FC = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

const Gate: React.FC<LegacyGateProps> = ({
  moduleId,
  hrLevel,
  payrollLevel,
  medicalLevel,
  wellnessLevel,
  children,
}) => {
  const { canAccessModule } = useAuth();
  const rbacInitialized = usePermissionsStore((s) => s.isInitialized);
  const rbacLoading = usePermissionsStore((s) => s.isLoading);
  const hr = useHrAccess();
  const payroll = usePayrollAccess();
  const medical = useMedicalAccess();
  const wellness = useWellnessAccess();

  // The pure rule (./moduleGate.ts) the favourites menu also rates pins with (D-107).
  const outcome = legacyGateOutcome(
    { moduleId, hrLevel, payrollLevel, medicalLevel, wellnessLevel },
    { rbacInitialized, rbacLoading, canAccessModule, hr, payroll, medical, wellness },
  );
  if (outcome.status === 'loading') return <Spinner />;
  if (outcome.status === 'denied') return <LegacyDenied denial={outcome} />;
  return <>{children}</>;
};

/** Capability gate: spinner while loading, `AccessDenied` when denied or unknown. */
const CapabilityGate: React.FC<{
  capability: CapabilityKey;
  context?: CanContext;
  children?: React.ReactNode;
}> = ({ capability, context, children }) => {
  const decision = capabilityGateDecision(useCapability(capability, context));
  if (decision === 'loading') return <Spinner />;
  if (decision === 'denied') {
    return (
      <AccessDenied
        title="No access to this page"
        detail="Your access does not include this page. Ask an account admin if you need it for your work."
      />
    );
  }
  return <>{children}</>;
};

/**
 * Route guard that requires login *and* access. Use for pages that must
 * never render for the wrong person.
 *
 * - `moduleId` (+ `hrLevel` / `payrollLevel` / `medicalLevel` /
 *   `wellnessLevel`): today's module gates, unchanged.
 * - `capability`: the generic PMS-key guard (`useCan`) for every new route.
 *
 * When both are given, both must pass. With neither, access is denied.
 */
const ModuleRoute: React.FC<ModuleRouteProps> = (props) => {
  const { capability, capabilityContext, children } = props;
  const guarded = capability ? (
    <CapabilityGate capability={capability} context={capabilityContext}>
      {children}
    </CapabilityGate>
  ) : (
    children
  );

  let content: React.ReactNode;
  if (props.moduleId) {
    content = (
      <Gate
        moduleId={props.moduleId}
        hrLevel={props.hrLevel}
        payrollLevel={props.payrollLevel}
        medicalLevel={props.medicalLevel}
        wellnessLevel={props.wellnessLevel}
      >
        {guarded}
      </Gate>
    );
  } else if (capability) {
    content = guarded;
  } else {
    // Fail closed: a guard with nothing to check never opens.
    content = <AccessDenied />;
  }

  return <ProtectedRoute>{content}</ProtectedRoute>;
};

export default ModuleRoute;

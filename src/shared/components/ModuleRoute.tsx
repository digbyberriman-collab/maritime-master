import React from 'react';
import { Loader2 } from 'lucide-react';
import ProtectedRoute from '@/shared/components/ProtectedRoute';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { usePermissionsStore } from '@/modules/auth/store/permissionsStore';
import { useHrAccess } from '@/modules/auth/hooks/useHrAccess';
import { hrAccessSatisfies } from '@/modules/auth/lib/hrAccess';
import { usePayrollAccess } from '@/modules/auth/hooks/usePayrollAccess';
import { payrollAccessSatisfies } from '@/modules/auth/lib/payrollAccess';
import { useMedicalAccess } from '@/modules/auth/hooks/useMedicalAccess';
import { medicalAccessSatisfies } from '@/modules/auth/lib/medicalAccess';
import { useWellnessAccess } from '@/modules/auth/hooks/useWellnessAccess';
import { wellnessAccessSatisfies } from '@/modules/auth/lib/wellnessAccess';
import { useCapability } from '@/lib/permissions/useCan';
import type { CanContext, CapabilityKey } from '@/lib/permissions/types';
import { AccessDenied as SharedAccessDenied } from '@/shared/components/states';

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
 * The shared no-access state (`@/shared/components/states`) inside the
 * dashboard shell. The shell is idempotent (ShellContext), so this is safe
 * inside a scope layout too.
 */
export const AccessDenied: React.FC<{ title?: string; detail?: string }> = ({
  title = 'Restricted area',
  detail = 'Your role does not include access to this module. Ask your DPA or fleet manager if you believe you should have it.',
}) => (
  <DashboardLayout>
    <SharedAccessDenied title={title} detail={detail} backTo={{ to: '/dashboard', label: 'Back to dashboard' }} />
  </DashboardLayout>
);

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

  if (
    !rbacInitialized ||
    rbacLoading ||
    hr.loading ||
    payroll.loading ||
    medical.loading ||
    wellness.loading
  ) {
    return <Spinner />;
  }

  if (!canAccessModule(moduleId)) return <AccessDenied />;
  if (hrLevel && !hrAccessSatisfies(hr, hrLevel)) {
    return (
      <AccessDenied
        title="HR access required"
        detail={`This page needs HR ${hrLevel} rights. DPA has full access; captains and pursers have edit rights; heads of department have view rights.`}
      />
    );
  }

  if (payrollLevel && !payrollAccessSatisfies(payroll, payrollLevel)) {
    return (
      <AccessDenied
        title="Finance access required"
        detail={`This page needs finance ${payrollLevel} rights. DPA has full access and pursers can edit; fleet managers can view.`}
      />
    );
  }

  if (medicalLevel && !medicalAccessSatisfies(medical, medicalLevel)) {
    return (
      <AccessDenied
        title="Clinical access required"
        detail={`This page holds medical records and needs ${medicalLevel} access. Ship's medics get it from the practitioner roster; DPA and superadmins have it by role. Captains and HR see fitness to work instead.`}
      />
    );
  }

  if (wellnessLevel && !wellnessAccessSatisfies(wellness, wellnessLevel)) {
    return (
      <AccessDenied
        title="Wellness access required"
        detail={`This page needs wellness ${wellnessLevel} access. Therapists, trainers and physios get it from the practitioner roster; captains and pursers can edit; heads of department can view.`}
      />
    );
  }

  return <>{children}</>;
};

/** Capability gate: spinner while loading, `AccessDenied` when denied or unknown. */
const CapabilityGate: React.FC<{
  capability: CapabilityKey;
  context?: CanContext;
  children?: React.ReactNode;
}> = ({ capability, context, children }) => {
  const decision = useCapability(capability, context);
  if (decision.status === 'loading') return <Spinner />;
  if (!decision.allowed) {
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

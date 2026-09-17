import React from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Lock } from 'lucide-react';
import ProtectedRoute from '@/shared/components/ProtectedRoute';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { usePermissionsStore } from '@/modules/auth/store/permissionsStore';
import { useHrAccess } from '@/modules/auth/hooks/useHrAccess';
import { hrAccessSatisfies } from '@/modules/auth/lib/hrAccess';
import { Button } from '@/components/ui/button';

interface ModuleRouteProps {
  /** Navigation module id (e.g. `hris`). Checked with `canAccessModule`. */
  moduleId: string;
  /** Extra HR gate for sensitive pages inside HRIS. */
  hrLevel?: 'view' | 'edit' | 'admin';
  children: React.ReactNode;
}

export const AccessDenied: React.FC<{ title?: string; detail?: string }> = ({
  title = 'Restricted area',
  detail = 'Your role does not include access to this module. Ask your DPA or fleet manager if you believe you should have it.',
}) => (
  <DashboardLayout>
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="max-w-md rounded-lg border border-border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <Lock className="h-6 w-6 text-destructive" />
        </div>
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
        <Button asChild variant="outline" className="mt-6">
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  </DashboardLayout>
);

const Gate: React.FC<ModuleRouteProps> = ({ moduleId, hrLevel, children }) => {
  const { canAccessModule } = useAuth();
  const rbacInitialized = usePermissionsStore((s) => s.isInitialized);
  const rbacLoading = usePermissionsStore((s) => s.isLoading);
  const hr = useHrAccess();

  if (!rbacInitialized || rbacLoading || hr.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
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

  return <>{children}</>;
};

/**
 * Route guard that requires login *and* module access. Use for modules whose
 * pages must never render for the wrong role (HRIS, compensation, etc.).
 */
const ModuleRoute: React.FC<ModuleRouteProps> = (props) => (
  <ProtectedRoute>
    <Gate {...props} />
  </ProtectedRoute>
);

export default ModuleRoute;

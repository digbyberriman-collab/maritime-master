import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { RoleDefinitionsMatrix, RoleDefinitionsNotice } from '@/modules/auth/components/RoleDefinitionsMatrix';

/**
 * Settings → Permissions, read only (Phase 2 spec §A.8, proposed D-124).
 *
 * The section used to create, edit and delete roles and rewrite
 * `role_permissions`. Those rows are global (every company shares them) and
 * migration file 8 freezes them to the service role, so it now shows the
 * role matrix with the "managed by STORM" notice: no save controls and no
 * writes. Its field-redaction editor is gone too: nothing in STORM reads
 * `field_redactions`, so editing it changed nothing anyone saw (a fake
 * control, non-negotiable 9). Access for one person is changed in
 * Users & Access.
 */
const PermissionsSection: React.FC = () => {
  const { profile } = useAuth();
  const isDPA = profile?.role === 'dpa' || profile?.role === 'shore_management';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Permissions</h2>
        <p className="mt-1 text-muted-foreground">What each STORM role can open, module by module</p>
      </div>
      {isDPA ? (
        <>
          <RoleDefinitionsNotice />
          <RoleDefinitionsMatrix />
        </>
      ) : (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" className="h-4 w-4" />
          <AlertDescription>Only DPA and shore management users can see the role matrix.</AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default PermissionsSection;

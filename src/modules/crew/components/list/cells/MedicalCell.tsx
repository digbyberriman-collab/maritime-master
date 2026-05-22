import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Lock } from 'lucide-react';
import { usePermissionsStore } from '@/modules/auth/store/permissionsStore';
import type { CrewMemberWithStatus } from '@/modules/crew/hooks/useCrewWithComputedStatus';

const MEDICAL_ROLES = ['superadmin', 'dpa', 'captain', 'medical_officer'];

const labelFor: Record<CrewMemberWithStatus['medicalStatus'], string> = {
  valid: 'Valid',
  expiring: 'Expiring',
  expired: 'Expired',
  missing: 'None',
};

export const MedicalCell: React.FC<{ member: CrewMemberWithStatus }> = ({ member }) => {
  const hasRole = usePermissionsStore((s) => s.hasRole);
  const authorised = MEDICAL_ROLES.some((r) => hasRole(r));

  if (!authorised) {
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <Lock className="h-3 w-3" /> Restricted
      </Badge>
    );
  }

  const colour =
    member.medicalStatus === 'expired'
      ? 'border-destructive/40 text-destructive bg-destructive/10'
      : member.medicalStatus === 'expiring'
      ? 'border-warning/40 text-warning-foreground bg-warning/10'
      : member.medicalStatus === 'valid'
      ? 'border-success/40 text-success bg-success/10'
      : 'border-muted text-muted-foreground bg-muted/40';

  return (
    <Badge variant="outline" className={colour}>
      {labelFor[member.medicalStatus]}
      {member.medical_expiry ? ` · ${member.medical_expiry}` : ''}
    </Badge>
  );
};

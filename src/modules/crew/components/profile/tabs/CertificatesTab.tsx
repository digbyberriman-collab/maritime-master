import React from 'react';
import CrewCertificates from '@/modules/crew/components/CrewCertificates';
import type { CrewMember } from '@/modules/crew/hooks/useCrew';

export const CertificatesTab: React.FC<{ member: CrewMember }> = ({ member }) => {
  if (!member.user_id) {
    return (
      <p className="text-sm text-muted-foreground p-4">
        Certificates are available once this crew member has an active account.
      </p>
    );
  }
  return (
    <CrewCertificates
      crewId={member.user_id}
      crewVesselId={member.current_assignment?.vessel_id}
    />
  );
};

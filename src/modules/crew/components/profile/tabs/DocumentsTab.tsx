import React from 'react';
import { CrewAttachments } from '@/modules/crew/components/CrewAttachments';
import type { CrewMember } from '@/modules/crew/hooks/useCrew';

export const DocumentsTab: React.FC<{ member: CrewMember }> = ({ member }) => {
  if (!member.user_id) {
    return (
      <p className="text-sm text-muted-foreground p-4">
        Document uploads are available once this crew member has an active account.
      </p>
    );
  }
  return (
    <CrewAttachments
      crewId={member.user_id}
      crewVesselId={member.current_assignment?.vessel_id}
    />
  );
};

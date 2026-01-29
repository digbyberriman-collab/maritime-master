import React from 'react';
import ISMPlaceholder from './ISMPlaceholder';
import { ListChecks } from 'lucide-react';

const ERMEmergencyChecklistsPage: React.FC = () => {
  return (
    <ISMPlaceholder
      title="Emergency Checklists"
      description="Quick-reference checklists for emergency situations"
      icon={ListChecks}
      sectionName="Emergency Checklists"
      contentType="emergency response checklists for fire, flooding, abandon ship, and other critical scenarios"
    />
  );
};

export default ERMEmergencyChecklistsPage;

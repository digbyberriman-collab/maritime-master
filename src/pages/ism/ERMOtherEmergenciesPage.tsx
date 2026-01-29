import React from 'react';
import ISMPlaceholder from './ISMPlaceholder';
import { FileWarning } from 'lucide-react';

const ERMOtherEmergenciesPage: React.FC = () => {
  return (
    <ISMPlaceholder
      title="Other Emergencies & Detailed Guidance"
      description="Comprehensive guidance for various emergency scenarios"
      icon={FileWarning}
      sectionName="Other Emergencies"
      contentType="detailed emergency guidance, contingency procedures, and scenario-specific response plans"
    />
  );
};

export default ERMOtherEmergenciesPage;
